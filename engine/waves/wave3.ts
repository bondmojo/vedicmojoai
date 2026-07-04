/**
 * engine/waves/wave3.ts — Wave 3 execution: Synthesis & Timing.
 *
 * Agents 3A–3D run in parallel. Only planner-selected agents execute.
 * Each agent receives chart_summary + wave1_delta + relevant wave2 deltas.
 * Agent 3D is conditional: only runs if lagna lord is afflicted.
 */

import type { AgentId, PreAnalysisAlert } from '@/lib/types'

/** All possible Wave 3 agents. */
const WAVE3_AGENTS: AgentId[] = ['3A', '3B', '3C', '3D']

/**
 * Filters the execution plan to only Wave 3 agents.
 */
export function getWave3Agents(planAgents: AgentId[]): AgentId[] {
  return planAgents.filter((a) => WAVE3_AGENTS.includes(a))
}

/**
 * Checks if agent 3D should run based on pre-analysis alerts.
 * 3D only runs when the lagna lord is afflicted or debilitated.
 */
export function should3DRun(alerts: PreAnalysisAlert[]): boolean {
  return alerts.some(
    (alert) =>
      alert.rule_id === 2 &&
      alert.severity === 'warning' &&
      (alert.rule_name === 'Lagna Lord Debilitated' ||
        alert.rule_name === 'Lagna Lord Placement')
  )
}

/** Maps Wave 3 agents to their domain classification. */
export const WAVE3_DOMAIN_MAP: Record<string, string> = {
  '3A': 'wealth',
  '3B': 'wealth',
  '3C': 'cross_domain',
  '3D': 'cross_domain',
}
