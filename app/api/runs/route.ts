/**
 * API: /api/runs
 * POST — Start a new pipeline run (returns 202 + run_id immediately)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { computeVimshottari } from '@/engine/computeVimshottari'
import { runPreAnalysis } from '@/engine/pre_analysis'
import { buildChartSummary } from '@/engine/chartSummary'
import { resolvePlan, validateAgentSelection } from '@/engine/planner'
import { executePipeline } from '@/engine/orchestrator'
import { shouldSkipWave1, getWave1Cache } from '@/engine/waves/wave1'
import type { ChartInputV1, QueryType, AgentId, SSEEvent } from '@/lib/types'

interface RunRequestBody {
  chartId: string
  queryTypes: QueryType[]
  userQuery?: string
  customAgents?: AgentId[]
  forceRerunWave1?: boolean
}

export async function POST(request: NextRequest) {
  let body: RunRequestBody

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { chartId, queryTypes, userQuery, customAgents, forceRerunWave1 } = body

  if (!chartId || !queryTypes || queryTypes.length === 0) {
    return NextResponse.json(
      { error: 'chartId and queryTypes[] are required' },
      { status: 400 }
    )
  }

  // Validate custom agent selection if provided
  if (customAgents && customAgents.length > 0) {
    const validationErrors = validateAgentSelection(customAgents)
    if (validationErrors.length > 0) {
      return NextResponse.json(
        { error: 'Invalid agent selection', details: validationErrors },
        { status: 400 }
      )
    }
  }

  // Load chart
  const chart = await prisma.chart.findUnique({ where: { id: chartId } })
  if (!chart) {
    return NextResponse.json({ error: 'Chart not found' }, { status: 404 })
  }

  // Determine if this is a follow-up
  const existingRuns = await prisma.pipelineRun.count({
    where: { chartId, status: 'done' },
  })
  const isFollowup = existingRuns > 0

  // Compute dasha tree and pre-analysis
  const chartInput = chart.chartJson as unknown as ChartInputV1
  const dashaTree = computeVimshottari(Number(chart.moonLongitude), chart.birthDatetime)
  const alerts = runPreAnalysis(chartInput)
  const chartSummary = buildChartSummary(chartInput, alerts, dashaTree)

  // Resolve execution plan
  const executionPlan = resolvePlan({
    queryTypes,
    isFollowup,
    alerts,
    customAgents,
    forceRerunWave1,
  })

  // Check Wave 1 cache
  const skipWave1 = await shouldSkipWave1(chart.chartHash, forceRerunWave1 ?? false)
  let wave1Delta: Record<string, unknown> | null = null

  if (skipWave1) {
    const cache = await getWave1Cache(chart.chartHash)
    wave1Delta = cache?.wave1Delta as Record<string, unknown> | null
  }

  // Create pipeline run record
  const run = await prisma.pipelineRun.create({
    data: {
      chartId,
      runType: isFollowup ? 'followup' : 'first_query',
      queryTypes,
      userQuery: userQuery ?? null,
      isFollowup,
      plannerOutput: executionPlan as unknown as Record<string, unknown>,
      status: 'queued',
    },
  })

  // Store user message if provided
  if (userQuery) {
    await prisma.runMessage.create({
      data: {
        runId: run.id,
        role: 'user',
        content: userQuery,
      },
    })
  }

  // Execute pipeline asynchronously (fire and forget)
  // The client will connect via SSE to /api/runs/[id]/events for progress
  const noopEmit = (_event: SSEEvent) => {
    // Events are stored and served via SSE endpoint
    // In production, use a message queue or in-memory event bus
  }

  executePipeline({
    runId: run.id,
    chartId,
    chart: chartInput,
    chartSummary,
    alerts,
    dashaTree,
    executionPlan,
    wave1Delta,
    emitEvent: noopEmit,
  }).catch(async (error) => {
    // Pipeline errors are already handled inside executePipeline
    // This catches unexpected errors
    console.error(`Pipeline run ${run.id} failed:`, error)
  })

  // Return 202 immediately
  return NextResponse.json(
    {
      runId: run.id,
      status: 'queued',
      executionPlan: {
        agents: executionPlan.agents,
        rationale: executionPlan.rationale,
        isFollowup,
        skippedWaves: executionPlan.skipped_waves,
      },
    },
    { status: 202 }
  )
}
