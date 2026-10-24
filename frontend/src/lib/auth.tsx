import { useState, useEffect, useCallback } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Profile } from '../types/supabase'
import { AuthContext } from './auth-context'

async function syncApiSession(session: Session | null): Promise<void> {
  if (!session) {
    await fetch('/api/users/session', { method: 'DELETE' })
    return
  }
  const response = await fetch('/api/users/session', {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}` },
  })
  if (!response.ok) throw new Error('Could not establish API session')
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(() => supabase === null)

  useEffect(() => {
    if (!supabase) {
      return
    }
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      await syncApiSession(session).catch(() => undefined)
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    }).catch(() => setLoading(false))

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      void syncApiSession(newSession).catch(() => undefined)
      setSession(newSession)
      setUser(newSession?.user ?? null)
      setProfile((currentProfile) =>
        currentProfile?.user_id === newSession?.user.id ? currentProfile : null,
      )
    })

    return () => subscription.unsubscribe()
  }, [])

  const userId = user?.id
  const accessToken = session?.access_token

  useEffect(() => {
    if (!userId || !accessToken) return

    let active = true
    void fetch('/api/users/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Profile request failed')
        return response.json() as Promise<Profile>
      })
      .then((result) => {
        if (active && result.user_id === userId) setProfile(result)
      })
      .catch(() => {
        if (active) setProfile(null)
      })

    return () => { active = false }
  }, [userId, accessToken])

  const signUp = useCallback(async (email: string, password: string, displayName: string) => {
    if (!supabase) throw new Error('Supabase client not configured')
    const normalizedEmail = email.trim().toLowerCase()
    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: { display_name: displayName },
      },
    })
    if (error) throw error
    if (data.user) {
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
          id: data.user.id,
          user_id: data.user.id,
          email: data.user.email?.trim().toLowerCase() ?? normalizedEmail,
          display_name: displayName,
        })
      if (profileError) throw profileError
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new Error('Supabase client not configured')
    const normalizedEmail = email.trim().toLowerCase()
    const { data, error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password })
    if (error) throw error
    if (data.user) {
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .single()
      if (!existingProfile) {
        const emailPrefix = normalizedEmail.split('@')[0]
        const { error: profileError } = await supabase
          .from('profiles')
          .upsert({
            id: data.user.id,
            user_id: data.user.id,
            email: data.user.email?.trim().toLowerCase() ?? normalizedEmail,
            display_name: emailPrefix,
          })
        if (profileError) throw profileError
      }
    }
  }, [])

  const signInWithGoogle = useCallback(async () => {
    if (!supabase) throw new Error('Supabase client not configured')
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        scopes: 'openid email profile',
      },
    })
    if (error) throw error
  }, [])

  const signOut = useCallback(async () => {
    if (!supabase) throw new Error('Supabase client not configured')
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    await syncApiSession(null)
  }, [])

  const updateProfile = useCallback((updatedProfile: Profile) => {
    setProfile(updatedProfile)
  }, [])

  const effectiveProfile = user && profile?.user_id === user.id ? profile : null

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        profile: effectiveProfile,
        loading,
        updateProfile,
        signUp,
        signIn,
        signInWithGoogle,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
