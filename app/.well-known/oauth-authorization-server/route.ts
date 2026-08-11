/**
 * GET /.well-known/oauth-authorization-server — RFC 8414 metadata for this
 * app's MCP OAuth server. This is the second step of the discovery chain a
 * remote MCP client (e.g. claude.ai's "Add custom connector") follows after
 * reading the `resource_metadata` URL out of /api/mcp's 401
 * WWW-Authenticate header (see app/.well-known/oauth-protected-resource and
 * app/api/mcp/route.ts).
 */

import { NextResponse } from 'next/server'
import { OAuthMetadataSchema } from '@modelcontextprotocol/sdk/shared/auth.js'
import { getOAuthIssuerUrl, OAUTH_CORS_HEADERS } from '@/lib/oauth'

export const runtime = 'nodejs'

export async function GET() {
  const issuer = getOAuthIssuerUrl()

  const metadata = OAuthMetadataSchema.parse({
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/api/oauth/token`,
    registration_endpoint: `${issuer}/api/oauth/register`,
    revocation_endpoint: `${issuer}/api/oauth/revoke`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
  })

  return NextResponse.json(metadata, { headers: OAUTH_CORS_HEADERS })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: OAUTH_CORS_HEADERS })
}
