/**
 * tests/auth-reset-password.test.ts
 * Integration tests for POST /api/auth/reset-password (Requirement 3).
 *
 * Mocks: @/lib/db (prisma.passwordResetToken, prisma.user, prisma.session,
 * prisma.mcpApiToken, prisma.$transaction).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/db', () => ({
  prisma: {
    passwordResetToken: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    user: {
      update: vi.fn(),
    },
    session: {
      deleteMany: vi.fn(),
    },
    mcpApiToken: {
      updateMany: vi.fn(),
    },
    $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  },
}))

import { POST as resetPassword } from '../app/api/auth/reset-password/route'
import { prisma } from '@/lib/db'
import { hashResetToken } from '@/lib/passwords'

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/auth/reset-password', () => {
  it('rejects an unknown token with 400 (generic message)', async () => {
    ;(prisma.passwordResetToken.findUnique as any).mockResolvedValue(null)

    const res = await resetPassword(makeRequest({ token: 'bogus-token', password: 'newpassword123' }))

    expect(res.status).toBe(400)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('rejects an already-used token with 400', async () => {
    ;(prisma.passwordResetToken.findUnique as any).mockResolvedValue({
      id: 'prt-1',
      userId: 'user-1',
      tokenHash: hashResetToken('used-token'),
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: new Date(), // already used
    })

    const res = await resetPassword(makeRequest({ token: 'used-token', password: 'newpassword123' }))
    expect(res.status).toBe(400)
  })

  it('rejects an expired token with 400', async () => {
    ;(prisma.passwordResetToken.findUnique as any).mockResolvedValue({
      id: 'prt-1',
      userId: 'user-1',
      tokenHash: hashResetToken('expired-token'),
      expiresAt: new Date(Date.now() - 60_000), // expired
      usedAt: null,
    })

    const res = await resetPassword(makeRequest({ token: 'expired-token', password: 'newpassword123' }))
    expect(res.status).toBe(400)
  })

  it('accepts a valid token, updates the password, and invalidates ALL sessions and MCP tokens for the user', async () => {
    ;(prisma.passwordResetToken.findUnique as any).mockResolvedValue({
      id: 'prt-1',
      userId: 'user-1',
      tokenHash: hashResetToken('good-token'),
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
    })

    const res = await resetPassword(makeRequest({ token: 'good-token', password: 'newpassword123' }))

    expect(res.status).toBe(200)
    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'user-1' } })
    )
    expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } })
    expect(prisma.mcpApiToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    })
  })

  it('does not rate-limit all users off of one shared IP bucket (keys on the token, not IP alone)', async () => {
    ;(prisma.passwordResetToken.findUnique as any).mockResolvedValue(null)

    for (let i = 0; i < 10; i++) {
      await resetPassword(makeRequest({ token: `token-${i}`, password: 'newpassword123' }))
    }

    // 10 different tokens from the same (unknown) IP must not share one bucket —
    // this 11th, distinct token should still be evaluated on its own merits (400
    // for unknown token), not 429 from a shared IP-only bucket exhausted above.
    const res = await resetPassword(makeRequest({ token: 'token-11', password: 'newpassword123' }))
    expect(res.status).toBe(400)
  })
})
