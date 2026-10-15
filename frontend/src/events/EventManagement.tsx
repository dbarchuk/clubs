import { useCallback, useEffect, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useI18n } from '../lib/i18n-context'
import { catalogLocaleForQuery, localizedBoardGameDescription, localizedBoardGameTitle, localizedMovieTitle } from '../lib/catalog-localization'
import type { BoardGameRecord, BoardGameSearchResult, EventRecord, MovieRecord, MovieSearchResult } from '../types/supabase'
import './events.css'

const DEFAULT_NOTICE_DURATION_MS = 5_000
const configuredNoticeDuration = Number(import.meta.env.VITE_NOTIFICATION_DURATION_MS)
const noticeDurationMs = Number.isFinite(configuredNoticeDuration) && configuredNoticeDuration >= 0
  ? configuredNoticeDuration
  : DEFAULT_NOTICE_DURATION_MS

interface EventManagementProps {
  clubId: string
  clubType: 'book' | 'movie' | 'sport' | 'board_games'
  accessToken: string
  canManage: boolean
  formOpen: boolean
  onFormOpenChange: (open: boolean) => void
}

async function errorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body: unknown = await response.json()
    if (typeof body === 'object' && body !== null && 'detail' in body && typeof body.detail === 'string') return body.detail
  } catch {
    return fallback
  }
  return fallback
}

export function EventManagement({ clubId, clubType, accessToken, canManage, formOpen, onFormOpenChange }: EventManagementProps) {
  const { t, language } = useI18n()
  const [events, setEvents] = useState<EventRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [searchingMovies, setSearchingMovies] = useState(false)
  const [savingMovie, setSavingMovie] = useState(false)
  const [activeMovieStatusEditor, setActiveMovieStatusEditor] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [title, setTitle] = useState('')
  const [linkedItemId, setLinkedItemId] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [movieQuery, setMovieQuery] = useState('')
  const [movieResults, setMovieResults] = useState<MovieSearchResult[]>([])
  const [hasSearchedMovies, setHasSearchedMovies] = useState(false)
  const [hasSearchedTmdbMovies, setHasSearchedTmdbMovies] = useState(false)
  const [selectedMovie, setSelectedMovie] = useState<MovieRecord | MovieSearchResult | null>(null)
  const [boardGameQuery, setBoardGameQuery] = useState('')
  const [boardGameUkrainianTitle, setBoardGameUkrainianTitle] = useState('')
  const [boardGameUkrainianDescription, setBoardGameUkrainianDescription] = useState('')
  const [boardGameResults, setBoardGameResults] = useState<BoardGameSearchResult[]>([])
  const [searchingBoardGames, setSearchingBoardGames] = useState(false)
  const [savingBoardGame, setSavingBoardGame] = useState(false)
  const [selectedBoardGame, setSelectedBoardGame] = useState<BoardGameRecord | null>(null)
  const [editingEvent, setEditingEvent] = useState<EventRecord | null>(null)

  const loadEvents = useCallback(async () => {
    const response = await fetch(`/api/events/clubs/${clubId}`, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!response.ok) throw new Error(await errorMessage(response, t('eventsLoadError')))
    setEvents((await response.json()) as EventRecord[])
  }, [accessToken, clubId, t])

  useEffect(() => {
    let cancelled = false
    // oxlint-disable-next-line react/set-state-in-effect -- Event state is updated after the API response.
    void loadEvents().catch((loadError: unknown) => {
      if (!cancelled) setError(loadError instanceof Error ? loadError.message : t('eventsLoadError'))
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [loadEvents, t])

  useEffect(() => {
    if (!notice) return
    const timeoutId = window.setTimeout(() => setNotice(''), noticeDurationMs)
    return () => window.clearTimeout(timeoutId)
  }, [notice])

  const resetForm = () => {
    setEditingEvent(null)
    onFormOpenChange(false)
    setTitle('')
    setLinkedItemId('')
    setAvatarUrl('')
    setStartDate('')
    setEndDate('')
    setStartTime('')
    setEndTime('')
    setMovieQuery('')
    setMovieResults([])
    setHasSearchedMovies(false)
    setHasSearchedTmdbMovies(false)
    setSelectedMovie(null)
    setBoardGameQuery('')
    setBoardGameUkrainianTitle('')
    setBoardGameUkrainianDescription('')
    setBoardGameResults([])
    setSelectedBoardGame(null)
  }

  const searchMovies = async (includeTmdb = false) => {
    const query = movieQuery.trim()
    if (!query) return
    setSearchingMovies(true)
    setError('')
    if (!includeTmdb) {
      setMovieResults([])
      setHasSearchedMovies(false)
      setHasSearchedTmdbMovies(false)
    }
    try {
      const params = new URLSearchParams({
        title: query,
        language: catalogLocaleForQuery(query, language),
        ...(includeTmdb ? { include_tmdb: 'true' } : {}),
      })
      const response = await fetch(`/api/movies?${params.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!response.ok) throw new Error(await errorMessage(response, t('movieSearchError')))
      setMovieResults((await response.json()) as MovieSearchResult[])
      setHasSearchedMovies(true)
      if (includeTmdb) setHasSearchedTmdbMovies(true)
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : t('movieSearchError'))
    } finally {
      setSearchingMovies(false)
    }
  }

  const handleMovieSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      void searchMovies()
    }
  }

  const searchBoardGames = async () => {
    const query = boardGameQuery.trim()
    if (!query) return
    setSearchingBoardGames(true)
    setError('')
    setBoardGameResults([])
    try {
      const response = await fetch(`/api/board-games?title=${encodeURIComponent(query)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!response.ok) throw new Error(await errorMessage(response, t('boardGameSearchError')))
      setBoardGameResults((await response.json()) as BoardGameSearchResult[])
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : t('boardGameSearchError'))
    } finally {
      setSearchingBoardGames(false)
    }
  }

  const handleBoardGameSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      void searchBoardGames()
    }
  }

  const createBoardGame = async () => {
    const gameTitle = boardGameQuery.trim()
    if (!gameTitle) return
    setSavingBoardGame(true)
    setError('')
    try {
      const response = await fetch('/api/board-games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          title: gameTitle,
          translations: boardGameUkrainianTitle.trim() || boardGameUkrainianDescription.trim()
            ? [{ locale: 'uk-UA', title: boardGameUkrainianTitle.trim() || null, description: boardGameUkrainianDescription.trim() || null }]
            : [],
        }),
      })
      if (!response.ok) throw new Error(await errorMessage(response, t('boardGameSaveError')))
      const game = (await response.json()) as BoardGameRecord
      setSelectedBoardGame(game)
      setBoardGameQuery(localizedBoardGameTitle(game, language))
      setBoardGameUkrainianTitle('')
      setBoardGameUkrainianDescription('')
      setBoardGameResults([])
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t('boardGameSaveError'))
    } finally {
      setSavingBoardGame(false)
    }
  }

  const selectBoardGame = async (result: BoardGameSearchResult) => {
    if (result.id !== null) {
      setSelectedBoardGame(result)
      setBoardGameQuery(localizedBoardGameTitle(result, language))
      setBoardGameResults([])
      return
    }

    setSavingBoardGame(true)
    setError('')
    try {
      const response = await fetch('/api/board-games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          title: result.title,
          cover_image_url: result.cover_image_url,
          translations: boardGameUkrainianTitle.trim() || boardGameUkrainianDescription.trim()
            ? [{ locale: 'uk-UA', title: boardGameUkrainianTitle.trim() || null, description: boardGameUkrainianDescription.trim() || null }]
            : [],
        }),
      })
      if (!response.ok) throw new Error(await errorMessage(response, t('boardGameSaveError')))
      const game = (await response.json()) as BoardGameRecord
      setSelectedBoardGame(game)
      setBoardGameQuery(localizedBoardGameTitle(game, language))
      setBoardGameUkrainianTitle('')
      setBoardGameUkrainianDescription('')
      setBoardGameResults([])
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t('boardGameSaveError'))
    } finally {
      setSavingBoardGame(false)
    }
  }

  const selectMovie = async (movie: MovieSearchResult) => {
    setError('')
    setSavingMovie(true)
    try {
      const response = await fetch('/api/movies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ external_id: movie.external_id }),
      })
      if (!response.ok) throw new Error(await errorMessage(response, t('movieSaveError')))
      const savedMovie = (await response.json()) as MovieRecord
      setSelectedMovie(savedMovie)
      setTitle((currentTitle) => currentTitle.trim() ? currentTitle : localizedMovieTitle(savedMovie, language))
      setMovieResults([])
      setHasSearchedMovies(false)
      setHasSearchedTmdbMovies(false)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t('movieSaveError'))
    } finally {
      setSavingMovie(false)
    }
  }

  const startEditing = (record: EventRecord) => {
    setEditingEvent(record)
    onFormOpenChange(true)
    setTitle(record.title ?? '')
    setLinkedItemId(record.linked_item_id ?? '')
    setAvatarUrl(record.avatar_url ?? '')
    setStartDate(record.start_date ?? '')
    setEndDate(record.end_date ?? '')
    setStartTime(record.start_time?.slice(0, 5) ?? '')
    setEndTime(record.end_time?.slice(0, 5) ?? '')
    setSelectedMovie(record.linked_movie)
    setMovieQuery(record.linked_movie ? localizedMovieTitle(record.linked_movie, language) : '')
    setSelectedBoardGame(record.linked_board_game)
    setBoardGameQuery(record.linked_board_game ? localizedBoardGameTitle(record.linked_board_game, language) : '')
    setBoardGameResults([])
    setMovieResults([])
    setHasSearchedMovies(false)
    setHasSearchedTmdbMovies(false)
    setError('')
    setNotice('')
  }

  const saveEvent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')
    const isMovieClub = clubType === 'movie'
    const isBoardGameClub = clubType === 'board_games'
    const isCatalogEvent = isMovieClub || isBoardGameClub
    const url = editingEvent
      ? `/api/events/${editingEvent.id}`
      : `/api/events/clubs/${clubId}`
    try {
      const response = await fetch(url, {
        method: editingEvent ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          title: isBoardGameClub
            ? (selectedBoardGame?.title ?? null)
            : title.trim() || (isMovieClub && selectedMovie ? localizedMovieTitle(selectedMovie, language) : null) || null,
          linked_item_id: isMovieClub ? (selectedMovie ? String(selectedMovie.id) : null) : isBoardGameClub ? (selectedBoardGame ? String(selectedBoardGame.id) : null) : (linkedItemId.trim() || null),
          avatar_url: isCatalogEvent ? null : (avatarUrl.trim() || null),
          start_date: startDate || null,
          end_date: isCatalogEvent ? null : endDate || null,
          start_time: isCatalogEvent ? null : startTime || null,
          end_time: isCatalogEvent ? null : endTime || null,
        }),
      })
      if (!response.ok) throw new Error(await errorMessage(response, editingEvent ? t('eventUpdateError') : t('eventSaveError')))
      await loadEvents()
      resetForm()
      setNotice(editingEvent ? t('eventUpdated') : t('eventCreated'))
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t('eventSaveError'))
    } finally {
      setSaving(false)
    }
  }

  const updateStatus = async (record: EventRecord, nextStatus: EventRecord['status']) => {
    setError('')
    try {
      const response = await fetch(`/api/events/${record.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ status: nextStatus }),
      })
      if (!response.ok) throw new Error(await errorMessage(response, t('eventUpdateError')))
      await loadEvents()
      setActiveMovieStatusEditor(null)
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : t('eventUpdateError'))
    }
  }

  const removeEvent = async (record: EventRecord) => {
    if (!window.confirm(t('confirmDeleteEvent'))) return
    setError('')
    try {
      const response = await fetch(`/api/events/${record.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } })
      if (!response.ok) throw new Error(await errorMessage(response, t('eventDeleteError')))
      await loadEvents()
      setNotice(t('eventDeleted'))
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : t('eventDeleteError'))
    }
  }

  const queueEvents = clubType === 'movie'
    ? events.filter((record) => record.status !== 'held' && record.start_date === null)
    : []
  const heldEvents = events.filter((record) => record.status === 'held')
  const upcomingEvents = events
    .filter((record) =>
      record.status !== 'held' && record.status !== 'cancelled'
      && !(clubType === 'movie' && record.start_date === null),
    )
    .sort((first, second) => (second.start_date ?? '').localeCompare(first.start_date ?? ''))

  const renderEvent = (record: EventRecord) => (
    clubType === 'movie' || clubType === 'board_games' ? renderCatalogEvent(record) : (
    <li className="event-card" key={record.id}>
      {(record.avatar_url || record.linked_movie?.cover_image_url || record.linked_board_game?.cover_image_url) && <img src={record.avatar_url || record.linked_movie?.cover_image_url || record.linked_board_game?.cover_image_url || ''} alt="" />}
      <div className="event-card-content">
        <h3>{record.title || record.linked_movie?.title || record.linked_board_game?.title || t('clubEvent')}</h3>
        <p>{record.start_date ? `${record.start_date}${record.end_date && record.end_date !== record.start_date ? ` – ${record.end_date}` : ''}${record.start_time ? ` · ${record.start_time.slice(0, 5)}–${record.end_time?.slice(0, 5) ?? ''}` : ` · ${t('allDay')}`}` : t('eventQueue')}</p>
        <span className={`event-status event-status-${record.status}`}>{t(`eventStatus_${record.status}`)}</span>
      </div>
      {canManage && <div className="event-card-actions">
        <button className="button button-light" type="button" onClick={() => startEditing(record)}>{t('editEvent')}</button>
        <label><span className="visually-hidden">{t('eventStatus')}</span><select value={record.status} onChange={(event) => void updateStatus(record, event.target.value as EventRecord['status'])}>
          <option value="scheduled">{t('eventStatus_scheduled')}</option><option value="delayed">{t('eventStatus_delayed')}</option><option value="cancelled">{t('eventStatus_cancelled')}</option><option value="held">{t('eventStatus_held')}</option>
        </select></label>
        <button className="button button-light" type="button" onClick={() => void removeEvent(record)}>{t('deleteEvent')}</button>
      </div>}
    </li>
    )
  )

  function renderCatalogEvent(record: EventRecord) {
    const linkedTitle = record.linked_movie
      ? localizedMovieTitle(record.linked_movie, language)
      : record.linked_board_game ? localizedBoardGameTitle(record.linked_board_game, language) : null
    const titleIsMovieMetadata = record.linked_movie && (
      record.title === record.linked_movie.title
      || record.linked_movie.translations?.some((translation) => translation.title === record.title)
    )
    const displayedTitle = record.linked_board_game
      ? localizedBoardGameTitle(record.linked_board_game, language)
      : record.linked_movie && titleIsMovieMetadata
        ? localizedMovieTitle(record.linked_movie, language)
        : record.title || linkedTitle || t('clubEvent')
    const linkedCover = record.linked_movie?.cover_image_url || record.linked_board_game?.cover_image_url
    const cardContent = (
      <>
        {record.avatar_url || linkedCover
          ? <img src={record.avatar_url || linkedCover || ''} alt="" />
          : <span className="movie-event-card-placeholder" aria-hidden="true" />}
        <span className="movie-event-card-content">
          <span className="movie-event-card-date">{record.start_date ?? t('eventQueue')}</span>
          <strong>{displayedTitle}</strong>
          <span className={`event-status event-status-${record.status}`}>{t(`eventStatus_${record.status}`)}</span>
        </span>
      </>
    )

    return (
      <li className="movie-event-card" key={record.id}>
        {canManage ? (
          <button
            className="movie-event-card-trigger"
            type="button"
            aria-expanded={activeMovieStatusEditor === record.id}
            aria-label={`${record.title || linkedTitle || t('clubEvent')} · ${t('eventStatus')}`}
            onClick={() => setActiveMovieStatusEditor((activeId) => activeId === record.id ? null : record.id)}
          >
            {cardContent}
          </button>
        ) : <div className="movie-event-card-trigger">{cardContent}</div>}
        {canManage && activeMovieStatusEditor === record.id && (
          <div className="movie-event-card-editor">
            <label>
              <span>{t('eventStatus')}</span>
              <select value={record.status} onChange={(event) => void updateStatus(record, event.target.value as EventRecord['status'])}>
                <option value="scheduled">{t('eventStatus_scheduled')}</option>
                <option value="delayed">{t('eventStatus_delayed')}</option>
                <option value="cancelled">{t('eventStatus_cancelled')}</option>
                <option value="held">{t('eventStatus_held')}</option>
              </select>
            </label>
            <div className="event-card-actions">
              <button className="button button-light" type="button" onClick={() => startEditing(record)}>{t('editEvent')}</button>
              <button className="button button-light" type="button" onClick={() => void removeEvent(record)}>{t('deleteEvent')}</button>
            </div>
          </div>
        )}
      </li>
    )
  }

  const eventListClassName = clubType === 'movie' || clubType === 'board_games' ? 'event-list movie-event-list' : 'event-list'

  return (
    <section className="event-management" aria-label={t('clubEvents')}>
      {notice && <p role="status">{notice}</p>}
      {error && <p className="club-form-error" role="alert">{error}</p>}
      {canManage && formOpen && (
        <form className="club-create-form" onSubmit={(event) => void saveEvent(event)}>
          <h3>{editingEvent ? t('editEvent') : t('createEvent')}</h3>
          <label className="club-form-field"><span>{t('eventTitle')}</span><input maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
          {clubType === 'movie' ? (
            <div className="movie-picker">
              <label className="club-form-field"><span>{t('searchMovies')}</span><input value={movieQuery} onChange={(event) => { setMovieQuery(event.target.value); setSelectedMovie(null); setMovieResults([]); setHasSearchedMovies(false); setHasSearchedTmdbMovies(false) }} onKeyDown={handleMovieSearchKeyDown} /></label>
              <div className="event-form-actions movie-search-actions">
                <button className="button button-light" type="button" onClick={() => void searchMovies()} disabled={searchingMovies || !movieQuery.trim()}>{searchingMovies ? t('loading') : t('search')}</button>
                {hasSearchedMovies && !hasSearchedTmdbMovies && movieResults.some((movie) => movie.id !== null) && (
                  <button className="button button-primary" type="button" onClick={() => void searchMovies(true)} disabled={searchingMovies}>
                    {searchingMovies ? t('loading') : t('searchTmdb')}
                  </button>
                )}
              </div>
              {selectedMovie && (
                <div className="selected-movie">
                  {selectedMovie.cover_image_url && <img src={selectedMovie.cover_image_url} alt="" />}
                  <span>{localizedMovieTitle(selectedMovie, language)}{selectedMovie.release_date ? ` · ${selectedMovie.release_date.slice(0, 4)}` : ''}</span>
                  <button className="button button-light" type="button" onClick={() => { setSelectedMovie(null); setMovieQuery('') }}>{t('removeSelectedMovie')}</button>
                </div>
              )}
              {savingMovie && <p role="status">{t('savingMovie')}</p>}
              {movieResults.length > 0 && (
                <ul className="movie-search-results" aria-label={t('movieSearchResults')}>
                  {movieResults.map((movie) => (
                    <li key={`${movie.provider}-${movie.external_id}`}>
                      <button type="button" onClick={() => void selectMovie(movie)} disabled={savingMovie}>
                        {movie.cover_image_url && <img src={movie.cover_image_url} alt="" />}
                        <span><strong>{localizedMovieTitle(movie, language)}</strong><small>{movie.release_date?.slice(0, 4) ?? t('unknownReleaseYear')} · {movie.id === null ? t('movieFromTmdb') : t('movieAlreadySaved')}</small></span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {!searchingMovies && hasSearchedMovies && movieResults.length === 0 && <p>{t('noMovieResults')}</p>}
            </div>
          ) : clubType === 'board_games' ? (
            <div className="movie-picker">
              <label className="club-form-field"><span>{t('searchBoardGames')}</span><input value={boardGameQuery} onChange={(event) => { setBoardGameQuery(event.target.value); setSelectedBoardGame(null); setBoardGameResults([]) }} onKeyDown={handleBoardGameSearchKeyDown} /></label>
              {!selectedBoardGame && <>
                <label className="club-form-field"><span>{t('ukrainianTitle')}</span><input value={boardGameUkrainianTitle} onChange={(event) => setBoardGameUkrainianTitle(event.target.value)} /></label>
                <label className="club-form-field"><span>{t('ukrainianDescription')}</span><textarea value={boardGameUkrainianDescription} onChange={(event) => setBoardGameUkrainianDescription(event.target.value)} /></label>
              </>}
              <div className="event-form-actions">
                <button className="button button-light" type="button" onClick={() => void searchBoardGames()} disabled={searchingBoardGames || !boardGameQuery.trim()}>{searchingBoardGames ? t('loading') : t('search')}</button>
                <button className="button button-light" type="button" onClick={() => void createBoardGame()} disabled={savingBoardGame || !boardGameQuery.trim()}>{savingBoardGame ? t('saving') : t('createBoardGame')}</button>
              </div>
              {selectedBoardGame && (
                <div className="selected-movie">
                  {selectedBoardGame.cover_image_url && <img src={selectedBoardGame.cover_image_url} alt="" />}
                  <span>{localizedBoardGameTitle(selectedBoardGame, language)}{localizedBoardGameDescription(selectedBoardGame, language) ? ` · ${localizedBoardGameDescription(selectedBoardGame, language)}` : ''}</span>
                  <button className="button button-light" type="button" onClick={() => { setSelectedBoardGame(null); setBoardGameQuery('') }}>{t('removeSelectedBoardGame')}</button>
                </div>
              )}
              {savingBoardGame && <p role="status">{t('savingBoardGame')}</p>}
              {boardGameResults.length > 0 && (
                <ul className="movie-search-results" aria-label={t('boardGameSearchResults')}>
                  {boardGameResults.map((game) => (
                    <li key={game.id === null ? `${game.provider}-${game.external_id}` : `local-${game.id}`}>
                      <button type="button" onClick={() => void selectBoardGame(game)} disabled={savingBoardGame}>
                        {game.cover_image_url && <img src={game.cover_image_url} alt="" />}
                        <span><strong>{game.id === null ? game.title : localizedBoardGameTitle(game, language)}</strong><small>{game.id === null ? `${t('boardGameFromGeekach')}${game.price === null ? '' : ` · ${game.price} ₴`}${game.in_stock === false ? ` · ${t('unavailable')}` : ''}` : localizedBoardGameDescription(game, language) || t('boardGameAlreadySaved')}</small></span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <label className="club-form-field"><span>{t('linkedItemId')}</span><input value={linkedItemId} onChange={(event) => setLinkedItemId(event.target.value)} /></label>
          )}
          {clubType !== 'movie' && clubType !== 'board_games' && <label className="club-form-field"><span>{t('eventAvatarUrl')}</span><input type="url" value={avatarUrl} onChange={(event) => setAvatarUrl(event.target.value)} /></label>}
          <div className="event-date-fields">
            <label className="club-form-field"><span>{t('startDate')}{clubType === 'movie' || clubType === 'board_games' ? ` (${t('optional')})` : ''}</span><input required={clubType !== 'movie' && clubType !== 'board_games'} type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
            {clubType !== 'movie' && clubType !== 'board_games' && <>
              <label className="club-form-field"><span>{t('endDate')}</span><input required type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
              <label className="club-form-field"><span>{t('startTime')}</span><input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} /></label>
              <label className="club-form-field"><span>{t('endTime')}</span><input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} /></label>
            </>}
          </div>
          <div className="event-form-actions">
            <button className="button button-primary" type="submit" disabled={saving || savingMovie || savingBoardGame}>{saving ? t('saving') : editingEvent ? t('saveEventChanges') : t('createEvent')}</button>
            {editingEvent && <button className="button button-light" type="button" onClick={resetForm}>{t('cancelEditEvent')}</button>}
          </div>
        </form>
      )}
      {loading ? <p role="status">{t('loading')}</p> : events.length === 0 ? <p>{t('noEvents')}</p> : <div className="event-groups">
        <section aria-labelledby="upcoming-events-title"><h3 id="upcoming-events-title">{t('upcomingEvents')}</h3>{upcomingEvents.length ? <ul className={eventListClassName}>{upcomingEvents.map(renderEvent)}</ul> : <p>{t('noEvents')}</p>}</section>
        {clubType === 'movie' && <section aria-labelledby="event-queue-title"><h3 id="event-queue-title">{t('eventQueue')}</h3>{queueEvents.length ? <ul className={eventListClassName}>{queueEvents.map(renderEvent)}</ul> : <p>{t('noEvents')}</p>}</section>}
        <section aria-labelledby="held-events-title"><h3 id="held-events-title">{t('heldEvents')}</h3>{heldEvents.length ? <ul className={eventListClassName}>{heldEvents.map(renderEvent)}</ul> : <p>{t('noEvents')}</p>}</section>
      </div>}
    </section>
  )
}
