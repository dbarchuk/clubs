import type { BookRecord, BoardGameRecord, MovieSearchResult } from '../types/supabase'

export function catalogLocale(language: 'uk' | 'en'): string {
  return language === 'uk' ? 'uk-UA' : 'en-US'
}

export function catalogLocaleForQuery(query: string, language: 'uk' | 'en'): string {
  return /[\u0400-\u04FF]/u.test(query) ? 'uk-UA' : catalogLocale(language)
}

export function localizedMovieTitle(movie: MovieSearchResult, language: 'uk' | 'en'): string {
  if (language === 'uk') {
    const translation = movie.translations?.find((item) => item.locale === 'uk-UA')
    if (translation?.title) return translation.title
  }
  return movie.title
}

export function localizedMovieOverview(movie: MovieSearchResult, language: 'uk' | 'en'): string {
  if (language === 'uk') {
    const translation = movie.translations?.find((item) => item.locale === 'uk-UA')
    if (translation?.overview) return translation.overview
  }
  return movie.overview
}

export function localizedBoardGameTitle(game: BoardGameRecord, language: 'uk' | 'en'): string {
  if (language === 'uk') {
    const translation = game.translations?.find((item) => item.locale === 'uk-UA')
    if (translation?.title) return translation.title
  }
  return game.title
}

export function localizedBoardGameDescription(game: BoardGameRecord, language: 'uk' | 'en'): string | null {
  if (language === 'uk') {
    const translation = game.translations?.find((item) => item.locale === 'uk-UA')
    if (translation?.description) return translation.description
  }
  return game.description
}

export function localizedBookTitle(book: Pick<BookRecord, 'title' | 'translations'>, language: 'uk' | 'en'): string {
  if (language === 'uk') {
    const translation = book.translations?.find((item) => item.locale === 'uk-UA')
    if (translation?.title) return translation.title
  }
  return book.title
}

export function localizedBookDescription(book: Pick<BookRecord, 'description' | 'translations'>, language: 'uk' | 'en'): string | null {
  if (language === 'uk') {
    const translation = book.translations?.find((item) => item.locale === 'uk-UA')
    if (translation?.description) return translation.description
  }
  return book.description
}
