import { useCallback, useEffect, useMemo, useState, type FormEvent, type KeyboardEvent } from 'react'
import { BookOpen, Dice5, Film } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth-context'
import { useI18n } from '../lib/i18n-context'
import { localizedBoardGameTitle, localizedBookDescription, localizedBookTitle, localizedMovieOverview, localizedMovieTitle } from '../lib/catalog-localization'
import { ReviewPanel } from '../reviews/ReviewPanel'
import type { BookRecord, BoardGameRecord, LibraryBoardGame, LibraryBook, LibraryMovie, ReviewCatalogType } from '../types/supabase'
import './library.css'

type LibraryTab = 'movies' | 'books' | 'board-games'
type LibraryScope = 'all' | 'mine'
type LibrarySort = 'date_added' | 'year_released'

function isValidYear(value: string): boolean {
  return /^\d{4}$/.test(value) && Number(value) >= 1000 && Number(value) <= 2200
}

interface LibraryFiltersProps {
  scope: LibraryScope
  setScope: (scope: LibraryScope) => void
  yearFrom: string
  setYearFrom: (year: string) => void
  yearTo: string
  setYearTo: (year: string) => void
  sort: LibrarySort
  setSort: (sort: LibrarySort) => void
}

function LibraryFilters({ scope, setScope, yearFrom, setYearFrom, yearTo, setYearTo, sort, setSort }: LibraryFiltersProps) {
  const { t } = useI18n()
  return (
    <details className="library-filters">
      <summary>{t('libraryFilters')}</summary>
      <div className="library-filter-grid">
        <label>{t('libraryScope')}
          <select value={scope} onChange={(event) => setScope(event.target.value as LibraryScope)}>
            <option value="mine">{t('libraryMine')}</option>
            <option value="all">{t('libraryAll')}</option>
          </select>
        </label>
        <label>{t('yearFrom')}<input type="number" min={1000} max={2200} value={yearFrom} onChange={(event) => setYearFrom(event.target.value)} /></label>
        <label>{t('yearTo')}<input type="number" min={1000} max={2200} value={yearTo} onChange={(event) => setYearTo(event.target.value)} /></label>
        <label>{t('librarySort')}
          <select value={sort} onChange={(event) => setSort(event.target.value as LibrarySort)}>
            <option value="date_added">{t('sortDateAdded')}</option>
            <option value="year_released">{t('sortYearReleased')}</option>
          </select>
        </label>
      </div>
    </details>
  )
}

interface ReviewTarget {
  catalogType: ReviewCatalogType
  itemId: number
  title: string
}

function MyRating({ rating, onClick }: { rating: number | null; onClick: () => void }) {
  const { t } = useI18n()
  return (
    <button
      className="library-my-rating"
      type="button"
      onClick={onClick}
      aria-label={`${t('myRating')}: ${rating === null ? t('reviewNoRating') : `${rating} / 10`}. ${t('yourReview')}`}
    >
      <span>{t('myRating')}</span>
      {rating === null
        ? <strong aria-label={t('reviewNoRating')}>–</strong>
        : <>
          <strong>{rating} / 10</strong>
          <span
            className="library-my-rating-track"
            role="progressbar"
            aria-label={`${t('myRating')}: ${rating} / 10`}
            aria-valuemin={0}
            aria-valuemax={10}
            aria-valuenow={rating}
          >
            <span style={{ width: `${rating * 10}%` }} />
          </span>
        </>}
    </button>
  )
}

async function errorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const payload: unknown = await response.json()
    if (typeof payload === 'object' && payload !== null && 'detail' in payload) {
      if (typeof payload.detail === 'string') return payload.detail
      if (Array.isArray(payload.detail)) {
        const messages = payload.detail.flatMap((item: unknown) =>
          typeof item === 'object' && item !== null && 'msg' in item && typeof item.msg === 'string' ? [item.msg] : [],
        )
        if (messages.length > 0) return messages.join(' ')
      }
    }
  } catch {
    return fallback
  }
  return fallback
}

export function LibraryPage() {
  const { session, profile } = useAuth()
  const { t, language } = useI18n()
  const accessToken = session?.access_token
  const [movies, setMovies] = useState<LibraryMovie[]>([])
  const [boardGames, setBoardGames] = useState<LibraryBoardGame[]>([])
  const [books, setBooks] = useState<LibraryBook[]>([])
  const [loading, setLoading] = useState(true)
  const [boardGamesLoading, setBoardGamesLoading] = useState(true)
  const [booksLoading, setBooksLoading] = useState(true)
  const [error, setError] = useState('')
  const [boardGamesError, setBoardGamesError] = useState('')
  const [booksError, setBooksError] = useState('')
  const [activeTab, setActiveTab] = useState<LibraryTab>('movies')
  const [search, setSearch] = useState('')
  const [boardGameSearch, setBoardGameSearch] = useState('')
  const [bookSearch, setBookSearch] = useState('')
  const [scope, setScope] = useState<LibraryScope>('all')
  const [yearFrom, setYearFrom] = useState('')
  const [yearTo, setYearTo] = useState('')
  const [sort, setSort] = useState<LibrarySort>('date_added')
  const [editingMovie, setEditingMovie] = useState<LibraryMovie['movie'] | null>(null)
  const [savingMovie, setSavingMovie] = useState(false)
  const [editError, setEditError] = useState('')
  const [editingBoardGame, setEditingBoardGame] = useState<BoardGameRecord | null>(null)
  const [savingBoardGame, setSavingBoardGame] = useState(false)
  const [boardGameEditError, setBoardGameEditError] = useState('')
  const [editingBook, setEditingBook] = useState<BookRecord | null>(null)
  const [bookEditError, setBookEditError] = useState('')
  const [savingBook, setSavingBook] = useState(false)
  const [reviewTarget, setReviewTarget] = useState<ReviewTarget | null>(null)
  const isAdmin = profile?.is_admin === true
  const isSuperuser = profile?.is_superuser === true
  const libraryQuery = useMemo(() => {
    const params = new URLSearchParams({ scope, sort })
    if (isValidYear(yearFrom)) params.set('year_from', yearFrom)
    if (isValidYear(yearTo)) params.set('year_to', yearTo)
    return params.toString()
  }, [scope, sort, yearFrom, yearTo])
  const updateReviewRating = useCallback((rating: number | null) => {
    if (!reviewTarget) return
    if (reviewTarget.catalogType === 'movies') {
      setMovies((current) => current.map((entry) => entry.movie.id === reviewTarget.itemId ? { ...entry, my_rating: rating } : entry))
    } else if (reviewTarget.catalogType === 'books') {
      setBooks((current) => current.map((entry) => entry.book.id === reviewTarget.itemId ? { ...entry, my_rating: rating } : entry))
    } else {
      setBoardGames((current) => current.map((entry) => entry.board_game.id === reviewTarget.itemId ? { ...entry, my_rating: rating } : entry))
    }
  }, [reviewTarget])
  const visibleMovies = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    return !query ? movies : movies.filter(({ movie }) =>
      localizedMovieTitle(movie, language).toLocaleLowerCase().includes(query)
      || movie.title.toLocaleLowerCase().includes(query)
      || movie.original_title.toLocaleLowerCase().includes(query),
    )
  }, [language, movies, search])
  const visibleBoardGames = useMemo(() => {
    const query = boardGameSearch.trim().toLocaleLowerCase()
    return !query ? boardGames : boardGames.filter(({ board_game: game }) =>
      localizedBoardGameTitle(game, language).toLocaleLowerCase().includes(query)
      || game.title.toLocaleLowerCase().includes(query)
      || (game.description ?? '').toLocaleLowerCase().includes(query),
    )
  }, [boardGameSearch, boardGames, language])
  const visibleBooks = useMemo(() => {
    const query = bookSearch.trim().toLocaleLowerCase()
    return !query ? books : books.filter(({ book }) =>
      localizedBookTitle(book, language).toLocaleLowerCase().includes(query)
      || book.title.toLocaleLowerCase().includes(query)
      || book.authors.some((author) => author.toLocaleLowerCase().includes(query)),
    )
  }, [bookSearch, books, language])

  const libraryTabs = [
    { id: 'movies', label: t('libraryMovies'), Icon: Film },
    { id: 'books', label: t('libraryBooks'), Icon: BookOpen },
    { id: 'board-games', label: t('libraryBoardGames'), Icon: Dice5 },
  ] as const

  const handleTabKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    currentTab: LibraryTab,
  ) => {
    const currentIndex = libraryTabs.findIndex((tab) => tab.id === currentTab)
    let nextIndex: number | null = null
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % libraryTabs.length
    if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + libraryTabs.length) % libraryTabs.length
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = libraryTabs.length - 1
    if (nextIndex === null) return
    event.preventDefault()
    const nextTab = libraryTabs[nextIndex]?.id
    if (!nextTab) return
    setActiveTab(nextTab)
    event.currentTarget.parentElement
      ?.querySelector<HTMLButtonElement>(`#library-tab-${nextTab}`)
      ?.focus()
  }

  async function saveMovie(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingMovie || !accessToken || !isAdmin) return
    const form = new FormData(event.currentTarget)
    const payload = {
      title: String(form.get('title') ?? '').trim(),
      original_title: String(form.get('original_title') ?? '').trim(),
      overview: String(form.get('overview') ?? '') || null,
      release_date: String(form.get('release_date') ?? '') || null,
      cover_image_url: String(form.get('cover_image_url') ?? '') || null,
      backdrop_image_url: String(form.get('backdrop_image_url') ?? '') || null,
      translations: [{
        locale: 'uk-UA',
        title: String(form.get('ukrainian_title') ?? '').trim() || null,
        overview: String(form.get('ukrainian_overview') ?? '').trim() || null,
      }],
    }
    setSavingMovie(true)
    setEditError('')
    try {
      const response = await fetch(`/api/movies/${editingMovie.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error(await errorMessage(response, t('movieUpdateError')))
      const updated = await response.json() as LibraryMovie['movie']
      setMovies((current) => current.map((entry) => entry.movie.id === updated.id ? { ...entry, movie: updated } : entry))
      setEditingMovie(null)
    } catch (saveError: unknown) {
      setEditError(saveError instanceof Error ? saveError.message : t('movieUpdateError'))
    } finally {
      setSavingMovie(false)
    }
  }

  async function saveBoardGame(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingBoardGame || !accessToken || !isSuperuser) return
    const form = new FormData(event.currentTarget)
    const ukrainianTitle = String(form.get('ukrainian_title') ?? '').trim()
    const ukrainianDescription = String(form.get('ukrainian_description') ?? '').trim()
    const yearPublished = String(form.get('year_published') ?? '').trim()
    const minPlayers = String(form.get('min_players') ?? '').trim()
    const maxPlayers = String(form.get('max_players') ?? '').trim()
    const payload = {
      title: String(form.get('title') ?? '').trim(),
      year_published: yearPublished ? Number(yearPublished) : null,
      description: String(form.get('description') ?? '') || null,
      min_players: minPlayers ? Number(minPlayers) : null,
      max_players: maxPlayers ? Number(maxPlayers) : null,
      cover_image_url: String(form.get('cover_image_url') ?? '').trim() || null,
      translations: [{ locale: 'uk-UA', title: ukrainianTitle || null, description: ukrainianDescription || null }],
    }
    if (!payload.title) {
      setBoardGameEditError(t('boardGameTitleRequired'))
      return
    }
    if (payload.min_players !== null && payload.max_players !== null && payload.max_players < payload.min_players) {
      setBoardGameEditError(t('boardGamePlayerRangeError'))
      return
    }
    setSavingBoardGame(true)
    setBoardGameEditError('')
    try {
      const response = await fetch(`/api/board-games/${editingBoardGame.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error(await errorMessage(response, t('boardGameUpdateError')))
      const updated = await response.json() as BoardGameRecord
      setBoardGames((current) => current.map((entry) => entry.board_game.id === updated.id ? { ...entry, board_game: updated } : entry))
      setEditingBoardGame(null)
    } catch (saveError: unknown) {
      setBoardGameEditError(saveError instanceof Error ? saveError.message : t('boardGameUpdateError'))
    } finally {
      setSavingBoardGame(false)
    }
  }

  async function saveBook(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingBook || !accessToken || !isAdmin) return
    const form = new FormData(event.currentTarget)
    const title = String(form.get('title') ?? '').trim()
    if (!title) {
      setBookEditError(t('bookTitleRequired'))
      return
    }
    setSavingBook(true)
    setBookEditError('')
    try {
      const response = await fetch(`/api/books/${editingBook.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description: String(form.get('description') ?? '').trim() || null,
          translations: [{
            locale: 'uk-UA',
            title: String(form.get('ukrainian_title') ?? '').trim() || null,
            description: String(form.get('ukrainian_description') ?? '').trim() || null,
          }],
        }),
      })
      if (!response.ok) throw new Error(await errorMessage(response, t('bookUpdateError')))
      const updated = await response.json() as BookRecord
      setBooks((current) => current.map((entry) => entry.book.id === updated.id ? { ...entry, book: updated } : entry))
      setEditingBook(null)
    } catch (saveError: unknown) {
      setBookEditError(saveError instanceof Error ? saveError.message : t('bookUpdateError'))
    } finally {
      setSavingBook(false)
    }
  }

  useEffect(() => {
    if (!accessToken) return
    let cancelled = false
    // oxlint-disable-next-line react/set-state-in-effect -- Loading state follows the library request.
    setLoading(true)
    // oxlint-disable-next-line react/set-state-in-effect -- Clears the previous request error.
    setError('')
    void fetch(`/api/movies/library?${libraryQuery}`, { headers: { Authorization: `Bearer ${accessToken}` } })
      .then(async (response) => {
        if (!response.ok) throw new Error(await errorMessage(response, t('libraryLoadError')))
        return response.json() as Promise<LibraryMovie[]>
      })
      .then((result) => { if (!cancelled) setMovies(result) })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : t('libraryLoadError'))
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [accessToken, libraryQuery, t])

  useEffect(() => {
    if (!accessToken) return
    let cancelled = false
    // oxlint-disable-next-line react/set-state-in-effect -- Loading state follows the library request.
    setBooksLoading(true)
    // oxlint-disable-next-line react/set-state-in-effect -- Clears the previous request error.
    setBooksError('')
    void fetch(`/api/books/library?${libraryQuery}`, { headers: { Authorization: `Bearer ${accessToken}` } })
      .then(async (response) => {
        if (!response.ok) throw new Error(await errorMessage(response, t('libraryLoadError')))
        return response.json() as Promise<LibraryBook[]>
      })
      .then((result) => { if (!cancelled) setBooks(result) })
      .catch((loadError: unknown) => {
        if (!cancelled) setBooksError(loadError instanceof Error ? loadError.message : t('libraryLoadError'))
      })
      .finally(() => { if (!cancelled) setBooksLoading(false) })
    return () => { cancelled = true }
  }, [accessToken, libraryQuery, t])

  useEffect(() => {
    if (!accessToken) return
    let cancelled = false
    // oxlint-disable-next-line react/set-state-in-effect -- Loading state follows the library request.
    setBoardGamesLoading(true)
    // oxlint-disable-next-line react/set-state-in-effect -- Clears the previous request error.
    setBoardGamesError('')
    void fetch(`/api/board-games/library?${libraryQuery}`, { headers: { Authorization: `Bearer ${accessToken}` } })
      .then(async (response) => {
        if (!response.ok) throw new Error(await errorMessage(response, t('libraryLoadError')))
        return response.json() as Promise<LibraryBoardGame[]>
      })
      .then((result) => { if (!cancelled) setBoardGames(result) })
      .catch((loadError: unknown) => {
        if (!cancelled) setBoardGamesError(loadError instanceof Error ? loadError.message : t('libraryLoadError'))
      })
      .finally(() => { if (!cancelled) setBoardGamesLoading(false) })
    return () => { cancelled = true }
  }, [accessToken, libraryQuery, t])

  return (
    <section className="library-page" aria-labelledby="library-title">
      <header className="library-heading">
        <p className="eyebrow">{t('yourSpace')}</p>
        <h1 id="library-title">{t('library')}</h1>
      </header>

      <div className="library-tabs" role="tablist" aria-label={t('library')}>
        {libraryTabs.map(({ id, label, Icon }) => (
          <button
            className="library-tab"
            id={`library-tab-${id}`}
            key={id}
            type="button"
            role="tab"
            aria-selected={activeTab === id}
            aria-controls={`library-panel-${id}`}
            tabIndex={activeTab === id ? 0 : -1}
            onClick={() => setActiveTab(id)}
            onKeyDown={(event) => handleTabKeyDown(event, id)}
          >
            <Icon size={18} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      <section hidden={activeTab !== 'movies'} className="library-section" id="library-panel-movies" role="tabpanel" aria-labelledby="library-tab-movies" tabIndex={0}>
        <LibraryFilters scope={scope} setScope={setScope} yearFrom={yearFrom} setYearFrom={setYearFrom} yearTo={yearTo} setYearTo={setYearTo} sort={sort} setSort={setSort} />
        <label className="library-search">
          <span className="visually-hidden">{t('librarySearchPlaceholder')}</span>
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('librarySearchPlaceholder')} />
        </label>
        {error && <p className="library-error" role="alert">{error}</p>}
        {loading ? <p role="status">{t('loading')}</p> : movies.length === 0 ? <p className="library-empty">{scope === 'mine' ? t('libraryMineEmpty') : yearFrom || yearTo ? t('librarySearchEmpty') : t('libraryNoMovies')}</p> : visibleMovies.length === 0 ? <p className="library-empty">{t('librarySearchEmpty')}</p> : (
          <div className="library-movie-grid">
            {visibleMovies.map(({ movie, clubs, my_rating }) => (
              <article className="library-movie-card" key={movie.id}>
                <button className="library-movie-card-trigger" type="button" onClick={() => { setEditingMovie(movie); setEditError('') }} aria-label={`${isAdmin ? t('editMovie') : t('movieDetails')}: ${movie.title}`}>
                  {movie.cover_image_url
                    ? <img src={movie.cover_image_url} alt="" />
                    : <div className="library-movie-placeholder" aria-hidden="true"><Film size={25} /></div>}
                  <div className="library-movie-details">
                    <h3>{localizedMovieTitle(movie, language)}</h3>
                    {movie.release_date && <p>{movie.release_date.slice(0, 4)}</p>}
                  </div>
                </button>
                <div className="library-movie-details library-movie-club-details">
                  {clubs.length > 0 && <div className="library-clubs">
                    <span>{t('libraryClubsLabel')}</span>
                    {clubs.map((club) => <Link key={club.id} to={`/clubs/${club.id}`}>{club.title}</Link>)}
                  </div>}
                  <MyRating rating={my_rating} onClick={() => setReviewTarget({ catalogType: 'movies', itemId: movie.id, title: localizedMovieTitle(movie, language) })} />
                  <Link className="button button-light library-review-button" to={`/library/reviews/movies/${movie.id}`} state={{ title: localizedMovieTitle(movie, language) }}>{t('reviews')}</Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {editingMovie && (
        <div className="library-editor-backdrop" onClick={() => setEditingMovie(null)}>
          <section className="library-editor" role="dialog" aria-modal="true" aria-labelledby="library-editor-title" onClick={(event) => event.stopPropagation()}>
            <h2 id="library-editor-title">{isAdmin ? t('editMovie') : t('movieDetails')}</h2>
            {isAdmin ? <form onSubmit={(event) => { void saveMovie(event) }}>
              <label>{t('movieTitle')}<input name="title" required maxLength={500} defaultValue={editingMovie.title} /></label>
              <label>{t('movieOriginalTitle')}<input name="original_title" required maxLength={500} defaultValue={editingMovie.original_title} /></label>
              <label>{t('movieOverview')}<textarea name="overview" defaultValue={editingMovie.overview} /></label>
              <label>{t('ukrainianTitle')}<input name="ukrainian_title" maxLength={500} defaultValue={editingMovie.translations?.find((translation) => translation.locale === 'uk-UA')?.title ?? ''} /></label>
              <label>{t('ukrainianOverview')}<textarea name="ukrainian_overview" defaultValue={editingMovie.translations?.find((translation) => translation.locale === 'uk-UA')?.overview ?? ''} /></label>
              <label>{t('movieReleaseDate')}<input name="release_date" type="date" defaultValue={editingMovie.release_date ?? ''} /></label>
              <label>{t('movieCoverUrl')}<input name="cover_image_url" type="url" defaultValue={editingMovie.cover_image_url ?? ''} /></label>
              <label>{t('movieBackdropUrl')}<input name="backdrop_image_url" type="url" defaultValue={editingMovie.backdrop_image_url ?? ''} /></label>
              {editError && <p className="library-error" role="alert">{editError}</p>}
              <div className="library-editor-actions">
                <button className="button button-light" type="button" disabled={savingMovie} onClick={() => setEditingMovie(null)}>{t('cancel')}</button>
                <button className="button button-primary" type="submit" disabled={savingMovie}>{savingMovie ? t('saving') : t('save')}</button>
              </div>
            </form> : <div className="library-movie-readonly">
              {editingMovie.cover_image_url && <img src={editingMovie.cover_image_url} alt="" />}
              <h3>{localizedMovieTitle(editingMovie, language)}</h3>
              {editingMovie.original_title !== editingMovie.title && <p><strong>{t('movieOriginalTitle')}:</strong> {editingMovie.original_title}</p>}
              {editingMovie.release_date && <p><strong>{t('movieReleaseDate')}:</strong> {editingMovie.release_date}</p>}
              {localizedMovieOverview(editingMovie, language) && <p>{localizedMovieOverview(editingMovie, language)}</p>}
              <button className="button button-primary" type="button" onClick={() => setEditingMovie(null)}>{t('cancel')}</button>
            </div>}
          </section>
        </div>
      )}

      <section hidden={activeTab !== 'books'} className="library-section" id="library-panel-books" role="tabpanel" aria-labelledby="library-tab-books" tabIndex={0}>
        <h2>{t('libraryBooks')}</h2>
        <LibraryFilters scope={scope} setScope={setScope} yearFrom={yearFrom} setYearFrom={setYearFrom} yearTo={yearTo} setYearTo={setYearTo} sort={sort} setSort={setSort} />
        <label className="library-search">
          <span className="visually-hidden">{t('libraryBookSearchPlaceholder')}</span>
          <input type="search" value={bookSearch} onChange={(event) => setBookSearch(event.target.value)} placeholder={t('libraryBookSearchPlaceholder')} />
        </label>
        {booksError && <p className="library-error" role="alert">{booksError}</p>}
        {booksLoading ? <p role="status">{t('loading')}</p> : books.length === 0 ? <p className="library-empty">{scope === 'mine' ? t('libraryMineEmpty') : yearFrom || yearTo ? t('libraryBookSearchEmpty') : t('libraryNoBooks')}</p> : visibleBooks.length === 0 ? <p className="library-empty">{t('libraryBookSearchEmpty')}</p> : (
          <div className="library-movie-grid">
            {visibleBooks.map(({ book, clubs, my_rating }) => (
              <article className="library-movie-card" key={book.id}>
                <button className="library-movie-card-trigger" type="button" onClick={() => { setEditingBook(book); setBookEditError('') }} aria-label={`${isAdmin ? t('editBook') : t('bookDetails')}: ${localizedBookTitle(book, language)}`}>
                  {book.cover_image_url ? <img src={book.cover_image_url} alt="" /> : <div className="library-movie-placeholder" aria-hidden="true"><BookOpen size={25} /></div>}
                  <div className="library-movie-details">
                    <h3>{localizedBookTitle(book, language)}</h3>
                    {book.authors.length > 0 && <p>{book.authors.join(', ')}</p>}
                    {book.published_date && <p>{book.published_date}</p>}
                  </div>
                </button>
                <div className="library-movie-details library-movie-club-details">
                  {clubs.length > 0 && <div className="library-clubs">
                    <span>{t('libraryClubsLabel')}</span>
                    {clubs.map((club) => <Link key={club.id} to={`/clubs/${club.id}`}>{club.title}</Link>)}
                  </div>}
                  <MyRating rating={my_rating} onClick={() => setReviewTarget({ catalogType: 'books', itemId: book.id, title: localizedBookTitle(book, language) })} />
                  <Link className="button button-light library-review-button" to={`/library/reviews/books/${book.id}`} state={{ title: localizedBookTitle(book, language) }}>{t('reviews')}</Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {editingBook && (
        <div className="library-editor-backdrop" onClick={() => setEditingBook(null)}>
          <section className="library-editor" role="dialog" aria-modal="true" aria-labelledby="library-book-editor-title" onClick={(event) => event.stopPropagation()}>
            <h2 id="library-book-editor-title">{isAdmin ? t('editBook') : t('bookDetails')}</h2>
            {isAdmin ? <form onSubmit={(event) => { void saveBook(event) }}>
              <label>{t('bookTitle')}<input name="title" required maxLength={500} defaultValue={editingBook.title} /></label>
              <label>{t('bookDescription')}<textarea name="description" defaultValue={editingBook.description ?? ''} /></label>
              <label>{t('ukrainianTitle')}<input name="ukrainian_title" maxLength={500} defaultValue={editingBook.translations?.find((translation) => translation.locale === 'uk-UA')?.title ?? ''} /></label>
              <label>{t('ukrainianDescription')}<textarea name="ukrainian_description" defaultValue={editingBook.translations?.find((translation) => translation.locale === 'uk-UA')?.description ?? ''} /></label>
              {bookEditError && <p className="library-error" role="alert">{bookEditError}</p>}
              <div className="library-editor-actions">
                <button className="button button-light" type="button" disabled={savingBook} onClick={() => setEditingBook(null)}>{t('cancel')}</button>
                <button className="button button-primary" type="submit" disabled={savingBook}>{savingBook ? t('saving') : t('save')}</button>
              </div>
            </form> : <div className="library-movie-readonly">
              {editingBook.cover_image_url && <img src={editingBook.cover_image_url} alt="" />}
              <h3>{localizedBookTitle(editingBook, language)}</h3>
              {editingBook.authors.length > 0 && <p><strong>{t('bookAuthors')}:</strong> {editingBook.authors.join(', ')}</p>}
              {editingBook.published_date && <p><strong>{t('bookPublished')}:</strong> {editingBook.published_date}</p>}
              {localizedBookDescription(editingBook, language) && <p>{localizedBookDescription(editingBook, language)}</p>}
              {editingBook.info_url && <p><a href={editingBook.info_url} target="_blank" rel="noreferrer">{t('bookGoogleBooksLink')}</a></p>}
              <button className="button button-primary" type="button" onClick={() => setEditingBook(null)}>{t('cancel')}</button>
            </div>}
          </section>
        </div>
      )}

      <section hidden={activeTab !== 'board-games'} className="library-section" id="library-panel-board-games" role="tabpanel" aria-labelledby="library-tab-board-games" tabIndex={0}>
        <h2>{t('libraryBoardGames')}</h2>
        <LibraryFilters scope={scope} setScope={setScope} yearFrom={yearFrom} setYearFrom={setYearFrom} yearTo={yearTo} setYearTo={setYearTo} sort={sort} setSort={setSort} />
        <label className="library-search">
          <span className="visually-hidden">{t('libraryBoardGameSearchPlaceholder')}</span>
          <input type="search" value={boardGameSearch} onChange={(event) => setBoardGameSearch(event.target.value)} placeholder={t('libraryBoardGameSearchPlaceholder')} />
        </label>
        {boardGamesError && <p className="library-error" role="alert">{boardGamesError}</p>}
        {boardGamesLoading ? <p role="status">{t('loading')}</p> : boardGames.length === 0 ? <p className="library-empty">{scope === 'mine' ? t('libraryMineEmpty') : yearFrom || yearTo ? t('libraryBoardGameSearchEmpty') : t('libraryNoBoardGames')}</p> : visibleBoardGames.length === 0 ? <p className="library-empty">{t('libraryBoardGameSearchEmpty')}</p> : (
          <div className="library-movie-grid">
            {visibleBoardGames.map(({ board_game: game, clubs, my_rating }) => (
              <article className="library-movie-card library-board-game-card" key={game.id}>
                {isSuperuser ? (
                  <button className="library-board-game-edit-trigger" type="button" onClick={() => { setEditingBoardGame(game); setBoardGameEditError('') }} aria-label={`${t('editBoardGame')}: ${game.title}`}>
                    {game.cover_image_url
                      ? <img src={game.cover_image_url} alt="" />
                      : <div className="library-movie-placeholder" aria-hidden="true"><Dice5 size={25} /></div>}
                  </button>
                ) : game.cover_image_url
                  ? <img src={game.cover_image_url} alt="" />
                  : <div className="library-movie-placeholder" aria-hidden="true"><Dice5 size={25} /></div>}
                <div className="library-movie-details">
                  <h3>{isSuperuser
                    ? <button className="library-board-game-edit-title" type="button" onClick={() => { setEditingBoardGame(game); setBoardGameEditError('') }}>{localizedBoardGameTitle(game, language)}</button>
                    : localizedBoardGameTitle(game, language)}</h3>
                  {game.year_published && <p>{game.year_published}</p>}
                  {(game.min_players || game.max_players) && <p>{game.min_players ?? '?'}–{game.max_players ?? '?'} {t('players')}</p>}
                </div>
                <div className="library-movie-details library-movie-club-details">
                  {clubs.length > 0 && <div className="library-clubs">
                    <span>{t('libraryClubsLabel')}</span>
                    {clubs.map((club) => <Link key={club.id} to={`/clubs/${club.id}`}>{club.title}</Link>)}
                  </div>}
                  <MyRating rating={my_rating} onClick={() => setReviewTarget({ catalogType: 'board-games', itemId: game.id, title: localizedBoardGameTitle(game, language) })} />
                  <Link className="button button-light library-review-button" to={`/library/reviews/board-games/${game.id}`} state={{ title: localizedBoardGameTitle(game, language) }}>{t('reviews')}</Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      {editingBoardGame && isSuperuser && (
        <div className="library-editor-backdrop" onClick={() => setEditingBoardGame(null)}>
          <section className="library-editor" role="dialog" aria-modal="true" aria-labelledby="library-board-game-editor-title" onClick={(event) => event.stopPropagation()}>
            <h2 id="library-board-game-editor-title">{t('editBoardGame')}</h2>
            <form onSubmit={(event) => { void saveBoardGame(event) }}>
              <label>{t('boardGameTitle')}<input name="title" required maxLength={500} defaultValue={editingBoardGame.title} /></label>
              <label>{t('boardGameDescription')}<textarea name="description" defaultValue={editingBoardGame.description ?? ''} /></label>
              <label>{t('ukrainianTitle')}<input name="ukrainian_title" maxLength={500} defaultValue={editingBoardGame.translations?.find((translation) => translation.locale === 'uk-UA')?.title ?? ''} /></label>
              <label>{t('ukrainianDescription')}<textarea name="ukrainian_description" defaultValue={editingBoardGame.translations?.find((translation) => translation.locale === 'uk-UA')?.description ?? ''} /></label>
              <label>{t('boardGameYear')}<input name="year_published" type="number" min={1000} max={2200} defaultValue={editingBoardGame.year_published ?? ''} /></label>
              <label>{t('boardGameMinPlayers')}<input name="min_players" type="number" min={1} defaultValue={editingBoardGame.min_players ?? ''} /></label>
              <label>{t('boardGameMaxPlayers')}<input name="max_players" type="number" min={1} defaultValue={editingBoardGame.max_players ?? ''} /></label>
              <label>{t('boardGameCoverUrl')}<input name="cover_image_url" type="url" defaultValue={editingBoardGame.cover_image_url ?? ''} /></label>
              {boardGameEditError && <p className="library-error" role="alert">{boardGameEditError}</p>}
              <div className="library-editor-actions">
                <button className="button button-light" type="button" disabled={savingBoardGame} onClick={() => setEditingBoardGame(null)}>{t('cancel')}</button>
                <button className="button button-primary" type="submit" disabled={savingBoardGame}>{savingBoardGame ? t('saving') : t('save')}</button>
              </div>
            </form>
          </section>
        </div>
      )}
      {reviewTarget && accessToken && <ReviewPanel
        {...reviewTarget}
        accessToken={accessToken}
        onClose={() => setReviewTarget(null)}
        onRatingChange={updateReviewRating}
      />}
    </section>
  )
}
