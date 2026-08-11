/**
 * tests/oauth-authorize.test.ts
 * app/oauth/authorize/page.tsx — the MCP OAuth consent screen.
 *
 * This is a Server Component: an async function returning a React element
 * tree. No DOM/rendering library is set up in this repo's vitest config
 * (environment: 'node'), so these tests call the component function
 * directly and inspect the returned element tree structurally, plus catch
 * next/navigation's redirect() throw (digest: "NEXT_REDIRECT;<type>;<url>;...").
 *
 * Covers the two-phase validation split (RFC 6749 §4.1.2.1): phase 1
 * (client_id/redirect_uri) failures must render a DIRECT error, never a
 * redirect — that's what prevents an open redirect. Phase 2 failures
 * redirect to the now-trusted redirect_uri with ?error=....
 *
 * Mocks: @/lib/auth (auth), @/lib/db (prisma.oAuthClient).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  prisma: {
    oAuthClient: {
      findUnique: vi.fn(),
    },
  },
}))

import AuthorizePage from '../app/oauth/authorize/page'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

// Phase-2 error redirects carry RFC 9207's `iss`, so they read the issuer.
// The consent-render path deliberately does not (see page.tsx).
const TEST_ISSUER = 'https://issuer.example.com'
process.env.OAUTH_ISSUER_URL = TEST_ISSUER

const VALID_CLIENT = {
  clientId: 'abc123',
  clientName: 'Claude',
  redirectUris: ['https://claude.ai/api/mcp/callback'],
}

const VALID_SESSION = { user: { id: 'user-1', email: 'astrologer@example.com' } }

function baseParams(overrides: Record<string, string> = {}) {
  return {
    client_id: 'abc123',
    redirect_uri: 'https://claude.ai/api/mcp/callback',
    response_type: 'code',
    code_challenge: 'a-valid-looking-challenge',
    code_challenge_method: 'S256',
    state: 'xyz',
    ...overrides,
  }
}

/**
 * Recursively collects every string leaf out of a React element tree. No
 * renderer is involved (this repo's vitest config has no DOM environment) —
 * a function-typed element (a custom component like ErrorCard, used
 * `<ErrorCard title="..." message="..." />` with no children) is invoked
 * directly to get its rendered output, standing in for what React's
 * reconciler would otherwise do.
 */
function collectText(node: unknown, out: string[] = []): string[] {
  if (node == null || typeof node === 'boolean') return out
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node))
    return out
  }
  if (Array.isArray(node)) {
    for (const child of node) collectText(child, out)
    return out
  }
  if (typeof node === 'object' && 'type' in (node as any)) {
    const el = node as any
    if (typeof el.type === 'function') {
      collectText(el.type(el.props), out)
      return out
    }
    collectText(el.props?.children, out)
  }
  return out
}

/** Finds an <input> element by its `name` prop and returns its `value`. */
function findInputValue(node: unknown, name: string): unknown {
  if (node == null || typeof node !== 'object') return undefined
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findInputValue(child, name)
      if (found !== undefined) return found
    }
    return undefined
  }
  const el = node as any
  if (el.type === 'input' && el.props?.name === name) return el.props.value
  return findInputValue(el.props?.children, name)
}

async function expectRedirect(promise: Promise<unknown>): Promise<URL> {
  try {
    await promise
    throw new Error('expected redirect() to throw, but the component returned normally')
  } catch (e: any) {
    if (typeof e.digest !== 'string' || !e.digest.startsWith('NEXT_REDIRECT')) throw e
    const url = e.digest.split(';')[2]
    // The /login redirect uses a relative URL; phase-2 redirects use an
    // absolute redirect_uri. A base makes URL() accept either.
    return new URL(url, 'http://localhost')
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Phase 1 — client_id/redirect_uri validation (direct error, never a redirect)', () => {
  it('renders a direct error when client_id is missing', async () => {
    const result = await AuthorizePage({ searchParams: { redirect_uri: 'https://claude.ai/callback' } as any })
    expect(collectText(result).join(' ')).toMatch(/Missing client_id/i)
    expect(prisma.oAuthClient.findUnique).not.toHaveBeenCalled()
  })

  it('renders a direct error for an unknown client_id (never redirects to the caller-supplied redirect_uri)', async () => {
    ;(prisma.oAuthClient.findUnique as any).mockResolvedValue(null)
    const result = await AuthorizePage({ searchParams: baseParams({ client_id: 'no-such-client' }) as any })
    expect(collectText(result).join(' ')).toMatch(/Unknown client/i)
  })

  it('renders a direct error when redirect_uri is not registered for the client (open-redirect guard)', async () => {
    ;(prisma.oAuthClient.findUnique as any).mockResolvedValue(VALID_CLIENT)
    const result = await AuthorizePage({
      searchParams: baseParams({ redirect_uri: 'https://attacker.example/callback' }) as any,
    })
    expect(collectText(result).join(' ')).toMatch(/not registered/i)
  })
})

describe('Session gate', () => {
  it('redirects to /login with the full query string preserved once redirect_uri is confirmed trusted', async () => {
    ;(prisma.oAuthClient.findUnique as any).mockResolvedValue(VALID_CLIENT)
    ;(auth as any).mockResolvedValue(null)

    const params = baseParams()
    const url = await expectRedirect(AuthorizePage({ searchParams: params as any }))

    expect(url.pathname).toBe('/login')
    const callbackUrl = new URL(url.searchParams.get('callbackUrl')!, 'http://localhost')
    expect(callbackUrl.pathname).toBe('/oauth/authorize')
    expect(callbackUrl.searchParams.get('client_id')).toBe('abc123')
    expect(callbackUrl.searchParams.get('code_challenge')).toBe('a-valid-looking-challenge')
  })
})

describe('Phase 2 — everything else (redirect-with-error to the now-trusted redirect_uri)', () => {
  beforeEach(() => {
    ;(prisma.oAuthClient.findUnique as any).mockResolvedValue(VALID_CLIENT)
    ;(auth as any).mockResolvedValue(VALID_SESSION)
  })

  it('redirects with unsupported_response_type when response_type is not "code"', async () => {
    const url = await expectRedirect(AuthorizePage({ searchParams: baseParams({ response_type: 'token' }) as any }))
    expect(url.origin + url.pathname).toBe('https://claude.ai/api/mcp/callback')
    expect(url.searchParams.get('error')).toBe('unsupported_response_type')
    expect(url.searchParams.get('state')).toBe('xyz')
  })

  it('redirects with invalid_request when code_challenge is missing', async () => {
    const params = baseParams()
    delete (params as any).code_challenge
    const url = await expectRedirect(AuthorizePage({ searchParams: params as any }))
    expect(url.searchParams.get('error')).toBe('invalid_request')
  })

  it('redirects with invalid_request when code_challenge_method is "plain" (OAuth 2.1 forbids it for public clients)', async () => {
    const url = await expectRedirect(
      AuthorizePage({ searchParams: baseParams({ code_challenge_method: 'plain' }) as any })
    )
    expect(url.searchParams.get('error')).toBe('invalid_request')
  })
})

describe('Consent screen (all validation passed)', () => {
  it('renders the consent form with the client name and every validated param as a hidden field', async () => {
    ;(prisma.oAuthClient.findUnique as any).mockResolvedValue(VALID_CLIENT)
    ;(auth as any).mockResolvedValue(VALID_SESSION)

    const result = await AuthorizePage({ searchParams: baseParams({ resource: 'https://issuer/api/mcp' }) as any })
    const text = collectText(result).join(' ')

    expect(text).toMatch(/Claude/)
    expect(text).toMatch(/astrologer@example\.com/)
    expect(findInputValue(result, 'client_id')).toBe('abc123')
    expect(findInputValue(result, 'redirect_uri')).toBe('https://claude.ai/api/mcp/callback')
    expect(findInputValue(result, 'code_challenge_method')).toBe('S256')
    expect(findInputValue(result, 'resource')).toBe('https://issuer/api/mcp')
  })
})
