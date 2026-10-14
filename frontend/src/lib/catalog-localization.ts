import type { BoardGameRecord, MovieSearchResult } from '../types/supabase'

export function catalogLocale(language: 'uk' | 'en'): string {
  return language === 'uk' ? 'uk-UA' : 'en-US'
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
