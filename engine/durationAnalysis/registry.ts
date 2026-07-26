/**
 * engine/durationAnalysis/registry.ts — Domain-agent registry.
 *
 * Single source of truth for how each DurationCategory maps to its analysing
 * agent: which prompt file to load, which model_config row to use, which
 * divisional charts to include, and which extra UnifiedChart columns the
 * domain needs beyond the base set (planets, nakshatras, relationships,
 * ashtakavarga, dashaTree).
 *
 * Adding a new domain agent = one entry here + a prompt file + a model_config
 * seed row. The extractor and orchestrator read this registry; do not hardcode
 * per-category logic elsewhere.
 *

 * Each per-domain prompt file composes {{include:domains/<category>.md}} (the
 * canonical domain knowledge, shared with the Wave 2 domain agents) with the
 * generic DA-1 core (duration_da1_domain_analyser.md).
 *
 * Model rows (DA1-HEALTH, DA1-CAREER, …) are seeded in prisma/seed.ts — run
 * `npm run db:seed` after adding an entry here.
 */

import type { DurationCategory, FoundationAgentId } from '@/lib/durationTypes'

/** Extra UnifiedChart JSONB columns a domain agent needs beyond the base set. */
export type DomainExtraColumn = 'shadbala' | 'jaimini'

export interface DomainAgentSpec {
  /** Agent identifier used in logs/SSE once per-domain agents exist. */
  agentId: string
  /** Prompt file in prompts/agents/ loaded for the domain analysis step. */
  promptFile: string
  /** model_config.waveId row that supplies model/provider/temperature. */
  modelWaveId: string
  /** Divisional chart numbers to include (e.g. [9, 10] = D9 + D10). D1 is always present via planets. */
  divisions: number[]
  /** Extra chart columns beyond planets/nakshatras/relationships/ashtakavarga/dashaTree. */
  extraColumns: DomainExtraColumn[]
  /**
   * Foundation sub-agents to run for this domain BEFORE DA-1 (deterministic planner).
   * Ordered by relevance; the orchestrator skips any whose required chart facet is absent
   * (paste-path charts). Empty = no foundation stage.
   */
  foundationAgents: FoundationAgentId[]
}

// ─── Foundation-agent catalogue (Track 2) ────────────────────────────

/** The chart facet a foundation agent reads — used to skip it when the data is absent. */
export type FoundationRequires = 'planets' | 'nakshatras' | 'upagrahas' | 'bav'

export interface FoundationAgentSpec {
  agentId: FoundationAgentId
  /** Prompt file in prompts/agents/ (domain-agnostic; domain context injected at runtime). */
  promptFile: string
  /** model_config.waveId row (seeded at the Wave-1 Haiku tier). */
  modelWaveId: string
  /** Chart facet required; the orchestrator skips the agent when it is empty/absent. */
  requires: FoundationRequires
}

export const FOUNDATION_AGENT_CATALOGUE: Record<FoundationAgentId, FoundationAgentSpec> = {
  'FOUND-PLANETS':   { agentId: 'FOUND-PLANETS',   promptFile: 'duration_found_planets.md',   modelWaveId: 'FOUND-PLANETS',   requires: 'planets' },
  'FOUND-NAKSHATRA': { agentId: 'FOUND-NAKSHATRA', promptFile: 'duration_found_nakshatra.md', modelWaveId: 'FOUND-NAKSHATRA', requires: 'nakshatras' },
  'FOUND-UPAGRAHA':  { agentId: 'FOUND-UPAGRAHA',  promptFile: 'duration_found_upagraha.md',  modelWaveId: 'FOUND-UPAGRAHA',  requires: 'upagrahas' },
  'FOUND-BAV':       { agentId: 'FOUND-BAV',       promptFile: 'duration_found_bav.md',       modelWaveId: 'FOUND-BAV',       requires: 'bav' },
}

/** Resolve a foundation agent spec by id. */
export function getFoundationAgentSpec(id: FoundationAgentId): FoundationAgentSpec {
  const spec = FOUNDATION_AGENT_CATALOGUE[id]
  if (!spec) throw new Error(`No foundation agent registered for id: ${id}`)
  return spec
}

export const DOMAIN_AGENT_REGISTRY: Record<DurationCategory, DomainAgentSpec> = {
  health: {
    agentId: 'DA1-HEALTH',
    promptFile: 'duration_da1_health.md',
    modelWaveId: 'DA1-HEALTH',
    divisions: [1, 6, 9],
    extraColumns: ['shadbala'],
    foundationAgents: ['FOUND-PLANETS', 'FOUND-UPAGRAHA', 'FOUND-BAV', 'FOUND-NAKSHATRA'],
  },
  career: {
    agentId: 'DA1-CAREER',
    promptFile: 'duration_da1_career.md',
    modelWaveId: 'DA1-CAREER',
    divisions: [1, 9, 10],
    extraColumns: ['shadbala', 'jaimini'],
    foundationAgents: ['FOUND-PLANETS', 'FOUND-NAKSHATRA', 'FOUND-BAV', 'FOUND-UPAGRAHA'],
  },
  wealth: {
    agentId: 'DA1-WEALTH',
    promptFile: 'duration_da1_wealth.md',
    modelWaveId: 'DA1-WEALTH',
    divisions: [2],
    extraColumns: ['shadbala', 'jaimini'],
    foundationAgents: ['FOUND-PLANETS', 'FOUND-BAV', 'FOUND-NAKSHATRA'],
  },
  marriage: {
    agentId: 'DA1-MARRIAGE',
    promptFile: 'duration_da1_marriage.md',
    modelWaveId: 'DA1-MARRIAGE',
    divisions: [9],
    extraColumns: ['jaimini'],
    foundationAgents: ['FOUND-PLANETS', 'FOUND-NAKSHATRA', 'FOUND-UPAGRAHA'],
  },
  property: {
    agentId: 'DA1-PROPERTY',
    promptFile: 'duration_da1_property.md',
    modelWaveId: 'DA1-PROPERTY',
    divisions: [4],
    extraColumns: [],
    foundationAgents: ['FOUND-PLANETS', 'FOUND-BAV'],
  },
  // "Money Agent" — liquidity (income vs expenses vs debt), distinct from wealth
  cashflow: {
    agentId: 'DA1-CASHFLOW',
    promptFile: 'duration_da1_cashflow.md',
    modelWaveId: 'DA1-CASHFLOW',
    divisions: [1, 2, 9],
    extraColumns: ['shadbala'],
    foundationAgents: ['FOUND-PLANETS', 'FOUND-BAV', 'FOUND-UPAGRAHA'],
  },
  // "Family Agent" — home/lineage/domestic happiness. Registered for type-completeness
  // and for the deterministic Duration Computation tab (/api/timeline) only — NOT wired
  // into the paid LLM pipeline (/api/duration-analysis keeps its own separate category
  // enum that intentionally excludes 'family'), so no prompt file or model_config seed
  // row exists for DA1-FAMILY.
  family: {
    agentId: 'DA1-FAMILY',
    promptFile: 'duration_da1_family.md',
    modelWaveId: 'DA1-FAMILY',
    divisions: [1, 4, 9],
    extraColumns: ['shadbala'],
    foundationAgents: ['FOUND-PLANETS', 'FOUND-BAV', 'FOUND-NAKSHATRA'],
  },
}

/** Resolve the agent spec for a category. Throws on unknown category. */
export function getDomainAgentSpec(category: DurationCategory): DomainAgentSpec {
  const spec = DOMAIN_AGENT_REGISTRY[category]
  if (!spec) {
    throw new Error(`No domain agent registered for category: ${category}`)
  }
  return spec
}
