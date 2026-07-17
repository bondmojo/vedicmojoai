/**
 * ThemeToggle — light/dark switch. Renders a neutral placeholder until
 * mounted (next-themes needs the client to know the resolved theme, avoiding
 * a hydration mismatch flash).
 */
'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  if (!mounted) {
    return (
      <span
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-600"
        aria-hidden="true"
      />
    )
  }

  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-600 text-gray-300 hover:border-indigo-500 hover:text-ink transition-colors"
    >
      {isDark ? (
        // Sun icon (click to go light)
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4.5 w-4.5" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      ) : (
        // Moon icon (click to go dark)
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4.5 w-4.5" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  )
}
