/**
 * POST /api/oauth/revoke — RFC 7009 token revocation.
 *
 * Always returns 200 regardless of whether the presented token existed or
 * was already revoked — per spec, a revocation response must never leak
 * whether a given token is/was valid.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { hashOAuthToken, OAUTH_CORS_HEADERS } from '@/lib/oauth'

export const runtime = 'nodejs'

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: OAUTH_CORS_HEADERS })
}

export async function POST(request: NextRequest) {
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return new NextResponse(null, { status: 200, headers: OAUTH_CORS_HEADERS })
  }

  const token = form.get('token')?.toString()
  if (token) {
    const tokenHash = hashOAuthToken(token)
    await Promise.all([
      prisma.oAuthAccessToken.deleteMany({ where: { tokenHash } }),
      prisma.oAuthRefreshToken.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ])
  }

  return new NextResponse(null, { status: 200, headers: OAUTH_CORS_HEADERS })
}
