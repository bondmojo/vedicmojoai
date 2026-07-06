/**
 * tests/wave4.test.ts
 * Unit tests for evaluateHaltGate() and getRerunWave() in engine/waves/wave4.ts.
 * Pure functions — zero mocks, zero DB.
 */

import { describe, it, expect } from 'vitest'
import { evaluateHaltGate, getRerunWave } from '../engine/waves/wave4'
import type { ErrorDetectionResult } from '../lib/types'

// ── Fixtures ────────────────────────────────────────────────────────

function makeResult(
  errors: ErrorDetectionResult['errors_found']
): ErrorDetectionResult {
  return {
    errors_found: errors,
    critical_errors: errors.filter((e) => e.severity === 'critical').length,
    moderate_errors: errors.filter((e) => e.severity === 'moderate').length,
    minor_errors: errors.filter((e) => e.severity === 'minor').length,
  }
}

const CRITICAL_ERROR = {
  check: 'lagna_consistency',
  description: 'Lagna sign mismatch between D1 and agent 1A output.',
  location: 'agent_1A.findings.lagna_sign',
  severity: 'critical' as const,
  affects_waves: [1, 2],
  correction_suggestion: 'Recompute D1 Rasi from ephemeris.',
}

const MODERATE_ERROR = {
  check: 'shadbala_range',
  description: 'Saturn Shadbala value out of expected range.',
  location: 'agent_1C.findings.shadbala.Saturn',
  severity: 'moderate' as const,
  affects_waves: [2],
  correction_suggestion: 'Verify Shadbala calculation inputs.',
}

const MINOR_ERROR = {
  check: 'nakshatra_pada',
  description: 'Pada value is 5 (should be 1–4).',
  location: 'agent_1B.findings.Moon.pada',
  severity: 'minor' as const,
  affects_waves: [1],
  correction_suggestion: 'Clamp pada to range 1–4.',
}

// ── evaluateHaltGate ─────────────────────────────────────────────────

describe('evaluateHaltGate', () => {
  it('should return shouldHalt=true when there is at least one critical error', () => {
    const result = evaluateHaltGate(makeResult([CRITICAL_ERROR]))
    expect(result.shouldHalt).toBe(true)
  })

  it('should return shouldHalt=false when there are no critical errors', () => {
    const result = evaluateHaltGate(makeResult([MODERATE_ERROR, MINOR_ERROR]))
    expect(result.shouldHalt).toBe(false)
  })

  it('should return shouldHalt=false for an empty error list', () => {
    const result = evaluateHaltGate(makeResult([]))
    expect(result.shouldHalt).toBe(false)
  })

  it('should correctly partition errors by severity', () => {
    const result = evaluateHaltGate(makeResult([CRITICAL_ERROR, MODERATE_ERROR, MINOR_ERROR]))
    expect(result.criticalErrors).toHaveLength(1)
    expect(result.moderateErrors).toHaveLength(1)
    expect(result.minorErrors).toHaveLength(1)
  })

  it('should return shouldHalt=true with multiple critical errors', () => {
    const result = evaluateHaltGate(
      makeResult([CRITICAL_ERROR, { ...CRITICAL_ERROR, check: 'dasha_gap' }])
    )
    expect(result.shouldHalt).toBe(true)
    expect(result.criticalErrors).toHaveLength(2)
  })

  it('should return empty criticalErrors array when no critical errors exist', () => {
    const result = evaluateHaltGate(makeResult([MODERATE_ERROR]))
    expect(result.criticalErrors).toHaveLength(0)
  })

  it('should return the critical error objects verbatim', () => {
    const result = evaluateHaltGate(makeResult([CRITICAL_ERROR]))
    expect(result.criticalErrors[0]).toEqual(CRITICAL_ERROR)
  })

  it('should return empty arrays for all severities on empty input', () => {
    const result = evaluateHaltGate(makeResult([]))
    expect(result.criticalErrors).toHaveLength(0)
    expect(result.moderateErrors).toHaveLength(0)
    expect(result.minorErrors).toHaveLength(0)
  })
})

// ── getRerunWave ─────────────────────────────────────────────────────

describe('getRerunWave', () => {
  it('should return the minimum affected wave across all critical errors', () => {
    const errors: ErrorDetectionResult['errors_found'] = [
      { ...CRITICAL_ERROR, affects_waves: [3] },
      { ...CRITICAL_ERROR, affects_waves: [1, 2] },
    ]
    expect(getRerunWave(errors)).toBe(1)
  })

  it('should return 2 (default) when affects_waves is empty on all errors', () => {
    const errors: ErrorDetectionResult['errors_found'] = [
      { ...CRITICAL_ERROR, affects_waves: [] },
    ]
    expect(getRerunWave(errors)).toBe(2)
  })

  it('should return 2 (default) when given an empty array', () => {
    expect(getRerunWave([])).toBe(2)
  })

  it('should handle a single error with a single affected wave', () => {
    const errors: ErrorDetectionResult['errors_found'] = [
      { ...CRITICAL_ERROR, affects_waves: [3] },
    ]
    expect(getRerunWave(errors)).toBe(3)
  })

  it('should return 1 when Wave 1 is among affected waves', () => {
    const errors: ErrorDetectionResult['errors_found'] = [
      { ...CRITICAL_ERROR, affects_waves: [1] },
    ]
    expect(getRerunWave(errors)).toBe(1)
  })

  it('should return wave 4 when only wave 4 is affected', () => {
    const errors: ErrorDetectionResult['errors_found'] = [
      { ...CRITICAL_ERROR, affects_waves: [4] },
    ]
    expect(getRerunWave(errors)).toBe(4)
  })

  it('should pick the global minimum across multiple errors with different wave sets', () => {
    const errors: ErrorDetectionResult['errors_found'] = [
      { ...CRITICAL_ERROR, affects_waves: [3, 4] },
      { ...CRITICAL_ERROR, affects_waves: [2, 3] },
      { ...CRITICAL_ERROR, affects_waves: [4] },
    ]
    expect(getRerunWave(errors)).toBe(2)
  })
})
