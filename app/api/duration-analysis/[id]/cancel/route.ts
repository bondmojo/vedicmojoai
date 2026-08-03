/**
 * POST /api/duration-analysis/[id]/cancel — Cancel an analysis.
 *
 * Valid from queued | running | symptom_unmatched. Sets status='cancelled';
 * the running pipeline notices at its next checkpoint (per DA-1 batch,
 * before DA-2/DA-3) and unwinds without overwriting the status. This is the
 * "cancel" action advertised by the symptom_gate SSE event.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { resolveRequestUser } from '@/lib/auth'

const CANCELLABLE = ['queued', 'running', 'symptom_unmatched']

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

  if (!CANCELLABLE.includes(analysis.status)) {
    return NextResponse.json(
      { error: `Cannot cancel an analysis in "${analysis.status}" status` },
      { status: 400 }
    )
  }

  // Guard the WHERE on status too — a concurrent completion must win over
  // a late cancel rather than flipping a finished run to cancelled.
  const result = await prisma.durationAnalysis.updateMany({
    where: { id: params.id, status: { in: CANCELLABLE } },
    data: { status: 'cancelled' },
  })

  if (result.count === 0) {
    return NextResponse.json(
      { error: 'Analysis reached a terminal state before the cancel applied' },
      { status: 409 }
    )
  }

  return NextResponse.json({ status: 'cancelled' })
}
