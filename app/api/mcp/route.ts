/**
 * POST /api/mcp — Streamable HTTP transport for the VedicMojo MCP server.
 *
 * Exposes the same read-only tool/resource/prompt surface as the stdio server
 * (mcp/src/*, spawned locally by Claude Desktop) to remote MCP clients, hosted
 * as part of this same Next.js/Vercel deployment — no separate process, no
 * TLS/port management, Vercel terminates HTTPS for us.
 *
 * Stateless: a fresh McpServer + transport is built per request (this server
 * has no per-session state to lose), matching Vercel's own per-invocation
 * model. Every mcp/src/* tool call is a self-referential HTTP call back into
 * this deployment's own /api/* routes — same calling convention already used
 * (and audited by tests/mcp-cost-guard.test.ts) by the stdio server.
 *
 * Base URL for those self-calls: `VEDICMOJO_INTERNAL_BASE_URL` if set,
 * otherwise the request's own origin. Do NOT collapse this to just the
 * origin — `request.url` is reconstructed from proxy headers, so behind
 * Vercel (which always sets `x-forwarded-host`) the origin is the PUBLIC
 * hostname, and every self-call would leave and re-enter the deployment over
 * the internet. That is slower, doubles invocations, and fails outright when
 * Deployment Protection is on (the default for preview deployments), which
 * answers the self-call with a 401 login page instead of the API response.
 * Where protection is genuinely wanted, set VERCEL_AUTOMATION_BYPASS_SECRET
 * and the bypass header below carries it through.
 *
 * Auth: this route does NOT itself authenticate — it only extracts whichever
 * token the caller sent (Authorization: Bearer, falling back to x-mcp-token
 * for parity with the stdio server's header) and forwards it downstream.
 * Every actual ownership/auth check happens per-call at the target routes via
 * lib/mcpAuth.ts's resolveMcpUser, exactly as it does today for the stdio
 * server. A request with no token at all is rejected here early with a clean
 * 401 rather than letting every tool call fail individually downstream.
 */

import { NextRequest, NextResponse } from 'next/server'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { createApiClient } from '@/mcp/src/http'
import { createMcpServer } from '@/mcp/src/registerAll'
import { getOAuthIssuerUrl } from '@/lib/oauth'

export const runtime = 'nodejs'

function extractToken(request: NextRequest): string | undefined {
  const auth = request.headers.get('authorization')
  if (auth?.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim() || undefined
  return request.headers.get('x-mcp-token')?.trim() || undefined
}

export async function POST(request: NextRequest): Promise<Response> {
  const token = extractToken(request)
  if (!token) {
    // WWW-Authenticate's resource_metadata is the discovery breadcrumb an
    // OAuth-aware MCP client (e.g. claude.ai's "Add custom connector") reads
    // off this exact 401 to learn that OAuth is available at all, before it
    // ever tries the manual-token path. Only added when OAUTH_ISSUER_URL is
    // actually configured — omitting it here (rather than throwing) keeps
    // the manual-token-only path fully functional on deployments that
    // haven't set up the OAuth server yet.
    let wwwAuthenticate = 'Bearer'
    try {
      const issuer = getOAuthIssuerUrl()
      wwwAuthenticate = `Bearer resource_metadata="${issuer}/.well-known/oauth-protected-resource/api/mcp"`
    } catch {
      /* OAUTH_ISSUER_URL unset — fall back to a bare Bearer challenge */
    }

    return NextResponse.json(
      {
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Missing Authorization: Bearer <token> (or x-mcp-token) header.' },
        id: null,
      },
      { status: 401, headers: { 'WWW-Authenticate': wwwAuthenticate } }
    )
  }

  const baseUrl = process.env.VEDICMOJO_INTERNAL_BASE_URL?.trim() || new URL(request.url).origin
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim()
  const api = createApiClient(
    token,
    baseUrl,
    bypass ? { 'x-vercel-protection-bypass': bypass } : undefined
  )
  const server = createMcpServer(api)

  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined })
  await server.connect(transport)
  return transport.handleRequest(request)
}

/** Stateless mode: no session to resume (GET) or terminate (DELETE). */
function methodNotAllowed(): Response {
  return NextResponse.json(
    { jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed in stateless mode.' }, id: null },
    { status: 405 }
  )
}

export const GET = methodNotAllowed
export const DELETE = methodNotAllowed
