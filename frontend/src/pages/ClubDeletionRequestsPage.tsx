import { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth-context'
import { useI18n } from '../lib/i18n-context'
import type { ClubDeletionRequest } from '../types/supabase'
import './club-deletion-requests.css'

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

export function ClubDeletionRequestsPage() {
  const { session, profile } = useAuth()
  const { t, language } = useI18n()
  const [requests, setRequests] = useState<ClubDeletionRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reviewingId, setReviewingId] = useState('')

  useEffect(() => {
    const accessToken = session?.access_token
    if (!accessToken || !profile?.is_admin) return

    let active = true
    void fetch('/api/clubs/deletion-requests', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(await getErrorMessage(response, t('couldNotLoadDeletionRequests')))
        }
        return response.json() as Promise<ClubDeletionRequest[]>
      })
      .then((result) => {
        if (active) setRequests(result)
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : t('couldNotLoadDeletionRequests'),
          )
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => { active = false }
  }, [profile?.is_admin, session?.access_token, t])

  const handleReview = async (requestId: string, approved: boolean) => {
    if (!session?.access_token) return
    setReviewingId(requestId)
    setError('')
    try {
      const response = await fetch(`/api/clubs/deletion-requests/${requestId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ approved }),
      })
      if (!response.ok) throw new Error(await getErrorMessage(response, t('couldNotReviewDeletionRequest')))
      setRequests((current) => current.filter((request) => request.id !== requestId))
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : t('couldNotReviewDeletionRequest'))
    } finally {
      setReviewingId('')
    }
  }

  if (!profile?.is_admin) return null

  return (
    <section className="deletion-requests-page" aria-labelledby="deletion-requests-title">
      <div className="eyebrow">{t('clubs')}</div>
      <h1 id="deletion-requests-title">{t('clubDeletionRequests')}</h1>
      {error && <p className="club-list-error" role="alert">{error}</p>}
      {loading && <p role="status">{t('loading')}</p>}
      {!loading && !error && requests.length === 0 && <p>{t('noDeletionRequests')}</p>}
      <div className="deletion-request-list">
        {requests.map((request) => (
          <article className="deletion-request-card" key={request.id}>
            <div>
              <h2>{request.club_title}</h2>
              <p>
                {t('requestedBy')} {request.requester_display_name} ·{' '}
                {new Intl.DateTimeFormat(language === 'uk' ? 'uk-UA' : 'en-US', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }).format(new Date(request.requested_at))}
              </p>
            </div>
            <div className="deletion-request-actions">
              <button
                className="button button-light"
                type="button"
                disabled={reviewingId === request.id}
                onClick={() => void handleReview(request.id, false)}
              >
                {t('rejectDeletionRequest')}
              </button>
              <button
                className="button button-primary"
                type="button"
                disabled={reviewingId === request.id}
                onClick={() => void handleReview(request.id, true)}
              >
                {t('approveDeletionRequest')}
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
