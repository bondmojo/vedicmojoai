/**
 * API: /api/runs/[id]/override
 * POST — Override a halted run and continue from 4B
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { resumeFromHalt } from '@/engine/orchestrator'
import type { SSEEvent } from '@/lib/types'

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
