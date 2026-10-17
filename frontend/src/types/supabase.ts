export interface Profile {
  id: string
  user_id: string
  email: string
  display_name: string
  avatar_url: string | null
  date_of_birth: string | null
  bio: string | null
  is_admin: boolean
  is_active: boolean
  is_superuser: boolean
  created_at: string
}

export interface ManagedUser {
  id: string
  email: string
  display_name: string
  is_active: boolean
  is_admin: boolean
  is_superuser: boolean
  created_at: string
}

export interface UserManagementResponse {
  users: ManagedUser[]
  current_user_is_superuser: boolean
}

export interface ClubRecord {
  id: string
  club_type: 'book' | 'movie' | 'sport' | 'board_games'
  title: string
  avatar_url: string | null
  is_public: boolean
  created_by: string
  created_at: string
  updated_at: string
  my_access_type: 'owner' | 'admin' | 'moderator' | 'member' | null
}

export interface ClubMemberRecord {
  user_id: string
  display_name: string
  avatar_url: string | null
  access_type: 'owner' | 'admin' | 'moderator' | 'member'
}

export interface EventRecord {
  id: string
  club_id: string
  title: string | null
  linked_item_id: string | null
  linked_movie: MovieRecord | null
  linked_board_game: BoardGameRecord | null
  linked_book: BookRecord | null
  avatar_url: string | null
  start_date: string | null
  end_date: string | null
  start_time: string | null
  end_time: string | null
  status: 'scheduled' | 'delayed' | 'cancelled' | 'held' | 'deleted'
  created_by: string
  created_at: string
  updated_at: string
  deleted_at: string | null
  deleted_by: string | null
}

export interface MovieSearchResult {
  id: number | null
  provider: string
  external_id: string
  title: string
  original_title: string
  overview: string
  release_date: string | null
  cover_image_url: string | null
  backdrop_image_url: string | null
  original_language: string | null
  popularity: number | null
  vote_average: number | null
  translations?: MovieTranslation[]
}

export interface MovieTranslation {
  locale: string
  title: string | null
  overview: string | null
}

export interface MovieRecord extends MovieSearchResult {
  id: number
  created_by: string
  created_at: string
  updated_at: string
}

export interface LibraryMovie {
  movie: MovieRecord
  clubs: Array<{ id: string; title: string }>
}

export interface LibraryBoardGame {
  board_game: BoardGameRecord
  clubs: Array<{ id: string; title: string }>
}

export interface BookTranslation {
  locale: string
  title: string | null
  description: string | null
}

export interface BookRecord {
  id: number
  provider: string
  external_id: string
  title: string
  subtitle: string | null
  authors: string[]
  publisher: string | null
  published_date: string | null
  description: string | null
  isbn_10: string | null
  isbn_13: string | null
  page_count: number | null
  categories: string[]
  language: string | null
  cover_image_url: string | null
  info_url: string | null
  provider_average_rating: number | null
  provider_ratings_count: number | null
  average_rating: number | null
  translations: BookTranslation[]
  created_by: string
  created_at: string
  updated_at: string
}

export interface BookProviderResult extends Omit<BookRecord, 'id' | 'created_by' | 'created_at' | 'updated_at'> {
  id: null
}

export type BookSearchResult = BookRecord | BookProviderResult

export interface LibraryBook {
  book: BookRecord
  clubs: Array<{ id: string; title: string }>
}

export type ReviewCatalogType = 'books' | 'movies' | 'board-games'

export interface ReviewRecord {
  id: number
  item_id: number
  reviewer_id: string
  reviewer_name: string
  rating: number | null
  body: string | null
  is_public: boolean
  is_mine: boolean
  created_at: string
  updated_at: string
}

export interface ReviewList {
  reviews: ReviewRecord[]
  average_rating: number | null
}

export interface BoardGameRecord {
  id: number
  title: string
  year_published: number | null
  description: string | null
  min_players: number | null
  max_players: number | null
  cover_image_url: string | null
  created_by: string
  created_at: string
  updated_at: string
  translations?: BoardGameTranslation[]
}

export interface BoardGameProviderResult {
  id: null
  provider: 'geekach'
  external_id: string
  title: string
  cover_image_url: string | null
  product_url: string
  price: number | null
  in_stock: boolean | null
}

export type BoardGameSearchResult = BoardGameRecord | BoardGameProviderResult

export interface BoardGameTranslation {
  locale: string
  title: string | null
  description: string | null
}

export interface InviteCodeResponse {
  id: string
  code: string | null
  created_at: string
  revoked_at: string | null
}

export interface InviteCodeCreated extends InviteCodeResponse {
  code: string
}

export interface ClubDeletionRequest {
  id: string
  club_id: string
  club_title: string
  requested_by: string
  requester_display_name: string
  requested_at: string
  status: 'pending' | 'approved' | 'rejected'
  reviewed_by: string | null
  reviewed_at: string | null
}

export interface PaginatedClubs {
  items: ClubRecord[]
  page: number
  size: number
  has_more: boolean
}
