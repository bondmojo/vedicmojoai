/**
 * POST /api/matchmaking — Compute an Ashtakoota + Mangal Dosha match for two
 *   owned charts and persist it as a `CompatibilityMatch` row.
 * GET  /api/matchmaking — List the caller's saved matches (summary fields
 *   only — see GET below for why the full `result` blob is withheld).
 *
 * Task 8.1 / 8.3 of .kiro/specs/marriage-matchmaking/tasks.md.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { resolveRequestUser } from '@/lib/auth'
import { MATCHMAKING_TABLES_VERSION } from '@/engine/compute/matchmakingTables'
import { MatchRequestSchema, resolveChartsForMatch, computeMatchResult } from './_shared'

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

    const { brideChartId, groomChartId, label } = parsed.data

    // 404 (never 403) whether a chart doesn't exist OR belongs to a
    // different user — same response body for both cases, no distinguishing.
    const charts = await resolveChartsForMatch(userId, brideChartId, groomChartId)
    if (!charts) {
      return NextResponse.json({ error: 'Chart not found' }, { status: 404 })
    }

    const result = computeMatchResult(charts.bride, charts.groom)

    // `gunaScore` is passed through as the raw JS number — Prisma accepts a
    // number for a Decimal(4,1) column and this MUST never be rounded,
    // floored, or `.toFixed()`'d: half-points are load-bearing (design.md
    // OD-13 / non-negotiable constraint).
    const created = await prisma.compatibilityMatch.create({
      data: {
        userId,
        brideChartId,
        groomChartId,
        label: label ?? null,
        gunaScore: result.ashtakoota.gunaScore,
        verdict: result.ashtakoota.verdict,
        result: result as unknown as object,
        tablesVersion: MATCHMAKING_TABLES_VERSION,
      },
    })

    return NextResponse.json(
      {
        id: created.id,
        brideChartId: created.brideChartId,
        groomChartId: created.groomChartId,
        label: created.label,
        // Number(), never a string — a Decimal round-trips losslessly through
        // Number() for the 4-digit/1-decimal range this column allows.
        gunaScore: Number(created.gunaScore),
        result: created.result,
        tablesVersion: created.tablesVersion,
        createdAt: created.createdAt,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Create compatibility match error:', error)
    return NextResponse.json(
      { error: 'Failed to create match', message: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const userId = await resolveRequestUser(request)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized', message: 'Sign in required.' }, { status: 401 })
    }

    // Summary fields only — `verdict` is denormalized (see schema.prisma's
    // comment on the column) specifically so this list doesn't have to fetch
    // the full `result` JSONB just to read one nested string. The full
    // `result` blob is reserved for GET /api/matchmaking/[id] (task 8.4).
    const matches = await prisma.compatibilityMatch.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        label: true,
        gunaScore: true,
        verdict: true,
        createdAt: true,
        brideChart: { select: { name: true } },
        groomChart: { select: { name: true } },
      },
    })

    return NextResponse.json(
      matches.map((m) => {
        const brideChart = m.brideChart as { name: string } | null
        const groomChart = m.groomChart as { name: string } | null
        return {
          id: m.id,
          label: m.label,
          gunaScore: Number(m.gunaScore),
          verdict: m.verdict,
          brideChartName: brideChart?.name ?? null,
          groomChartName: groomChart?.name ?? null,
          createdAt: m.createdAt,
        }
      })
    )
  } catch (error) {
    console.error('List compatibility matches error:', error)
    return NextResponse.json(
      { error: 'Failed to load matches', message: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
