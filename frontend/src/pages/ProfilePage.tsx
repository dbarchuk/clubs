import { useEffect, useState } from 'react'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth-context'
import type { Profile } from '../types/supabase'
import { useI18n } from '../lib/i18n-context'
import { getInitials } from '../lib/initials'
import './profile.css'

interface ProfileForm {
  display_name: string
  avatar_url: string
  date_of_birth: string
  bio: string
}

async function getResponseError(response: Response): Promise<string> {
  const body: unknown = await response.json().catch(() => null)
  if (
    typeof body === 'object' &&
    body !== null &&
    'detail' in body &&
    typeof body.detail === 'string'
  ) {
    return body.detail
  }
  return `Request failed (${response.status})`
}

export function ProfilePage() {
  const { user, session, loading: authLoading, updateProfile } = useAuth()
  const { t, language } = useI18n()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profileLoading, setProfileLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<ProfileForm>({
    display_name: '',
    avatar_url: '',
    date_of_birth: '',
    bio: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const displayProfile = profile

  useEffect(() => {
    if (!user || !session?.access_token) return

    let active = true
    void fetch('/api/users/me', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(await getResponseError(response))
        return response.json() as Promise<Profile>
      })
      .then((result) => {
        if (!active) return
        setProfile(result)
        updateProfile(result)
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : t('failedToLoadProfile'))
      })
      .finally(() => {
        if (active) setProfileLoading(false)
      })

    return () => { active = false }
  }, [user, session?.access_token, updateProfile, t])

  if (authLoading || profileLoading) {
    return <div className="page-state">{t('loading')}</div>
  }

  if (!user) {
    return null
  }

  const handleEdit = () => {
    if (!displayProfile) return
    setForm({
      display_name: displayProfile.display_name,
      avatar_url: displayProfile.avatar_url ?? '',
      date_of_birth: displayProfile.date_of_birth ?? '',
      bio: displayProfile.bio ?? '',
    })
    setError('')
    setEditing(true)
  }

  const handleChange = (field: keyof ProfileForm, value: string) => {
    setForm((previous) => ({ ...previous, [field]: value }))
  }

  const handleSave = async () => {
    if (!session?.access_token) {
      setError(t('sessionExpired'))
      return
    }

    setSaving(true)
    setError('')
    try {
      const profileUpdate = {
        display_name: form.display_name,
        avatar_url: form.avatar_url || null,
        date_of_birth: form.date_of_birth || null,
        bio: form.bio || null,
      }
      const response = await fetch('/api/users/me', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(profileUpdate),
      })
      if (!response.ok) {
        throw new Error(await getResponseError(response))
      }

      const updatedProfile = (await response.json()) as Profile
      setProfile(updatedProfile)
      updateProfile(updatedProfile)

      setEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failedToSaveProfile'))
    } finally {
      setSaving(false)
    }
  }

  const displayName = displayProfile?.display_name ?? user.email?.split('@')[0] ?? t('member')
  const initials = getInitials(displayName)

  return (
    <div className="page-wrap">
      <div className="inner-heading">
        <div className="eyebrow">{t('settings')}</div>
        <h1>{t('profile')}</h1>
      </div>

      <div className="profile-page">
        {error && !editing && <div className="form-error" role="alert">{error}</div>}
        <div className="profile-card">
          {displayProfile?.avatar_url ? (
            <img
              className="profile-avatar-large"
              src={displayProfile.avatar_url}
              alt=""
            />
          ) : (
            <div className="profile-avatar-large" aria-hidden="true">{initials}</div>
          )}
          <div className="profile-info">
            <h2>{displayName}</h2>
            <p>{displayProfile?.bio || t('noBio')}</p>
            <span className="profile-role">{displayProfile?.is_admin ? t('adminRole') : t('memberRole')}</span>
          </div>
        </div>

        {editing ? (
          <form
            className="profile-form"
            onSubmit={(event) => {
              event.preventDefault()
              void handleSave()
            }}
          >
            <div className="form-group">
              <label htmlFor="displayName">{t('displayName')}</label>
              <input
                id="displayName"
                type="text"
                value={form.display_name}
                onChange={(event) => handleChange('display_name', event.target.value)}
                required
                maxLength={100}
              />
            </div>
            <div className="form-group">
              <label htmlFor="avatarUrl">{t('avatarUrl')}</label>
              <input
                id="avatarUrl"
                type="url"
                value={form.avatar_url}
                onChange={(event) => handleChange('avatar_url', event.target.value)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="dateOfBirth">{t('dateOfBirth')}</label>
              <input
                id="dateOfBirth"
                type="date"
                value={form.date_of_birth}
                onChange={(event) => handleChange('date_of_birth', event.target.value)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="bio">{t('bio')}</label>
              <textarea
                id="bio"
                value={form.bio}
                onChange={(event) => handleChange('bio', event.target.value)}
                rows={4}
                maxLength={500}
              />
            </div>

            {error && <div className="form-error" role="alert">{error}</div>}

            <div className="form-actions">
              <button type="submit" className="button button-primary" disabled={saving}>
                {saving ? <Loader2 size={16} aria-label={t('saving')} /> : t('save')}
              </button>
              <button
                type="button"
                className="button button-light"
                onClick={() => setEditing(false)}
                disabled={saving}
              >
                {t('cancel')}
              </button>
            </div>
          </form>
        ) : (
          <div className="profile-detail">
            <div className="profile-field">
              <span className="profile-label">{t('displayName')}</span>
              <span>{displayProfile?.display_name ?? t('notSet')}</span>
            </div>
            <div className="profile-field">
              <span className="profile-label">{t('email')}</span>
              <span>{user.email ?? t('notSet')}</span>
            </div>
            <div className="profile-field">
              <span className="profile-label">{t('dateOfBirth')}</span>
              <span>{displayProfile?.date_of_birth ? new Intl.DateTimeFormat(language === 'uk' ? 'uk-UA' : 'en-US').format(new Date(`${displayProfile.date_of_birth}T00:00:00`)) : t('notSet')}</span>
            </div>
            <div className="profile-field">
              <span className="profile-label">{t('role')}</span>
              <span>{displayProfile?.is_admin ? t('adminRole') : t('memberRole')}</span>
            </div>
            <div className="profile-field">
              <span className="profile-label">{t('bio')}</span>
              <span>{displayProfile?.bio || t('notSet')}</span>
            </div>
            {displayProfile ? (
              <button className="button button-primary" onClick={handleEdit}>
                {t('editProfile')}
              </button>
            ) : (
              <p className="profile-empty">{t('profileUnavailable')}</p>
            )}
          </div>
        )}
      </div>

      <Link to="/" className="text-link"><ArrowLeft size={14} aria-hidden="true" /> {t('backToMenu')}</Link>
    </div>
  )
}
