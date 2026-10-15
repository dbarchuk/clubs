import { useEffect, useMemo, useState, type FormEvent, type KeyboardEvent } from 'react'
import { BookOpen, Dice5, Film } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth-context'
import { useI18n } from '../lib/i18n-context'
import { localizedBoardGameTitle, localizedMovieOverview, localizedMovieTitle } from '../lib/catalog-localization'
import type { BoardGameRecord, LibraryBoardGame, LibraryMovie } from '../types/supabase'
import './library.css'

type LibraryTab = 'movies' | 'books' | 'board-games'

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
  const [loading, setLoading] = useState(true)
  const [boardGamesLoading, setBoardGamesLoading] = useState(true)
  const [error, setError] = useState('')
  const [boardGamesError, setBoardGamesError] = useState('')
  const [activeTab, setActiveTab] = useState<LibraryTab>('movies')
  const [search, setSearch] = useState('')
  const [boardGameSearch, setBoardGameSearch] = useState('')
  const [editingMovie, setEditingMovie] = useState<LibraryMovie['movie'] | null>(null)
  const [savingMovie, setSavingMovie] = useState(false)
  const [editError, setEditError] = useState('')
  const [editingBoardGame, setEditingBoardGame] = useState<BoardGameRecord | null>(null)
  const [savingBoardGame, setSavingBoardGame] = useState(false)
  const [boardGameEditError, setBoardGameEditError] = useState('')
  const isAdmin = profile?.is_admin === true
  const isSuperuser = profile?.is_superuser === true
  const visibleMovies = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    if (!query) return movies
    return movies.filter(({ movie }) =>
      localizedMovieTitle(movie, language).toLocaleLowerCase().includes(query)
      || movie.title.toLocaleLowerCase().includes(query)
      || movie.original_title.toLocaleLowerCase().includes(query),
    )
  }, [language, movies, search])
  const visibleBoardGames = useMemo(() => {
    const query = boardGameSearch.trim().toLocaleLowerCase()
    if (!query) return boardGames
    return boardGames.filter(({ board_game: game }) =>
      localizedBoardGameTitle(game, language).toLocaleLowerCase().includes(query)
      || game.title.toLocaleLowerCase().includes(query)
      || (game.description ?? '').toLocaleLowerCase().includes(query),
    )
  }, [boardGameSearch, boardGames, language])

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

  useEffect(() => {
    if (!accessToken) return
    let cancelled = false
    // oxlint-disable-next-line react/set-state-in-effect -- Loading state follows the library request.
    setLoading(true)
    // oxlint-disable-next-line react/set-state-in-effect -- Clears the previous request error.
    setError('')
    void fetch('/api/movies/library', { headers: { Authorization: `Bearer ${accessToken}` } })
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
  }, [accessToken, t])

  useEffect(() => {
    if (!accessToken) return
    let cancelled = false
    // oxlint-disable-next-line react/set-state-in-effect -- Loading state follows the library request.
    setBoardGamesLoading(true)
    // oxlint-disable-next-line react/set-state-in-effect -- Clears the previous request error.
    setBoardGamesError('')
    void fetch('/api/board-games/library', { headers: { Authorization: `Bearer ${accessToken}` } })
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
  }, [accessToken, t])

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
        <label className="library-search">
          <span className="visually-hidden">{t('librarySearchPlaceholder')}</span>
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('librarySearchPlaceholder')} />
        </label>
        {error && <p className="library-error" role="alert">{error}</p>}
        {loading ? <p role="status">{t('loading')}</p> : movies.length === 0 ? <p className="library-empty">{isAdmin ? t('libraryAdminNoMovies') : t('libraryNoMovies')}</p> : visibleMovies.length === 0 ? <p className="library-empty">{t('librarySearchEmpty')}</p> : (
          <div className="library-movie-grid">
            {visibleMovies.map(({ movie, clubs }) => (
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
                  <div className="library-clubs">
                    <span>{t('libraryClubsLabel')}</span>
                    {clubs.map((club) => <Link key={club.id} to={`/clubs/${club.id}`}>{club.title}</Link>)}
                  </div>
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

      <section hidden={activeTab !== 'books'} className="library-section library-placeholder-section" id="library-panel-books" role="tabpanel" aria-labelledby="library-tab-books" tabIndex={0}>
        <h2>{t('libraryBooks')}</h2>
        <p>{t('libraryBooksPlaceholder')}</p>
      </section>

      <section hidden={activeTab !== 'board-games'} className="library-section" id="library-panel-board-games" role="tabpanel" aria-labelledby="library-tab-board-games" tabIndex={0}>
        <h2>{t('libraryBoardGames')}</h2>
        <label className="library-search">
          <span className="visually-hidden">{t('libraryBoardGameSearchPlaceholder')}</span>
          <input type="search" value={boardGameSearch} onChange={(event) => setBoardGameSearch(event.target.value)} placeholder={t('libraryBoardGameSearchPlaceholder')} />
        </label>
        {boardGamesError && <p className="library-error" role="alert">{boardGamesError}</p>}
        {boardGamesLoading ? <p role="status">{t('loading')}</p> : boardGames.length === 0 ? <p className="library-empty">{t('libraryNoBoardGames')}</p> : visibleBoardGames.length === 0 ? <p className="library-empty">{t('libraryBoardGameSearchEmpty')}</p> : (
          <div className="library-movie-grid">
            {visibleBoardGames.map(({ board_game: game, clubs }) => (
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
                  <div className="library-clubs">
                    <span>{t('libraryClubsLabel')}</span>
                    {clubs.map((club) => <Link key={club.id} to={`/clubs/${club.id}`}>{club.title}</Link>)}
                  </div>
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
    </section>
  )
}
