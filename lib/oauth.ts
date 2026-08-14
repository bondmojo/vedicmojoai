/**
 * lib/oauth.ts — Shared helpers for the MCP OAuth 2.1 authorization server
 * (app/.well-known/**, app/oauth/authorize, app/api/oauth/*).
 *
 * Sibling to lib/mcpAuth.ts: that module resolves an incoming token to a
 * userId; this module is the plumbing that issues/verifies the tokens (and
 * authorization codes) it resolves. Hashing follows the exact pattern
 * already used for McpApiToken/PasswordResetToken (lib/passwords.ts) —
 * sha256 at rest, raw value only ever seen once by the caller.
 */

import { randomBytes, createHash, timingSafeEqual } from 'crypto'

/** Prefix on every OAuth-issued access token — lets lib/mcpAuth.ts branch to
 *  the right table (OAuthAccessToken vs McpApiToken) without two blind hash
 *  lookups per call. Manually-generated McpApiToken values never carry this
 *  prefix (they're plain hex), so there's no collision risk. */
export const OAUTH_ACCESS_TOKEN_PREFIX = 'mcp_oat_'
export const OAUTH_REFRESH_TOKEN_PREFIX = 'mcp_ort_'

export function generateOAuthToken(prefix: string): string {
  return `${prefix}${randomBytes(32).toString('hex')}`
}

export function hashOAuthToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex')
}

/** Raw authorization code — hashed at rest in OAuthAuthorizationCode.codeHash,
 *  same defense-in-depth rationale as McpApiToken despite the short TTL. */
export function generateAuthorizationCode(): string {
  return randomBytes(32).toString('hex')
}

export function hashAuthorizationCode(rawCode: string): string {
  return createHash('sha256').update(rawCode).digest('hex')
}

export function generateClientId(): string {
  return randomBytes(16).toString('hex')
}

/**
 * PKCE (RFC 7636) S256 verification: base64url(sha256(code_verifier)) must
 * equal the code_challenge stored at /authorize time. OAuth 2.1 does not
 * permit the 'plain' method for public clients — callers must reject any
 * code_challenge_method other than 'S256' before ever calling this.
 */
export function verifyPkce(codeVerifier: string, codeChallenge: string): boolean {
  const computed = createHash('sha256').update(codeVerifier).digest('base64url')
  const a = Buffer.from(computed)
  const b = Buffer.from(codeChallenge)
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * Exact-match only — never prefix/substring. This is what prevents an
 * open redirect: a client_id's registered redirect_uris are the sole
 * trusted set of destinations this server will ever redirect a browser to.
 */
export function isRegisteredRedirectUri(redirectUri: string, registeredUris: string[]): boolean {
  return registeredUris.includes(redirectUri)
}

/**
 * Stable, externally-facing issuer URL for this OAuth server. Deliberately
 * fails loudly (unlike lib/email.ts's silent APP_BASE_URL fallback chain) —
 * an OAuth issuer identity that silently drifted per-request would break
 * client/token binding and the whole discovery chain in ways that are hard
 * to notice until a real client fails partway through.
 */
export function getOAuthIssuerUrl(): string {
  const issuer = process.env.OAUTH_ISSUER_URL?.trim()
  if (!issuer) {
    throw new Error(
      'OAUTH_ISSUER_URL is not set. The MCP OAuth server needs a stable, externally-facing issuer URL — see .env.example.'
    )
  }
  return issuer.replace(/\/$/, '')
}

export const AUTHORIZATION_CODE_TTL_MS = 5 * 60 * 1000
/**
 * Access-token lifetime — 10 years, i.e. "effectively never expires" for the
 * MCP clients that hold these tokens (no periodic re-auth in practice).
 */
export const ACCESS_TOKEN_TTL_MS = 10 * 365.25 * 24 * 60 * 60 * 1000
export const REFRESH_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000

/**
 * Discovery/registration/token/revocation are called by MCP clients running
 * in a browser context (not just server-to-server), matching the SDK's own
 * reference implementation, which wraps every one of these in permissive
 * CORS. `/oauth/authorize` (full-page navigation) and
 * `/api/oauth/authorize-decision` (same-origin form POST) deliberately don't
 * use this — they're never fetched cross-origin.
 */
export const OAUTH_CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}
