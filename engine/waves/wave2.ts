/**
 * engine/waves/wave2.ts — Wave 2 execution: Domain specialists.
 *
 * Agents 2A–2G run in parallel. Only planner-selected agents execute.
 * Each agent receives chart_summary + wave1_delta as context.
 */

import type { AgentId } from '@/lib/types'

/** All possible Wave 2 agents. */
const WAVE2_AGENTS: AgentId[] = ['2A', '2B', '2C', '2D', '2E', '2F', '2G']

/**
 * Filters the execution plan to only Wave 2 agents.
 */
export function getWave2Agents(planAgents: AgentId[]): AgentId[] {
  return planAgents.filter((a) => WAVE2_AGENTS.includes(a))
}

/**
 * Maps Wave 2 agent IDs to their domain for context filtering in Wave 3.
 */
export const WAVE2_DOMAIN_MAP: Record<string, string> = {
  '2A': 'cross_domain',
  '2B': 'cross_domain',
  '2C': 'wealth',
  '2D': 'property',
  '2E': 'health',
  '2F': 'career',
  '2G': 'marriage',
}

/**
 * Given a Wave 3 agent, returns which Wave 2 outputs are relevant to it.
 * Used for domain-scoped context injection (token optimization).
 */
export function getRelevantWave2ForWave3(wave3Agent: AgentId): AgentId[] {
  switch (wave3Agent) {
    case '3A': // Cashflow — needs wealth, yoga
      return ['2A', '2C']
    case '3B': // Financial Freedom — needs wealth
      return ['2C']
    case '3C': // Cross-Channel — needs all available
      return ['2A', '2B', '2C', '2D', '2E', '2F', '2G']
    case '3D': // Lagna Lord — needs yoga, relationships
      return ['2A']
    default:
      return []
  }
}
