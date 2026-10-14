import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../lib/auth-context'
import { useI18n } from '../lib/i18n-context'
import type { ManagedUser, UserManagementResponse } from '../types/supabase'
import './user-management.css'

type UserStatusFilter = 'all' | 'active' | 'inactive'

async function responseError(response: Response, fallback: string): Promise<string> {
  try {
    const payload: unknown = await response.json()
    if (typeof payload === 'object' && payload !== null && 'detail' in payload && typeof payload.detail === 'string') return payload.detail
  } catch {
    return fallback
  }
  return fallback
}

export function UserManagementPage() {
  const { session, profile, updateProfile } = useAuth()
  const { t } = useI18n()
  const [data, setData] = useState<UserManagementResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<UserStatusFilter>('all')
  const [search, setSearch] = useState('')

  const visibleUsers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    return (data?.users ?? [])
      .filter((user) => user.id !== profile?.id)
      .filter((user) => statusFilter === 'all' || user.is_active === (statusFilter === 'active'))
      .filter((user) => !query || user.email.toLocaleLowerCase().includes(query) || user.display_name.toLocaleLowerCase().includes(query))
      .sort((left, right) => right.id.localeCompare(left.id))
  }, [data?.users, profile?.id, search, statusFilter])

  const loadUsers = useCallback(async (signal?: AbortSignal) => {
    if (!session?.access_token) return
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/users/management', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        signal,
      })
      if (!response.ok) throw new Error(await responseError(response, t('userManagementLoadError')))
      setData(await response.json() as UserManagementResponse)
    } catch (loadError: unknown) {
      if (loadError instanceof DOMException && loadError.name === 'AbortError') return
      setError(loadError instanceof Error ? loadError.message : t('userManagementLoadError'))
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [session?.access_token, t])

  useEffect(() => {
    const controller = new AbortController()
    void loadUsers(controller.signal)
    return () => controller.abort()
  }, [loadUsers])

  async function updateUser(user: ManagedUser, changes: { is_active?: boolean; is_admin?: boolean }) {
    if (!session?.access_token) return
    setSavingId(user.id)
    setError('')
    setNotice('')
    try {
      const response = await fetch(`/api/users/management/${user.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(changes),
      })
      if (!response.ok) throw new Error(await responseError(response, t('userManagementSaveError')))
      const updated = await response.json() as ManagedUser
      setData((current) => current ? { ...current, users: current.users.map((item) => item.id === updated.id ? updated : item) } : current)
      if (profile?.id === updated.id) updateProfile({ ...profile, is_active: updated.is_active, is_admin: updated.is_admin })
      setNotice(t('userUpdated'))
    } catch (updateError: unknown) {
      setError(updateError instanceof Error ? updateError.message : t('userManagementSaveError'))
    } finally {
      setSavingId(null)
    }
  }

  const canManage = profile?.is_admin === true || profile?.is_superuser === true
  if (!canManage) return null

  return (
    <section className="user-management-page" aria-labelledby="user-management-title">
      <header className="user-management-heading">
        <p className="eyebrow">{t('yourSpace')}</p>
        <h1 id="user-management-title">{t('userManagement')}</h1>
      </header>
      {error && <p className="user-management-error" role="alert">{error}</p>}
      {notice && <p className="user-management-notice" role="status">{notice}</p>}
      {!loading && data?.users.length ? <div className="user-management-filters">
        <label className="user-management-search">
          <span className="visually-hidden">{t('userManagementSearch')}</span>
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('userManagementSearch')} />
        </label>
        <label className="user-management-status-filter">
          <span className="visually-hidden">{t('userFilterAll')}</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as UserStatusFilter)}>
            <option value="all">{t('userFilterAll')}</option>
            <option value="active">{t('userFilterActive')}</option>
            <option value="inactive">{t('userFilterInactive')}</option>
          </select>
        </label>
      </div> : null}
      {loading ? <p role="status">{t('loading')}</p> : data?.users.length === 0 ? <p className="user-management-empty">{t('userManagementNoUsers')}</p> : visibleUsers.length ? (
        <div className="managed-user-list">
          {visibleUsers.map((user) => {
            const saving = savingId === user.id
            const canRemoveAdmin = data?.current_user_is_superuser === true
            return (
              <article className="managed-user-card" key={user.id}>
                <div className="managed-user-identity">
                  <strong>{user.display_name}</strong>
                  <span>{user.email}</span>
                  <div className="managed-user-badges">
                    <span className={user.is_active ? 'user-badge active' : 'user-badge inactive'}>{user.is_active ? t('userActive') : t('userInactive')}</span>
                    {user.is_admin && <span className="user-badge admin">{t('adminRole')}</span>}
                    {user.is_superuser && <span className="user-badge superuser">{t('superuserRole')}</span>}
                  </div>
                </div>
                <div className="managed-user-actions">
                  <button type="button" className="button button-light" disabled={saving || user.is_superuser || user.id === profile?.id} onClick={() => { void updateUser(user, { is_active: !user.is_active }) }}>
                    {user.is_active ? t('makeUserInactive') : t('makeUserActive')}
                  </button>
                  {user.is_admin ? (
                    <button type="button" className="button button-light" disabled={saving || !canRemoveAdmin || user.is_superuser} onClick={() => { void updateUser(user, { is_admin: false }) }}>
                      {t('removeUserAdmin')}
                    </button>
                  ) : (
                    <button type="button" className="button button-primary" disabled={saving} onClick={() => { void updateUser(user, { is_admin: true }) }}>
                      {t('makeUserAdmin')}
                    </button>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      ) : <p className="user-management-empty">{t('userManagementNoResults')}</p>}
    </section>
  )
}
