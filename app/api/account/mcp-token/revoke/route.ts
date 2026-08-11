/**
 * POST /api/account/mcp-token/revoke — revoke the caller's active MCP token.
 * Session-only, same rationale as app/api/account/mcp-token/route.ts.
 */

import { NextResponse } from 'next/server'
import { requireSessionUserId } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function POST() {
  const userId = await requireSessionUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized', message: 'Sign in required.' }, { status: 401 })
  }

  await prisma.mcpApiToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  })

  return NextResponse.json({ message: 'MCP token revoked.' })
}
