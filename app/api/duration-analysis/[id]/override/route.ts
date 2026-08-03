/**
 * POST /api/duration-analysis/[id]/override — Override symptom gate and resume to DA-3.
 *
 * Only valid when status === 'symptom_unmatched'.
 * Fires resumeDurationPipeline fire-and-forget; returns 202 immediately.
 * Progress is served via /events endpoint.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { resumeDurationPipeline } from '@/engine/durationAnalysis'
import { resolveRequestUser } from '@/lib/auth'
import type { DurationSSEEvent } from '@/lib/durationTypes'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await resolveRequestUser(request)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized', message: 'Sign in required.' }, { status: 401 })
  }

  const analysis = await prisma.durationAnalysis.findUnique({
    where: { id: params.id },
    select: { status: true, unifiedChart: { select: { userId: true } } },
  })

  if (!analysis || analysis.unifiedChart.userId !== userId) {
    return NextResponse.json({ error: 'Analysis not found' }, { status: 404 })
  }

  if (analysis.status !== 'symptom_unmatched') {
    return NextResponse.json(
      { error: 'Can only override analyses in symptom_unmatched status' },
      { status: 400 }
    )
  }

  // Fire-and-forget — SSE events are served via the /events endpoint
  const noopEmit = (_event: DurationSSEEvent) => {}
  resumeDurationPipeline(params.id, noopEmit).catch((err) => {
    console.error(`[duration-analysis/override] Resume failed for ${params.id}:`, err)
  })

  return NextResponse.json({ status: 'resumed' }, { status: 202 })
}
