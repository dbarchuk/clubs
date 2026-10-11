import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../lib/auth-context'
import { useI18n } from '../lib/i18n-context'
import { InviteCodeManagement } from '../clubs/InviteCodeManagement'
import type { ClubRecord } from '../types/supabase'
import './club-management.css'

async function responseError(response: Response, fallback: string): Promise<string> {
  try {
    const body: unknown = await response.json()
    if (typeof body === 'object' && body !== null && 'detail' in body && typeof body.detail === 'string') return body.detail
  } catch {
    return fallback
  }
  return fallback
}

export function ClubManagementPage() {
  const { clubId } = useParams()
  const { session } = useAuth()
  const { t } = useI18n()
  const accessToken = session?.access_token
  const [club, setClub] = useState<ClubRecord | null>(null)
  const [title, setTitle] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [clubType, setClubType] = useState<ClubRecord['club_type']>('book')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (!clubId || !accessToken) return
    let cancelled = false
    void (async () => {
      try {
        const response = await fetch(`/api/clubs/${clubId}`, { headers: { Authorization: `Bearer ${accessToken}` } })
        if (!response.ok) throw new Error(await responseError(response, t('couldNotLoadClub')))
        const result = (await response.json()) as ClubRecord
        if (!cancelled) {
          setClub(result)
          setTitle(result.title)
          setAvatarUrl(result.avatar_url ?? '')
          setClubType(result.club_type)
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : t('couldNotLoadClub'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [accessToken, clubId, t])

  const canManage = club?.my_access_type === 'owner' || club?.my_access_type === 'admin'
  const isOwner = club?.my_access_type === 'owner'

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!clubId || !accessToken) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch(`/api/clubs/${clubId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ title, club_type: clubType, avatar_url: avatarUrl.trim() || null }),
      })
      if (!response.ok) throw new Error(await responseError(response, t('couldNotUpdateClub')))
      const result = (await response.json()) as ClubRecord
      setClub(result)
      setNotice(t('clubUpdated'))
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t('couldNotUpdateClub'))
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!clubId || !accessToken || !window.confirm(t('confirmDeleteClub'))) return
    setDeleting(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch(`/api/clubs/${clubId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } })
      if (response.status === 202) setNotice(t('deletionRequestCreated'))
      else if (response.status === 204) setNotice(t('clubDeleted'))
      else throw new Error(await responseError(response, t('couldNotDeleteClub')))
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : t('couldNotDeleteClub'))
    } finally {
      setDeleting(false)
    }
  }

  if (loading) return <p className="page-state" role="status">{t('loading')}</p>
  if (error && !club) return <section className="club-management-page"><p className="club-list-error" role="alert">{error}</p><Link to="/my-clubs">{t('backToMyClubs')}</Link></section>
  if (!club) return null

  return (
    <section className="club-management-page" aria-labelledby="club-management-title">
      <Link className="club-management-back" to="/my-clubs">{t('backToMyClubs')}</Link>
      <header>
        <p>{t('clubManagement')}</p>
        <h1 id="club-management-title">{club.title}</h1>
        <span>{club.is_public ? t('publicLabel') : t('privateLabel')}</span>
      </header>
      {notice && <p role="status">{notice}</p>}
      {error && <p className="club-form-error" role="alert">{error}</p>}
      {canManage ? (
        <form className="club-create-form" onSubmit={(event) => void save(event)}>
          <h2>{t('editClub')}</h2>
          <label className="club-form-field"><span>{t('clubType')}</span>
            <select value={clubType} onChange={(event) => setClubType(event.target.value as ClubRecord['club_type'])}>
              <option value="book">{t('bookClubs')}</option><option value="movie">{t('movieClubs')}</option>
              <option value="sport">{t('sportClubs')}</option><option value="board_games">{t('boardGameClubs')}</option>
            </select>
          </label>
          <label className="club-form-field"><span>{t('clubTitle')}</span><input required maxLength={50} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
          <label className="club-form-field"><span>{t('clubAvatarUrl')}</span><input type="url" value={avatarUrl} onChange={(event) => setAvatarUrl(event.target.value)} /></label>
          <button className="button button-primary" type="submit" disabled={saving}>{saving ? t('saving') : t('saveClubChanges')}</button>
        </form>
      ) : <p>{t('clubManagerOnly')}</p>}
      {canManage && !club.is_public && accessToken && <InviteCodeManagement clubId={club.id} accessToken={accessToken} />}
      {isOwner && <div className="club-management-delete"><h2>{t('deleteClub')}</h2><button className="button button-light" type="button" disabled={deleting} onClick={() => void remove()}>{deleting ? t('loading') : t('deleteClub')}</button></div>}
    </section>
  )
}
