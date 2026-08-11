/**
 * lib/chart-mapper.test.ts — task 12.3 of .kiro/specs/marriage-matchmaking/tasks.md.
 *
 * Covers only `buildChartInputV1FromUnified`'s gender-resolution priority
 * (UnifiedChart.gender > chartInputV1.meta.gender > unset — the last resort
 * default of 'male' lives in engine/chartSummary.ts and lib/validation.ts's
 * W2 warning, both untouched by this change and not re-tested here).
 */
import { describe, it, expect } from 'vitest'
import { buildChartInputV1FromUnified } from './chart-mapper'

function minimalComputeChart(overrides: Partial<Parameters<typeof buildChartInputV1FromUnified>[0]>) {
  return {
    source: 'compute',
    chartInputV1: null,
    planets: [],
    nakshatras: [],
    divisionalCharts: [],
    karakas: [],
    ashtakavarga: null,
    upagrahas: [],
    specialLagnas: [],
    shadbala: null,
    birthInput: {},
    lagna: 'Aries',
    lagnaLongitude: 5,
    moonLongitude: 40,
    ayanamsa: 24,
    birthDatetime: new Date('2000-01-01T00:00:00Z'),
    name: 'Test Native',
    ...overrides,
  }
}

describe('buildChartInputV1FromUnified — gender resolution (task 12.1)', () => {
  it('prefers UnifiedChart.gender when set', () => {
    const result = buildChartInputV1FromUnified(minimalComputeChart({ gender: 'female' }))
    expect(result?.meta.gender).toBe('female')
  })

  it('falls back to chartInputV1.meta.gender when UnifiedChart.gender is unset', () => {
    const result = buildChartInputV1FromUnified(
      minimalComputeChart({ gender: null, chartInputV1: { meta: { gender: 'male' } } })
    )
    expect(result?.meta.gender).toBe('male')
  })

  it('UnifiedChart.gender wins over a conflicting chartInputV1.meta.gender', () => {
    const result = buildChartInputV1FromUnified(
      minimalComputeChart({ gender: 'female', chartInputV1: { meta: { gender: 'male' } } })
    )
    expect(result?.meta.gender).toBe('female')
  })

  it('leaves meta.gender undefined when neither source has it (default stays a downstream concern)', () => {
    const result = buildChartInputV1FromUnified(minimalComputeChart({ gender: null }))
    expect(result?.meta.gender).toBeUndefined()
  })

  it('ignores a malformed gender value rather than passing it through verbatim', () => {
    const result = buildChartInputV1FromUnified(
      minimalComputeChart({ gender: 'not-a-real-gender' as any })
    )
    expect(result?.meta.gender).toBeUndefined()
  })

  it('normalizes a mixed-case/whitespace gender value (e.g. from prisma/backfill-gender.ts, which does not re-validate against the enum)', () => {
    const result = buildChartInputV1FromUnified(minimalComputeChart({ gender: ' Female ' as any }))
    expect(result?.meta.gender).toBe('female')
  })
})
