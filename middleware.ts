/**
 * middleware.ts — guards UI page routes only (never API routes).
 *
 * Checks for the session cookie's mere presence — cheap, no DB hit, runs on
 * the edge runtime where Prisma isn't available. The real session-validity
 * and ownership check still happens per-route via `resolveRequestUser`
 * (lib/auth.ts), consistent with how lib/mcpAuth.ts was already per-route
 * rather than per-middleware. Deliberately does not import lib/auth.ts —
 * that module pulls in the Prisma adapter, which isn't edge-compatible.
 *
 * Cookie name must exactly match lib/auth.ts's SESSION_COOKIE_NAME — both
 * key off COOKIE_SECURE (not NODE_ENV; see lib/auth.ts's comment for why).
 */

import { NextRequest, NextResponse } from 'next/server'

const SESSION_COOKIE_NAME =
  process.env.COOKIE_SECURE === 'true' ? '__Secure-authjs.session-token' : 'authjs.session-token'

export function middleware(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE_NAME)) {
    return NextResponse.next()
  }

  const loginUrl = new URL('/login', request.url)
  loginUrl.searchParams.set('callbackUrl', request.nextUrl.pathname)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: [
    '/',
    '/compute/:path*',
    '/unified-charts/:path*',
    '/runs/:path*',
    '/duration-analysis/:path*',
    '/duration-computation/:path*',
    '/account/:path*',
    '/reports/:path*',
  ],
}
