/**
 * POST /api/auth/reset-password — consume a reset token and set a new
 * password. Invalidates every existing session and MCP token for the user
 * (Requirement 3.5) in the same transaction as the password update.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { hashPassword, hashResetToken } from '@/lib/passwords'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'

const ResetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

const INVALID_TOKEN_ERROR = {
  error: 'InvalidResetToken',
  message: 'This password reset link is invalid or has expired.',
}

export async function POST(request: NextRequest) {
  // IP-only keying would put every caller behind a non-proxied deployment
  // (getClientIp() falling back to the literal 'unknown') into one shared
  // bucket, locking out password reset for everyone after 10 attempts from
  // anyone — the same shared-bucket bug fixed on signup. Key on the reset
  // token itself instead: it's already the single-use, unguessable value
  // this endpoint is meant to protect, so it deters brute-forcing one token
  // regardless of whether the caller's IP is visible.
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'InvalidJson', message: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = ResetPasswordSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'ValidationError', message: 'Invalid input', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const { token, password } = parsed.data

  if (!checkRateLimit(`reset-password:${getClientIp(request)}:${token}`)) {
    return NextResponse.json(
      { error: 'RateLimited', message: 'Too many attempts. Try again later.' },
      { status: 429 }
    )
  }

  const tokenHash = hashResetToken(token)

  const resetToken = await prisma.passwordResetToken.findUnique({ where: { tokenHash } })
  if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
    return NextResponse.json(INVALID_TOKEN_ERROR, { status: 400 })
  }

  const passwordHash = await hashPassword(password)

  await prisma.$transaction([
    prisma.user.update({ where: { id: resetToken.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: resetToken.id }, data: { usedAt: new Date() } }),
    prisma.session.deleteMany({ where: { userId: resetToken.userId } }),
    // A password reset is often a compromise response — a surviving MCP
    // token would let an attacker keep full API access after the user
    // thinks they've locked them out. Revoke rather than delete so
    // /account still shows the token existed (label/lastUsedAt).
    prisma.mcpApiToken.updateMany({
      where: { userId: resetToken.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ])

  return NextResponse.json({ message: 'Password has been reset. Please log in with your new password.' })
}
