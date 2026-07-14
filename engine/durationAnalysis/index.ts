/**
 * engine/durationAnalysis/index.ts — Main pipeline orchestrator for the Duration Analysis
 * 3-agent pipeline (DA-1 → DA-2 (conditional) → DA-3).
 *
 * Runs sequentially, emits SSE events at each transition, persists step outputs to DB,
 * and accumulates token/cost totals.
 *
 * Called fire-and-forget from the API route (no await at call site).
 * Errors are caught internally and stored as status="failed".
 */

import { prisma } from '@/lib/db'
import { readPromptFile } from '@/engine/llm'
import { sliceDashaTree } from './slicer'
import { buildTransitOverlay } from './transitOverlay'
import { extractCategoryData, toScoringChartData } from './extractor'
import { getDomainAgentSpec } from './registry'
import { callAgentJson } from './agentJson'
import { scorePeriod, identifyPeaks, resolveDomainWeights } from './scoring'
import type {
  DurationPipelineInput,
  DA1Output,
  DA2Output,
  DA3Output,
  DurationSSEEvent,
  CategoryChartData,
  DashaSlice,
  TransitOverlay,
  PeriodAnalysis,
  ScoredDashaSlice,
  PeakPeriod,
} from '@/lib/durationTypes'

// ─── Cooperative cancellation ────────────────────────────────────────
// POST /api/duration-analysis/[id]/cancel sets status='cancelled'. The
// pipeline cannot be killed mid-await, so it checks the flag between steps
// (per DA-1 batch, before DA-2, before DA-3) and unwinds without
// overwriting the cancelled status.

export class PipelineCancelledError extends Error {
  constructor(analysisId: string) {
    super(`Analysis ${analysisId} was cancelled by the practitioner`)
    this.name = 'PipelineCancelledError'
  }
}

async function throwIfCancelled(analysisId: string): Promise<void> {
  const current = await prisma.durationAnalysis.findUnique({
    where: { id: analysisId },
    select: { status: true },
  })
  if (current?.status === 'cancelled') {
    throw new PipelineCancelledError(analysisId)
  }
}

// ─── DA-1 batching ───────────────────────────────────────────────────
// A single DA-1 call cannot emit detailed analysis for hundreds of periods
// within maxTokens — long ranges are split into batches and merged.

export const DA1_BATCH_SIZE = 25

/**
 * Merges per-batch DA-1 outputs into one DA1Output. period_analysis is
 * concatenated in batch (chronological) order. Batch trends are joined.
 *
 * NOTE: peak_stress_periods and peak_favorable_periods from the LLM are
 * intentionally DISCARDED here — they are replaced by the engine-computed
 * authoritative peaks during the compute-first merge (task 6.2).
 */
export function mergeDA1Outputs(outputs: DA1Output[]): DA1Output {
  if (outputs.length === 0) {
    throw new Error('DA-1 produced no batch outputs')
  }
  if (outputs.length === 1) return outputs[0]

  return {
    ...outputs[0],
    period_analysis: outputs.flatMap((o) => o.period_analysis ?? []),
    overall_trend: outputs
      .map((o) => o.overall_trend)
      .filter(Boolean)
      .join(' '),
    // Engine peaks override these — clear them now so there is no ambiguity.
    peak_stress_periods: [],
    peak_favorable_periods: [],
  }
}

// ─── Period context merge ───────────────────────────────────────────

/**
 * Enriches each DA-1 period_analysis entry with the deterministic
 * `lordAnnotations` (from the matching period slice), `transitContext`
 * (from the matching transit overlay), and — COMPUTE-FIRST CONTRACT —
 * the engine `score`, `intensity`, `favorable`, and `scoreBreakdown`.
 *
 * Engine values always win: any model-emitted intensity/favorable is
 * overwritten, even when the entry has no matching slice (Requirement 8.3/8.4).
 */
export function mergePeriodContext(
  da1Output: DA1Output,
  scoredSlices: ScoredDashaSlice[],
  transitOverlay: TransitOverlay[]
): DA1Output {
  if (!da1Output || !Array.isArray(da1Output.period_analysis)) {
    return da1Output
  }

  const datePart = (iso: string): string => (typeof iso === 'string' ? iso.slice(0, 10) : '')

  const merged: PeriodAnalysis[] = da1Output.period_analysis.map((period) => {
    // Match slice by full lord triple + pd.start, then fall back progressively.
    const slice =
      scoredSlices.find(
        (s) =>
          s.md.lord === period.md?.lord &&
          s.ad.lord === period.ad?.lord &&
          s.pd.lord === period.pd?.lord &&
          s.pd.start === period.pd?.start
      ) ??
      scoredSlices.find(
        (s) =>
          s.md.lord === period.md?.lord &&
          s.ad.lord === period.ad?.lord &&
          s.pd.lord === period.pd?.lord &&
          datePart(s.pd.start) === datePart(period.pd?.start ?? '')
      ) ??
      scoredSlices.find(
        (s) =>
          s.md.lord === period.md?.lord &&
          s.ad.lord === period.ad?.lord &&
          s.pd.lord === period.pd?.lord
      )

    // Match overlay by AD start (exact, then date-only, then by AD lord).
    const overlay =
      transitOverlay.find((o) => o.adStart === period.ad?.start) ??
      transitOverlay.find((o) => datePart(o.adStart) === datePart(period.ad?.start ?? '')) ??
      transitOverlay.find((o) => o.adLord === period.ad?.lord)

    return {
      ...period,
      lordAnnotations: slice?.lordAnnotations ?? period.lordAnnotations,
      transitContext: overlay ?? period.transitContext,
      // Compute-first contract: engine values are authoritative.
      // Overwrite whatever the model emitted, even when slice is unmatched (use slice value when available).
      ...(slice != null ? {
        intensity: slice.intensity,
        favorable: slice.favorable,
        score: slice.score,
        scoreBreakdown: slice.scoreBreakdown,
      } : {
        // No matching slice: keep model-emitted intensity/favorable as-is (legacy/edge case)
      }),
    }
  })

  return { ...da1Output, period_analysis: merged }
}

// ─── Main Pipeline Orchestrator ─────────────────────────────────────

/**
 * Executes the full Duration Analysis pipeline for a given analysis record.
 *
 * Steps:
 *   0a. Period Slicer — sliceDashaTree (pure TS)
 *   0b. Transit Overlay — buildTransitOverlay (pure TS, calls computeTransits per AD boundary)
 *   1.  DA-1 Domain Analyser — LLM
 *   2.  DA-2 Symptom Validator — LLM (conditional: only when symptoms provided)
 *   3.  DA-3 Future Analyser — LLM
 *
 * @param input - Pipeline input including analysisId, chart ref, date range, category, and emitEvent callback
 */
export async function executeDurationPipeline(input: DurationPipelineInput): Promise<void> {
  const { analysisId, unifiedChartId, dateFrom, dateTo, category, userQuestion, symptoms, overrideProvider, overrideModel, apiKey, emitEvent } = input

  // Resolve provider/model per agent: a UI override (applied to all DA agents)
  // wins over the seeded ModelConfig. Temperature/maxTokens always come from config.
  const resolveProvider = (cfgProvider: string) =>
    (overrideProvider ?? cfgProvider) as 'anthropic' | 'openai' | 'google'
  const resolveModel = (cfgModel: string) => overrideModel ?? cfgModel

  try {
    // 1. Set status = running (unless already cancelled)
    await throwIfCancelled(analysisId)
    await prisma.durationAnalysis.update({
      where: { id: analysisId },
      data: { status: 'running' },
    })

    // 2. Load chart and model configs.
    // The domain-analysis step resolves its prompt + model via the registry,
    // so per-domain agents (DA1-CAREER, …) need no orchestrator changes.
    const domainSpec = getDomainAgentSpec(category)
    const chart = await prisma.unifiedChart.findUniqueOrThrow({ where: { id: unifiedChartId } })
    const [da1Config, da2Config, da3Config] = await Promise.all([
      prisma.modelConfig.findUniqueOrThrow({ where: { waveId: domainSpec.modelWaveId } }),
      prisma.modelConfig.findUniqueOrThrow({ where: { waveId: 'DA-2' } }),
      prisma.modelConfig.findUniqueOrThrow({ where: { waveId: 'DA-3' } }),
    ])

    // 3. Step 0a: Period Slicer with lord annotation + Karaka_Role tagging
    const { slices: periodSlice, truncated } = sliceDashaTree(
      chart.dashaTree,
      dateFrom,
      dateTo,
      {
        planets: chart.planets,
        nakshatras: chart.nakshatras,
        relationships: chart.relationships,
        karakas: chart.karakas,   // for karakaRole annotation
      }
    )

    // 3b. Step 0b: Transit Overlay
    const natalMoonSign = Math.floor(Number(chart.moonLongitude) / 30) + 1
    const natalLagnaSign = Math.floor(Number(chart.lagnaLongitude) / 30) + 1
    const birthYear = new Date(chart.birthDatetime).getUTCFullYear()
    let transitOverlay: TransitOverlay[] = []
    try {
      transitOverlay = buildTransitOverlay(
        periodSlice,
        natalMoonSign,
        natalLagnaSign,
        birthYear,
        chart.transits,
        chart.ashtakavarga
      )
    } catch (err) {
      console.warn('[executeDurationPipeline] buildTransitOverlay failed:', err)
      // transitOverlay stays []
    }

    // Empty slice = nothing to analyse. Fail fast with a clear reason instead
    // of burning an LLM call on an empty period table. Most common cause:
    // an older chart whose dashaTree lacks pratyantardashas (run db:backfill-pd).
    if (periodSlice.length === 0) {
      throw new Error(
        'No dasha periods overlap the requested date range. If this chart was computed ' +
          'before full-PD storage, run `npm run db:backfill-pd` and retry.'
      )
    }

    await prisma.durationAnalysis.update({
      where: { id: analysisId },
      data: { transitOverlay: transitOverlay as any },
    })

    // 4. Category data extraction (with bhavaBala, nakshatraRelationships, special points)
    const categoryData = extractCategoryData(
      {
        planets: chart.planets,
        nakshatras: chart.nakshatras,
        relationships: chart.relationships,
        shadbala: chart.shadbala,
        divisionalCharts: chart.divisionalCharts,
        jaimini: chart.jaimini,
        ashtakavarga: chart.ashtakavarga,
        dashaTree: chart.dashaTree,
        bhavaBala: chart.bhavaBala,
        arudhaPadas: chart.arudhaPadas,
        specialLagnas: chart.specialLagnas,
        karakas: chart.karakas,
        upagrahas: chart.upagrahas,
      },
      category
    )

    // Step 0d: Deterministic scoring — runs BEFORE DA-1 so engine verdicts
    // are authoritative context for DA-1 (compute-first contract).
    const domainWeights = resolveDomainWeights(category)
    const scoringChartData = toScoringChartData(categoryData, {
      shadbala: chart.shadbala,
      bhavaBala: chart.bhavaBala,
      karakas: chart.karakas,
      ashtakavarga: chart.ashtakavarga,
      planets: chart.planets,
    })

    // Build an overlay index keyed by AD start for O(1) lookup per period
    const overlayByAdStart = new Map(transitOverlay.map((o) => [o.adStart, o]))

    const scoredSlices: ScoredDashaSlice[] = periodSlice.map((slice) => {
      const overlayEntry =
        overlayByAdStart.get(slice.ad.start) ??
        transitOverlay.find((o) => o.adLord === slice.ad.lord) ??
        null
      const { score, breakdown } = scorePeriod(slice, scoringChartData, overlayEntry, domainWeights)
      return {
        ...slice,
        score,
        intensity: breakdown.intensity,
        favorable: breakdown.favorable,
        scoreBreakdown: breakdown,
      }
    })

    // Identify peaks from the full scored window (global, batch-independent)
    const { peakStress, peakFavorable } = identifyPeaks(
      scoredSlices.map((s) => ({ period: s, result: { score: s.score, breakdown: s.scoreBreakdown } }))
    )

    // 5. Step 1: DA-1 Domain Analyser — batched so the per-call output stays
    // within maxTokens regardless of range length. Each batch gets only its
    // own slices + the transit overlays for the ADs it touches.
    // The period table passed to DA-1 includes engine scores/verdicts as authoritative context.
    emitEvent({ type: 'agent_start', agent_id: 'DA-1', timestamp: new Date().toISOString() })
    const da1PromptTemplate = await readPromptFile(domainSpec.promptFile)

    const batches: ScoredDashaSlice[][] = []
    for (let i = 0; i < scoredSlices.length; i += DA1_BATCH_SIZE) {
      batches.push(scoredSlices.slice(i, i + DA1_BATCH_SIZE))
    }

    let totalTokenIn = 0
    let totalTokenOut = 0
    let totalCostUsd = 0
    const batchOutputs: DA1Output[] = []

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i]
      const adStarts = new Set(batch.map((s) => s.ad.start))
      const batchOverlay = transitOverlay.filter((o) => adStarts.has(o.adStart))
      const da1Prompt = buildDA1Prompt(
        da1PromptTemplate,
        categoryData,
        batch,
        batchOverlay,
        userQuestion,
        truncated,
        { index: i + 1, count: batches.length }
      )
      const result = await callAgentJson<DA1Output>(
        {
          model: resolveModel(da1Config.modelId),
          provider: resolveProvider(da1Config.provider),
          prompt: da1Prompt.prompt,
          cachedPrefix: da1Prompt.cachedPrefix,
          temperature: Number(da1Config.temperature),
          maxTokens: da1Config.maxTokens,
          apiKey,
        },
        domainSpec.agentId
      )
      batchOutputs.push(result.output)
      totalTokenIn += result.tokenIn
      totalTokenOut += result.tokenOut
      totalCostUsd += result.costUsd

      // Heartbeat: persist running totals after every batch so updatedAt
      // advances — the stale-run reaper treats a silent row as a dead run.
      await prisma.durationAnalysis.update({
        where: { id: analysisId },
        data: { totalTokenIn, totalTokenOut, totalCostUsd },
      })
      await throwIfCancelled(analysisId)
    }

    // Merge batches, then join deterministic per-period context + engine verdicts back on.
    let da1Output = mergeDA1Outputs(batchOutputs)
    da1Output = mergePeriodContext(da1Output, scoredSlices, transitOverlay)

    // Compute-first: replace LLM-chosen peaks with authoritative engine peaks.
    const peakStressForDA1 = peakStress.map((p) => ({ period: p.label, reason: `Score: ${p.score}` }))
    const peakFavorableForDA1 = peakFavorable.map((p) => ({ period: p.label, reason: `Score: ${p.score}` }))
    da1Output = {
      ...da1Output,
      peak_stress_periods: peakStressForDA1,
      peak_favorable_periods: peakFavorableForDA1,
    }

    await prisma.durationAnalysis.update({
      where: { id: analysisId },
      data: {
        periodSlice: scoredSlices as any,  // persist scored slices with score/breakdown
        da1Output: da1Output as any,
        totalTokenIn,
        totalTokenOut,
        totalCostUsd,
      },
    })
    emitEvent({
      type: 'agent_complete',
      agent_id: 'DA-1',
      data: { tokenIn: totalTokenIn, tokenOut: totalTokenOut, costUsd: totalCostUsd },
      timestamp: new Date().toISOString(),
    })

    // 6. Step 2: DA-2 Symptom Validator (conditional — only when symptoms provided)
    let da2Output: DA2Output | null = null
    if (symptoms) {
      await throwIfCancelled(analysisId)
      emitEvent({ type: 'agent_start', agent_id: 'DA-2', timestamp: new Date().toISOString() })
      const da2PromptTemplate = await readPromptFile('duration_da2_symptom_validator.md')
      const da2Prompt = buildDA2Prompt(da2PromptTemplate, categoryData, da1Output, symptoms)
      const da2Response = await callAgentJson<DA2Output>(
        {
          model: resolveModel(da2Config.modelId),
          provider: resolveProvider(da2Config.provider),
          prompt: da2Prompt,
          temperature: Number(da2Config.temperature),
          maxTokens: da2Config.maxTokens,
          apiKey,
        },
        'DA-2'
      )
      da2Output = da2Response.output
      totalTokenIn += da2Response.tokenIn
      totalTokenOut += da2Response.tokenOut
      totalCostUsd += da2Response.costUsd
      await prisma.durationAnalysis.update({
        where: { id: analysisId },
        data: {
          da2Output: da2Output as any,
          totalTokenIn,
          totalTokenOut,
          totalCostUsd,
        },
      })
      emitEvent({
        type: 'agent_complete',
        agent_id: 'DA-2',
        data: { tokenIn: da2Response.tokenIn, tokenOut: da2Response.tokenOut, costUsd: da2Response.costUsd },
        timestamp: new Date().toISOString(),
      })

      // DA-2 gate check — the diagnosis must be present and well-formed.
      // A missing/malformed diagnosis is a hard failure (never fail-open on the gate).
      const symptomDiag = da2Output?.symptom_diagnosis
      if (!symptomDiag || typeof symptomDiag.found !== 'boolean') {
        throw new Error('DA-2 output missing a valid symptom_diagnosis')
      }
      if (symptomDiag.found === false) {
        await prisma.durationAnalysis.update({
          where: { id: analysisId },
          data: { status: 'symptom_unmatched', totalTokenIn, totalTokenOut, totalCostUsd },
        })
        emitEvent({
          type: 'symptom_gate',
          data: { da2Output, actions: ['override_continue', 'cancel'] },
          timestamp: new Date().toISOString(),
        })
        return // pipeline halts; user can override via POST /override
      }
    }

    // 7. Step 3: DA-3 Future Analyser
    await throwIfCancelled(analysisId)
    emitEvent({ type: 'agent_start', agent_id: 'DA-3', timestamp: new Date().toISOString() })
    const existingMessages = await prisma.durationMessage.findMany({
      where: { analysisId },
      orderBy: { createdAt: 'asc' },
    })
    const conversationHistory = existingMessages.map(m => ({ role: m.role, content: m.content }))
    const da3PromptTemplate = await readPromptFile('duration_da3_future_analyser.md')
    const da3Prompt = buildDA3Prompt(
      da3PromptTemplate,
      categoryData,
      da1Output,
      da2Output,
      userQuestion,
      conversationHistory,
      undefined, // no context summary on first run
      scoredSlices,
      peakStress,
      peakFavorable
    )
    const da3Response = await callAgentJson<DA3Output>(
      {
        model: resolveModel(da3Config.modelId),
        provider: resolveProvider(da3Config.provider),
        prompt: da3Prompt,
        temperature: Number(da3Config.temperature),
        maxTokens: da3Config.maxTokens,
        apiKey,
      },
      'DA-3'
    )
    const da3Output = da3Response.output
    totalTokenIn += da3Response.tokenIn
    totalTokenOut += da3Response.tokenOut
    totalCostUsd += da3Response.costUsd

    // Generate context summary (deterministic — no LLM)
    const contextSummary = buildContextSummary(da1Output, da3Output, scoredSlices)

    await prisma.durationAnalysis.update({
      where: { id: analysisId },
      data: {
        da3Output: da3Output as any,
        contextSummary,
        status: 'done',
        totalTokenIn,
        totalTokenOut,
        totalCostUsd,
      },
    })

    // Persist DA-3 answer as assistant message
    const answerText = typeof (da3Output as DA3Output).answer === 'string'
      ? (da3Output as DA3Output).answer
      : JSON.stringify(da3Output)
    await prisma.durationMessage.create({
      data: {
        analysisId,
        role: 'assistant',
        content: answerText,
        agentId: 'DA-3',
        tokenIn: da3Response.tokenIn,
        tokenOut: da3Response.tokenOut,
      },
    })

    emitEvent({
      type: 'agent_complete',
      agent_id: 'DA-3',
      data: { tokenIn: da3Response.tokenIn, tokenOut: da3Response.tokenOut, costUsd: da3Response.costUsd },
      timestamp: new Date().toISOString(),
    })
    emitEvent({
      type: 'run_complete',
      data: { totalTokenIn, totalTokenOut, totalCostUsd },
      timestamp: new Date().toISOString(),
    })

  } catch (error) {
    // Practitioner cancelled — status is already 'cancelled'; unwind quietly.
    if (error instanceof PipelineCancelledError) {
      console.log(`[executeDurationPipeline] ${error.message}`)
      return
    }

    // Unexpected failure — persist the message so the SSE route can surface it.
    const message = error instanceof Error ? error.message : String(error)
    await prisma.durationAnalysis.update({
      where: { id: analysisId },
      data: { status: 'failed', errorMessage: message },
    }).catch(() => {}) // ignore secondary failure

    emitEvent({
      type: 'agent_error',
      data: { error: message },
      timestamp: new Date().toISOString(),
    })
    throw error
  }
}

// ─── Resume After Symptom Gate ───────────────────────────────────────

/**
 * Resumes a halted (symptom_unmatched) pipeline by running DA-3 directly.
 * Sets overrideApplied = true and includes the DA-2 mismatch context in the prompt.
 *
 * @param analysisId - ID of the DurationAnalysis record to resume
 * @param emitEvent  - SSE event emission callback
 */
export async function resumeDurationPipeline(
  analysisId: string,
  emitEvent: (event: DurationSSEEvent) => void
): Promise<void> {
  // 1. Load the analysis record and validate it can be resumed
  const analysis = await prisma.durationAnalysis.findUniqueOrThrow({
    where: { id: analysisId },
  })

  if (analysis.status !== 'symptom_unmatched') {
    throw new Error(
      `Cannot resume analysis ${analysisId}: expected status "symptom_unmatched", got "${analysis.status}"`
    )
  }

  try {
    // 2. Set status = running, overrideApplied = true
    await prisma.durationAnalysis.update({
      where: { id: analysisId },
      data: { status: 'running', overrideApplied: true },
    })

    // 3. Load chart, model config, and existing messages
    const chart = await prisma.unifiedChart.findUniqueOrThrow({
      where: { id: analysis.unifiedChartId },
    })
    const da3Config = await prisma.modelConfig.findUniqueOrThrow({ where: { waveId: 'DA-3' } })

    const existingMessages = await prisma.durationMessage.findMany({
      where: { analysisId },
      orderBy: { createdAt: 'asc' },
    })
    const conversationHistory = existingMessages.map(m => ({ role: m.role, content: m.content }))

    // Reconstruct the DA-1 and DA-2 outputs from the stored record
    const da1Output = analysis.da1Output as unknown as DA1Output
    const da2Output = analysis.da2Output as unknown as DA2Output | null

    // Reconstruct category data
    const categoryData = extractCategoryData(
      {
        planets: chart.planets,
        nakshatras: chart.nakshatras,
        relationships: chart.relationships,
        shadbala: chart.shadbala,
        divisionalCharts: chart.divisionalCharts,
        jaimini: chart.jaimini,
        ashtakavarga: chart.ashtakavarga,
        dashaTree: chart.dashaTree,
      },
      analysis.category as import('@/lib/durationTypes').DurationCategory
    )

    // Reconstruct the period slice (needed for context summary)
    const periodSlice = (analysis.periodSlice as unknown as ScoredDashaSlice[]) ?? []

    // 4. Build DA-3 prompt with override preamble
    const da3PromptTemplate = await readPromptFile('duration_da3_future_analyser.md')
    const overridePreamble = da2Output?.symptom_diagnosis
      ? `[OVERRIDE NOTE] Symptom validation (DA-2) returned found=false with the following analysis: "${da2Output.symptom_diagnosis.analysis}". The practitioner has chosen to proceed despite the mismatch. Incorporate this awareness into your forecast — note limitations but provide the requested analysis.\n\n`
      : '[OVERRIDE NOTE] Symptom validation gate was bypassed by practitioner override. Provide the requested analysis.\n\n'

    const da3Prompt =
      overridePreamble +
      buildDA3Prompt(
        da3PromptTemplate,
        categoryData,
        da1Output,
        da2Output,
        analysis.userQuestion ?? undefined,
        conversationHistory,
        undefined // no context summary on first DA-3 call
      )

    // 5. Call DA-3 (lenient parse + one retry; throws after retry fails)
    await throwIfCancelled(analysisId)
    emitEvent({ type: 'agent_start', agent_id: 'DA-3', timestamp: new Date().toISOString() })
    // Resume reuses the run's persisted provider/model selection (not a secret).
    // The API key was never persisted, so resume falls back to the env key.
    const da3Response = await callAgentJson<DA3Output>(
      {
        model: analysis.overrideModel ?? da3Config.modelId,
        provider: (analysis.overrideProvider ?? da3Config.provider) as 'anthropic' | 'openai' | 'google',
        prompt: da3Prompt,
        temperature: Number(da3Config.temperature),
        maxTokens: da3Config.maxTokens,
      },
      'DA-3'
    )
    const da3Output = da3Response.output

    // Accumulate token totals (add to existing totals from DA-1 and DA-2)
    const totalTokenIn = analysis.totalTokenIn + da3Response.tokenIn
    const totalTokenOut = analysis.totalTokenOut + da3Response.tokenOut
    const totalCostUsd = Number(analysis.totalCostUsd) + da3Response.costUsd

    // Generate context summary
    const contextSummary = buildContextSummary(da1Output, da3Output, periodSlice)

    // Persist DA-3 output and mark done
    await prisma.durationAnalysis.update({
      where: { id: analysisId },
      data: {
        da3Output: da3Output as any,
        contextSummary,
        status: 'done',
        totalTokenIn,
        totalTokenOut,
        totalCostUsd,
      },
    })

    // Persist DA-3 answer as assistant message
    const answerText = typeof (da3Output as DA3Output).answer === 'string'
      ? (da3Output as DA3Output).answer
      : JSON.stringify(da3Output)
    await prisma.durationMessage.create({
      data: {
        analysisId,
        role: 'assistant',
        content: answerText,
        agentId: 'DA-3',
        tokenIn: da3Response.tokenIn,
        tokenOut: da3Response.tokenOut,
      },
    })

    // 7. Emit agent_complete + run_complete
    emitEvent({
      type: 'agent_complete',
      agent_id: 'DA-3',
      data: { tokenIn: da3Response.tokenIn, tokenOut: da3Response.tokenOut, costUsd: da3Response.costUsd },
      timestamp: new Date().toISOString(),
    })
    emitEvent({
      type: 'run_complete',
      data: { totalTokenIn, totalTokenOut, totalCostUsd },
      timestamp: new Date().toISOString(),
    })

  } catch (error) {
    // Practitioner cancelled — status is already 'cancelled'; unwind quietly.
    if (error instanceof PipelineCancelledError) {
      console.log(`[resumeDurationPipeline] ${error.message}`)
      return
    }

    // Unexpected failure during resume — persist the message for the SSE route.
    const message = error instanceof Error ? error.message : String(error)
    await prisma.durationAnalysis.update({
      where: { id: analysisId },
      data: { status: 'failed', errorMessage: message },
    }).catch(() => {}) // ignore secondary failure

    emitEvent({
      type: 'agent_error',
      data: { error: message },
      timestamp: new Date().toISOString(),
    })
    throw error
  }
}

// ─── Prompt Builders ────────────────────────────────────────────────

/**
 * Assembles the DA-1 Domain Analyser prompt as { cachedPrefix, prompt }.
 *
 * The period table now includes engine score/intensity/favorable for each period —
 * DA-1 reads these as authoritative and must narrate them, not override them.
 *
 * cachedPrefix = the chart-data section — byte-identical across every batch
 * of a run, so Anthropic prompt caching pays for it once and reads it from
 * cache for batches 2..N. prompt = the per-batch volatile part (notes,
 * period table, transit overlay, question, instructions).
 */
function buildDA1Prompt(
  template: string,
  categoryData: CategoryChartData,
  periodSlice: ScoredDashaSlice[],
  transitOverlay: TransitOverlay[],
  userQuestion?: string,
  truncated = false,
  batch?: { index: number; count: number }
): { cachedPrefix: string; prompt: string } {
  const { dashaTree: _omitted, ...chartForPrompt } = categoryData
  // Compact JSON (no indent) — lossless, but ~20-40% fewer input tokens than
  // pretty-printed. Models parse minified JSON identically.
  const cachedPrefix = ['--- CHART DATA ---', JSON.stringify(chartForPrompt), '', ''].join('\n')

  const parts: string[] = []
  if (truncated) {
    parts.push(
      'NOTE: The period table was truncated to the first 200 periods. This analysis covers a PARTIAL window — say so in overall_trend.'
    )
    parts.push('')
  }
  if (batch && batch.count > 1) {
    parts.push(
      `NOTE: This is batch ${batch.index} of ${batch.count} covering a chronological subset of the full window. ` +
        'Analyse ONLY the periods provided below. Your overall_trend and peak periods refer to THIS batch only — they will be merged with the other batches.'
    )
    parts.push('')
  }
  parts.push('--- PERIOD TABLE ---')
  parts.push(JSON.stringify(periodSlice))
  parts.push('')
  parts.push('--- TRANSIT OVERLAY ---')
  parts.push(JSON.stringify(transitOverlay))
  if (userQuestion) {
    parts.push('')
    parts.push('--- USER QUESTION ---')
    parts.push(userQuestion)
  }
  parts.push('')
  parts.push('--- AGENT INSTRUCTIONS ---')
  parts.push(template)
  return { cachedPrefix, prompt: parts.join('\n') }
}

/**
 * Assembles the DA-2 Symptom Validator prompt.
 * Injects: chart data → DA-1 analysis → symptoms → agent instructions.
 */
function buildDA2Prompt(
  template: string,
  categoryData: CategoryChartData,
  da1Output: DA1Output,
  symptoms: string
): string {
  const parts: string[] = []
  parts.push('--- CHART DATA ---')
  parts.push(JSON.stringify(categoryData))
  parts.push('')
  parts.push('--- DA-1 ANALYSIS ---')
  parts.push(JSON.stringify(da1Output))
  parts.push('')
  parts.push('--- SYMPTOMS ---')
  parts.push(symptoms)
  parts.push('')
  parts.push('--- AGENT INSTRUCTIONS ---')
  parts.push(template)
  return parts.join('\n')
}

/**
 * Assembles the DA-3 Future Analyser prompt.
 * Injects: chart data → DA-1 (or context summary for deep conversations) →
 *          DA-2 (if present) → ENGINE VERDICTS (scored periods + peaks, authoritative) →
 *          conversation history → user question → agent instructions.
 *
 * Token optimisation: after 2+ turns, substitutes the full DA-1 output with a
 * compact context summary to keep the prompt within the token budget.
 */
function buildDA3Prompt(
  template: string,
  categoryData: CategoryChartData,
  da1Output: DA1Output,
  da2Output: DA2Output | null,
  userQuestion: string | undefined,
  conversationHistory: Array<{ role: string; content: string }>,
  contextSummary?: string,
  scoredSlices?: ScoredDashaSlice[],
  peakStress?: PeakPeriod[],
  peakFavorable?: PeakPeriod[]
): string {
  const parts: string[] = []
  parts.push('--- CHART DATA ---')
  parts.push(JSON.stringify(categoryData))
  parts.push('')
  // Use context summary for history depth > 2, otherwise full DA-1 output
  if (contextSummary && conversationHistory.length > 2) {
    parts.push('--- CONTEXT SUMMARY ---')
    parts.push(contextSummary)
  } else {
    parts.push('--- DA-1 ANALYSIS ---')
    parts.push(JSON.stringify(da1Output))
  }
  if (da2Output) {
    parts.push('')
    parts.push('--- DA-2 VALIDATION ---')
    parts.push(JSON.stringify(da2Output))
  }

  // Inject engine verdicts as authoritative context (task 6.3)
  if (scoredSlices && scoredSlices.length > 0) {
    parts.push('')
    parts.push('--- ENGINE VERDICTS (AUTHORITATIVE — DO NOT REVERSE) ---')
    parts.push('These score/intensity/favorable values were computed deterministically.')
    parts.push('Your forecast MUST remain consistent with them. You may add nuance but must not flip direction.')
    parts.push('')
    // Compact one-line summary per AD (not per PD — reduces tokens)
    const adSeen = new Set<string>()
    const adRows: string[] = []
    for (const s of scoredSlices) {
      const adKey = `${s.md.lord}/${s.ad.lord}`
      if (adSeen.has(adKey)) continue
      adSeen.add(adKey)
      const topFactor = s.scoreBreakdown.factors
        .sort((a, b) => b.contribution - a.contribution)[0]?.factor ?? ''
      adRows.push(
        `${s.md.lord} MD / ${s.ad.lord} AD: score=${s.score} intensity=${s.intensity} favorable=${s.favorable}` +
        (topFactor ? ` topFactor=${topFactor}` : '')
      )
    }
    parts.push(adRows.join('\n'))
  }
  if (peakStress && peakFavorable) {
    parts.push('')
    parts.push('--- ENGINE PEAKS (AUTHORITATIVE) ---')
    if (peakStress.length > 0) {
      parts.push('Peak stress periods:')
      for (const p of peakStress) {
        parts.push(`  ${p.label} — score ${p.score}, top factors: ${p.topFactors.map(f => f.factor).join(', ')}`)
      }
    }
    if (peakFavorable.length > 0) {
      parts.push('Peak favorable periods:')
      for (const p of peakFavorable) {
        parts.push(`  ${p.label} — score ${p.score}, top factors: ${p.topFactors.map(f => f.factor).join(', ')}`)
      }
    }
  }

  if (conversationHistory.length > 0) {
    parts.push('')
    parts.push('--- CONVERSATION HISTORY ---')
    for (const msg of conversationHistory) {
      parts.push(`${msg.role === 'user' ? 'Practitioner' : 'Assistant'}: ${msg.content}`)
    }
  }
  if (userQuestion) {
    parts.push('')
    parts.push('--- USER QUESTION ---')
    parts.push(userQuestion)
  }
  parts.push('')
  parts.push('--- AGENT INSTRUCTIONS ---')
  parts.push(template)
  return parts.join('\n')
}

/**
 * Generates a compact context summary (~500 tokens) of the analysis findings.
 * Used for efficient follow-up prompting after 2+ conversation turns.
 *
 * Deterministic — no LLM involved.
 */
function buildContextSummary(
  da1Output: DA1Output,
  da3Output: DA3Output,
  periodSlice: ScoredDashaSlice[]
): string {
  const lines: string[] = []
  lines.push(`=== DURATION ANALYSIS SUMMARY ===`)
  lines.push(`Category: ${da1Output.category}`)
  lines.push(`Date range: ${da1Output.date_range.from} to ${da1Output.date_range.to}`)
  lines.push(`Overall trend: ${da1Output.overall_trend}`)
  lines.push('')
  lines.push('Peak stress periods:')
  for (const p of da1Output.peak_stress_periods ?? []) {
    lines.push(`  ${p.period}: ${p.reason}`)
  }
  lines.push('Peak favorable periods:')
  for (const p of da1Output.peak_favorable_periods ?? []) {
    lines.push(`  ${p.period}: ${p.reason}`)
  }
  lines.push('')
  lines.push('DA-3 summary: ' + ((da3Output as DA3Output).summary ?? ''))
  lines.push(`Total periods analysed: ${periodSlice.length}`)
  lines.push('=== END SUMMARY ===')
  return lines.join('\n')
}
