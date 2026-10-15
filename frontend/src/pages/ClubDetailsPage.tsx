import { useEffect, useState } from 'react'
import { ArrowLeft, Plus } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { EventManagement } from '../events/EventManagement'
import { useAuth } from '../lib/auth-context'
import { useI18n } from '../lib/i18n-context'
import type { ClubRecord } from '../types/supabase'
import './club-details.css'

async function responseError(response: Response, fallback: string): Promise<string> {
  try {
    const body: unknown = await response.json()
    if (typeof body === 'object' && body !== null && 'detail' in body && typeof body.detail === 'string') return body.detail
  } catch {
    return fallback
  }
  return fallback
}

export function ClubDetailsPage() {
  const { clubId } = useParams()
  const { session } = useAuth()
  const { t } = useI18n()
  const accessToken = session?.access_token
  const [club, setClub] = useState<ClubRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [eventFormOpen, setEventFormOpen] = useState(false)

  useEffect(() => {
    if (!clubId || !accessToken) return
    let cancelled = false
    void fetch(`/api/clubs/${clubId}`, { headers: { Authorization: `Bearer ${accessToken}` } })
      .then(async (response) => {
        if (!response.ok) throw new Error(await responseError(response, t('couldNotLoadClub')))
        return response.json() as Promise<ClubRecord>
      })
      .then((result) => { if (!cancelled) setClub(result) })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : t('couldNotLoadClub'))
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [accessToken, clubId, t])

  if (loading) return <p className="page-state" role="status">{t('loading')}</p>
  if (error) return <section className="club-details-page"><p className="club-list-error" role="alert">{error}</p><Link className="button button-light" to="/my-clubs"><ArrowLeft aria-hidden="true" size={16} />{t('backToMyClubs')}</Link></section>
  if (!club || !clubId || !accessToken) return null

  const canManage = club.my_access_type === 'owner' || club.my_access_type === 'admin'

  return (
    <section className="club-details-page" aria-labelledby="club-details-title">
      <nav className="club-details-actions" aria-label={t('clubDetails')}>
        <Link className="button button-light" to="/my-clubs"><ArrowLeft aria-hidden="true" size={16} />{t('backToMyClubs')}</Link>
        {canManage && !eventFormOpen && (
          <button className="button button-primary" type="button" onClick={() => setEventFormOpen(true)}>
            <Plus aria-hidden="true" size={16} />{t('createEvent')}
          </button>
        )}
      </nav>
      <header className="club-details-header">
        {club.avatar_url && <img src={club.avatar_url} alt="" />}
        <div>
          <p>{t('clubDetails')}</p>
          <h1 id="club-details-title">{club.title}</h1>
          <span>{club.is_public ? t('publicLabel') : t('privateLabel')}</span>
        </div>
        {canManage && <Link className="button button-primary" to={`/clubs/${club.id}/manage`}>{t('clubManagement')}</Link>}
      </header>
      <EventManagement
        clubId={club.id}
        clubType={club.club_type}
        accessToken={accessToken}
        canManage={canManage}
        formOpen={eventFormOpen}
        onFormOpenChange={setEventFormOpen}
      />
    </section>
  )
}
