/**
 * POST /api/auth/forgot-password — always returns the same generic response,
 * regardless of whether the email exists (NFR-2 no-enumeration). Only when
 * the email resolves to a real User is a reset token generated and emailed.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { generateResetToken, hashResetToken } from '@/lib/passwords'
import { sendPasswordResetEmail } from '@/lib/email'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'

const ForgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
})

const RESET_TOKEN_TTL_MS = 45 * 60 * 1000 // 45 minutes

const GENERIC_RESPONSE = {
  message: 'If an account exists for that email, a password reset link has been sent.',
}

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'InvalidJson', message: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = ForgotPasswordSchema.safeParse(body)
  if (!parsed.success) {
    // Still generic — don't reveal validation specifics beyond "bad request".
    return NextResponse.json(GENERIC_RESPONSE)
  }

  const { email } = parsed.data

  if (!checkRateLimit(`forgot-password:${getClientIp(request)}:${email}`)) {
    // Rate limiting itself must not leak account existence — same generic body.
    return NextResponse.json(GENERIC_RESPONSE)
  }

  const user = await prisma.user.findUnique({ where: { email } })
  if (user) {
    const rawToken = generateResetToken()
    const tokenHash = hashResetToken(rawToken)
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS)

    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    })

    try {
      await sendPasswordResetEmail(user.email, rawToken)
    } catch (err) {
      console.error('[forgot-password] failed to send reset email:', err)
      // Do not surface this to the caller — response stays generic either way.
    }
  }

  return NextResponse.json(GENERIC_RESPONSE)
}
