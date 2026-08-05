/**
 * POST /api/oauth/token — RFC 6749 §5 token endpoint (authorization_code +
 * refresh_token grants only — this server never issues client_credentials
 * or password grants).
 *
 * Body is application/x-www-form-urlencoded (the OAuth-standard content
 * type), a deliberate deviation from every other route in this app, which
 * are all JSON (app/api/auth/{login,signup,reset-password}/route.ts) — do
 * not "fix" this back to JSON.
 *
 * Both grants consume a single-use secret (an authorization code, or the
 * previous refresh token being rotated out). Both use an ATOMIC conditional
 * `updateMany` claim rather than read-then-write — a plain findUnique()
 * followed by a separate update() is a TOCTOU race that would let two
 * concurrent requests both succeed with the same code/token (this exact
 * read-then-write pattern exists today in
 * app/api/auth/reset-password/route.ts; harmless there, since a password
 * reset "succeeding twice" has no security consequence, but exactly the
 * replay RFC 6749 §4.1.2 exists to prevent for an authorization code).
 */

import { NextRequest, NextResponse } from 'next/server'
import { OAuthErrorResponseSchema, OAuthTokensSchema } from '@modelcontextprotocol/sdk/shared/auth.js'
import { prisma } from '@/lib/db'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'
import {
  generateOAuthToken,
  hashOAuthToken,
  hashAuthorizationCode,
  verifyPkce,
  OAUTH_ACCESS_TOKEN_PREFIX,
  OAUTH_REFRESH_TOKEN_PREFIX,
  ACCESS_TOKEN_TTL_MS,
  REFRESH_TOKEN_TTL_MS,
  OAUTH_CORS_HEADERS,
} from '@/lib/oauth'

export const runtime = 'nodejs'

function tokenError(error: string, description: string, status = 400) {
  const body = OAuthErrorResponseSchema.parse({ error, error_description: description })
  return NextResponse.json(body, { status, headers: { ...OAUTH_CORS_HEADERS, 'Cache-Control': 'no-store' } })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: OAUTH_CORS_HEADERS })
}

export async function POST(request: NextRequest) {
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return tokenError('invalid_request', 'Expected application/x-www-form-urlencoded body.')
  }

  const grantType = form.get('grant_type')?.toString()
  const clientId = form.get('client_id')?.toString()

  if (!clientId) return tokenError('invalid_client', 'Missing client_id.')

  if (grantType === 'authorization_code') {
    const code = form.get('code')?.toString()
    const codeVerifier = form.get('code_verifier')?.toString()
    const redirectUri = form.get('redirect_uri')?.toString()
    const resource = form.get('resource')?.toString()

    if (!code || !codeVerifier || !redirectUri) {
      return tokenError('invalid_request', 'Missing code, code_verifier, or redirect_uri.')
    }

    // Rate-limit keyed on the code itself (not just IP) — same lesson
    // already documented in reset-password/route.ts: getClientIp() falls
    // back to the literal 'unknown', so IP-only keying would put every
    // caller behind a non-proxied deployment into one shared bucket.
    if (!checkRateLimit(`oauth-token:${getClientIp(request)}:${code}`)) {
      return tokenError('invalid_request', 'Too many attempts. Try again later.', 429)
    }

    const codeHash = hashAuthorizationCode(code)

    // Atomic claim: this UPDATE only matches (and only returns count: 1) if
    // the code was unused and unexpired at the instant it ran — a
    // concurrent second request claiming the same code gets count: 0.
    const claim = await prisma.oAuthAuthorizationCode.updateMany({
      where: { codeHash, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    })
    if (claim.count !== 1) {
      return tokenError('invalid_grant', 'The authorization code is invalid, expired, or already used.')
    }

    const authCode = await prisma.oAuthAuthorizationCode.findUnique({
      where: { codeHash },
      include: { client: true },
    })
    if (!authCode) return tokenError('invalid_grant', 'The authorization code could not be found.')

    if (authCode.client.clientId !== clientId || authCode.redirectUri !== redirectUri) {
      return tokenError('invalid_grant', 'client_id or redirect_uri does not match the authorization request.')
    }
    if (!verifyPkce(codeVerifier, authCode.codeChallenge)) {
      return tokenError('invalid_grant', 'code_verifier does not match the original code_challenge.')
    }
    // RFC 8707 — this server only ever protects one resource (/api/mcp), so
    // the blast radius of skipping this is low, but it's cheap to bind
    // correctly when a client does send it on both legs.
    if (authCode.resource && resource && authCode.resource !== resource) {
      return tokenError('invalid_target', 'resource does not match the authorization request.')
    }

    return await issueTokenPair(authCode.clientId, authCode.userId, authCode.scope, authCode.resource)
  }

  if (grantType === 'refresh_token') {
    const refreshToken = form.get('refresh_token')?.toString()
    if (!refreshToken) return tokenError('invalid_request', 'Missing refresh_token.')

    if (!checkRateLimit(`oauth-token:${getClientIp(request)}:${refreshToken}`)) {
      return tokenError('invalid_request', 'Too many attempts. Try again later.', 429)
    }

    const tokenHash = hashOAuthToken(refreshToken)

    // Same atomic-claim pattern as the authorization_code grant above —
    // rotation must invalidate the presented refresh token exactly once,
    // never leaving a window where two concurrent requests both rotate it.
    const claim = await prisma.oAuthRefreshToken.updateMany({
      where: { tokenHash, revokedAt: null, expiresAt: { gt: new Date() } },
      data: { revokedAt: new Date() },
    })
    if (claim.count !== 1) {
      // v1 known simplification: a replayed (already-rotated) refresh token
      // is rejected on this one request but doesn't cascade-revoke the rest
      // of its lineage (no token-family tracking) — see schema comment.
      return tokenError('invalid_grant', 'The refresh token is invalid, expired, or already used.')
    }

    const existing = await prisma.oAuthRefreshToken.findUnique({ where: { tokenHash }, include: { client: true } })
    if (!existing) return tokenError('invalid_grant', 'The refresh token could not be found.')
    if (existing.client.clientId !== clientId) {
      return tokenError('invalid_grant', 'client_id does not match the original grant.')
    }

    // `resource: null` — OAuthRefreshToken has no `resource` column, so the
    // RFC 8707 audience binding on the original grant is NOT carried across a
    // refresh. Latent today (nothing reads OAuthAccessToken.resource; this
    // server protects exactly one resource, /api/mcp), but it means a
    // refreshed token is not a faithful renewal of the original. Fix by adding
    // `resource` to OAuthRefreshToken before anything starts enforcing it.
    return await issueTokenPair(existing.clientId, existing.userId, existing.scope, null)
  }

  return tokenError('unsupported_grant_type', `grant_type '${grantType}' is not supported.`)
}

async function issueTokenPair(clientId: string, userId: string, scope: string | null, resource: string | null) {
  const rawAccessToken = generateOAuthToken(OAUTH_ACCESS_TOKEN_PREFIX)
  const rawRefreshToken = generateOAuthToken(OAUTH_REFRESH_TOKEN_PREFIX)

  await prisma.$transaction([
    prisma.oAuthAccessToken.create({
      data: {
        tokenHash: hashOAuthToken(rawAccessToken),
        clientId,
        userId,
        resource,
        scope,
        expiresAt: new Date(Date.now() + ACCESS_TOKEN_TTL_MS),
      },
    }),
    prisma.oAuthRefreshToken.create({
      data: {
        tokenHash: hashOAuthToken(rawRefreshToken),
        clientId,
        userId,
        scope,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    }),
  ])

  const body = OAuthTokensSchema.parse({
    access_token: rawAccessToken,
    token_type: 'Bearer',
    expires_in: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
    refresh_token: rawRefreshToken,
    scope: scope ?? undefined,
  })

  return NextResponse.json(body, { headers: { ...OAUTH_CORS_HEADERS, 'Cache-Control': 'no-store' } })
}
