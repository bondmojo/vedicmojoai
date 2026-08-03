/**
 * lib/email.ts — Resend-backed transactional email (password reset only, v1).
 */

import { Resend } from 'resend'

function getClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not configured — cannot send email')
  }
  return new Resend(apiKey)
}

export async function sendPasswordResetEmail(toEmail: string, rawToken: string): Promise<void> {
  const from = process.env.RESEND_FROM_EMAIL
  if (!from) {
    throw new Error('RESEND_FROM_EMAIL is not configured — cannot send email')
  }

  const baseUrl = process.env.NEXTAUTH_URL || process.env.APP_BASE_URL || 'http://localhost:3000'
  const resetUrl = `${baseUrl}/reset-password?token=${rawToken}`

  const resend = getClient()
  const { error } = await resend.emails.send({
    from,
    to: toEmail,
    subject: 'Reset your VedicMojoAI password',
    html: `
      <p>A password reset was requested for this account.</p>
      <p><a href="${resetUrl}">Click here to reset your password</a></p>
      <p>This link expires in 45 minutes. If you didn't request this, you can ignore this email.</p>
    `,
  })

  if (error) {
    throw new Error(`Resend failed to send password reset email: ${error.message}`)
  }
}
