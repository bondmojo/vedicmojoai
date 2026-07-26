/**
 * ThemeProvider — wraps next-themes to toggle the `.dark` class on <html>.
 * Default is "dark" so existing users see the same UI as before this change;
 * `enableSystem={false}` keeps behavior deterministic rather than following
 * the OS preference.
 */
'use client'

import { ThemeProvider as NextThemesProvider } from 'next-themes'
import type { ReactNode } from 'react'

export default function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      {children}
    </NextThemesProvider>
  )
}
