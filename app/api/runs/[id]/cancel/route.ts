/**
 * API: /api/runs/[id]/cancel
 * POST — Cancel a halted or running run
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { resolveRequestUser } from '@/lib/auth'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await resolveRequestUser(request)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized', message: 'Sign in required.' }, { status: 401 })
  }

  const run = await prisma.pipelineRun.findUnique({
    where: { id: params.id },
    select: { id: true, status: true, unifiedChart: { select: { userId: true } } },
  })

  if (!run || run.unifiedChart?.userId !== userId) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 })
  }

  if (!['halted_for_review', 'running', 'queued'].includes(run.status)) {
    return NextResponse.json(
      { error: `Cannot cancel run with status "${run.status}".` },
      { status: 400 }
    )
  }

  await prisma.pipelineRun.update({
    where: { id: run.id },
    data: {
      status: 'failed',
      completedAt: new Date(),
    },
  })

  return NextResponse.json({ message: 'Run cancelled.', runId: run.id })
}
