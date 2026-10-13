export interface Profile {
  id: string
  user_id: string
  email: string
  display_name: string
  avatar_url: string | null
  date_of_birth: string | null
  bio: string | null
  is_admin: boolean
  created_at: string
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
}

export interface MovieRecord extends MovieSearchResult {
  id: number
  created_by: string
  created_at: string
  updated_at: string
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
