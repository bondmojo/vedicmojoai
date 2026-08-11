/**
 * tests/mcp-token-routes.test.ts
 * Integration tests for /api/account/mcp-token (Requirement 7) — session-only
 * issuance/revoke, one-active-token-per-user (Decision 9), reveal-once.
 *
 * Mocks: @/lib/auth (requireSessionUserId), @/lib/db.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/auth', () => ({
  requireSessionUserId: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  prisma: {
    mcpApiToken: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  },
}))

import { GET, POST } from '../app/api/account/mcp-token/route'
import { POST as revoke } from '../app/api/account/mcp-token/revoke/route'
import { requireSessionUserId } from '@/lib/auth'
import { prisma } from '@/lib/db'

function makePostRequest(body: Record<string, unknown> = {}): NextRequest {
  return new NextRequest('http://localhost:3000/api/account/mcp-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/account/mcp-token', () => {
  it('returns 401 when not logged in (an MCP token itself must not work here)', async () => {
    ;(requireSessionUserId as any).mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns the active token metadata without the raw value', async () => {
    ;(requireSessionUserId as any).mockResolvedValue('user-1')
    ;(prisma.mcpApiToken.findFirst as any).mockResolvedValue({
      label: 'laptop',
      createdAt: new Date('2026-01-01'),
      lastUsedAt: null,
    })

    const res = await GET()
    const body = await res.json()
    expect(body.token.label).toBe('laptop')
    expect(body.token.tokenHash).toBeUndefined()
  })
})

describe('POST /api/account/mcp-token', () => {
  it('returns 401 when not logged in', async () => {
    ;(requireSessionUserId as any).mockResolvedValue(null)
    const res = await POST(makePostRequest())
    expect(res.status).toBe(401)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('revokes any existing active token and creates a new one, returning the raw value once', async () => {
    ;(requireSessionUserId as any).mockResolvedValue('user-1')

    const res = await POST(makePostRequest({ label: 'my-laptop' }))
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(typeof body.token).toBe('string')
    expect(body.token.length).toBeGreaterThan(20)
    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(prisma.mcpApiToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1', revokedAt: null } })
    )
    expect(prisma.mcpApiToken.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'user-1', label: 'my-laptop' }) })
    )
  })
})

describe('POST /api/account/mcp-token/revoke', () => {
  it('returns 401 when not logged in', async () => {
    ;(requireSessionUserId as any).mockResolvedValue(null)
    const res = await revoke()
    expect(res.status).toBe(401)
  })

  it('revokes the active token for the logged-in user', async () => {
    ;(requireSessionUserId as any).mockResolvedValue('user-1')
    const res = await revoke()
    expect(res.status).toBe(200)
    expect(prisma.mcpApiToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1', revokedAt: null } })
    )
  })
})
