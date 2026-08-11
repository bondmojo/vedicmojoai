/**
 * POST /api/oauth/authorize-decision — handles the Allow/Deny submit from
 * the /oauth/authorize consent form.
 *
 * Re-validates client_id/redirect_uri itself rather than trusting the
 * POSTed hidden fields as already-validated by the page that rendered them
 * — closes a forged-submission class of bug (a crafted POST straight to
 * this route, bypassing the GET page's own checks).
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import {
  generateAuthorizationCode,
  hashAuthorizationCode,
  isRegisteredRedirectUri,
  getOAuthIssuerUrl,
  AUTHORIZATION_CODE_TTL_MS,
} from '@/lib/oauth'

export const runtime = 'nodejs'

/**
 * 303 See Other — NOT NextResponse.redirect()'s 307 default. This matters and
 * is easy to "simplify" back into a bug.
 *
 * This handler is a POST (the consent form submit). A 307/308 preserves the
 * request method, so the browser would POST to the client's redirect_uri.
 * Real OAuth callbacks only accept GET: claude.ai's
 * /api/mcp/auth_callback answers a POST with `405 Method Not Allowed`, the
 * flow dies at the callback, and the token endpoint is never reached — with
 * no trace on this server, because the failure is entirely client-side.
 *
 * 303 is the one redirect status defined to force the follow-up request to
 * GET, which is exactly what RFC 6749 §4.1.2's "redirect the user-agent"
 * means in practice.
 */
const SEE_OTHER = 303

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    // Rare: session expired in the seconds between the consent page
    // rendering and the form submit. No trusted redirect_uri to bounce to
    // yet at this point (re-validation happens below) — simplest safe
    // response is to send the user back to log in fresh.
    return NextResponse.redirect(new URL('/login', request.url), SEE_OTHER)
  }

  const form = await request.formData()
  const clientId = form.get('client_id')?.toString()
  const redirectUri = form.get('redirect_uri')?.toString()
  const codeChallenge = form.get('code_challenge')?.toString()
  const codeChallengeMethod = form.get('code_challenge_method')?.toString()
  const state = form.get('state')?.toString()
  const scope = form.get('scope')?.toString()
  const resource = form.get('resource')?.toString()
  const decision = form.get('decision')?.toString()

  // ── Re-validation: client_id + redirect_uri only. Any failure -> direct error, never a redirect. ──
  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: 'invalid_request', error_description: 'Missing client_id or redirect_uri.' },
      { status: 400 }
    )
  }

  const client = await prisma.oAuthClient.findUnique({ where: { clientId } })
  if (!client || !isRegisteredRedirectUri(redirectUri, client.redirectUris)) {
    return NextResponse.json(
      { error: 'invalid_request', error_description: 'Unknown client, or redirect_uri is not registered.' },
      { status: 400 }
    )
  }

  // RFC 9207: every authorization response (success or error) carries `iss`
  // so the client can bind the response to the authorization server it
  // actually started the request with — some clients require this and
  // silently abort the flow (never calling the token endpoint) without it.
  const issuer = getOAuthIssuerUrl()

  if (decision !== 'allow') {
    const url = new URL(redirectUri)
    url.searchParams.set('error', 'access_denied')
    if (state) url.searchParams.set('state', state)
    url.searchParams.set('iss', issuer)
    return NextResponse.redirect(url, SEE_OTHER)
  }

  if (!codeChallenge || codeChallengeMethod !== 'S256') {
    const url = new URL(redirectUri)
    url.searchParams.set('error', 'invalid_request')
    if (state) url.searchParams.set('state', state)
    url.searchParams.set('iss', issuer)
    return NextResponse.redirect(url, SEE_OTHER)
  }

  const rawCode = generateAuthorizationCode()
  await prisma.oAuthAuthorizationCode.create({
    data: {
      codeHash: hashAuthorizationCode(rawCode),
      clientId: client.id,
      userId: session.user.id,
      redirectUri,
      codeChallenge,
      codeChallengeMethod,
      resource: resource ?? null,
      scope: scope ?? null,
      expiresAt: new Date(Date.now() + AUTHORIZATION_CODE_TTL_MS),
    },
  })

  const url = new URL(redirectUri)
  url.searchParams.set('code', rawCode)
  if (state) url.searchParams.set('state', state)
  url.searchParams.set('iss', issuer)
  return NextResponse.redirect(url, SEE_OTHER)
}
