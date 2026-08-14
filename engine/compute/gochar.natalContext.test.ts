/**
 * engine/compute/gochar.natalContext.test.ts — Natal-context equivalence test.
 *
 * Validates that `resolveNatalGocharContext()` returns the identical two sign
 * numbers that `computeFullChart()` would return for the same `BirthInput`.
 * This is the guard that makes skipping the full chart safe in the Gochar API
 * route.
 *
 * Note: this test is deliberately slower than the rest of the Gochar suite
 * because it calls `computeFullChart()` once to obtain the reference values.
 *
 * Design: Testing Strategy — "Natal-context equivalence"
 * Requirements: R1.6
 */

import { describe, it, expect } from 'vitest'
import { computeFullChart } from './index'
import { resolveNatalGocharContext } from './gochar'

// ─── Fixture ──────────────────────────────────────────────────────────────
// Reuses the "Mojo" chart fixture that backs the yoga engine tests and the
// duration-analysis scorer backtest fixture.  See yogas.mojo.test.ts.
// Birth data (source: stored UnifiedChart.birthInput):
//   1984-05-26, 07:00:00 IST (+5.5), 24.9048313 N, 74.5803945 E, sunriseMode="jhora"
const MOJO_BIRTH = {
  date: '1984-05-26',
  time: '07:00:00',
  timezone: 5.5,
  latitude: 24.9048313,
  longitude: 74.5803945,
  name: 'Mojo',
  sunriseMode: 'jhora' as const,
}

describe('resolveNatalGocharContext — equivalence with computeFullChart()', { timeout: 120_000 }, () => {
  it('natalLagnaSignNumber equals chart.lagnaSignNumber', () => {
    const ctx = resolveNatalGocharContext(MOJO_BIRTH)
    const chart = computeFullChart(MOJO_BIRTH)
    expect(ctx.natalLagnaSignNumber).toBe(chart.lagnaSignNumber)
  })

  it('natalMoonSignNumber equals chart.planets Moon signNumber', () => {
    const ctx = resolveNatalGocharContext(MOJO_BIRTH)
    const chart = computeFullChart(MOJO_BIRTH)
    const moonFromChart = chart.planets.find((p) => p.planet === 'Moon')
    expect(moonFromChart, 'Moon must be present in chart.planets').toBeDefined()
    expect(ctx.natalMoonSignNumber).toBe(moonFromChart!.signNumber)
  })

  it('returns sign numbers in the valid 1..12 range', () => {
    const ctx = resolveNatalGocharContext(MOJO_BIRTH)
    expect(ctx.natalMoonSignNumber).toBeGreaterThanOrEqual(1)
    expect(ctx.natalMoonSignNumber).toBeLessThanOrEqual(12)
    expect(ctx.natalLagnaSignNumber).toBeGreaterThanOrEqual(1)
    expect(ctx.natalLagnaSignNumber).toBeLessThanOrEqual(12)
  })

  it('is deterministic across repeated calls', () => {
    const a = resolveNatalGocharContext(MOJO_BIRTH)
    const b = resolveNatalGocharContext(MOJO_BIRTH)
    expect(a).toEqual(b)
  })
})
