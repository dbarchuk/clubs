import { useEffect, useMemo, useState } from 'react'
import { ThemeContext, type ThemeContextValue, type ThemePreference } from './theme-context'

function getInitialTheme(): ThemePreference {
  try {
    const stored = localStorage.getItem('clubworms-theme')
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // Default to the operating system preference when storage is unavailable.
  }
  return 'system'
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<ThemePreference>(getInitialTheme)
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  )
  const resolvedTheme = theme === 'system' ? systemTheme : theme

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const updateSystemTheme = () => setSystemTheme(media.matches ? 'dark' : 'light')
    media.addEventListener('change', updateSystemTheme)
    return () => media.removeEventListener('change', updateSystemTheme)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      'content', resolvedTheme === 'dark' ? '#151815' : '#f7f6f2',
    )
    try {
      localStorage.setItem('clubworms-theme', theme)
    } catch {
      // Theme selection remains available when storage is disabled.
    }
  }, [theme, resolvedTheme])

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme],
  )
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
