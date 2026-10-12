import { useCallback, useEffect, useEffectEvent, useRef, useState, type FormEvent } from 'react'
import { BookOpen, Dice5, Dumbbell, Film, Globe2, LockKeyhole, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth-context'
import { useI18n } from '../lib/i18n-context'
import type { ClubRecord, PaginatedClubs } from '../types/supabase'
import './club-list.css'

interface ClubListPageProps {
  scope: 'my' | 'public'
  searchQuery: string
}

interface CreateClubForm {
  clubType: ClubRecord['club_type']
  title: string
  avatarUrl: string
  isPublic: boolean
}

const PAGE_SIZE = 20

async function getErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const payload: unknown = await response.json()
    if (
      typeof payload === 'object' && payload !== null && 'detail' in payload &&
      typeof payload.detail === 'string'
    ) {
      return payload.detail
    }
  } catch {
    return fallback
  }
  return fallback
}

export function ClubListPage({ scope, searchQuery }: ClubListPageProps) {
  const { session } = useAuth()
  const { t } = useI18n()
  const accessToken = session?.access_token
  const [clubs, setClubs] = useState<ClubRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(true)
  const [error, setError] = useState('')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [form, setForm] = useState<CreateClubForm>({ clubType: 'book', title: '', avatarUrl: '', isPublic: false })
  const [inviteCode, setInviteCode] = useState('')
  const [showJoinPrivate, setShowJoinPrivate] = useState(false)
  const [joiningClubId, setJoiningClubId] = useState('')
  const [clubErrors, setClubErrors] = useState<Record<string, string>>({})
  const [pageNotice, setPageNotice] = useState('')
  const [privateJoinError, setPrivateJoinError] = useState('')
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const requestInFlightRef = useRef(false)
  const pageRef = useRef(0)
  const searchRef = useRef('')
  const hasMoreRef = useRef(true)

  const loadPage = useCallback(async (page: number, search: string, replace: boolean) => {
    if (requestInFlightRef.current || (!replace && !hasMoreRef.current)) return
    if (!accessToken) return

    requestInFlightRef.current = true
    const params = new URLSearchParams({
      scope,
      page: String(page),
      size: String(PAGE_SIZE),
    })
    if (search) params.set('search', search)

    try {
      const response = await fetch(`/api/clubs?${params.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!response.ok) throw new Error(await getErrorMessage(response, t('couldNotLoadClubs')))

      const result = (await response.json()) as PaginatedClubs
      setClubs((current) => replace ? result.items : [...current, ...result.items])
      pageRef.current = result.page
      hasMoreRef.current = result.has_more
      setHasMore(result.has_more)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t('couldNotLoadClubs'))
    } finally {
      requestInFlightRef.current = false
      setLoading(false)
    }
  }, [accessToken, scope, t])

  const loadNextPage = useCallback(() => {
    if (requestInFlightRef.current || !hasMoreRef.current) return
    setLoading(true)
    setError('')
    void loadPage(pageRef.current + 1, searchRef.current, false)
  }, [loadPage])

  const loadInitialPage = useEffectEvent(() => {
    searchRef.current = searchQuery
    setLoading(true)
    setError('')
    setClubs([])
    pageRef.current = 0
    hasMoreRef.current = true
    setHasMore(true)
    void loadPage(1, searchQuery, true)
  })

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- Starts the initial request; state updates follow the response.
    loadInitialPage()
  }, [searchQuery])

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || !hasMore || loading || error) return

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) loadNextPage()
    }, { rootMargin: '250px' })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [error, hasMore, loading, loadNextPage])

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!accessToken) {
      setCreateError(t('sessionExpired'))
      return
    }

    setCreating(true)
    setCreateError('')
    try {
      const response = await fetch('/api/clubs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          club_type: form.clubType,
          title: form.title,
          avatar_url: form.avatarUrl.trim() || null,
          is_public: form.isPublic,
        }),
      })
      if (!response.ok) throw new Error(await getErrorMessage(response, t('couldNotCreateClub')))

      setForm({ clubType: 'book', title: '', avatarUrl: '', isPublic: false })
      setShowCreateForm(false)
      pageRef.current = 0
      hasMoreRef.current = true
      setClubs([])
      setHasMore(true)
      setLoading(true)
      setError('')
      void loadPage(1, searchRef.current, true)
    } catch (createError) {
      setCreateError(createError instanceof Error ? createError.message : t('couldNotCreateClub'))
    } finally {
      setCreating(false)
    }
  }

  const handlePublicJoin = async (clubId: string) => {
    if (!accessToken) return
    setJoiningClubId(clubId)
    setClubErrors((current) => ({ ...current, [clubId]: '' }))
    try {
      const response = await fetch(`/api/clubs/${clubId}/join`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!response.ok) throw new Error(await getErrorMessage(response, t('couldNotJoinClub')))
      setPageNotice(t('joinedClub'))
      setClubs((current) => current.filter((club) => club.id !== clubId))
    } catch (joinError) {
      setClubErrors((current) => ({
        ...current,
        [clubId]: joinError instanceof Error ? joinError.message : t('couldNotJoinClub'),
      }))
    } finally {
      setJoiningClubId('')
    }
  }

  const handlePrivateJoin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!accessToken) {
      setPrivateJoinError(t('sessionExpired'))
      return
    }
    setJoiningClubId('private')
    setPrivateJoinError('')
    try {
      const response = await fetch('/api/clubs/join-private', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ invite_code: inviteCode.trim() }),
      })
      if (!response.ok) throw new Error(await getErrorMessage(response, t('couldNotJoinClub')))
      setInviteCode('')
      setShowJoinPrivate(false)
      setPageNotice(t('joinedPrivateClub'))
      pageRef.current = 0
      hasMoreRef.current = true
      setClubs([])
      setHasMore(true)
      setLoading(true)
      setError('')
      void loadPage(1, searchRef.current, true)
    } catch (joinError) {
      setPrivateJoinError(joinError instanceof Error ? joinError.message : t('couldNotJoinClub'))
    } finally {
      setJoiningClubId('')
    }
  }

  const clubTypeDetails = {
    movie: { title: t('movieClubs'), icon: Film },
    book: { title: t('bookClubs'), icon: BookOpen },
    sport: { title: t('sportClubs'), icon: Dumbbell },
    board_games: { title: t('boardGameClubs'), icon: Dice5 },
  } satisfies Record<ClubRecord['club_type'], { title: string; icon: typeof Film }>
  const title = scope === 'my' ? t('myClubs') : t('publicClubs')
  const EmptyIcon = scope === 'my' ? BookOpen : Globe2

  return (
    <section className="club-list-page" aria-labelledby="club-list-title">
      <div className="club-list-heading">
        <div>
          <div className="eyebrow">{t('clubs')}</div>
          <h1 id="club-list-title">{title}</h1>
        </div>
        {scope === 'my' && (
          <div className="club-list-actions">
            <button className="button button-light" type="button" onClick={() => { setPrivateJoinError(''); setShowJoinPrivate(true) }}>
              <LockKeyhole size={15} aria-hidden="true" /> {t('joinPrivateClub')}
            </button>
            <button
              className="button button-primary"
              type="button"
              aria-label={t('createClub')}
              onClick={() => { setCreateError(''); setShowCreateForm((visible) => !visible) }}
            >
              <Plus size={16} aria-hidden="true" /> {t('createClub')}
            </button>
          </div>
        )}
        {scope === 'public' && (
          <button
            className="button button-light"
            type="button"
            onClick={() => {
              setPrivateJoinError('')
              setShowJoinPrivate((visible) => !visible)
            }}
          >
            <LockKeyhole size={15} aria-hidden="true" /> {t('joinPrivateClub')}
          </button>
        )}
      </div>

      {showJoinPrivate && (
        <div className="club-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowJoinPrivate(false) }}>
          <form className="club-join-modal" role="dialog" aria-modal="true" aria-labelledby="join-private-title" onSubmit={(event) => void handlePrivateJoin(event)}>
            <div className="club-create-form-heading">
              <h2 id="join-private-title">{t('joinPrivateClub')}</h2>
              <button type="button" className="text-link" onClick={() => setShowJoinPrivate(false)}>{t('cancel')}</button>
            </div>
            <label className="club-form-field">
              <span>{t('inviteCode')}</span>
              <input required minLength={8} maxLength={8} value={inviteCode} onChange={(event) => setInviteCode(event.target.value.toUpperCase())} autoComplete="off" />
            </label>
            {privateJoinError && <p className="club-form-error" role="alert">{privateJoinError}</p>}
            <button className="button button-primary" type="submit" disabled={joiningClubId === 'private'}>
              {joiningClubId === 'private' ? t('loading') : t('joinClub')}
            </button>
          </form>
        </div>
      )}

      {pageNotice && <p className="club-list-notice" role="status">{pageNotice}</p>}

      {showCreateForm && (
        <form className="club-create-form" onSubmit={(event) => void handleCreate(event)}>
          <div className="club-create-form-heading">
            <h2>{t('createClub')}</h2>
            <button type="button" className="text-link" onClick={() => setShowCreateForm(false)}>
              {t('cancel')}
            </button>
          </div>
          <label className="club-form-field">
            <span>{t('clubType')}</span>
            <select
              value={form.clubType}
              onChange={(event) => setForm((current) => ({
                ...current,
                clubType: event.target.value as ClubRecord['club_type'],
              }))}
            >
              {Object.entries(clubTypeDetails).map(([clubType, details]) => (
                <option key={clubType} value={clubType}>{details.title}</option>
              ))}
            </select>
          </label>
          <label className="club-form-field">
            <span>{t('clubTitle')}</span>
            <input
              required
              maxLength={50}
              value={form.title}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
            />
          </label>
          <label className="club-form-field">
            <span>{t('clubAvatarUrl')}</span>
            <input
              type="url"
              value={form.avatarUrl}
              onChange={(event) => setForm((current) => ({ ...current, avatarUrl: event.target.value }))}
            />
          </label>
          <label className="club-public-toggle">
            <input
              type="checkbox"
              checked={form.isPublic}
              onChange={(event) => setForm((current) => ({ ...current, isPublic: event.target.checked }))}
            />
            <span>
              <strong>{t('publicClub')}</strong>
              <small>{t('publicClubHelp')}</small>
            </span>
          </label>
          {createError && <p className="club-form-error" role="alert">{createError}</p>}
          <button className="button button-primary" type="submit" disabled={creating}>
            {creating ? t('saving') : t('createClub')}
          </button>
        </form>
      )}

      {error && <p className="club-list-error" role="alert">{error}</p>}
      {!loading && clubs.length === 0 && !error && (
        <div className="club-list-empty">
          <EmptyIcon size={25} aria-hidden="true" />
          <p>{t('noClubsFound')}</p>
        </div>
      )}

      <div className="club-record-grid">
        {clubs.map((club) => {
          const ClubIcon = clubTypeDetails[club.club_type].icon
          return (
            <article className="club-record-card" key={club.id}>
              {club.avatar_url ? (
                <img className="club-record-avatar" src={club.avatar_url} alt="" />
              ) : (
                <div className="club-record-avatar club-record-avatar-placeholder" aria-hidden="true">
                  <ClubIcon size={24} />
                </div>
              )}
              <div className="club-record-info">
                <h2>{scope === 'my' ? <Link to={`/clubs/${club.id}`}>{club.title}</Link> : club.title}</h2>
                <span className="club-type-label">{clubTypeDetails[club.club_type].title}</span>
                <span className="club-visibility">
                  {club.is_public ? <Globe2 size={13} aria-hidden="true" /> : <LockKeyhole size={13} aria-hidden="true" />}
                  {club.is_public ? t('publicLabel') : t('privateLabel')}
                </span>
                {scope === 'public' && club.is_public && (
                  <>
                  <button
                    className="button button-primary club-card-action"
                    type="button"
                    disabled={joiningClubId === club.id}
                    onClick={() => void handlePublicJoin(club.id)}
                  >
                    {joiningClubId === club.id ? t('loading') : t('joinClub')}
                  </button>
                  {clubErrors[club.id] && <p className="club-form-error" role="alert">{clubErrors[club.id]}</p>}
                  </>
                )}
              </div>
            </article>
          )
        })}
      </div>

      {loading && <p className="club-list-loading" role="status">{t('loadingMore')}</p>}
      {hasMore && !loading && (
        <button className="button button-light club-load-more" type="button" onClick={loadNextPage}>
          {t('loadMoreClubs')}
        </button>
      )}
      <div ref={sentinelRef} className="club-list-sentinel" aria-hidden="true" />
    </section>
  )
}
