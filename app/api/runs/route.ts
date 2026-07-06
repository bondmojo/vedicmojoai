/**
 * API: /api/runs
 * POST — Start a new pipeline run (returns 202 + run_id immediately)
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { computeVimshottari } from '@/engine/computeVimshottari'
import { runPreAnalysis } from '@/engine/pre_analysis'
import { buildChartSummary } from '@/engine/chartSummary'
import { resolvePlan, validateAgentSelection } from '@/engine/planner'
import { executePipeline } from '@/engine/orchestrator'
import { shouldSkipWave1, getWave1Cache } from '@/engine/waves/wave1'
import type { ChartInputV1, QueryType, AgentId, SSEEvent } from '@/lib/types'

const ModelOverrideSchema = z.object({
  foundation: z.object({ provider: z.enum(['anthropic', 'openai']), model: z.string() }),
  specialist: z.object({ provider: z.enum(['anthropic', 'openai']), model: z.string() }),
  synthesis:  z.object({ provider: z.enum(['anthropic', 'openai']), model: z.string() }),
}).optional()

interface RunRequestBody {
  chartId: string
  queryTypes: QueryType[]
  userQuery?: string
  customAgents?: AgentId[]
  forceRerunWave1?: boolean
  modelOverride?: z.infer<typeof ModelOverrideSchema>
}

export async function POST(request: NextRequest) {
  let body: RunRequestBody

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { chartId, queryTypes, userQuery, customAgents, forceRerunWave1, modelOverride } = body

  // Validate modelOverride shape if present
  if (modelOverride !== undefined) {
    const parsed = ModelOverrideSchema.safeParse(modelOverride)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid modelOverride', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }
  }

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
      plannerOutput: executionPlan as any,
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

  // Apply model overrides to ModelConfig (if provided)
  if (modelOverride) {
    const foundationAgents = ['1A', '1B', '1C', '1D']
    const specialistAgents = ['2A', '2B', '2C', '2D', '2E', '2F', '2G', '3A', '3B', '3C', '3D', '4X', '4A', '4B', 'verification']
    const synthesisAgents = ['4C']

    const overrides: { waveId: string; provider: string; modelId: string }[] = []
    for (const id of foundationAgents) overrides.push({ waveId: id, provider: modelOverride.foundation.provider, modelId: modelOverride.foundation.model })
    for (const id of specialistAgents) overrides.push({ waveId: id, provider: modelOverride.specialist.provider, modelId: modelOverride.specialist.model })
    for (const id of synthesisAgents)  overrides.push({ waveId: id, provider: modelOverride.synthesis.provider,  modelId: modelOverride.synthesis.model })

    for (const o of overrides) {
      await prisma.modelConfig.upsert({
        where: { waveId: o.waveId },
        update: { modelId: o.modelId, provider: o.provider },
        create: {
          waveId: o.waveId,
          modelId: o.modelId,
          provider: o.provider,
          temperature: o.waveId === '4C' || o.waveId.startsWith('4') ? 0 : 0.3,
          maxTokens: o.waveId === '4C' ? 16384 : 8192,
          promptVersion: 'v1.0',
        },
      })
    }
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
