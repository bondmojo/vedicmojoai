/**
 * POST /api/auth/login — verify credentials and start a session.
 *
 * NFR-2 no-enumeration: unknown email and wrong password return the exact
 * same generic 401. The specific reason is only ever logged server-side.
 * Bypasses Auth.js's signIn() — see lib/auth.ts.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { verifyPassword } from '@/lib/passwords'
import { createUserSession, SESSION_COOKIE_NAME, sessionCookieOptions } from '@/lib/auth'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'

const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
})

const GENERIC_ERROR = { error: 'InvalidCredentials', message: 'Invalid email or password.' }

// Bcrypt hash of a random, never-used placeholder — compared against on the
// unknown-email branch so that path costs the same ~bcrypt-compare latency as
// a real wrong-password check. Without this, an unknown email returns
// noticeably faster than a wrong password for a real account, which is a
// timing oracle for account enumeration even though the response bodies are
// identical (NFR-2).
const DUMMY_PASSWORD_HASH =
  '$2b$12$pCfSlEI1K5D3cNQrUAtGc.yJZADEZVBiYLnOIOWJc8JF0YSxk5ZB2'

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'InvalidJson', message: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = LoginSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(GENERIC_ERROR, { status: 401 })
  }

  const { email, password } = parsed.data

  if (!checkRateLimit(`login:${getClientIp(request)}:${email}`)) {
    return NextResponse.json(
      { error: 'RateLimited', message: 'Too many login attempts. Try again later.' },
      { status: 429 }
    )
  }

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) {
    await verifyPassword(password, DUMMY_PASSWORD_HASH) // constant-time-ish: match the real branch's latency
    return NextResponse.json(GENERIC_ERROR, { status: 401 })
  }

  const valid = await verifyPassword(password, user.passwordHash)
  if (!valid) {
    return NextResponse.json(GENERIC_ERROR, { status: 401 })
  }

  const { sessionToken, expires } = await createUserSession(user.id)

  const response = NextResponse.json({ user: { id: user.id, email: user.email, name: user.name } })
  response.cookies.set(SESSION_COOKIE_NAME, sessionToken, {
    ...sessionCookieOptions(),
    expires,
  })
  return response
}
