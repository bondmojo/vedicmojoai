/**
 * lib/auth.ts — Auth.js (NextAuth v5) config + the shared ownership helper.
 *
 * Credentials + database-sessions integration note (see
 * .kiro/specs/user-management/design.md): Auth.js's core `assertConfig` HARD
 * ERRORS ("UnsupportedStrategy") on every `auth()` call — not just signIn() —
 * whenever a Credentials provider is registered together with the database
 * session strategy (@auth/core considers "credentials + database sessions"
 * unsupported outright, regardless of whether signIn() is ever invoked with
 * it). So the Credentials provider is NOT registered here at all — this
 * config has `providers: []`. The custom routes under app/api/auth/*
 * (signup, login, logout, forgot-password, reset-password) never call
 * Auth.js's signIn()/signOut(); they verify the bcrypt hash and create/delete
 * `Session` rows directly via the Prisma adapter, then set/clear the
 * `authjs.session-token` cookie by hand. `auth()` below is only ever used to
 * *read* an existing session (Server Components, route handlers).
 */

import NextAuth from 'next-auth'
import { PrismaAdapter } from '@auth/prisma-adapter'
import type { NextRequest } from 'next/server'
import { randomUUID } from 'crypto'
import { prisma } from '@/lib/db'
import { resolveMcpUser } from '@/lib/mcpAuth'

const adapter = PrismaAdapter(prisma)

// Deliberately NOT tied to NODE_ENV === 'production': this app's own
// docker-compose stack runs a production build over plain HTTP on
// localhost with no TLS-terminating proxy in front of it. A Secure cookie
// is silently dropped by the browser over HTTP, breaking login entirely.
// Only opt into Secure when the deployment genuinely terminates HTTPS.
//
// This MUST also be passed into `authConfig.useSecureCookies` below —
// @auth/core's own cookie-name resolution (`defaultCookies()` in
// @auth/core/lib/init.js) independently falls back to
// `url.protocol === 'https:'` whenever `useSecureCookies` is left
// unset, which silently diverges from the cookie name/attributes our
// custom login/signup/reset routes set by hand. Without setting it here,
// `auth()` (used by resolveRequestUser) looks for a DIFFERENT cookie name
// than the one actually written, so every session is invisible to `auth()`
// even though the cookie was stored correctly by the browser.
const useSecureCookies = process.env.COOKIE_SECURE === 'true'

export const authConfig = {
  adapter,
  session: { strategy: 'database' as const },
  providers: [],
  useSecureCookies,
  pages: {
    signIn: '/login',
  },
  callbacks: {
    // Database-session default doesn't put `id` on session.user — add it
    // explicitly (documented Auth.js pattern for database sessions).
    session({ session, user }: { session: import('next-auth').Session; user: { id: string } }) {
      session.user.id = user.id
      return session
    },
  },
}

export const { auth, handlers } = NextAuth(authConfig)

/**
 * Resolves the calling identity for any route: a browser session cookie
 * takes priority, falling back to a per-user MCP token (Requirement 8). Every
 * ownership check in the app is written once against this single function.
 */
export async function resolveRequestUser(request: NextRequest): Promise<string | null> {
  const session = await auth()
  if (session?.user?.id) return session.user.id
  return resolveMcpUser(request)
}

/**
 * Session-only identity resolution — deliberately has no MCP-token fallback.
 * Used by the MCP token issuance/revoke routes so an MCP token can never be
 * used to mint or revoke another MCP token.
 */
export async function requireSessionUserId(): Promise<string | null> {
  const session = await auth()
  return session?.user?.id ?? null
}

// ─── Session cookie helpers (used by the custom app/api/auth/* routes) ───
// These bypass Auth.js's signIn()/signOut() entirely — see the integration
// note at the top of this file for why.

export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60 // 30 days
export const SESSION_COOKIE_NAME = useSecureCookies
  ? '__Secure-authjs.session-token'
  : 'authjs.session-token'

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    secure: useSecureCookies,
    maxAge: SESSION_MAX_AGE_SECONDS,
  }
}

/** Creates a database Session row for `userId` and returns the cookie value + expiry. */
export async function createUserSession(userId: string): Promise<{ sessionToken: string; expires: Date }> {
  const sessionToken = randomUUID()
  const expires = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000)
  await adapter.createSession!({ sessionToken, userId, expires })
  return { sessionToken, expires }
}

/** Deletes a single Session row by its cookie token (used by logout). */
export async function destroySessionByToken(sessionToken: string): Promise<void> {
  await adapter.deleteSession!(sessionToken)
}
