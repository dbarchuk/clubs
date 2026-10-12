import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '../lib/i18n-context'
import type { ClubMemberRecord } from '../types/supabase'

interface ClubMemberManagementProps {
  clubId: string
  accessToken: string
  profileId: string
  isOwner: boolean
}

async function responseError(response: Response, fallback: string): Promise<string> {
  try {
    const body: unknown = await response.json()
    if (typeof body === 'object' && body !== null && 'detail' in body && typeof body.detail === 'string') return body.detail
  } catch {
    return fallback
  }
  return fallback
}

export function ClubMemberManagement({ clubId, accessToken, profileId, isOwner }: ClubMemberManagementProps) {
  const { t } = useI18n()
  const [members, setMembers] = useState<ClubMemberRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadMembers = useCallback(async () => {
    const response = await fetch(`/api/clubs/${clubId}/members`, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!response.ok) throw new Error(await responseError(response, t('couldNotLoadMembers')))
    setMembers((await response.json()) as ClubMemberRecord[])
  }, [accessToken, clubId, t])

  useEffect(() => {
    let active = true
    // oxlint-disable-next-line react/set-state-in-effect -- Member data and loading state update after the API request.
    void loadMembers().catch((loadError: unknown) => {
      if (active) setError(loadError instanceof Error ? loadError.message : t('couldNotLoadMembers'))
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [loadMembers, t])

  const updateRole = async (member: ClubMemberRecord, accessType: 'admin' | 'moderator' | 'member') => {
    setError('')
    try {
      const response = await fetch(`/api/clubs/${clubId}/members/${member.user_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ access_type: accessType }),
      })
      if (!response.ok) throw new Error(await responseError(response, t('couldNotUpdateMemberRole')))
      const updated = (await response.json()) as ClubMemberRecord
      setMembers((current) => current.map((item) => item.user_id === updated.user_id ? updated : item))
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : t('couldNotUpdateMemberRole'))
    }
  }

  return (
    <section className="club-member-management" aria-labelledby="club-members-title">
      <h2 id="club-members-title">{t('clubMembers')}</h2>
      {error && <p className="club-form-error" role="alert">{error}</p>}
      {loading ? <p role="status">{t('loading')}</p> : (
        <ul className="club-member-list">
          {members.map((member) => {
            const canEdit = member.access_type !== 'owner'
              && member.user_id !== profileId
              && (isOwner || member.access_type !== 'admin')
            return (
              <li key={member.user_id}>
                {member.avatar_url ? <img src={member.avatar_url} alt="" /> : <span className="club-member-avatar" aria-hidden="true">{member.display_name.slice(0, 1).toUpperCase()}</span>}
                <span className="club-member-name">{member.display_name}</span>
                {canEdit ? (
                  <label>
                    <span className="visually-hidden">{t('memberRoleLabel').replace('{name}', member.display_name)}</span>
                    <select value={member.access_type} onChange={(event) => void updateRole(member, event.target.value as 'admin' | 'moderator' | 'member')}>
                      <option value="admin">{t('adminRole')}</option>
                      <option value="moderator">{t('moderatorRole')}</option>
                      <option value="member">{t('memberRole')}</option>
                    </select>
                  </label>
                ) : <span className="club-member-role">{t(member.access_type === 'owner' ? 'ownerRole' : member.access_type === 'admin' ? 'adminRole' : member.access_type === 'moderator' ? 'moderatorRole' : 'memberRole')}</span>}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
