/**
 * GET    /api/matchmaking/[id] — Load a single saved match. Returns the
 *   PERSISTED `result` JSON verbatim — NEVER recomputed (OD-5: the stored
 *   snapshot is the record of what the practitioner saw).
 * DELETE /api/matchmaking/[id] — Delete a saved match. `CompatibilityMatch`
 *   has no dependents, so a plain delete is enough (no cascade needed).
 *
 * Task 8.4 / 8.5 of .kiro/specs/marriage-matchmaking/tasks.md.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { resolveRequestUser } from '@/lib/auth'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await resolveRequestUser(request)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized', message: 'Sign in required.' }, { status: 401 })
    }

    // Relations are selected defensively — if a referenced chart row is ever
    // gone (should not happen: the unified-charts DELETE route hand-cascades
    // compatibilityMatch.deleteMany before deleting the chart), this must
    // still render the persisted `result` without throwing, so the chart
    // names are null-guarded below rather than assumed present.
    const match = await prisma.compatibilityMatch.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        userId: true,
        label: true,
        result: true,
        tablesVersion: true,
        createdAt: true,
        brideChart: { select: { name: true, source: true } },
        groomChart: { select: { name: true, source: true } },
      },
    })

    if (!match || match.userId !== userId) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 })
    }

    const brideChart = match.brideChart as { name: string; source: string } | null
    const groomChart = match.groomChart as { name: string; source: string } | null

    return NextResponse.json({
      id: match.id,
      label: match.label,
      // Verbatim — never recomputed from current chart data.
      result: match.result,
      tablesVersion: match.tablesVersion,
      createdAt: match.createdAt,
      brideChartName: brideChart?.name ?? null,
      brideChartSource: brideChart?.source ?? null,
      groomChartName: groomChart?.name ?? null,
      groomChartSource: groomChart?.source ?? null,
    })
  } catch (error) {
    console.error('Load compatibility match error:', error)
    return NextResponse.json(
      { error: 'Failed to load match', message: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await resolveRequestUser(request)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized', message: 'Sign in required.' }, { status: 401 })
    }

    const match = await prisma.compatibilityMatch.findUnique({
      where: { id: params.id },
      select: { id: true, userId: true },
    })

    if (!match || match.userId !== userId) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 })
    }

    await prisma.compatibilityMatch.delete({ where: { id: params.id } })

    return NextResponse.json({ message: 'Match deleted successfully' })
  } catch (error) {
    console.error('Delete compatibility match error:', error)
    return NextResponse.json(
      { error: 'Failed to delete match', message: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
