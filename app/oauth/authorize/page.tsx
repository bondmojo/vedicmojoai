/**
 * /oauth/authorize — MCP OAuth 2.1 consent screen.
 *
 * Server Component (deliberately breaking from this app's login/signup
 * client-component convention): the redirect-safety validation below must
 * run, and the session must be checked, BEFORE anything is rendered — a
 * client-component-that-fetches-its-own-data pattern would mean standing up
 * a public API endpoint that lets an unauthenticated caller probe arbitrary
 * client_id/redirect_uri combinations pre-login.
 *
 * Two-phase validation (RFC 6749 §4.1.2.1):
 *   Phase 1 (client_id + redirect_uri only) — any failure renders a DIRECT
 *   error page, never a redirect. This is what prevents an open redirect: we
 *   must not redirect to a redirect_uri we haven't yet confirmed is
 *   registered to this client_id.
 *   Phase 2 (response_type, code_challenge, code_challenge_method, ...) —
 *   only reached once phase 1 passed. Failures here redirect to the
 *   now-trusted redirect_uri with ?error=...&state=....
 *
 * The consent form is a plain <form method="POST"> targeting
 * /api/oauth/authorize-decision — zero client JS required, which matters for
 * a security-critical redirect flow. That route RE-VALIDATES
 * client_id/redirect_uri itself rather than trusting these hidden fields as
 * pre-validated by this page.
 *
 * CSP frame-ancestors for this route is set in next.config.mjs's headers()
 * (Server Components can't set response headers directly).
 */

import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { getOAuthIssuerUrl } from '@/lib/oauth'

type SearchParams = { [key: string]: string | string[] | undefined }

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function ErrorCard({ title, message }: { title: string; message: string }) {
  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <div className="rounded-lg border border-red-800 bg-red-900/30 p-6 space-y-2">
          <h1 className="text-lg font-semibold text-red-300">{title}</h1>
          <p className="text-sm text-red-300">{message}</p>
        </div>
      </div>
    </main>
  )
}

export default async function AuthorizePage({ searchParams }: { searchParams: SearchParams }) {
  const clientId = first(searchParams.client_id)
  const redirectUri = first(searchParams.redirect_uri)

  // ── Phase 1: client_id + redirect_uri only. Any failure -> direct error, never a redirect. ──
  if (!clientId || !redirectUri) {
    return <ErrorCard title="Invalid authorization request" message="Missing client_id or redirect_uri." />
  }

  const client = await prisma.oAuthClient.findUnique({ where: { clientId } })
  if (!client || !client.redirectUris.includes(redirectUri)) {
    return (
      <ErrorCard
        title="Invalid authorization request"
        message="Unknown client, or redirect_uri is not registered for this client."
      />
    )
  }

  // Session check happens AFTER redirect_uri is confirmed trusted, so the
  // login round-trip below can safely carry the full query string.
  const session = await auth()
  if (!session?.user?.id) {
    const qs = new URLSearchParams()
    for (const [key, value] of Object.entries(searchParams)) {
      const v = first(value)
      if (v !== undefined) qs.set(key, v)
    }
    redirect(`/login?callbackUrl=${encodeURIComponent(`/oauth/authorize?${qs.toString()}`)}`)
  }

  // ── Phase 2: everything else. Failures redirect to the now-trusted redirect_uri. ──
  const state = first(searchParams.state)
  const responseType = first(searchParams.response_type)
  const codeChallenge = first(searchParams.code_challenge)
  const codeChallengeMethod = first(searchParams.code_challenge_method)
  const scope = first(searchParams.scope)
  const resource = first(searchParams.resource)

  const redirectWithError = (error: string): never => {
    const url = new URL(redirectUri)
    url.searchParams.set('error', error)
    if (state) url.searchParams.set('state', state)
    // RFC 9207: `iss` rides on EVERY authorization response, errors included —
    // same as the success/deny paths in /api/oauth/authorize-decision. A
    // client that validates `iss` must be able to bind an error response to
    // this server too, not just a successful one. Read lazily (rather than
    // once at the top of the render) so the consent screen itself doesn't
    // acquire a hard dependency on OAUTH_ISSUER_URL it never needed.
    url.searchParams.set('iss', getOAuthIssuerUrl())
    redirect(url.toString())
  }

  if (responseType !== 'code') redirectWithError('unsupported_response_type')
  if (!codeChallenge) redirectWithError('invalid_request')
  // OAuth 2.1 does not permit 'plain' for public clients — reject anything but S256 outright.
  if (codeChallengeMethod !== 'S256') redirectWithError('invalid_request')

  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold mb-6 text-center">Authorize access</h1>
        <form
          method="POST"
          action="/api/oauth/authorize-decision"
          className="rounded-lg border border-gray-700 bg-gray-800/50 p-6 space-y-4"
        >
          <p className="text-sm text-gray-300">
            <span className="font-medium text-gray-100">{client.clientName || client.clientId}</span> wants to
            access your VedicMojoAI account (charts, reports, and analysis data) as{' '}
            <span className="font-medium text-gray-100">{session.user.email}</span>.
          </p>

          <input type="hidden" name="client_id" value={clientId} />
          <input type="hidden" name="redirect_uri" value={redirectUri} />
          <input type="hidden" name="code_challenge" value={codeChallenge} />
          <input type="hidden" name="code_challenge_method" value={codeChallengeMethod} />
          {state && <input type="hidden" name="state" value={state} />}
          {scope && <input type="hidden" name="scope" value={scope} />}
          {resource && <input type="hidden" name="resource" value={resource} />}

          <div className="flex gap-3">
            <button
              type="submit"
              name="decision"
              value="deny"
              className="flex-1 rounded-lg border border-red-800 text-red-300 hover:bg-red-900/30 px-3 py-2 text-sm font-medium"
            >
              Deny
            </button>
            <button
              type="submit"
              name="decision"
              value="allow"
              className="flex-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 px-3 py-2 text-sm font-medium text-white"
            >
              Allow
            </button>
          </div>
        </form>
      </div>
    </main>
  )
}
