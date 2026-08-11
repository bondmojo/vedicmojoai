/**
 * AppNav — sticky global top navigation. Rendered once from app/layout.tsx
 * so every page shares the same brand mark, primary nav, and theme toggle
 * instead of each page rolling its own row of nav-style buttons.
 */
'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Sparkles, LogOut } from 'lucide-react'
import ThemeToggle from './ThemeToggle'
import { cn } from '@/lib/utils'

const NAV_LINKS: { href: string; label: string }[] = [
  { href: '/', label: 'Chart Compute' },
  { href: '/duration-computation', label: 'Duration Analyser' },
  { href: '/duration-analysis', label: 'Duration AI' },
  { href: '/unified-charts', label: 'Charts' },
  { href: '/matchmaking', label: 'Matchmaking' },
  { href: '/reports', label: 'Reports' },
  { href: '/account', label: 'Account' },
]

const AUTH_PAGES = ['/login', '/signup', '/forgot-password', '/reset-password']

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}

export default function AppNav() {
  const pathname = usePathname()
  const router = useRouter()

  if (AUTH_PAGES.includes(pathname)) {
    return null
  }

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  return (
    <header className="sticky top-0 z-40 h-14 w-full border-b border-border bg-card/80 backdrop-blur">
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-6">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <Sparkles className="h-[18px] w-[18px] text-primary" aria-hidden="true" />
          <span className="font-semibold tracking-tight text-ink">VedicMojo</span>
        </Link>

        {/* Primary nav */}
        <nav className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map((link) => {
            const active = isActive(pathname, link.href)
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  active
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
                )}
              >
                {link.label}
              </Link>
            )
          })}
        </nav>

        {/* Theme toggle + logout */}
        <div className="flex items-center gap-2 shrink-0">
          <ThemeToggle />
          <button
            onClick={handleLogout}
            title="Log out"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent/60 hover:text-foreground transition-colors"
          >
            <LogOut className="h-[18px] w-[18px]" aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>
  )
}
