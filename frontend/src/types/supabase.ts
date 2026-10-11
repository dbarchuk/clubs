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
