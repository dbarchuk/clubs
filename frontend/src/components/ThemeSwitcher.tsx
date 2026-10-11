import { Moon, Sun } from 'lucide-react'
import { useI18n } from '../lib/i18n-context'
import { useTheme } from '../lib/theme-context'

export function ThemeSwitcher() {
  const { resolvedTheme, setTheme } = useTheme()
  const { t } = useI18n()
  const nextTheme = resolvedTheme === 'dark' ? 'light' : 'dark'

  return (
    <button
      type="button"
      className="theme-switcher"
      onClick={() => setTheme(nextTheme)}
      aria-label={nextTheme === 'light' ? t('switchToLight') : t('switchToDark')}
      title={nextTheme === 'light' ? t('switchToLight') : t('switchToDark')}
    >
      {resolvedTheme === 'dark'
        ? <Sun size={17} aria-hidden="true" />
        : <Moon size={17} aria-hidden="true" />}
    </button>
  )
}
