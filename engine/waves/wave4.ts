/**
 * engine/waves/wave4.ts — Wave 4 execution: Quality & Synthesis.
 *
 * Agents 4X → 4A → 4B → 4C run STRICTLY sequentially.
 * Contains the critical error halt gate logic between 4A and 4B.
 *
 * 4X: Fact Consolidation (reduces ~40KB of Wave 2/3 output to ~6KB fact_summary)
 * 4A: Error Detection (finds inconsistencies, classifies by severity)
 * 4B: Validation (confidence scoring, cross-verification)
 * 4C: Final Synthesis (Opus — produces the authoritative report)
 */

import type { AgentId, ErrorDetectionResult } from '@/lib/types'

/** Wave 4 agents in execution order. Never reorder. */
export const WAVE4_SEQUENCE: AgentId[] = ['4X', '4A', '4B', '4C']

/**
 * Determines the halt decision based on 4A error detection output.
 *
 * @param errorResult - Parsed output from agent 4A.
 * @returns Object with halt decision and categorized errors.
 */
export function evaluateHaltGate(errorResult: ErrorDetectionResult): {
  shouldHalt: boolean
  criticalErrors: ErrorDetectionResult['errors_found']
  moderateErrors: ErrorDetectionResult['errors_found']
  minorErrors: ErrorDetectionResult['errors_found']
} {
  const criticalErrors = errorResult.errors_found.filter((e) => e.severity === 'critical')
  const moderateErrors = errorResult.errors_found.filter((e) => e.severity === 'moderate')
  const minorErrors = errorResult.errors_found.filter((e) => e.severity === 'minor')

  return {
    shouldHalt: criticalErrors.length > 0,
    criticalErrors,
    moderateErrors,
    minorErrors,
  }
}

/**
 * Determines which wave to re-run from based on the critical error's affects_waves.
 * Used when the practitioner selects "Re-run from Wave X".
 *
 * @param criticalErrors - Critical errors from 4A.
 * @returns The earliest wave number that needs re-running.
 */
export function getRerunWave(
  criticalErrors: ErrorDetectionResult['errors_found']
): number {
  const affectedWaves = criticalErrors.flatMap((e) => e.affects_waves)
  if (affectedWaves.length === 0) return 2 // Default to Wave 2

  return Math.min(...affectedWaves)
}
