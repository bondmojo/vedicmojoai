/**
 * tests/oauth-register.test.ts
 * RFC 7591 dynamic client registration — app/api/oauth/register/route.ts.
 *
 * Mocks: @/lib/db (prisma.oAuthClient).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/db', () => ({
  prisma: {
    oAuthClient: {
      create: vi.fn(),
    },
  },
}))

import { POST } from '../app/api/oauth/register/route'
import { prisma } from '@/lib/db'

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/oauth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/oauth/register', () => {
  it('registers a public/PKCE-only client and returns a client_id, never a client_secret', async () => {
    ;(prisma.oAuthClient.create as any).mockResolvedValue({
      clientId: 'abc123',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    })

    const res = await POST(
      makeRequest({ redirect_uris: ['https://claude.ai/api/mcp/callback'], client_name: 'Claude' })
    )
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body.client_id).toBe('abc123')
    expect(body.client_secret).toBeUndefined()
    expect(body.token_endpoint_auth_method).toBe('none')
    expect(prisma.oAuthClient.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          redirectUris: ['https://claude.ai/api/mcp/callback'],
          tokenEndpointAuthMethod: 'none',
        }),
      })
    )
  })

  it('rejects a body with no redirect_uris', async () => {
    const res = await POST(makeRequest({ client_name: 'Bad Client' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('invalid_client_metadata')
    expect(prisma.oAuthClient.create).not.toHaveBeenCalled()
  })

  it('rejects a redirect_uri using the javascript: scheme', async () => {
    const res = await POST(makeRequest({ redirect_uris: ['javascript:alert(1)'] }))
    expect(res.status).toBe(400)
    expect(prisma.oAuthClient.create).not.toHaveBeenCalled()
  })

  it('rejects invalid JSON', async () => {
    const req = new NextRequest('http://localhost:3000/api/oauth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not json',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })
})
