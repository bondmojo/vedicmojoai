/**
 * GET /.well-known/oauth-protected-resource(/api/mcp)? — RFC 9728 protected
 * resource metadata. The path-suffixed variant
 * (/.well-known/oauth-protected-resource/api/mcp) is what /api/mcp's 401
 * WWW-Authenticate header points at — it's the FIRST thing an OAuth-aware
 * MCP client fetches, so getting this route wrong is the single most likely
 * way "Add custom connector" silently fails to even attempt the OAuth
 * handshake. The bare path is also served (RFC 9728 §3.1's default
 * location) via this same optional-catch-all so a client probing without a
 * path suffix doesn't 404.
 */

import { NextResponse } from 'next/server'
import { OAuthProtectedResourceMetadataSchema } from '@modelcontextprotocol/sdk/shared/auth.js'
import { getOAuthIssuerUrl, OAUTH_CORS_HEADERS } from '@/lib/oauth'

export const runtime = 'nodejs'

export async function GET(_request: Request, { params }: { params: { resourcePath?: string[] } }) {
  const issuer = getOAuthIssuerUrl()
  const resourcePath = params.resourcePath?.length ? `/${params.resourcePath.join('/')}` : ''

  const metadata = OAuthProtectedResourceMetadataSchema.parse({
    resource: `${issuer}${resourcePath}`,
    authorization_servers: [issuer],
    scopes_supported: ['mcp'],
    resource_name: 'VedicMojoAI MCP server',
  })

  return NextResponse.json(metadata, { headers: OAUTH_CORS_HEADERS })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: OAUTH_CORS_HEADERS })
}
