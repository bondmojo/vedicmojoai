/**
 * tests/oauth-authorize-decision.test.ts
 * app/api/oauth/authorize-decision/route.ts — the Allow/Deny form submit.
 *
 * The headline case here is the REDIRECT STATUS. This route is a POST (the
 * consent form submit) that redirects to the client's redirect_uri.
 * NextResponse.redirect() defaults to 307, which *preserves the method* — so
 * the browser re-issues the request to the callback as a POST. Real OAuth
 * callbacks are GET-only: claude.ai's /api/mcp/auth_callback answers a POST
 * with `405 Method Not Allowed`, which killed the whole connector flow at the
 * very last step, with zero trace server-side (the failure is entirely in the
 * client's browser). 303 See Other is the one status defined to force the
 * follow-up to GET.
 *
 * That regression is invisible to any test that only asserts on the Location
 * header, which is exactly why these assert on `status` explicitly.
 *
 * Also covers the re-validation that makes this route safe to POST to
 * directly (it must never trust the hidden form fields as pre-validated by
 * the page that rendered them) and RFC 9207's `iss` on every response.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/db', () => ({
  prisma: {
    oAuthClient: { findUnique: vi.fn() },
    oAuthAuthorizationCode: { create: vi.fn() },
  },
}))

import { POST } from '../app/api/oauth/authorize-decision/route'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

const TEST_ISSUER = 'https://issuer.example.com'
process.env.OAUTH_ISSUER_URL = TEST_ISSUER

const REDIRECT_URI = 'https://claude.ai/api/mcp/auth_callback'

const VALID_CLIENT = {
  id: 'client-row-1',
  clientId: 'abc123',
  clientName: 'Claude',
  redirectUris: [REDIRECT_URI],
}

const VALID_SESSION = { user: { id: 'user-1', email: 'astrologer@example.com' } }

function makeRequest(fields: Record<string, string>) {
  const form = new URLSearchParams(fields)
  return new Request('https://issuer.example.com/api/oauth/authorize-decision', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  }) as never
}

function validFields(overrides: Record<string, string> = {}) {
  return {
    client_id: 'abc123',
    redirect_uri: REDIRECT_URI,
    code_challenge: 'a-valid-looking-challenge',
    code_challenge_method: 'S256',
    state: 'xyz',
    decision: 'allow',
    ...overrides,
  }
}

beforeEach(() => {
  vi.mocked(auth).mockReset()
  vi.mocked(prisma.oAuthClient.findUnique).mockReset()
  vi.mocked(prisma.oAuthAuthorizationCode.create).mockReset()

  vi.mocked(auth).mockResolvedValue(VALID_SESSION as never)
  vi.mocked(prisma.oAuthClient.findUnique).mockResolvedValue(VALID_CLIENT as never)
  vi.mocked(prisma.oAuthAuthorizationCode.create).mockResolvedValue({} as never)
})

describe('redirect status (the claude.ai 405 regression)', () => {
  it('issues 303 (not 307) on Allow, so the callback is fetched as a GET', async () => {
    const res = await POST(makeRequest(validFields()))

    expect(res.status).toBe(303)
    // 307/308 would preserve the POST method and get a 405 from the callback.
    expect(res.status).not.toBe(307)
  })

  it('issues 303 on Deny', async () => {
    const res = await POST(makeRequest(validFields({ decision: 'deny' })))

    expect(res.status).toBe(303)
    const url = new URL(res.headers.get('location')!)
    expect(url.searchParams.get('error')).toBe('access_denied')
  })

  it('issues 303 on a phase-2 validation failure', async () => {
    const res = await POST(makeRequest(validFields({ code_challenge_method: 'plain' })))

    expect(res.status).toBe(303)
    const url = new URL(res.headers.get('location')!)
    expect(url.searchParams.get('error')).toBe('invalid_request')
  })
})

describe('successful authorization response', () => {
  it('redirects to the registered redirect_uri with code, state, and iss', async () => {
    const res = await POST(makeRequest(validFields()))
    const url = new URL(res.headers.get('location')!)

    expect(url.origin + url.pathname).toBe(REDIRECT_URI)
    expect(url.searchParams.get('code')).toMatch(/^[0-9a-f]{64}$/)
    expect(url.searchParams.get('state')).toBe('xyz')
    expect(url.searchParams.get('iss')).toBe(TEST_ISSUER)
  })

  it('persists the code bound to the session user and the validated params', async () => {
    await POST(makeRequest(validFields()))

    const { data } = vi.mocked(prisma.oAuthAuthorizationCode.create).mock.calls[0][0] as never as {
      data: Record<string, unknown>
    }
    expect(data.userId).toBe('user-1')
    expect(data.clientId).toBe('client-row-1')
    expect(data.redirectUri).toBe(REDIRECT_URI)
    expect(data.codeChallenge).toBe('a-valid-looking-challenge')
    // Hashed at rest — the raw code must never be what's stored.
    expect(data.codeHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('carries iss on the deny response too', async () => {
    const res = await POST(makeRequest(validFields({ decision: 'deny' })))
    const url = new URL(res.headers.get('location')!)
    expect(url.searchParams.get('iss')).toBe(TEST_ISSUER)
  })
})

describe('re-validation (never trusts the POSTed hidden fields)', () => {
  it('rejects an unknown client_id with a direct error, not a redirect', async () => {
    vi.mocked(prisma.oAuthClient.findUnique).mockResolvedValue(null as never)

    const res = await POST(makeRequest(validFields()))

    expect(res.status).toBe(400)
    expect(res.headers.get('location')).toBeNull()
    expect(await res.json()).toMatchObject({ error: 'invalid_request' })
  })

  it('rejects a redirect_uri not registered to the client — the open-redirect guard', async () => {
    const res = await POST(makeRequest(validFields({ redirect_uri: 'https://evil.example.com/steal' })))

    expect(res.status).toBe(400)
    expect(res.headers.get('location')).toBeNull()
    expect(prisma.oAuthAuthorizationCode.create).not.toHaveBeenCalled()
  })

  it('rejects a near-miss redirect_uri (exact match only, no trailing-slash slack)', async () => {
    const res = await POST(makeRequest(validFields({ redirect_uri: REDIRECT_URI + '/' })))

    expect(res.status).toBe(400)
    expect(prisma.oAuthAuthorizationCode.create).not.toHaveBeenCalled()
  })

  it('sends an unauthenticated caller to login without minting a code', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)

    const res = await POST(makeRequest(validFields()))

    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toContain('/login')
    expect(prisma.oAuthAuthorizationCode.create).not.toHaveBeenCalled()
  })
})
