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

import type { DurationCategory } from '@/lib/durationTypes'

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
}

export const DOMAIN_AGENT_REGISTRY: Record<DurationCategory, DomainAgentSpec> = {
  health: {
    agentId: 'DA1-HEALTH',
    promptFile: 'duration_da1_health.md',
    modelWaveId: 'DA1-HEALTH',
    divisions: [30],
    extraColumns: ['shadbala'],
  },
  career: {
    agentId: 'DA1-CAREER',
    promptFile: 'duration_da1_career.md',
    modelWaveId: 'DA1-CAREER',
    divisions: [9, 10],
    extraColumns: ['shadbala', 'jaimini'],
  },
  wealth: {
    agentId: 'DA1-WEALTH',
    promptFile: 'duration_da1_wealth.md',
    modelWaveId: 'DA1-WEALTH',
    divisions: [2],
    extraColumns: ['shadbala', 'jaimini'],
  },
  marriage: {
    agentId: 'DA1-MARRIAGE',
    promptFile: 'duration_da1_marriage.md',
    modelWaveId: 'DA1-MARRIAGE',
    divisions: [9],
    extraColumns: ['jaimini'],
  },
  property: {
    agentId: 'DA1-PROPERTY',
    promptFile: 'duration_da1_property.md',
    modelWaveId: 'DA1-PROPERTY',
    divisions: [4],
    extraColumns: [],
  },
  // "Money Agent" — liquidity (income vs expenses vs debt), distinct from wealth
  cashflow: {
    agentId: 'DA1-CASHFLOW',
    promptFile: 'duration_da1_cashflow.md',
    modelWaveId: 'DA1-CASHFLOW',
    divisions: [2],
    extraColumns: ['shadbala'],
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
