/**
 * engine/orchestrator.ts — Pipeline execution orchestrator.
 *
 * The heart of the pipeline. Manages:
 * - Parallel fan-out within waves
 * - Sequential execution across waves
 * - DB persistence of wave outputs
 * - SSE event emission
 * - Critical error halt gate (between 4A and 4B)
 * - Token/cost accumulation
 */

import { prisma } from '@/lib/db'
import { PipelineHaltError } from '@/lib/errors'
import type {
  AgentId,
  ChartInputV1,
  DashaTree,
  ErrorDetectionResult,
  ExecutionPlan,
  PreAnalysisAlert,
  SSEEvent,
} from '@/lib/types'
import { AGENT_CATALOGUE } from './constants'
import { callLLM, readPromptFile } from './llm'

// ─── Compute Engine Preamble ────────────────────────────────────────
// Injected before wave1Delta when data comes from the deterministic compute engine
// rather than LLM Wave 1 agents. Instructs Wave 2+ agents on how to read the format.

const COMPUTE_ENGINE_PREAMBLE = `
NOTE: This Wave 1 data comes from the DETERMINISTIC COMPUTE ENGINE (Swiss Ephemeris),
not from LLM extraction agents. The data is structured differently but is MORE ACCURATE
than LLM-extracted output. Here is how to read it:

- "1A" contains: planets[] (PlanetPosition with longitude, sign, signNumber, house, degreeInSign, retrograde, speed),
  nakshatras[] (NakshatraInfo with planet, nakshatra, pada, nakshatraLord, subLord),
  divisionalCharts[] (DivisionalChart with division, lagna, lagnaSignNumber, planets[], arudhaPadas[], specialLagnas[]),
  karakas[] (CharaKaraka with planet, karaka, karakaAbbr, degreeInSign),
  specialLagnas[], upagrahas[], arudhaPadas[].

- "1B" contains: nakshatras[] — same NakshatraInfo array with nakshatra, pada, nakshatraLord, subLord per planet.

- "1C" contains: shadbala (ShadbalResult with planets[] containing totalVirupas, requiredRupas, strengthRatio, grade,
  ishtaPhala, kashtaPhala, components {sthana, dig, kaala, cheshta, naisargika, drik}),
  bhavaBala (BhavaBalaResult with houses[]), pindaStrength[].

- "1D" contains: relationships (RelationshipGeometry with conjunctions[], aspects[], rashiAspects[],
  grahaYuddha[], mutualReception[], stelliums[], combustion[], avastha[], gandanta[], sandhi[],
  upagrahaPlacements[], houseLords{}),
  jaimini (JaiminiGeometry with argala[], virodhaArgala[], yogiPoint, avayogiPoint),
  ashtakavarga (AshtakavargaResult with bav{}, sav[], savTotal).

USE THESE FIELDS DIRECTLY. Do NOT re-derive conjunctions, aspects, or exchanges — the "1D" relationships
object is the single source of truth. Planet positions in "1A" use numeric degrees (longitude 0–360,
degreeInSign 0–30) — convert as needed for your analysis.
`.trim()
import { getRelevantWave2ForWave3 } from './waves/wave2'

// ─── Types ──────────────────────────────────────────────────────────

export interface OrchestratorInput {
  runId: string
  chartId: string
  chart: ChartInputV1
  chartSummary: string
  alerts: PreAnalysisAlert[]
  dashaTree: DashaTree
  executionPlan: ExecutionPlan
  wave1Delta: Record<string, unknown> | null
  /** Whether wave1Delta came from the compute engine or LLM agents. */
  wave1Source?: 'compute' | 'llm'
  /** Callback for SSE event emission. */
  emitEvent: (event: SSEEvent) => void
}

interface AgentContext {
  chartSummary: string
  alerts: PreAnalysisAlert[]
  wave1Delta: Record<string, unknown> | null
  /** Whether wave1Delta came from the compute engine ("compute") or LLM agents ("llm"). */
  wave1Source: 'compute' | 'llm'
  wave2Deltas: Record<string, unknown>
  wave3Deltas: Record<string, unknown>
  factSummary: string | null
  agent4AOutput: Record<string, unknown> | null
  agent4BOutput: Record<string, unknown> | null
}

// ─── Main Orchestrator ──────────────────────────────────────────────

/**
 * Executes the full pipeline for a given run.
 *
 * Manages wave execution order, context assembly, DB writes, and SSE.
 * Throws PipelineHaltError if 4A detects critical errors.
 */
export async function executePipeline(input: OrchestratorInput): Promise<void> {
  const { runId, executionPlan, emitEvent } = input

  // Update run status to 'running'
  await prisma.pipelineRun.update({
    where: { id: runId },
    data: { status: 'running' },
  })

  const context: AgentContext = {
    chartSummary: input.chartSummary,
    alerts: input.alerts,
    wave1Delta: input.wave1Delta,
    wave1Source: input.wave1Source ?? 'llm',
    wave2Deltas: {},
    wave3Deltas: {},
    factSummary: null,
    agent4AOutput: null,
    agent4BOutput: null,
  }

  try {
    // Group agents by wave
    const wave1Agents = executionPlan.agents.filter((a) => a.startsWith('1'))
    const wave2Agents = executionPlan.agents.filter((a) => a.startsWith('2'))
    const wave3Agents = executionPlan.agents.filter((a) => a.startsWith('3'))
    const wave4Agents = executionPlan.agents.filter((a) => a.startsWith('4'))
    const hasVerification = executionPlan.agents.includes('verification')

    // ─── Wave 1 (parallel) ────────────────────────────────────────
    if (wave1Agents.length > 0) {
      const results = await executeWaveParallel(wave1Agents, context, runId, emitEvent)
      // Store combined wave1 delta
      const combinedDelta: Record<string, unknown> = {}
      for (const [agentId, output] of Object.entries(results)) {
        combinedDelta[agentId] = output
      }
      context.wave1Delta = combinedDelta

      // Cache Wave 1 results
      await cacheWave1(input.chart, input.chartSummary, combinedDelta, input.dashaTree)
    }

    // ─── Wave 2 (parallel) ────────────────────────────────────────
    if (wave2Agents.length > 0) {
      const results = await executeWaveParallel(wave2Agents, context, runId, emitEvent)
      context.wave2Deltas = results
    }

    // ─── Wave 3 (parallel) ────────────────────────────────────────
    if (wave3Agents.length > 0) {
      const results = await executeWaveParallel(wave3Agents, context, runId, emitEvent)
      context.wave3Deltas = results
    }

    // ─── Wave 4 (sequential) ──────────────────────────────────────
    for (const agentId of wave4Agents) {
      await executeAgent(agentId, context, runId, emitEvent)

      // After 4X: store fact_summary in context
      if (agentId === '4X') {
        const output = await getLatestOutput(runId, '4X')
        context.factSummary = output?.factSummary ?? null
        if (!context.factSummary || context.factSummary.trim().length === 0) {
          throw new Error(
            'Agent 4X returned empty fact_summary. Cannot proceed to 4A/4C without consolidated findings.'
          )
        }
      }

      // After 4A: HALT GATE — check for critical errors
      if (agentId === '4A') {
        const output = await getLatestOutput(runId, '4A')
        context.agent4AOutput = output?.outputJson as Record<string, unknown> | null

        const errorResult = context.agent4AOutput as unknown as ErrorDetectionResult | null
        if (errorResult && errorResult.critical_errors > 0) {
          // HALT — critical errors detected
          const criticalErrors = errorResult.errors_found.filter(
            (e) => e.severity === 'critical'
          )

          await prisma.pipelineRun.update({
            where: { id: runId },
            data: {
              status: 'halted_for_review',
              haltReason: criticalErrors,
            },
          })

          emitEvent({
            type: 'critical_error',
            agent_id: '4A',
            wave_number: 4,
            data: {
              errors: criticalErrors,
              actions: ['override_continue', 'rerun_from_wave', 'cancel'],
            },
            timestamp: new Date().toISOString(),
          })

          throw new PipelineHaltError(
            `Pipeline halted: ${criticalErrors.length} critical error(s) detected`,
            criticalErrors.map((e) => ({
              check: e.check,
              description: e.description,
              location: e.location,
              severity: 'critical' as const,
              affectsWaves: e.affects_waves,
              correctionSuggestion: e.correction_suggestion,
            }))
          )
        }
      }

      // After 4B: store validation output
      if (agentId === '4B') {
        const output = await getLatestOutput(runId, '4B')
        context.agent4BOutput = output?.outputJson as Record<string, unknown> | null
      }
    }

    // ─── Verification Agent (follow-ups only) ─────────────────────
    if (hasVerification) {
      await executeAgent('verification', context, runId, emitEvent)
    }

    // ─── Complete ─────────────────────────────────────────────────
    // Accumulate total tokens and cost
    const totals = await prisma.waveOutput.aggregate({
      where: { runId },
      _sum: { tokenIn: true, tokenOut: true, costUsd: true },
    })

    await prisma.pipelineRun.update({
      where: { id: runId },
      data: {
        status: 'done',
        totalTokenIn: totals._sum.tokenIn ?? 0,
        totalTokenOut: totals._sum.tokenOut ?? 0,
        totalCostUsd: totals._sum.costUsd ?? 0,
        completedAt: new Date(),
      },
    })

    emitEvent({
      type: 'run_complete',
      data: {
        totalTokenIn: totals._sum.tokenIn ?? 0,
        totalTokenOut: totals._sum.tokenOut ?? 0,
        totalCostUsd: Number(totals._sum.costUsd ?? 0),
      },
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    if (error instanceof PipelineHaltError) {
      // Already handled above — status set to halted_for_review
      throw error
    }

    // Unexpected failure
    await prisma.pipelineRun.update({
      where: { id: runId },
      data: {
        status: 'failed',
        completedAt: new Date(),
      },
    })

    emitEvent({
      type: 'agent_error',
      data: { error: error instanceof Error ? error.message : String(error) },
      timestamp: new Date().toISOString(),
    })

    throw error
  }
}

// ─── Wave Execution ─────────────────────────────────────────────────

/**
 * Executes multiple agents in parallel within a single wave.
 * Returns a map of agentId → parsed output JSON.
 */
async function executeWaveParallel(
  agents: AgentId[],
  context: AgentContext,
  runId: string,
  emitEvent: (event: SSEEvent) => void
): Promise<Record<string, unknown>> {
  const results: Record<string, unknown> = {}

  const promises = agents.map(async (agentId) => {
    const output = await executeAgent(agentId, context, runId, emitEvent)
    results[agentId] = output
  })

  await Promise.all(promises)
  return results
}

/**
 * Executes a single agent: reads prompt, assembles context, calls LLM, persists output.
 */
async function executeAgent(
  agentId: AgentId,
  context: AgentContext,
  runId: string,
  emitEvent: (event: SSEEvent) => void
): Promise<Record<string, unknown> | null> {
  const agentMeta = AGENT_CATALOGUE.find((a) => a.id === agentId)
  if (!agentMeta) {
    throw new Error(`Unknown agent: ${agentId}`)
  }

  const waveNumber = agentMeta.wave

  // Emit start event
  emitEvent({
    type: 'agent_start',
    agent_id: agentId,
    wave_number: waveNumber,
    timestamp: new Date().toISOString(),
  })

  // Create WaveOutput record (status: running)
  const startedAt = new Date()
  await prisma.waveOutput.create({
    data: {
      runId,
      agentId,
      waveNumber,
      domain: agentMeta.domain,
      promptVersion: 'v1.0',
      modelId: 'pending',
      provider: 'pending',
      status: 'running',
      startedAt,
    },
  })

  try {
    // Get model config for this agent
    const modelConfig = await prisma.modelConfig.findUnique({
      where: { waveId: agentId },
    })

    if (!modelConfig) {
      throw new Error(`No model config found for agent ${agentId}`)
    }

    // Read prompt file
    const promptTemplate = await readPromptFile(agentMeta.promptFile)

    // Assemble context for this agent
    const fullPrompt = assemblePrompt(agentId, promptTemplate, context)

    // Call LLM
    const response = await callLLM({
      model: modelConfig.modelId,
      provider: modelConfig.provider as 'anthropic' | 'openai' | 'google',
      prompt: fullPrompt,
      temperature: Number(modelConfig.temperature),
      maxTokens: modelConfig.maxTokens,
    })

    // Parse output as JSON (agents are instructed to return structured JSON)
    let outputJson: Record<string, unknown> | null = null
    try {
      outputJson = JSON.parse(response.content)
    } catch {
      // If not valid JSON, store raw content as a wrapped object
      outputJson = { raw_content: response.content }
    }

    // Update WaveOutput with results
    await prisma.waveOutput.update({
      where: { runId_agentId: { runId, agentId } },
      data: {
        outputJson: outputJson as any,
        factSummary: agentId === '4X' ? response.content : null,
        modelId: modelConfig.modelId,
        provider: modelConfig.provider,
        tokenIn: response.tokenIn,
        tokenOut: response.tokenOut,
        costUsd: response.costUsd,
        status: 'done',
        completedAt: new Date(),
      },
    })

    // Emit completion event
    emitEvent({
      type: 'agent_complete',
      agent_id: agentId,
      wave_number: waveNumber,
      data: {
        tokenIn: response.tokenIn,
        tokenOut: response.tokenOut,
        costUsd: response.costUsd,
      },
      timestamp: new Date().toISOString(),
    })

    emitEvent({
      type: 'token_count',
      agent_id: agentId,
      data: { tokenIn: response.tokenIn, tokenOut: response.tokenOut },
      timestamp: new Date().toISOString(),
    })

    return outputJson
  } catch (error) {
    // Mark agent as failed
    await prisma.waveOutput.update({
      where: { runId_agentId: { runId, agentId } },
      data: {
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : String(error),
        completedAt: new Date(),
      },
    })

    emitEvent({
      type: 'agent_error',
      agent_id: agentId,
      wave_number: waveNumber,
      data: { error: error instanceof Error ? error.message : String(error) },
      timestamp: new Date().toISOString(),
    })

    throw error
  }
}

// ─── Context Assembly ───────────────────────────────────────────────

/**
 * Assembles the full prompt for an agent based on its wave and the accumulated context.
 * Implements the token optimization strategy from the HLD.
 */
function assemblePrompt(
  agentId: AgentId,
  promptTemplate: string,
  context: AgentContext
): string {
  const parts: string[] = []

  // All agents get chart_summary
  parts.push(context.chartSummary)
  parts.push('')

  // Pre-analysis alerts (compact format)
  if (context.alerts.length > 0) {
    parts.push('--- PRE-ANALYSIS ALERTS ---')
    for (const alert of context.alerts) {
      parts.push(`[${alert.severity.toUpperCase()}] Rule ${alert.rule_id}: ${alert.message}`)
    }
    parts.push('')
  }

  // Wave-specific context injection
  if (agentId.startsWith('1')) {
    // Wave 1: chart_summary + alerts only (already added above)
  } else if (agentId.startsWith('2')) {
    // Wave 2: + wave1_delta
    if (context.wave1Delta) {
      if (context.wave1Source === 'compute') {
        parts.push('--- WAVE 1 FOUNDATION OUTPUT (from Compute Engine) ---')
        parts.push(COMPUTE_ENGINE_PREAMBLE)
      } else {
        parts.push('--- WAVE 1 FOUNDATION OUTPUT ---')
      }
      parts.push(JSON.stringify(context.wave1Delta, null, 1))
      parts.push('')
    }
  } else if (agentId.startsWith('3')) {
    // Wave 3: + wave1_delta + relevant wave2 deltas (domain-scoped)
    if (context.wave1Delta) {
      if (context.wave1Source === 'compute') {
        parts.push('--- WAVE 1 FOUNDATION OUTPUT (from Compute Engine) ---')
        parts.push(COMPUTE_ENGINE_PREAMBLE)
      } else {
        parts.push('--- WAVE 1 FOUNDATION OUTPUT ---')
      }
      parts.push(JSON.stringify(context.wave1Delta, null, 1))
      parts.push('')
    }
    if (Object.keys(context.wave2Deltas).length > 0) {
      const relevantAgents = getRelevantWave2ForWave3(agentId)
      const relevantDeltas: Record<string, unknown> = {}
      for (const relevantId of relevantAgents) {
        if (context.wave2Deltas[relevantId]) {
          relevantDeltas[relevantId] = context.wave2Deltas[relevantId]
        }
      }
      if (Object.keys(relevantDeltas).length > 0) {
        parts.push('--- WAVE 2 DOMAIN OUTPUTS ---')
        parts.push(JSON.stringify(relevantDeltas, null, 1))
        parts.push('')
      }
    }
  } else if (agentId === '4X') {
    // 4X Consolidation: chart_summary + all wave2/3 deltas
    if (Object.keys(context.wave2Deltas).length > 0) {
      parts.push('--- WAVE 2 OUTPUTS ---')
      parts.push(JSON.stringify(context.wave2Deltas, null, 1))
      parts.push('')
    }
    if (Object.keys(context.wave3Deltas).length > 0) {
      parts.push('--- WAVE 3 OUTPUTS ---')
      parts.push(JSON.stringify(context.wave3Deltas, null, 1))
      parts.push('')
    }
  } else if (agentId === '4A' || agentId === '4B') {
    // 4A, 4B: chart_summary + fact_summary
    if (context.factSummary) {
      parts.push('--- FACT SUMMARY (from 4X) ---')
      parts.push(context.factSummary)
      parts.push('')
    }
    if (agentId === '4B' && context.agent4AOutput) {
      parts.push('--- ERROR DETECTION OUTPUT (from 4A) ---')
      parts.push(JSON.stringify(context.agent4AOutput, null, 1))
      parts.push('')
    }
  } else if (agentId === '4C') {
    // 4C Synthesis (Opus): chart_summary + fact_summary + 4A + 4B
    if (context.factSummary) {
      parts.push('--- FACT SUMMARY ---')
      parts.push(context.factSummary)
      parts.push('')
    }
    if (context.agent4AOutput) {
      parts.push('--- ERROR DETECTION (4A) ---')
      parts.push(JSON.stringify(context.agent4AOutput, null, 1))
      parts.push('')
    }
    if (context.agent4BOutput) {
      parts.push('--- VALIDATION (4B) ---')
      parts.push(JSON.stringify(context.agent4BOutput, null, 1))
      parts.push('')
    }
  } else if (agentId === 'verification') {
    // Verification: fact_summary + prior context
    if (context.factSummary) {
      parts.push('--- FACT SUMMARY ---')
      parts.push(context.factSummary)
      parts.push('')
    }
  }

  // Append the agent's prompt template last
  parts.push('--- AGENT INSTRUCTIONS ---')
  parts.push(promptTemplate)

  return parts.join('\n')
}

// ─── Helper Functions ───────────────────────────────────────────────

/** Fetch latest output for a given agent in a run. */
async function getLatestOutput(runId: string, agentId: string) {
  return prisma.waveOutput.findUnique({
    where: { runId_agentId: { runId, agentId } },
  })
}

/** Cache Wave 1 results in Wave1Cache. */
async function cacheWave1(
  chart: ChartInputV1,
  chartSummary: string,
  wave1Delta: Record<string, unknown>,
  dashaTree: DashaTree
): Promise<void> {
  const crypto = await import('crypto')
  const chartHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(chart))
    .digest('hex')

  await prisma.wave1Cache.upsert({
    where: { chartHash },
    update: {
      chartSummary,
      wave1Delta: wave1Delta as any,
      dashaTree: dashaTree as any,
      updatedAt: new Date(),
    },
    create: {
      chartHash,
      chartSummary,
      wave1Delta: wave1Delta as any,
      dashaTree: dashaTree as any,
    },
  })
}

// ─── Resume After Halt ──────────────────────────────────────────────

/**
 * Resumes a halted pipeline from 4B onward (override & continue).
 * Sets override_applied = true on the run.
 */
export async function resumeFromHalt(
  runId: string,
  emitEvent: (event: SSEEvent) => void
): Promise<void> {
  // Mark override
  await prisma.pipelineRun.update({
    where: { id: runId },
    data: {
      status: 'running',
      overrideApplied: true,
    },
  })

  // Reconstruct context from stored outputs
  const outputs = await prisma.waveOutput.findMany({
    where: { runId },
    orderBy: { startedAt: 'asc' },
  })

  const run = await prisma.pipelineRun.findUniqueOrThrow({
    where: { id: runId },
    include: { chart: true },
  })

  const cache = await prisma.wave1Cache.findUnique({
    where: { chartHash: run.chart.chartHash },
  })

  const context: AgentContext = {
    chartSummary: cache?.chartSummary ?? '',
    alerts: [],
    wave1Delta: cache?.wave1Delta as Record<string, unknown> | null,
    wave1Source: 'llm',
    wave2Deltas: {},
    wave3Deltas: {},
    factSummary: null,
    agent4AOutput: null,
    agent4BOutput: null,
  }

  // Reconstruct from outputs
  for (const output of outputs) {
    if (output.agentId.startsWith('2')) {
      context.wave2Deltas[output.agentId] = output.outputJson
    } else if (output.agentId.startsWith('3')) {
      context.wave3Deltas[output.agentId] = output.outputJson
    } else if (output.agentId === '4X') {
      context.factSummary = output.factSummary
    } else if (output.agentId === '4A') {
      context.agent4AOutput = output.outputJson as Record<string, unknown> | null
    }
  }

  // Execute 4B and 4C
  await executeAgent('4B', context, runId, emitEvent)
  const output4B = await getLatestOutput(runId, '4B')
  context.agent4BOutput = output4B?.outputJson as Record<string, unknown> | null

  await executeAgent('4C', context, runId, emitEvent)

  // Update run totals
  const totals = await prisma.waveOutput.aggregate({
    where: { runId },
    _sum: { tokenIn: true, tokenOut: true, costUsd: true },
  })

  await prisma.pipelineRun.update({
    where: { id: runId },
    data: {
      status: 'done',
      totalTokenIn: totals._sum.tokenIn ?? 0,
      totalTokenOut: totals._sum.tokenOut ?? 0,
      totalCostUsd: totals._sum.costUsd ?? 0,
      completedAt: new Date(),
    },
  })

  emitEvent({
    type: 'run_complete',
    data: { overrideApplied: true },
    timestamp: new Date().toISOString(),
  })
}
