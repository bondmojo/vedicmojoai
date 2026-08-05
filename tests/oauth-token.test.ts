/**
 * tests/oauth-token.test.ts
 * RFC 6749 §5 token endpoint — app/api/oauth/token/route.ts.
 *
 * Covers: PKCE success/failure, single-use enforcement via the atomic
 * updateMany claim (a replayed code/refresh-token must be rejected once the
 * claim's affected-row count is 0 — this is what stands in for a real
 * concurrent-request race at the unit level, since Postgres itself
 * guarantees the UPDATE...WHERE atomicity that makes the race safe),
 * refresh-token rotation, and resource (RFC 8707) mismatch rejection.
 *
 * Mocks: @/lib/db (prisma.oAuthAuthorizationCode/oAuthRefreshToken/oAuthAccessToken).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createHash } from 'crypto'

vi.mock('@/lib/db', () => ({
  prisma: {
    oAuthAuthorizationCode: {
      updateMany: vi.fn(),
      findUnique: vi.fn(),
    },
    oAuthRefreshToken: {
      updateMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    oAuthAccessToken: {
      create: vi.fn(),
    },
    $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  },
}))

import { POST } from '../app/api/oauth/token/route'
import { prisma } from '@/lib/db'

function pkcePair() {
  const codeVerifier = 'a'.repeat(64)
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url')
  return { codeVerifier, codeChallenge }
}

function makeRequest(fields: Record<string, string>): NextRequest {
  const body = new URLSearchParams(fields)
  return new NextRequest('http://localhost:3000/api/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/oauth/token — authorization_code grant', () => {
  const { codeVerifier, codeChallenge } = pkcePair()

  function mockValidCode(overrides: Record<string, unknown> = {}) {
    ;(prisma.oAuthAuthorizationCode.updateMany as any).mockResolvedValue({ count: 1 })
    ;(prisma.oAuthAuthorizationCode.findUnique as any).mockResolvedValue({
      clientId: 'client-uuid-1',
      userId: 'user-1',
      redirectUri: 'https://claude.ai/api/mcp/callback',
      codeChallenge,
      resource: null,
      scope: null,
      client: { clientId: 'abc123' },
      ...overrides,
    })
  }

  it('issues an access + refresh token pair for a valid PKCE exchange', async () => {
    mockValidCode()

    const res = await POST(
      makeRequest({
        grant_type: 'authorization_code',
        code: 'raw-code-1',
        code_verifier: codeVerifier,
        redirect_uri: 'https://claude.ai/api/mcp/callback',
        client_id: 'abc123',
      })
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.token_type).toBe('Bearer')
    expect(body.access_token.startsWith('mcp_oat_')).toBe(true)
    expect(body.refresh_token.startsWith('mcp_ort_')).toBe(true)
    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
  })

  it('rejects a mismatched code_verifier (PKCE failure) and issues no tokens', async () => {
    mockValidCode()

    const res = await POST(
      makeRequest({
        grant_type: 'authorization_code',
        code: 'raw-code-1',
        code_verifier: 'wrong-verifier-wrong-verifier-wrong-verifier-wrong-verifier',
        redirect_uri: 'https://claude.ai/api/mcp/callback',
        client_id: 'abc123',
      })
    )
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toBe('invalid_grant')
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('rejects a replayed code once the atomic claim reports count 0 (single-use enforcement)', async () => {
    ;(prisma.oAuthAuthorizationCode.updateMany as any).mockResolvedValue({ count: 0 })

    const res = await POST(
      makeRequest({
        grant_type: 'authorization_code',
        code: 'already-used-code',
        code_verifier: codeVerifier,
        redirect_uri: 'https://claude.ai/api/mcp/callback',
        client_id: 'abc123',
      })
    )
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toBe('invalid_grant')
    // Must not even read the row when the claim failed — proves the check
    // gates on updateMany's count, not a subsequent read.
    expect(prisma.oAuthAuthorizationCode.findUnique).not.toHaveBeenCalled()
  })

  it('rejects a redirect_uri that does not match the original authorization request', async () => {
    mockValidCode()

    const res = await POST(
      makeRequest({
        grant_type: 'authorization_code',
        code: 'raw-code-1',
        code_verifier: codeVerifier,
        redirect_uri: 'https://attacker.example/callback',
        client_id: 'abc123',
      })
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('invalid_grant')
  })

  it('rejects a resource that does not match the one bound at /authorize (RFC 8707)', async () => {
    mockValidCode({ resource: 'https://issuer.example/api/mcp' })

    const res = await POST(
      makeRequest({
        grant_type: 'authorization_code',
        code: 'raw-code-1',
        code_verifier: codeVerifier,
        redirect_uri: 'https://claude.ai/api/mcp/callback',
        client_id: 'abc123',
        resource: 'https://issuer.example/some-other-resource',
      })
    )
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.error).toBe('invalid_target')
  })

  it('rejects a missing code_verifier as invalid_request', async () => {
    const res = await POST(
      makeRequest({
        grant_type: 'authorization_code',
        code: 'raw-code-1',
        redirect_uri: 'https://claude.ai/api/mcp/callback',
        client_id: 'abc123',
      })
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('invalid_request')
    expect(prisma.oAuthAuthorizationCode.updateMany).not.toHaveBeenCalled()
  })
})

describe('POST /api/oauth/token — refresh_token grant', () => {
  it('rotates the refresh token and issues a new access token', async () => {
    ;(prisma.oAuthRefreshToken.updateMany as any).mockResolvedValue({ count: 1 })
    ;(prisma.oAuthRefreshToken.findUnique as any).mockResolvedValue({
      clientId: 'client-uuid-1',
      userId: 'user-1',
      scope: null,
      client: { clientId: 'abc123' },
    })

    const res = await POST(
      makeRequest({ grant_type: 'refresh_token', refresh_token: 'raw-refresh-1', client_id: 'abc123' })
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.access_token.startsWith('mcp_oat_')).toBe(true)
    expect(body.refresh_token.startsWith('mcp_ort_')).toBe(true)
  })

  it('rejects a replayed (already-rotated) refresh token', async () => {
    ;(prisma.oAuthRefreshToken.updateMany as any).mockResolvedValue({ count: 0 })

    const res = await POST(
      makeRequest({ grant_type: 'refresh_token', refresh_token: 'already-rotated', client_id: 'abc123' })
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('invalid_grant')
  })

  it('rejects a client_id that does not match the original grant', async () => {
    ;(prisma.oAuthRefreshToken.updateMany as any).mockResolvedValue({ count: 1 })
    ;(prisma.oAuthRefreshToken.findUnique as any).mockResolvedValue({
      clientId: 'client-uuid-1',
      userId: 'user-1',
      scope: null,
      client: { clientId: 'abc123' },
    })

    const res = await POST(
      makeRequest({ grant_type: 'refresh_token', refresh_token: 'raw-refresh-1', client_id: 'someone-else' })
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('invalid_grant')
  })
})

describe('POST /api/oauth/token — unsupported grant', () => {
  it('rejects an unrecognized grant_type', async () => {
    const res = await POST(makeRequest({ grant_type: 'client_credentials', client_id: 'abc123' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('unsupported_grant_type')
  })
})
