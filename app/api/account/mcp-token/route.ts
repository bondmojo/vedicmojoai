/**
 * GET  /api/account/mcp-token — active token's metadata (never the raw value).
 * POST /api/account/mcp-token — generate a new token; revokes any existing
 *                                active token first (v1 = one active token
 *                                per user, Decision 9). Returns the raw token
 *                                exactly once — it is never retrievable again.
 *
 * Session-only (requireSessionUserId, not resolveRequestUser) — an MCP token
 * must never be usable to mint another MCP token.
 */

import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { requireSessionUserId } from '@/lib/auth'
import { hashMcpToken } from '@/lib/mcpAuth'
import { prisma } from '@/lib/db'

const UNAUTHORIZED = { error: 'Unauthorized', message: 'Sign in required.' }

export async function GET() {
  const userId = await requireSessionUserId()
  if (!userId) return NextResponse.json(UNAUTHORIZED, { status: 401 })

  const token = await prisma.mcpApiToken.findFirst({
    where: { userId, revokedAt: null },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({
    token: token
      ? { label: token.label, createdAt: token.createdAt, lastUsedAt: token.lastUsedAt }
      : null,
  })
}

export async function POST(request: NextRequest) {
  const userId = await requireSessionUserId()
  if (!userId) return NextResponse.json(UNAUTHORIZED, { status: 401 })

  let label: string | null = null
  try {
    const body = await request.json()
    if (body && typeof body.label === 'string' && body.label.trim()) {
      label = body.label.trim().slice(0, 100)
    }
  } catch {
    // No body / not JSON — label stays null.
  }

  const rawToken = randomBytes(32).toString('hex')
  const tokenHash = hashMcpToken(rawToken)

  await prisma.$transaction([
    prisma.mcpApiToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
    prisma.mcpApiToken.create({ data: { userId, tokenHash, label } }),
  ])

  return NextResponse.json({ token: rawToken }, { status: 201 })
}
