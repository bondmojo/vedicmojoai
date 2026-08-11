/**
 * lib/passwords.ts — bcrypt password hashing + reset-token hashing helpers.
 */

import bcrypt from 'bcrypt'
import { randomBytes, createHash } from 'crypto'

const SALT_ROUNDS = 12

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS)
}

export function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash)
}

/** Raw, URL-safe token to email the user — never stored as-is. */
export function generateResetToken(): string {
  return randomBytes(32).toString('hex')
}

/** SHA-256 of a raw reset token — this is what's stored in PasswordResetToken.tokenHash. */
export function hashResetToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex')
}
