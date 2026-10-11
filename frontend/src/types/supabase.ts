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
}

export interface PaginatedClubs {
  items: ClubRecord[]
  page: number
  size: number
  has_more: boolean
}
