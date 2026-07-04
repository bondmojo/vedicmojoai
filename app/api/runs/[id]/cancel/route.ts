/**
 * API: /api/runs/[id]/cancel
 * POST — Cancel a halted or running run
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const run = await prisma.pipelineRun.findUnique({
    where: { id: params.id },
    select: { id: true, status: true },
  })

  if (!run) {
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
