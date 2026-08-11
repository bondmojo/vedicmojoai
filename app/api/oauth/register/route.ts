/**
 * POST /api/oauth/register — RFC 7591 dynamic client registration.
 *
 * Every dynamically-registered client (claude.ai's connector, or any other
 * MCP client) is treated as a PUBLIC, PKCE-only client in v1: no
 * client_secret is issued, token_endpoint_auth_method is always 'none'.
 * That matches how claude.ai itself registers and keeps this server from
 * having to manage confidential-client secret storage/rotation.
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  OAuthClientMetadataSchema,
  OAuthClientInformationFullSchema,
} from '@modelcontextprotocol/sdk/shared/auth.js'
import { prisma } from '@/lib/db'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'
import { generateClientId, OAUTH_CORS_HEADERS } from '@/lib/oauth'

export const runtime = 'nodejs'

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: OAUTH_CORS_HEADERS })
}

export async function POST(request: NextRequest) {
  // Same shared-bucket lesson as signup/route.ts: only rate-limit on IP when
  // a real one is known (getClientIp() falls back to the literal 'unknown').
  const ip = getClientIp(request)
  if (ip !== 'unknown' && !checkRateLimit(`oauth-register:${ip}`)) {
    return NextResponse.json(
      { error: 'invalid_request', error_description: 'Too many registration attempts. Try again later.' },
      { status: 429, headers: OAUTH_CORS_HEADERS }
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'invalid_client_metadata', error_description: 'Invalid JSON body' },
      { status: 400, headers: OAUTH_CORS_HEADERS }
    )
  }

  const parsed = OAuthClientMetadataSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_client_metadata', error_description: parsed.error.message },
      { status: 400, headers: OAUTH_CORS_HEADERS }
    )
  }

  const metadata = parsed.data
  const clientId = generateClientId()

  const client = await prisma.oAuthClient.create({
    data: {
      clientId,
      clientName: metadata.client_name ?? null,
      redirectUris: metadata.redirect_uris,
      grantTypes: metadata.grant_types ?? ['authorization_code', 'refresh_token'],
      responseTypes: metadata.response_types ?? ['code'],
      tokenEndpointAuthMethod: 'none',
    },
  })

  const response = OAuthClientInformationFullSchema.parse({
    ...metadata,
    client_id: client.clientId,
    client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
    token_endpoint_auth_method: 'none',
  })

  return NextResponse.json(response, { status: 201, headers: OAUTH_CORS_HEADERS })
}
