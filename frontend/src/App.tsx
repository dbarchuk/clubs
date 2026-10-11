import { useAuth } from './lib/auth-context'
import { LoginPage } from './pages/LoginPage'
import { ProfilePage } from './pages/ProfilePage'
import { ClubListPage } from './pages/ClubListPage'
import { ClubDeletionRequestsPage } from './pages/ClubDeletionRequestsPage'
import { ClubManagementPage } from './pages/ClubManagementPage'
import mainIcon from './assets/main_icon.png'
import { Users, Globe2, LogOut, Search, ShieldCheck } from 'lucide-react'
import { Link, NavLink, Routes, Route } from 'react-router-dom'
import { useState, type FormEvent } from 'react'
import { useI18n } from './lib/i18n-context'
import { LanguageSwitcher } from './components/LanguageSwitcher'
import { ThemeSwitcher } from './components/ThemeSwitcher'
import { getInitials } from './lib/initials'
import './clubs.css'

function App() {
  const { user, profile, loading, signOut } = useAuth()
  const { t } = useI18n()
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  if (loading) {
    return <div className="page-state">{t('loading')}</div>
  }

  if (!user) {
    return <LoginPage />
  }

  const displayName = profile?.display_name ?? user.email?.split('@')[0] ?? t('member')
  const initials = getInitials(displayName)
  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSearchQuery(searchInput.trim())
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link to="/" className="brand">
          <span className="brand-mark"><img src={mainIcon} alt="" /></span>
          <span>clubworms<span className="brand-period">.</span></span>
        </Link>

        <div className="workspace-label">{t('workspace')}</div>
        <nav className="primary-nav" aria-label={t('navigation')}>
          <NavLink to="/my-clubs" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            <Users size={18} aria-hidden="true" /> <span>{t('myClubs')}</span>
          </NavLink>
          <NavLink to="/public-clubs" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            <Globe2 size={18} aria-hidden="true" /> <span>{t('publicClubs')}</span>
          </NavLink>
          {profile?.is_admin && (
            <NavLink to="/club-deletion-requests" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              <ShieldCheck size={18} aria-hidden="true" /> <span>{t('clubDeletionRequests')}</span>
            </NavLink>
          )}
        </nav>

        <div className="sidebar-bottom">
          <div className="profile-row">
            {profile?.avatar_url ? (
              <img className="avatar avatar-small" src={profile.avatar_url} alt="" />
            ) : (
              <div className="avatar avatar-small" aria-hidden="true">{initials}</div>
            )}
            <div>
              <Link to="/me" className="profile-name-link" aria-label={t('viewProfile')}>
                <strong>{displayName}</strong>
              </Link>
              <span>{t('storyEnthusiast')}</span>
            </div>
            <button className="icon-button" onClick={signOut} aria-label={t('signOut')}><LogOut size={17} aria-hidden="true" /></button>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">{t('yourSpace')} <span>/</span> <strong>{t('clubs')}</strong></div>
          <form className="topbar-search" onSubmit={handleSearch} role="search">
            <label className="visually-hidden" htmlFor="topbar-search-input">{t('searchClubs')}</label>
            <Search size={16} aria-hidden="true" />
            <input
              id="topbar-search-input"
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder={t('searchClubs')}
            />
            <button type="submit" aria-label={t('search')}><Search size={16} aria-hidden="true" /></button>
          </form>
          <div className="topbar-controls">
            <LanguageSwitcher />
            <ThemeSwitcher />
          </div>
        </header>

        <div className="page-wrap">
          <Routes>
            <Route
              path="/"
              element={(
                <section className="welcome-page" aria-labelledby="welcome-title">
                  <h1 id="welcome-title">{t('homeTitle')}</h1>
                  <p>{t('homeIntroOne')}</p>
                  <p>{t('homeIntroTwo')}</p>
                  <p>{t('homeIntroThree')}</p>
                </section>
              )}
            />
            <Route path="/my-clubs" element={<ClubListPage key="my-clubs" scope="my" searchQuery={searchQuery} />} />
            <Route path="/public-clubs" element={<ClubListPage key="public-clubs" scope="public" searchQuery={searchQuery} />} />
            <Route path="/clubs/:clubId/manage" element={<ClubManagementPage />} />
            <Route path="/club-deletion-requests" element={<ClubDeletionRequestsPage />} />
            <Route path="/me" element={<ProfilePage />} />
            <Route path="*" element={<section className="welcome-page"><h1>404</h1></section>} />
          </Routes>
        </div>
      </main>
    </div>
  )
}

export default App
