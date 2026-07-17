/**
 * engine/durationAnalysis/foundation.ts — Foundation sub-agent stage (Track 2).
 *
 * A small set of cheap, natal-static "facet reader" LLM agents (planets, nakshatra,
 * upagraha, BAV) that run ONCE per (chart, domain) BEFORE DA-1. They read the natal
 * chart through a single lens and emit a compact { summary, key_findings } block that
 * is injected as authoritative structural context into DA-1 and DA-3 — mirroring the
 * Wave-1 → Wave-2 foundation pattern.
 *
 * Design notes:
 *  - Which agents run per domain is deterministic (registry.foundationAgents) — no LLM planner.
 *  - An agent whose required chart facet is absent (paste-path charts) is SKIPPED, not failed.
 *  - A single agent failing (bad JSON, model error) is swallowed — foundation is enrichment,
 *    never a hard dependency of the paid pipeline.
 *  - Agents run in parallel; the whole stage is (chart × domain)-scoped, so a future
 *    optimization can cache it per chart. No caching in v1.
 */

import { readPromptFile } from '@/engine/llm'
import { callAgentJson } from './agentJson'
import { getFoundationAgentSpec } from './registry'
import type { FoundationRequires } from './registry'
import type {
  FoundationAgentId,
  FoundationOutput,
  FoundationAgentOutput,
  DurationCategory,
} from '@/lib/durationTypes'

/** Raw natal facets the foundation agents read (assembled by the orchestrator). */
export interface FoundationChartInputs {
  planets: unknown
  divisionalCharts: unknown
  nakshatras: unknown
  nakshatraRelationships: unknown
  upagrahas: unknown
  ashtakavarga: unknown
  lagnaSignNumber: number
}

export interface FoundationStageResult {
  foundationOutput: FoundationOutput
  tokenIn: number
  tokenOut: number
  costUsd: number
}

type ModelResolvers = {
  resolveModel: (cfgModel: string) => string
  resolveProvider: (cfgProvider: string) => 'anthropic' | 'openai' | 'google'
  apiKey?: string
}

function isNonEmptyArray(v: unknown): boolean {
  return Array.isArray(v) && v.length > 0
}

function hasBav(ashtakavarga: unknown): boolean {
  const bav = (ashtakavarga as { bav?: unknown } | null | undefined)?.bav
  return !!bav && typeof bav === 'object' && Object.keys(bav as object).length > 0
}

/**
 * Presence check for a chart facet — driven by the registry's `requires` field
 * (FOUNDATION_AGENT_CATALOGUE), so the facet an agent needs is declared in ONE place.
 */
function facetPresent(requires: FoundationRequires, inputs: FoundationChartInputs): boolean {
  switch (requires) {
    case 'planets':    return isNonEmptyArray(inputs.planets)
    case 'nakshatras': return isNonEmptyArray(inputs.nakshatras)
    case 'upagrahas':  return isNonEmptyArray(inputs.upagrahas)
    case 'bav':        return hasBav(inputs.ashtakavarga)
    default:           return false
  }
}

/** The facet-specific data payload one foundation agent receives in its prompt. */
function facetData(id: FoundationAgentId, inputs: FoundationChartInputs): unknown {
  switch (id) {
    case 'FOUND-PLANETS':
      return {
        planets: inputs.planets,
        divisionalCharts: inputs.divisionalCharts,
        lagnaSignNumber: inputs.lagnaSignNumber,
      }
    case 'FOUND-NAKSHATRA':
      return { nakshatras: inputs.nakshatras, nakshatraRelationships: inputs.nakshatraRelationships }
    case 'FOUND-UPAGRAHA':
      return { upagrahas: inputs.upagrahas }
    case 'FOUND-BAV':
      return { ashtakavarga: inputs.ashtakavarga, lagnaSignNumber: inputs.lagnaSignNumber }
    default:
      return {}
  }
}

/**
 * Deterministic planner: from the domain's declared foundation agents, return only
 * those whose required chart facet (registry `requires`) is present — paste-path
 * charts skip the rest. Pure — no LLM, no I/O — so it is unit-testable.
 */
export function selectFoundationAgents(
  foundationAgents: FoundationAgentId[],
  inputs: FoundationChartInputs
): FoundationAgentId[] {
  return foundationAgents.filter((id) => facetPresent(getFoundationAgentSpec(id).requires, inputs))
}

function buildFoundationPrompt(template: string, category: DurationCategory, data: unknown): string {
  return [
    '--- DOMAIN ---',
    category,
    '',
    '--- DATA ---',
    JSON.stringify(data),
    '',
    '--- AGENT INSTRUCTIONS ---',
    template,
  ].join('\n')
}

/**
 * Run the selected foundation agents in parallel for one (chart, domain).
 * Skips agents whose data is absent; swallows individual agent failures.
 */
export async function runFoundationStage(params: {
  category: DurationCategory
  foundationAgents: FoundationAgentId[]
  inputs: FoundationChartInputs
  models: ModelResolvers
  /** Resolved ModelConfig rows keyed by waveId (loaded once by the orchestrator). */
  configByWaveId: Map<string, { modelId: string; provider: string; temperature: unknown; maxTokens: number }>
}): Promise<FoundationStageResult> {
  const { category, foundationAgents, inputs, models, configByWaveId } = params

  const runnable = selectFoundationAgents(foundationAgents, inputs)
    .map((id) => ({ id, spec: getFoundationAgentSpec(id), data: facetData(id, inputs) }))

  const results = await Promise.all(
    runnable.map(async (a) => {
      const cfg = configByWaveId.get(a.spec.modelWaveId)
      if (!cfg) return null // no model row seeded — skip rather than fail the run
      try {
        const template = await readPromptFile(a.spec.promptFile)
        const prompt = buildFoundationPrompt(template, category, a.data)
        const res = await callAgentJson<FoundationAgentOutput>(
          {
            model: models.resolveModel(cfg.modelId),
            provider: models.resolveProvider(cfg.provider),
            prompt,
            temperature: Number(cfg.temperature),
            maxTokens: cfg.maxTokens,
            apiKey: models.apiKey,
          },
          a.id
        )
        return { id: a.id, output: res.output, tokenIn: res.tokenIn, tokenOut: res.tokenOut, costUsd: res.costUsd }
      } catch (err) {
        // Enrichment only — never fail the paid pipeline on a foundation agent.
        console.warn(`[foundation] ${a.id} failed, skipping:`, err instanceof Error ? err.message : err)
        return null
      }
    })
  )

  const foundationOutput: FoundationOutput = {}
  let tokenIn = 0
  let tokenOut = 0
  let costUsd = 0
  for (const r of results) {
    if (!r) continue
    foundationOutput[r.id] = { ...r.output, agent_id: r.id }
    tokenIn += r.tokenIn
    tokenOut += r.tokenOut
    costUsd += r.costUsd
  }

  return { foundationOutput, tokenIn, tokenOut, costUsd }
}

const FOUNDATION_LABELS: Record<FoundationAgentId, string> = {
  'FOUND-PLANETS': 'Planetary',
  'FOUND-NAKSHATRA': 'Nakshatra',
  'FOUND-UPAGRAHA': 'Upagraha',
  'FOUND-BAV': 'Ashtakavarga',
}

/**
 * Render the merged foundation output as a labelled prompt section for DA-1/DA-3.
 * Returns '' when there is no foundation output (so callers can concatenate freely).
 */
export function buildFoundationSection(foundationOutput: FoundationOutput | null | undefined): string {
  if (!foundationOutput) return ''
  const ids = Object.keys(foundationOutput) as FoundationAgentId[]
  if (ids.length === 0) return ''

  const lines: string[] = []
  lines.push('--- FOUNDATION ANALYSIS (natal structural context — apply per period) ---')
  for (const id of ids) {
    const out = foundationOutput[id]
    if (!out) continue
    lines.push(`[${FOUNDATION_LABELS[id] ?? id}] ${out.summary}`)
    for (const f of out.key_findings ?? []) lines.push(`  - ${f}`)
  }
  return lines.join('\n')
}
