import { useState } from 'react'
import { useAuth } from '../lib/auth-context'
import mainIcon from '../assets/main_icon.png'
import { useI18n } from '../lib/i18n-context'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import { ThemeSwitcher } from '../components/ThemeSwitcher'
import './login.css'

export function LoginPage() {
  const { signIn, signUp, signInWithGoogle, loading } = useAuth()
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [error, setError] = useState('')
  const [googleLoading, setGoogleLoading] = useState(false)

  const handleGoogleSignIn = async () => {
    setError('')
    setGoogleLoading(true)
    try {
      await signInWithGoogle()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('googleSignInFailed'))
      setGoogleLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      if (isSignUp) {
        await signUp(email, password, displayName)
      } else {
        await signIn(email, password)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('authenticationFailed'))
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-preferences">
          <LanguageSwitcher />
          <ThemeSwitcher />
        </div>
        <div className="login-header">
          <span className="brand-mark"><img src={mainIcon} alt="" /></span>
          <h1>{isSignUp ? t('createAccount') : t('welcomeBack')}</h1>
          <p>{isSignUp ? t('startTracking') : t('signInToManage')}</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {isSignUp && (
            <div className="form-group">
              <label htmlFor="displayName">{t('displayName')}</label>
              <input
                id="displayName"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={t('yourName')}
                required={isSignUp}
                autoComplete="nickname"
              />
            </div>
          )}

          <div className="form-group">
            <label htmlFor="email">{t('email')}</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">{t('password')}</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('yourPassword')}
              required
              minLength={6}
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
            />
          </div>

          {error && <div className="form-error">{error}</div>}

          <button type="submit" className="button button-primary button-full" disabled={loading}>
            {loading ? t('loading') : isSignUp ? t('createAccountAction') : t('signIn')}
          </button>
        </form>

        <div className="login-divider"><span>{t('or')}</span></div>
        <button
          type="button"
          className="button button-google button-full"
          onClick={() => void handleGoogleSignIn()}
          disabled={loading || googleLoading}
        >
          <svg aria-hidden="true" viewBox="0 0 48 48" width="18" height="18">
            <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.8 6.1C12.3 13.7 17.6 9.5 24 9.5Z" />
            <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.1 5.4-4.5 7.1l7.3 5.7c4.3-4 6.9-9.9 6.9-17.3Z" />
            <path fill="#FBBC05" d="M10.4 28.6a14.5 14.5 0 0 1 0-9.2l-7.8-6.1a24 24 0 0 0 0 21.4l7.8-6.1Z" />
            <path fill="#34A853" d="M24 48c6.5 0 12-2.1 16-6.2l-7.3-5.7c-2 1.4-4.7 2.3-8.7 2.3-6.4 0-11.7-4.2-13.6-10l-7.8 6.1C6.5 42.6 14.6 48 24 48Z" />
          </svg>
          {googleLoading ? t('connecting') : t('continueWithGoogle')}
        </button>

        <div className="login-footer">
          <button className="text-link" onClick={() => setIsSignUp(!isSignUp)}>
            {isSignUp ? t('alreadyHaveAccount') : t('noAccount')}
          </button>
          <nav className="login-legal-links" aria-label={t('legalInformation')}>
            <a href="/privacy-policy.html">{t('privacyPolicy')}</a>
            <a href="/terms-of-service.html">{t('termsOfService')}</a>
          </nav>
        </div>
      </div>
    </div>
  )
}
