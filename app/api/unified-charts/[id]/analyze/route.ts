/**
 * POST /api/unified-charts/[id]/analyze — Run AI Analysis on a unified chart.
 *
 * Pulls chart data from the UnifiedChart record, determines the wave execution
 * strategy based on source:
 *   - source="compute": Skip Wave 1 (foundation data already deterministic)
 *   - source="paste":   Run full Wave 1–4 pipeline
 *
 * Creates a PipelineRun linked to both the legacy Chart table (for backward
 * compatibility) and the new UnifiedChart, then starts the orchestrator.
 *
 * Returns 202 with the run ID immediately. Client connects via SSE for progress.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { computeVimshottari } from '@/engine/computeVimshottari'
import { runPreAnalysis } from '@/engine/pre_analysis'
import { buildChartSummary } from '@/engine/chartSummary'
import { resolvePlan } from '@/engine/planner'
import { executePipeline } from '@/engine/orchestrator'
import { shouldSkipWave1, getWave1Cache } from '@/engine/waves/wave1'
import { buildChartInputV1FromUnified } from '@/lib/chart-mapper'
import { YOGAKARAKA } from '@/engine/constants'
import crypto from 'crypto'
import type { ChartInputV1, QueryType, SSEEvent } from '@/lib/types'

// ─── Input Validation ───────────────────────────────────────────────

const AnalyzeInputSchema = z.object({
  queryTypes: z
    .array(z.enum(['generic', 'health', 'wealth', 'career', 'property', 'marriage', 'full']))
    .min(1, 'At least one query type is required'),
  userQuery: z.string().optional(),
  forceRerunWave1: z.boolean().optional().default(false),
})

// ─── Route Handler ──────────────────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // Parse request body
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = AnalyzeInputSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const { queryTypes, userQuery, forceRerunWave1 } = parsed.data

  // Load the unified chart
  const unifiedChart = await prisma.unifiedChart.findUnique({
    where: { id: params.id },
  })

  if (!unifiedChart) {
    return NextResponse.json({ error: 'Chart not found' }, { status: 404 })
  }

  // ─── Build ChartInputV1 for the pipeline ────────────────────────

  let chartInput: ChartInputV1 | null

  if (unifiedChart.source === 'paste' && unifiedChart.chartInputV1) {
    // Paste path: use stored ChartInputV1 directly
    chartInput = unifiedChart.chartInputV1 as unknown as ChartInputV1
  } else if (unifiedChart.source === 'compute') {
    // Compute path: synthesize ChartInputV1 from domain columns
    chartInput = buildChartInputV1FromUnified({
      source: unifiedChart.source,
      chartInputV1: unifiedChart.chartInputV1,
      planets: unifiedChart.planets,
      nakshatras: unifiedChart.nakshatras,
      divisionalCharts: unifiedChart.divisionalCharts,
      karakas: unifiedChart.karakas,
      ashtakavarga: unifiedChart.ashtakavarga,
      upagrahas: unifiedChart.upagrahas,
      specialLagnas: unifiedChart.specialLagnas,
      shadbala: unifiedChart.shadbala,
      birthInput: unifiedChart.birthInput,
      lagna: unifiedChart.lagna,
      lagnaLongitude: Number(unifiedChart.lagnaLongitude),
      moonLongitude: Number(unifiedChart.moonLongitude),
      ayanamsa: Number(unifiedChart.ayanamsa),
      birthDatetime: unifiedChart.birthDatetime,
      name: unifiedChart.name,
    })

    if (!chartInput) {
      return NextResponse.json(
        { error: 'Cannot build pipeline input — chart domain data is incomplete' },
        { status: 422 }
      )
    }
  } else {
    return NextResponse.json(
      { error: 'Chart has no usable data for AI analysis' },
      { status: 422 }
    )
  }

  // ─── Ensure legacy Chart record exists (for PipelineRun FK) ─────

  const chartHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(chartInput))
    .digest('hex')

  let legacyChart = await prisma.chart.findUnique({
    where: { chartHash },
  })

  if (!legacyChart) {
    // Create a legacy Chart record for backward compatibility
    const moonEntry = chartInput.natal_nakshatras.find((p) => p.body === 'Moon')!
    const moonLongitude = ((moonEntry.sign_no - 1) * 30) + moonEntry.degree_decimal
    const yogakaraka = YOGAKARAKA[chartInput.meta.lagna_sign] ?? null

    legacyChart = await prisma.chart.create({
      data: {
        clientName: chartInput.meta.client_name,
        lagna: chartInput.meta.lagna_sign,
        yogakaraka,
        chartJson: chartInput as any,
        chartHash,
        moonLongitude,
        birthDatetime: new Date(chartInput.meta.birth_datetime),
      },
    })
  }

  // ─── Compute dasha tree and pre-analysis ────────────────────────

  const moonLongitude = Number(unifiedChart.moonLongitude)
  const dashaTree = computeVimshottari(moonLongitude, unifiedChart.birthDatetime)
  const alerts = runPreAnalysis(chartInput)
  const chartSummary = buildChartSummary(chartInput, alerts, dashaTree)

  // ─── Determine wave execution strategy ─────────────────────────

  // For compute-path charts: skip Wave 1 (already deterministic)
  // For paste-path charts: run full Wave 1–4
  const isComputePath = unifiedChart.source === 'compute'

  // Check existing completed runs for follow-up detection
  const existingRuns = await prisma.pipelineRun.count({
    where: { unifiedChartId: unifiedChart.id, status: 'done' },
  })
  const isFollowup = existingRuns > 0

  const executionPlan = resolvePlan({
    queryTypes: queryTypes as QueryType[],
    isFollowup,
    alerts,
    forceRerunWave1: isComputePath ? false : forceRerunWave1,
  })

  // For compute path, check/populate Wave1Cache so orchestrator skips Wave 1
  let wave1Delta: Record<string, unknown> | null = null

  if (isComputePath && !forceRerunWave1) {
    // Compute-path charts already have deterministic foundation data.
    // Check if Wave1Cache exists; if not, the orchestrator will still
    // skip Wave 1 agents since data is already in the unified chart.
    const cache = await getWave1Cache(chartHash)
    if (cache) {
      wave1Delta = cache.wave1Delta as Record<string, unknown> | null
    }
  } else {
    // Paste path: check cache normally
    const skipWave1 = await shouldSkipWave1(chartHash, forceRerunWave1)
    if (skipWave1) {
      const cache = await getWave1Cache(chartHash)
      wave1Delta = cache?.wave1Delta as Record<string, unknown> | null
    }
  }

  // ─── Create PipelineRun ─────────────────────────────────────────

  const run = await prisma.pipelineRun.create({
    data: {
      chartId: legacyChart.id,
      unifiedChartId: unifiedChart.id,
      runType: isFollowup ? 'followup' : 'first_query',
      queryTypes: queryTypes,
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

  // ─── Execute pipeline (fire and forget) ─────────────────────────

  const noopEmit = (_event: SSEEvent) => {
    // Events served via SSE endpoint at /api/runs/[id]/events
  }

  executePipeline({
    runId: run.id,
    chartId: legacyChart.id,
    chart: chartInput,
    chartSummary,
    alerts,
    dashaTree,
    executionPlan,
    wave1Delta,
    emitEvent: noopEmit,
  }).catch(async (error) => {
    console.error(`Pipeline run ${run.id} failed:`, error)
  })

  // ─── Return 202 immediately ─────────────────────────────────────

  return NextResponse.json(
    {
      runId: run.id,
      unifiedChartId: unifiedChart.id,
      status: 'queued',
      source: unifiedChart.source,
      waveStrategy: isComputePath ? 'skip_wave1' : 'full_pipeline',
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
