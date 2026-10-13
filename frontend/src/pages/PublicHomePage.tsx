import { Link } from 'react-router-dom'
import mainIcon from '../assets/main_icon.png'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import { ThemeSwitcher } from '../components/ThemeSwitcher'
import { useI18n } from '../lib/i18n-context'
import './public-home.css'

export function PublicHomePage() {
  const { t } = useI18n()

  return (
    <main className="public-home">
      <header className="public-home-header">
        <Link to="/" className="public-home-brand">
          <span className="brand-mark"><img src={mainIcon} alt="" /></span>
          <span>clubworms<span className="brand-period">.</span></span>
        </Link>
        <div className="public-home-controls">
          <LanguageSwitcher />
          <ThemeSwitcher />
          <Link className="button button-primary" to="/login">{t('signIn')}</Link>
        </div>
      </header>
      <section className="public-home-content" aria-labelledby="public-home-title">
        <h1 id="public-home-title">{t('homeTitle')}</h1>
        <p>{t('homeIntroOne')}</p>
        <p>{t('homeIntroTwo')}</p>
        <p>{t('homeIntroThree')}</p>
        <Link className="button button-primary" to="/login">{t('startTracking')}</Link>
      </section>
      <footer className="public-home-footer">
        <a href="/privacy-policy.html">{t('privacyPolicy')}</a>
        <a href="/terms-of-service.html">{t('termsOfService')}</a>
        <a href="mailto:dvbarchuk@gmail.com">dvbarchuk@gmail.com</a>
      </footer>
    </main>
  )
}
