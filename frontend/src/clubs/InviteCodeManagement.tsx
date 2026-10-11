import { Copy } from 'lucide-react'
import { useState } from 'react'
import type { InviteCodeCreated, InviteCodeResponse } from '../types/supabase'
import { useI18n } from '../lib/i18n-context'

interface InviteCodeManagementProps {
  clubId: string
  accessToken: string
}

async function getErrorMessage(response: Response, fallback: string): Promise<string> {
  const payload: unknown = await response.json().catch(() => null)
  if (
    typeof payload === 'object' && payload !== null && 'detail' in payload &&
    typeof payload.detail === 'string'
  ) {
    return payload.detail
  }
  return fallback
}

export function InviteCodeManagement({ clubId, accessToken }: InviteCodeManagementProps) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [activeCode, setActiveCode] = useState<InviteCodeResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const loadCode = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/clubs/${clubId}/invite-codes`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!response.ok) throw new Error(await getErrorMessage(response, t('inviteCodeFailed')))
      const codes = (await response.json()) as InviteCodeResponse[]
      setActiveCode(codes[0] ?? null)
      setLoaded(true)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t('inviteCodeFailed'))
    } finally {
      setLoading(false)
    }
  }

  const handleToggle = () => {
    if (!open && !loaded) void loadCode()
    setOpen((current) => !current)
  }

  const handleCreate = async () => {
    setLoading(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch(`/api/clubs/${clubId}/invite-codes`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!response.ok) throw new Error(await getErrorMessage(response, t('inviteCodeFailed')))
      const result = (await response.json()) as InviteCodeCreated
      setActiveCode({ id: result.id, code: result.code, created_at: result.created_at, revoked_at: null })
      setLoaded(true)
      setNotice(t('inviteCodeCreated'))
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : t('inviteCodeFailed'))
    } finally {
      setLoading(false)
    }
  }

  const handleRevoke = async () => {
    if (!activeCode) return
    setLoading(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch(
        `/api/clubs/${clubId}/invite-codes/${activeCode.id}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } },
      )
      if (!response.ok) throw new Error(await getErrorMessage(response, t('inviteCodeFailed')))
      setActiveCode(null)
      setNotice(t('inviteCodeRevoked'))
    } catch (revokeError) {
      setError(revokeError instanceof Error ? revokeError.message : t('inviteCodeFailed'))
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = async () => {
    if (!activeCode?.code) return
    try {
      await navigator.clipboard.writeText(activeCode.code)
      setNotice(t('inviteCodeCopied'))
      setError('')
    } catch {
      setError(t('inviteCodeCopyFailed'))
    }
  }

  return (
    <div className="club-manager-panel">
      <button className="button button-light" type="button" onClick={handleToggle}>
        {open ? t('hideInviteCode') : t('manageInviteCode')}
      </button>
      {open && (
        <div className="club-invite-controls">
          {loading && <p role="status">{t('loading')}</p>}
          {error && <p className="club-form-error" role="alert">{error}</p>}
          {notice && <p role="status">{notice}</p>}
          {activeCode?.code && (
            <div>
              <p>{t('inviteCodeActive')}</p>
              <code className="club-invite-code">{activeCode.code}</code>
              <button className="button button-light" type="button" onClick={() => void handleCopy()}>
                <Copy size={14} aria-hidden="true" /> {t('copyInviteCode')}
              </button>
            </div>
          )}
          {!loading && activeCode ? (
            <>
              {!activeCode.code && <p>{t('inviteCodeNeedsReplacement')}</p>}
              <button className="button button-light" type="button" onClick={() => void handleRevoke()}>
                {t('revokeInviteCode')}
              </button>
            </>
          ) : !loading && (
            <button className="button button-primary" type="button" onClick={() => void handleCreate()}>
              {t('createInviteCode')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
