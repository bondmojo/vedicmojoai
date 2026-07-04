/**
 * engine/planner.ts — Deterministic planner for agent selection.
 *
 * Maps query types to the minimum required set of agents.
 * No LLM call — purely a static lookup with deduplication and ordering.
 *
 * Phase 2 (US-2.3) will add an LLM-assisted planner for ambiguous
 * free-text queries; this deterministic path remains the default.
 */

import type { AgentId, ExecutionPlan, PreAnalysisAlert, QueryType } from '@/lib/types'
import { ALWAYS_RUN_FIRST_QUERY, DOMAIN_AGENTS, WAVE4_SEQUENCE } from './constants'

// ─── Agent wave classification for ordering ─────────────────────────

const WAVE_ORDER: Record<string, number> = {
  '1A': 1, '1B': 1, '1C': 1, '1D': 1,
  '2A': 2, '2B': 2, '2C': 2, '2D': 2, '2E': 2, '2F': 2, '2G': 2,
  '3A': 3, '3B': 3, '3C': 3, '3D': 3,
  '4X': 4, '4A': 4, '4B': 4, '4C': 4,
  verification: 5,
}

/** Sort agents by wave order, preserving wave-internal order. */
function sortAgentsByWave(agents: AgentId[]): AgentId[] {
  return [...agents].sort((a, b) => {
    const waveA = WAVE_ORDER[a] ?? 99
    const waveB = WAVE_ORDER[b] ?? 99
    if (waveA !== waveB) return waveA - waveB
    // Within same wave, maintain alphabetical/numeric order
    return a.localeCompare(b)
  })
}

// ─── Planner Interface ──────────────────────────────────────────────

export interface PlannerInput {
  /** Selected query types for this run. */
  queryTypes: QueryType[]
  /** Whether this is a follow-up query (skips Wave 1, ALWAYS_RUN). */
  isFollowup: boolean
  /** Pre-analysis alerts (used for conditional agent decisions like 3D). */
  alerts: PreAnalysisAlert[]
  /** Custom agent selection override (from US-4.1). Null = use planner logic. */
  customAgents?: AgentId[] | null
  /** Force Wave 1 re-run even on follow-up. */
  forceRerunWave1?: boolean
}

/**
 * Resolves the execution plan for a pipeline run.
 *
 * @param input - Planner input parameters.
 * @returns ExecutionPlan with ordered agent list and rationale.
 *
 * @example
 * ```typescript
 * const plan = resolvePlan({
 *   queryTypes: ['health', 'career'],
 *   isFollowup: false,
 *   alerts: preAnalysisAlerts,
 * })
 * console.log(plan.agents) // ['1A','1B','1C','1D','2A','2B','2E','2F','3A','3C','4X','4A','4B','4C']
 * ```
 */
export function resolvePlan(input: PlannerInput): ExecutionPlan {
  const { queryTypes, isFollowup, alerts, customAgents, forceRerunWave1 } = input

  // ─── Custom override path ───────────────────────────────────────
  if (customAgents && customAgents.length > 0) {
    return {
      agents: sortAgentsByWave(customAgents),
      rationale: `Custom agent selection override: ${customAgents.join(', ')}`,
      query_types: queryTypes,
      is_followup: isFollowup,
      skipped_waves: getSkippedWaves(customAgents),
    }
  }

  // ─── Standard planner path ──────────────────────────────────────
  const agentSet = new Set<AgentId>()
  const rationaleparts: string[] = []

  // Step 1: Resolve domain agents from query types
  for (const queryType of queryTypes) {
    const domainAgents = DOMAIN_AGENTS[queryType]
    if (domainAgents) {
      for (const agent of domainAgents) {
        agentSet.add(agent)
      }
      rationaleparts.push(`${queryType} → [${domainAgents.join(', ')}]`)
    }
  }

  // Step 2: Apply ALWAYS_RUN for first queries
  if (!isFollowup) {
    for (const agent of ALWAYS_RUN_FIRST_QUERY) {
      agentSet.add(agent)
    }
    rationaleparts.push(`First query — added ALWAYS_RUN: [${ALWAYS_RUN_FIRST_QUERY.join(', ')}]`)
  } else {
    // Follow-ups: always add Wave 4 sequence + verification
    for (const agent of WAVE4_SEQUENCE) {
      agentSet.add(agent)
    }
    agentSet.add('verification')
    rationaleparts.push('Follow-up — added Wave 4 + verification, skipped Wave 1')
  }

  // Step 3: Conditional agent decisions
  // 3D only runs if lagna lord is afflicted/debilitated
  if (agentSet.has('3D')) {
    const lagnaLordAfflicted = alerts.some(
      (a) => a.rule_id === 2 && a.severity === 'warning' &&
        (a.rule_name === 'Lagna Lord Debilitated' || a.rule_name === 'Lagna Lord Placement')
    )
    if (!lagnaLordAfflicted) {
      agentSet.delete('3D')
      rationaleparts.push('3D removed — lagna lord not afflicted/debilitated')
    } else {
      rationaleparts.push('3D retained — lagna lord is afflicted')
    }
  }

  // Step 4: Handle Wave 1 for follow-ups
  if (isFollowup && !forceRerunWave1) {
    agentSet.delete('1A')
    agentSet.delete('1B')
    agentSet.delete('1C')
    agentSet.delete('1D')
  } else if (isFollowup && forceRerunWave1) {
    agentSet.add('1A')
    agentSet.add('1B')
    agentSet.add('1C')
    agentSet.add('1D')
    rationaleparts.push('Force re-run Wave 1 requested')
  }

  // Step 5: Sort by wave order
  const sortedAgents = sortAgentsByWave(Array.from(agentSet))

  return {
    agents: sortedAgents,
    rationale: rationaleparts.join('; '),
    query_types: queryTypes,
    is_followup: isFollowup,
    skipped_waves: getSkippedWaves(sortedAgents),
  }
}

/**
 * Determines which waves are being skipped (no agents from that wave).
 */
function getSkippedWaves(agents: AgentId[]): number[] {
  const wavesPresent = new Set(agents.map((a) => WAVE_ORDER[a]).filter(Boolean))
  const allWaves = [1, 2, 3, 4]
  return allWaves.filter((w) => !wavesPresent.has(w))
}

/**
 * Validates that a custom agent selection is coherent.
 *
 * @param agents - Custom agent selection from the practitioner.
 * @returns Array of validation error messages. Empty = valid.
 */
export function validateAgentSelection(agents: AgentId[]): string[] {
  const errors: string[] = []

  // 4C requires 4X output
  if (agents.includes('4C') && !agents.includes('4X')) {
    errors.push('Agent 4C (Final Synthesis) requires 4X (Fact Consolidation) to be included')
  }

  // 4B requires 4A
  if (agents.includes('4B') && !agents.includes('4A')) {
    errors.push('Agent 4B (Validation) requires 4A (Error Detection) to be included')
  }

  // Wave 2/3 agents require Wave 1 output to exist (either cached or run)
  const wave23Agents = agents.filter((a) => WAVE_ORDER[a] === 2 || WAVE_ORDER[a] === 3)
  if (wave23Agents.length > 0) {
    // This is fine if Wave1Cache exists — validated at runtime, not here
  }

  // 3D without Wave 2 yoga detection is unusual
  if (agents.includes('3D') && !agents.includes('2A')) {
    errors.push('Agent 3D (Lagna Lord) benefits from 2A (Yoga Detection) — consider including it')
  }

  return errors
}
