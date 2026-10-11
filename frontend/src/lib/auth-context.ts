import { createContext, useContext } from 'react'
import type { Profile } from '../types/supabase'
import type { Session, User } from '@supabase/supabase-js'

export interface AuthContextType {
  session: Session | null
  user: User | null
  profile: Profile | null
  loading: boolean
  updateProfile: (profile: Profile) => void
  signUp: (email: string, password: string, displayName: string) => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextType | null>(null)

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
