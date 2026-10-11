import { useRef } from 'react'
import { useI18n } from '../lib/i18n-context'

export function LanguageSwitcher() {
  const { language, setLanguage, t } = useI18n()
  const menuRef = useRef<HTMLDetailsElement>(null)
  const options = [
    { code: 'uk', flag: '🇺🇦', label: t('ukrainian') },
    { code: 'en', flag: '🇬🇧', label: t('english') },
  ] as const

  return (
    <details className="language-menu" ref={menuRef}>
      <summary aria-label={t('language')} title={t('language')}>
        {language === 'uk' ? '🇺🇦' : '🇬🇧'}
      </summary>
      <div className="language-menu-options">
        {options.map((option) => (
          <button
            key={option.code}
            type="button"
            aria-label={option.label}
            aria-pressed={language === option.code}
            onClick={() => {
              setLanguage(option.code)
              menuRef.current?.removeAttribute('open')
            }}
          >
            {option.flag}
          </button>
        ))}
      </div>
    </details>
  )
}
