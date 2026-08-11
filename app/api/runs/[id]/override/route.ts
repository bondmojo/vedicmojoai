/**
 * API: /api/runs/[id]/override
 * POST — Override a halted run and continue from 4B
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { resumeFromHalt } from '@/engine/orchestrator'
import { resolveRequestUser } from '@/lib/auth'
import type { SSEEvent } from '@/lib/types'

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

  if (run.status !== 'halted_for_review') {
    return NextResponse.json(
      { error: `Cannot override run with status "${run.status}". Must be "halted_for_review".` },
      { status: 400 }
    )
  }

  // Resume pipeline asynchronously
  const noopEmit = (_event: SSEEvent) => {}

  resumeFromHalt(run.id, noopEmit).catch((error) => {
    console.error(`Override resume failed for run ${run.id}:`, error)
  })

  return NextResponse.json(
    { message: 'Override accepted. Pipeline resuming from 4B.', runId: run.id },
    { status: 202 }
  )
}
