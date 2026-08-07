/**
 * POST /api/matchmaking/preview — Compute an Ashtakoota + Mangal Dosha match
 * for two owned charts WITHOUT persisting it. Byte-for-byte the same
 * resolve/validate/build/compute pipeline as POST /api/matchmaking (factored
 * into ./_shared so the two routes cannot drift) minus the DB write.
 *
 * This is the ONLY matchmaking route the MCP tool may ever call — see
 * tests/mcp-cost-guard.test.ts and .kiro/specs/marriage-matchmaking/tasks.md
 * task 8.2 / 8.6. The persisting POST /api/matchmaking is deliberately NOT
 * allow-listed there.
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestUser } from '@/lib/auth'
import { MatchRequestSchema, resolveChartsForMatch, computeMatchResult } from '../_shared'

export async function POST(request: NextRequest) {
  try {
    const userId = await resolveRequestUser(request)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized', message: 'Sign in required.' }, { status: 401 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const parsed = MatchRequestSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { brideChartId, groomChartId } = parsed.data

    // 404 (never 403) whether a chart doesn't exist OR belongs to a
    // different user — same response body for both cases, no distinguishing.
    const charts = await resolveChartsForMatch(userId, brideChartId, groomChartId)
    if (!charts) {
      return NextResponse.json({ error: 'Chart not found' }, { status: 404 })
    }

    const result = computeMatchResult(charts.bride, charts.groom)

    return NextResponse.json({ result, tablesVersion: result.tablesVersion })
  } catch (error) {
    console.error('Preview compatibility match error:', error)
    return NextResponse.json(
      { error: 'Failed to preview match', message: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
