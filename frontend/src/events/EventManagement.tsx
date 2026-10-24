import { useCallback, useEffect, useState, type FormEvent, type KeyboardEvent } from 'react'
import { CalendarClock, Check, Clock, Settings, X } from 'lucide-react'
import { useI18n } from '../lib/i18n-context'
import { catalogLocaleForQuery, localizedBoardGameDescription, localizedBoardGameTitle, localizedBookTitle, localizedMovieTitle } from '../lib/catalog-localization'
import { ReviewPanel } from '../reviews/ReviewPanel'
import type { BookRecord, BookSearchResult, BoardGameRecord, BoardGameSearchResult, EventRecord, MovieRecord, MovieSearchResult, ReviewCatalogType } from '../types/supabase'
import './events.css'

const DEFAULT_NOTICE_DURATION_MS = 5_000
const configuredNoticeDuration = Number(import.meta.env.VITE_NOTIFICATION_DURATION_MS)
const noticeDurationMs = Number.isFinite(configuredNoticeDuration) && configuredNoticeDuration >= 0
  ? configuredNoticeDuration
  : DEFAULT_NOTICE_DURATION_MS

interface ReviewTarget {
  catalogType: ReviewCatalogType
  itemId: number
  title: string
}

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
  const [activeEventActionsEditor, setActiveEventActionsEditor] = useState<string | null>(null)
  const [reviewTarget, setReviewTarget] = useState<ReviewTarget | null>(null)
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
  const [bookQuery, setBookQuery] = useState('')
  const [bookResults, setBookResults] = useState<BookSearchResult[]>([])
  const [searchingBooks, setSearchingBooks] = useState(false)
  const [savingBook, setSavingBook] = useState(false)
  const [hasSearchedBooks, setHasSearchedBooks] = useState(false)
  const [hasSearchedGoogleBooks, setHasSearchedGoogleBooks] = useState(false)
  const [selectedBook, setSelectedBook] = useState<BookRecord | null>(null)
  const [editingEvent, setEditingEvent] = useState<EventRecord | null>(null)
  const [pendingEventStatus, setPendingEventStatus] = useState<EventRecord['status'] | null>(null)

  const updateEventRating = useCallback((rating: number | null) => {
    if (!reviewTarget) return
    setEvents((current) => current.map((record) => {
      const matchesTarget = reviewTarget.catalogType === 'movies'
        ? record.linked_movie?.id === reviewTarget.itemId
        : reviewTarget.catalogType === 'books'
          ? record.linked_book?.id === reviewTarget.itemId
          : record.linked_board_game?.id === reviewTarget.itemId
      return matchesTarget ? { ...record, my_rating: rating } : record
    }))
  }, [reviewTarget])

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
    setBookQuery('')
    setBookResults([])
    setHasSearchedBooks(false)
    setHasSearchedGoogleBooks(false)
    setSelectedBook(null)
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

  const searchBooks = async (includeGoogleBooks = false) => {
    const query = bookQuery.trim()
    if (!query) return
    setSearchingBooks(true)
    setError('')
    if (!includeGoogleBooks) {
      setBookResults([])
      setHasSearchedBooks(false)
      setHasSearchedGoogleBooks(false)
    }
    try {
      const params = new URLSearchParams({
        query,
        search_provider: String(includeGoogleBooks),
        language: catalogLocaleForQuery(query, language).startsWith('uk') ? 'uk' : 'en',
      })
      const response = await fetch(`/api/books?${params.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!response.ok) throw new Error(await errorMessage(response, t('bookSearchError')))
      setBookResults((await response.json()) as BookSearchResult[])
      setHasSearchedBooks(true)
      if (includeGoogleBooks) setHasSearchedGoogleBooks(true)
    } catch (searchError: unknown) {
      setError(searchError instanceof Error ? searchError.message : t('bookSearchError'))
    } finally {
      setSearchingBooks(false)
    }
  }

  const handleBookSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      void searchBooks()
    }
  }

  const selectBook = async (book: BookSearchResult) => {
    if (book.id !== null) {
      setSelectedBook(book)
      setTitle((currentTitle) => currentTitle.trim() ? currentTitle : localizedBookTitle(book, language))
      setBookResults([])
      return
    }
    setSavingBook(true)
    setError('')
    try {
      const response = await fetch('/api/books', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ external_id: book.external_id }),
      })
      if (!response.ok) throw new Error(await errorMessage(response, t('bookSaveError')))
      const savedBook = await response.json() as BookRecord
      setSelectedBook(savedBook)
      setTitle((currentTitle) => currentTitle.trim() ? currentTitle : localizedBookTitle(savedBook, language))
      setBookResults([])
      setHasSearchedBooks(false)
      setHasSearchedGoogleBooks(false)
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : t('bookSaveError'))
    } finally {
      setSavingBook(false)
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
    setActiveEventActionsEditor(null)
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
    setSelectedBook(record.linked_book)
    setBookQuery(record.linked_book ? localizedBookTitle(record.linked_book, language) : '')
    setBookResults([])
    setHasSearchedBooks(false)
    setHasSearchedGoogleBooks(false)
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
    const isBookClub = clubType === 'book'
    const isCatalogEvent = isMovieClub || isBoardGameClub || isBookClub
    try {
      const response = await fetch(editingEvent ? `/api/events/${editingEvent.id}` : `/api/events/clubs/${clubId}`, {
        method: editingEvent ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          title: isBoardGameClub
            ? (selectedBoardGame?.title ?? null)
            : title.trim() || (isMovieClub && selectedMovie ? localizedMovieTitle(selectedMovie, language) : null) || (isBookClub && selectedBook ? localizedBookTitle(selectedBook, language) : null) || null,
          linked_item_id: isMovieClub ? (selectedMovie ? String(selectedMovie.id) : null) : isBoardGameClub ? (selectedBoardGame ? String(selectedBoardGame.id) : null) : isBookClub ? (selectedBook ? String(selectedBook.id) : null) : (linkedItemId.trim() || null),
          avatar_url: isCatalogEvent ? null : (avatarUrl.trim() || null),
          start_date: startDate || null,
          end_date: isCatalogEvent ? null : endDate || null,
          start_time: isCatalogEvent || isBookClub ? null : startTime || null,
          end_time: isCatalogEvent || isBookClub ? null : endTime || null,
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
      setPendingEventStatus(null)
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
      setActiveEventActionsEditor(null)
      setNotice(t('eventDeleted'))
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : t('eventDeleteError'))
    }
  }

  const queueEvents = clubType === 'movie' || clubType === 'book'
    ? events.filter((record) => record.status !== 'held' && record.start_date === null)
    : []
  const heldEvents = events.filter((record) => record.status === 'held')

  const toggleEventStatusEditor = (record: EventRecord) => {
    if (activeMovieStatusEditor === record.id) {
      setActiveMovieStatusEditor(null)
      setPendingEventStatus(null)
      return
    }
    setActiveEventActionsEditor(null)
    setActiveMovieStatusEditor(record.id)
    setPendingEventStatus(record.status)
  }

  const toggleEventActionsEditor = (record: EventRecord) => {
    setActiveMovieStatusEditor(null)
    setPendingEventStatus(null)
    setActiveEventActionsEditor((activeId) => activeId === record.id ? null : record.id)
  }

  const cancelEventStatusEdit = () => {
    setActiveMovieStatusEditor(null)
    setPendingEventStatus(null)
  }

  const confirmEventStatus = (record: EventRecord) => {
    if (pendingEventStatus && pendingEventStatus !== record.status) {
      void updateStatus(record, pendingEventStatus)
    }
  }

  const renderEventStatus = (record: EventRecord) => {
    const label = t(`eventStatus_${record.status}`)
    const className = `event-status-icon event-status-icon-${record.status}`
    const Icon = record.status === 'held'
      ? Check
      : record.status === 'cancelled'
        ? X
        : record.status === 'delayed'
          ? CalendarClock
          : Clock
    return canManage ? (
      <button
        className={`${className} event-status-trigger`}
        type="button"
        aria-label={`${t('eventStatus')}: ${label}`}
        title={`${t('eventStatus')}: ${label}`}
        aria-expanded={activeMovieStatusEditor === record.id}
        onClick={() => toggleEventStatusEditor(record)}
      >
        <Icon aria-hidden="true" size={18} />
      </button>
    ) : <span className={className} role="img" aria-label={`${t('eventStatus')}: ${label}`} title={`${t('eventStatus')}: ${label}`}><Icon aria-hidden="true" size={18} /></span>
  }

  const renderEventActions = (record: EventRecord) => canManage ? (
    <button
      className="event-actions-icon"
      type="button"
      aria-label={t('eventActions')}
      title={t('eventActions')}
      aria-expanded={activeEventActionsEditor === record.id}
      onClick={() => toggleEventActionsEditor(record)}
    >
      <Settings aria-hidden="true" size={17} />
    </button>
  ) : null

  const renderEventRating = (record: EventRecord) => record.my_rating !== null && record.my_rating !== undefined ? (
    <span className="event-my-rating" aria-label={`${t('myRating')}: ${record.my_rating} / 10`}>
      <span>{t('myRating')}</span>
      <strong>{record.my_rating} / 10</strong>
      <span className="event-my-rating-track" aria-hidden="true"><span style={{ width: `${record.my_rating * 10}%` }} /></span>
    </span>
  ) : null

  const openEventReview = (record: EventRecord) => {
    if (record.linked_movie) {
      setReviewTarget({ catalogType: 'movies', itemId: record.linked_movie.id, title: localizedMovieTitle(record.linked_movie, language) })
    } else if (record.linked_board_game) {
      setReviewTarget({ catalogType: 'board-games', itemId: record.linked_board_game.id, title: localizedBoardGameTitle(record.linked_board_game, language) })
    } else if (record.linked_book) {
      setReviewTarget({ catalogType: 'books', itemId: record.linked_book.id, title: localizedBookTitle(record.linked_book, language) })
    }
  }
  const upcomingEvents = events
    .filter((record) =>
      record.status !== 'held' && record.status !== 'cancelled'
      && !((clubType === 'movie' || clubType === 'book') && record.start_date === null),
    )
    .sort((first, second) => (second.start_date ?? '').localeCompare(first.start_date ?? ''))

  const renderEvent = (record: EventRecord) => (
    clubType === 'movie' || clubType === 'board_games' ? renderCatalogEvent(record) : (
    <li className="event-card" key={record.id}>
      {renderEventStatus(record)}
      {renderEventActions(record)}
      <button className="event-review-card-content" type="button" disabled={!record.linked_movie && !record.linked_board_game && !record.linked_book} onClick={() => openEventReview(record)}>
      {(record.avatar_url || record.linked_movie?.cover_image_url || record.linked_board_game?.cover_image_url || record.linked_book?.cover_image_url) && <img src={record.avatar_url || record.linked_movie?.cover_image_url || record.linked_board_game?.cover_image_url || record.linked_book?.cover_image_url || ''} alt="" />}
      <div className="event-card-content">
        <h3>{record.linked_book && (!record.title || record.title === record.linked_book.title || record.linked_book.translations.some((translation) => translation.title === record.title))
          ? localizedBookTitle(record.linked_book, language)
          : record.title || record.linked_movie?.title || record.linked_board_game?.title || record.linked_book?.title || t('clubEvent')}</h3>
        <p>{record.start_date ? `${record.start_date}${record.end_date && record.end_date !== record.start_date ? ` – ${record.end_date}` : ''}${record.start_time ? ` · ${record.start_time.slice(0, 5)}–${record.end_time?.slice(0, 5) ?? ''}` : ` · ${t('allDay')}`}` : t('eventQueue')}</p>
      </div>
      </button>
      {renderEventRating(record)}
      {canManage && activeMovieStatusEditor === record.id && <div className="event-status-editor">
        <label><span>{t('eventStatus')}</span><select value={pendingEventStatus ?? record.status} onChange={(event) => setPendingEventStatus(event.target.value as EventRecord['status'])}>
          <option value="scheduled">{t('eventStatus_scheduled')}</option><option value="delayed">{t('eventStatus_delayed')}</option><option value="cancelled">{t('eventStatus_cancelled')}</option><option value="held">{t('eventStatus_held')}</option>
        </select></label>
        <button className="button button-primary" type="button" disabled={!pendingEventStatus || pendingEventStatus === record.status} onClick={() => confirmEventStatus(record)}>OK</button>
        <button className="button button-light" type="button" onClick={cancelEventStatusEdit}>{t('cancel')}</button>
      </div>}
      {canManage && activeEventActionsEditor === record.id && <div className="event-card-actions">
        <button className="button button-light" type="button" onClick={() => startEditing(record)}>{t('editEvent')}</button>
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
        </span>
      </>
    )

    return (
      <li className="movie-event-card" key={record.id}>
        {renderEventStatus(record)}
        {renderEventActions(record)}
        <button
            className="movie-event-card-trigger"
            type="button"
            aria-label={`${displayedTitle} · ${t('reviews')}`}
            onClick={() => openEventReview(record)}
          >
            {cardContent}
          </button>
        <div className="movie-event-card-meta">
          {renderEventRating(record)}
        </div>
        {canManage && activeMovieStatusEditor === record.id && (
          <div className="movie-event-card-editor">
            <label>
              <span>{t('eventStatus')}</span>
              <select value={pendingEventStatus ?? record.status} onChange={(event) => setPendingEventStatus(event.target.value as EventRecord['status'])}>
                <option value="scheduled">{t('eventStatus_scheduled')}</option>
                <option value="delayed">{t('eventStatus_delayed')}</option>
                <option value="cancelled">{t('eventStatus_cancelled')}</option>
                <option value="held">{t('eventStatus_held')}</option>
              </select>
            </label>
            <div className="event-card-actions">
              <button className="button button-primary" type="button" disabled={!pendingEventStatus || pendingEventStatus === record.status} onClick={() => confirmEventStatus(record)}>OK</button>
              <button className="button button-light" type="button" onClick={cancelEventStatusEdit}>{t('cancel')}</button>
            </div>
          </div>
        )}
        {canManage && activeEventActionsEditor === record.id && <div className="movie-event-card-editor event-actions-panel">
          <button className="button button-light" type="button" onClick={() => startEditing(record)}>{t('editEvent')}</button>
          <button className="button button-light" type="button" onClick={() => void removeEvent(record)}>{t('deleteEvent')}</button>
        </div>}
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
          ) : clubType === 'book' ? (
            <div className="movie-picker">
              <label className="club-form-field"><span>{t('searchBooks')}</span><input value={bookQuery} onChange={(event) => { setBookQuery(event.target.value); setSelectedBook(null); setBookResults([]); setHasSearchedBooks(false); setHasSearchedGoogleBooks(false) }} onKeyDown={handleBookSearchKeyDown} /></label>
              <div className="event-form-actions movie-search-actions">
                <button className="button button-light" type="button" onClick={() => void searchBooks()} disabled={searchingBooks || !bookQuery.trim()}>{searchingBooks ? t('loading') : t('search')}</button>
                {hasSearchedBooks && !hasSearchedGoogleBooks && <button className="button button-primary" type="button" onClick={() => void searchBooks(true)} disabled={searchingBooks}>{searchingBooks ? t('loading') : t('searchGoogleBooks')}</button>}
              </div>
              {selectedBook && <div className="selected-movie">
                {selectedBook.cover_image_url && <img src={selectedBook.cover_image_url} alt="" />}
                <span>{localizedBookTitle(selectedBook, language)}{selectedBook.authors.length ? ` · ${selectedBook.authors.join(', ')}` : ''}</span>
                <button className="button button-light" type="button" onClick={() => { setSelectedBook(null); setBookQuery('') }}>{t('removeSelectedBook')}</button>
              </div>}
              {savingBook && <p role="status">{t('savingBook')}</p>}
              {bookResults.length > 0 && <ul className="movie-search-results" aria-label={t('bookSearchResults')}>
                {bookResults.map((book) => <li key={book.id === null ? `${book.provider}-${book.external_id}` : `local-${book.id}`}>
                  <button type="button" onClick={() => void selectBook(book)} disabled={savingBook}>
                    {book.cover_image_url && <img src={book.cover_image_url} alt="" />}
                    <span><strong>{localizedBookTitle(book, language)}</strong><small>{[book.authors.join(', '), book.published_date, book.id === null ? t('bookFromGoogleBooks') : t('bookAlreadySaved')].filter(Boolean).join(' · ')}</small></span>
                  </button>
                </li>)}
              </ul>}
              {!searchingBooks && hasSearchedBooks && bookResults.length === 0 && <p>{t('noBookResults')}</p>}
            </div>
          ) : (
            <label className="club-form-field"><span>{t('linkedItemId')}</span><input value={linkedItemId} onChange={(event) => setLinkedItemId(event.target.value)} /></label>
          )}
          {clubType !== 'movie' && clubType !== 'board_games' && clubType !== 'book' && <label className="club-form-field"><span>{t('eventAvatarUrl')}</span><input type="url" value={avatarUrl} onChange={(event) => setAvatarUrl(event.target.value)} /></label>}
          <div className="event-date-fields">
            <label className="club-form-field"><span>{t('startDate')}{clubType === 'movie' || clubType === 'board_games' || clubType === 'book' ? ` (${t('optional')})` : ''}</span><input required={clubType !== 'movie' && clubType !== 'board_games' && clubType !== 'book'} type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
            {clubType !== 'movie' && clubType !== 'board_games' && clubType !== 'book' && <>
              <label className="club-form-field"><span>{t('endDate')}</span><input required type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
              <label className="club-form-field"><span>{t('startTime')}</span><input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} /></label>
              <label className="club-form-field"><span>{t('endTime')}</span><input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} /></label>
            </>}
          </div>
          <div className="event-form-actions">
            <button className="button button-primary" type="submit" disabled={saving || savingMovie || savingBoardGame || savingBook}>{saving ? t('saving') : editingEvent ? t('saveEventChanges') : t('createEvent')}</button>
            {editingEvent && <button className="button button-light" type="button" onClick={resetForm}>{t('cancelEditEvent')}</button>}
          </div>
        </form>
      )}
      {loading ? <p role="status">{t('loading')}</p> : events.length === 0 ? <p>{t('noEvents')}</p> : <div className="event-groups">
        <section aria-labelledby="upcoming-events-title"><h3 id="upcoming-events-title">{t('upcomingEvents')}</h3>{upcomingEvents.length ? <ul className={eventListClassName}>{upcomingEvents.map(renderEvent)}</ul> : <p>{t('noEvents')}</p>}</section>
        {(clubType === 'movie' || clubType === 'book') && <section aria-labelledby="event-queue-title"><h3 id="event-queue-title">{t('eventQueue')}</h3>{queueEvents.length ? <ul className={eventListClassName}>{queueEvents.map(renderEvent)}</ul> : <p>{t('noEvents')}</p>}</section>}
        <section aria-labelledby="held-events-title"><h3 id="held-events-title">{t('heldEvents')}</h3>{heldEvents.length ? <ul className={eventListClassName}>{heldEvents.map(renderEvent)}</ul> : <p>{t('noEvents')}</p>}</section>
      </div>}
      {reviewTarget && <ReviewPanel
        {...reviewTarget}
        accessToken={accessToken}
        onClose={() => setReviewTarget(null)}
        onRatingChange={updateEventRating}
      />}
    </section>
  )
}
