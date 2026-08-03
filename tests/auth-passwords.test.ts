/**
 * tests/auth-passwords.test.ts
 * Unit tests for lib/passwords.ts — bcrypt hashing and reset-token hashing.
 */

import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword, generateResetToken, hashResetToken } from '@/lib/passwords'

describe('hashPassword / verifyPassword', () => {
  it('round-trips: hashing then verifying the same password succeeds', async () => {
    const hash = await hashPassword('correct-horse-battery-staple')
    expect(await verifyPassword('correct-horse-battery-staple', hash)).toBe(true)
  })

  it('rejects an incorrect password against a valid hash', async () => {
    const hash = await hashPassword('correct-horse-battery-staple')
    expect(await verifyPassword('wrong-password', hash)).toBe(false)
  })

  it('never stores the password in plaintext', async () => {
    const hash = await hashPassword('correct-horse-battery-staple')
    expect(hash).not.toContain('correct-horse-battery-staple')
    expect(hash.startsWith('$2')).toBe(true) // bcrypt hash prefix
  })
})

describe('generateResetToken / hashResetToken', () => {
  it('generates unique raw tokens across calls', () => {
    const a = generateResetToken()
    const b = generateResetToken()
    expect(a).not.toBe(b)
    expect(a.length).toBeGreaterThanOrEqual(32)
  })

  it('hashes the same raw token deterministically', () => {
    const raw = generateResetToken()
    expect(hashResetToken(raw)).toBe(hashResetToken(raw))
  })

  it('produces different hashes for different raw tokens', () => {
    const a = generateResetToken()
    const b = generateResetToken()
    expect(hashResetToken(a)).not.toBe(hashResetToken(b))
  })

  it('the stored hash never equals the raw token (never stored as-is)', () => {
    const raw = generateResetToken()
    expect(hashResetToken(raw)).not.toBe(raw)
  })
})
