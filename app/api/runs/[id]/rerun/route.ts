/**
 * API: /api/runs/[id]/rerun
 * POST — Re-run pipeline from a specific wave after a halt
 * Query param: from_wave (number) — which wave to restart from
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { computeVimshottari } from '@/engine/computeVimshottari'
import { runPreAnalysis } from '@/engine/pre_analysis'
import { buildChartSummary } from '@/engine/chartSummary'
import { resolvePlan } from '@/engine/planner'
import { executePipeline } from '@/engine/orchestrator'
import { getWave1Cache } from '@/engine/waves/wave1'
import type { ChartInputV1, QueryType, SSEEvent } from '@/lib/types'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const fromWave = parseInt(request.nextUrl.searchParams.get('from_wave') ?? '2')

  if (isNaN(fromWave) || fromWave < 1 || fromWave > 4) {
    return NextResponse.json(
      { error: 'from_wave must be 1-4' },
      { status: 400 }
    )
  }

  const run = await prisma.pipelineRun.findUnique({
    where: { id: params.id },
    include: { chart: true },
  })

  if (!run) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 })
  }

  if (run.status !== 'halted_for_review' && run.status !== 'failed') {
    return NextResponse.json(
      { error: `Cannot re-run from status "${run.status}". Must be halted or failed.` },
      { status: 400 }
    )
  }

  // Delete wave outputs from the target wave onward
  await prisma.waveOutput.deleteMany({
    where: {
      runId: run.id,
      waveNumber: { gte: fromWave },
    },
  })

  // Reset run status
  await prisma.pipelineRun.update({
    where: { id: run.id },
    data: { status: 'queued', haltReason: null, completedAt: null },
  })

  // Reconstruct and re-execute
  const chartInput = run.chart.chartJson as unknown as ChartInputV1
  const dashaTree = computeVimshottari(Number(run.chart.moonLongitude), run.chart.birthDatetime)
  const alerts = runPreAnalysis(chartInput)
  const chartSummary = buildChartSummary(chartInput, alerts, dashaTree)

  const executionPlan = resolvePlan({
    queryTypes: run.queryTypes as QueryType[],
    isFollowup: run.isFollowup,
    alerts,
  })

  // Filter plan to only include agents from the target wave onward
  const filteredAgents = executionPlan.agents.filter((a) => {
    const wave = a.startsWith('1') ? 1 : a.startsWith('2') ? 2 : a.startsWith('3') ? 3 : a.startsWith('4') ? 4 : 5
    return wave >= fromWave
  })
  executionPlan.agents = filteredAgents

  // Load cached Wave 1 if not re-running from Wave 1
  let wave1Delta: Record<string, unknown> | null = null
  if (fromWave > 1) {
    const cache = await getWave1Cache(run.chart.chartHash)
    wave1Delta = cache?.wave1Delta as Record<string, unknown> | null
  }

  const noopEmit = (_event: SSEEvent) => {}

  executePipeline({
    runId: run.id,
    chartId: run.chartId,
    chart: chartInput,
    chartSummary,
    alerts,
    dashaTree,
    executionPlan,
    wave1Delta,
    emitEvent: noopEmit,
  }).catch((error) => {
    console.error(`Re-run ${run.id} from wave ${fromWave} failed:`, error)
  })

  return NextResponse.json(
    { message: `Re-running from Wave ${fromWave}`, runId: run.id },
    { status: 202 }
  )
}
