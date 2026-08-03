/**
 * tests/mcp-auth.test.ts
 * Unit tests for lib/mcpAuth.ts's resolveMcpUser — the identity resolver
 * MCP-facing routes use via resolveRequestUser (Requirement 8).
 *
 * Mocks: @/lib/db (prisma.mcpApiToken, prisma.user).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/db', () => ({
  prisma: {
    mcpApiToken: {
      findFirst: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}))

import { resolveMcpUser, hashMcpToken } from '@/lib/mcpAuth'
import { prisma } from '@/lib/db'

function makeRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost:3000/api/timeline', {
    method: 'POST',
    headers,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('resolveMcpUser', () => {
  it('resolves to the owning userId for a valid, unrevoked token', async () => {
    ;(prisma.mcpApiToken.findFirst as any).mockResolvedValue({
      id: 'tok-1',
      userId: 'user-1',
      revokedAt: null,
    })

    const req = makeRequest({ 'x-mcp-token': 'raw-token-value' })
    const userId = await resolveMcpUser(req)

    expect(userId).toBe('user-1')
    expect(prisma.mcpApiToken.findFirst).toHaveBeenCalledWith({
      where: { tokenHash: hashMcpToken('raw-token-value'), revokedAt: null },
    })
  })

  it('updates lastUsedAt on a successful resolution (best-effort)', async () => {
    ;(prisma.mcpApiToken.findFirst as any).mockResolvedValue({
      id: 'tok-1',
      userId: 'user-1',
      revokedAt: null,
    })

    await resolveMcpUser(makeRequest({ 'x-mcp-token': 'raw-token-value' }))

    expect(prisma.mcpApiToken.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'tok-1' } })
    )
  })

  it('returns null for a token that does not match any row (revoked or invalid)', async () => {
    ;(prisma.mcpApiToken.findFirst as any).mockResolvedValue(null)

    const userId = await resolveMcpUser(makeRequest({ 'x-mcp-token': 'not-a-real-token' }))
    expect(userId).toBeNull()
  })

  it('never falls through to the dev-user fallback when an (invalid) token was provided', async () => {
    vi.stubEnv('NODE_ENV', 'test') // not 'production'
    vi.stubEnv('MCP_DEV_USER_EMAIL', 'dev@example.com')
    ;(prisma.mcpApiToken.findFirst as any).mockResolvedValue(null)

    const userId = await resolveMcpUser(makeRequest({ 'x-mcp-token': 'bad-token' }))

    expect(userId).toBeNull()
    expect(prisma.user.findUnique).not.toHaveBeenCalled()
  })

  it('resolves the dev-user fallback when no token is sent, non-production, and MCP_DEV_USER_EMAIL is set', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('MCP_DEV_USER_EMAIL', 'dev@example.com')
    ;(prisma.user.findUnique as any).mockResolvedValue({ id: 'dev-user-1', email: 'dev@example.com' })

    const userId = await resolveMcpUser(makeRequest())
    expect(userId).toBe('dev-user-1')
  })

  it('the dev-user fallback is disabled in production, even with MCP_DEV_USER_EMAIL set', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('MCP_DEV_USER_EMAIL', 'dev@example.com')

    const userId = await resolveMcpUser(makeRequest())

    expect(userId).toBeNull()
    expect(prisma.user.findUnique).not.toHaveBeenCalled()
  })

  it('returns null with no token and no MCP_DEV_USER_EMAIL configured', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('MCP_DEV_USER_EMAIL', '')

    const userId = await resolveMcpUser(makeRequest())
    expect(userId).toBeNull()
  })
})
