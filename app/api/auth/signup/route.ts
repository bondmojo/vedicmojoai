/**
 * POST /api/auth/signup — create a User and start a session immediately.
 *
 * No email verification (Decision 4) and open self-serve signup (Decision 6).
 * Rate-limited per IP. Bypasses Auth.js's signIn() — see lib/auth.ts.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { hashPassword } from '@/lib/passwords'
import { createUserSession, SESSION_COOKIE_NAME, sessionCookieOptions } from '@/lib/auth'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'

const SignupSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().trim().min(1).optional(),
})

export async function POST(request: NextRequest) {
  // IP-based check only when a real IP is known. getClientIp() falls back to
  // the literal 'unknown' when there's no reverse proxy setting
  // x-forwarded-for (the normal case for a single-instance/local deployment)
  // — keying on that constant would make every caller share one bucket, so
  // 10 signups from anyone would lock out signup for everyone. The
  // per-email check below (after body parsing) still deters repeated
  // attempts against one target email regardless of IP visibility.
  const ip = getClientIp(request)
  if (ip !== 'unknown' && !checkRateLimit(`signup:ip:${ip}`)) {
    return NextResponse.json(
      { error: 'RateLimited', message: 'Too many signup attempts. Try again later.' },
      { status: 429 }
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'InvalidJson', message: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = SignupSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'ValidationError', message: 'Invalid input', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const { email, password, name } = parsed.data

  if (!checkRateLimit(`signup:email:${email}`)) {
    return NextResponse.json(
      { error: 'RateLimited', message: 'Too many signup attempts. Try again later.' },
      { status: 429 }
    )
  }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    return NextResponse.json(
      { error: 'EmailAlreadyRegistered', message: 'An account with this email already exists.' },
      { status: 409 }
    )
  }

  const passwordHash = await hashPassword(password)
  const user = await prisma.user.create({
    data: { email, passwordHash, name: name ?? null },
  })

  const { sessionToken, expires } = await createUserSession(user.id)

  const response = NextResponse.json(
    { user: { id: user.id, email: user.email, name: user.name } },
    { status: 201 }
  )
  response.cookies.set(SESSION_COOKIE_NAME, sessionToken, {
    ...sessionCookieOptions(),
    expires,
  })
  return response
}
