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

describe('buildChartInputV1FromUnified — birth place mapping (task 6.5)', () => {
  it('uses the persisted place label instead of the client name', () => {
    const result = buildChartInputV1FromUnified(minimalComputeChart({
      name: 'Client Name Must Not Be A Location',
      birthInput: {
        name: 'Client Name Must Not Be A Location',
        place: { label: 'Alandi, Khed, Maharashtra' },
      },
    }))

    expect(result?.meta.birth_place).toBe('Alandi, Khed, Maharashtra')
    expect(result?.meta.birth_place).not.toBe('Client Name Must Not Be A Location')
  })

  it('leaves birth_place unset when no persisted place exists', () => {
    const result = buildChartInputV1FromUnified(minimalComputeChart({
      name: 'Client Name Must Not Be A Location',
      birthInput: { name: 'Client Name Must Not Be A Location' },
    }))

    expect(result?.meta.birth_place).toBeUndefined()
  })

  it('reads the label from a full persisted BirthPlace object, not from any other field', () => {
    const result = buildChartInputV1FromUnified(minimalComputeChart({
      name: 'Client Name Must Not Be A Location',
      birthInput: {
        date: '1990-01-01',
        time: '10:00:00',
        timezone: 5.5,
        latitude: 18.6772446,
        longitude: 73.8981129,
        name: 'Client Name Must Not Be A Location',
        sunriseMode: 'precise',
        place: {
          id: '8f14e45f-ceea-467a-9f5e-6f0f1c3b2a10',
          name: 'Alandi',
          kind: 'village',
          state: 'Maharashtra',
          district: 'Pune',
          county: 'Khed',
          label: 'Alandi, Khed, Maharashtra',
        },
      },
    }))

    expect(result?.meta.birth_place).toBe('Alandi, Khed, Maharashtra')
  })

  /**
   * `meta.birth_place` flows into `chart_summary` and thence into every LLM
   * agent's context, so a garbage value there is worse than an absent one.
   * These shapes are not producible by the current writer, but `birthInput` is
   * an untyped JSON column that older/foreign writers can have filled in.
   */
  describe('malformed persisted place', () => {
    const malformed: Array<[string, unknown]> = [
      ['null', null],
      ['a bare string', 'Alandi, Khed, Maharashtra'],
      ['an object with no label', { id: 'x', name: 'Alandi', state: 'Maharashtra' }],
      ['an object with an explicitly undefined label', { label: undefined }],
      ['an empty object', {}],
      ['an array', [{ label: 'Alandi' }]],
      ['a number', 42],
    ]

    for (const [description, place] of malformed) {
      it(`leaves birth_place undefined without throwing when place is ${description}`, () => {
        const build = () => buildChartInputV1FromUnified(minimalComputeChart({
          name: 'Client Name Must Not Be A Location',
          birthInput: { name: 'Client Name Must Not Be A Location', place },
        }))

        expect(build).not.toThrow()
        expect(build()?.meta.birth_place).toBeUndefined()
      })
    }
  })

  it('maps a legacy pre-feature birthInput cleanly (Requirement 9.1)', () => {
    // Exactly what charts saved before the picker carry: engine input, no `place` key.
    const result = buildChartInputV1FromUnified(minimalComputeChart({
      name: 'Legacy Native',
      birthInput: {
        date: '1985-06-15',
        time: '04:30:00',
        timezone: 5.5,
        latitude: 19.076,
        longitude: 72.8777,
        name: 'Legacy Native',
        sunriseMode: 'precise',
      },
    }))

    expect(result).not.toBeNull()
    expect(result?.meta.client_name).toBe('Legacy Native')
    expect(result?.meta.birth_place).toBeUndefined()
  })

  it('tolerates a missing birthInput column altogether', () => {
    const result = buildChartInputV1FromUnified(minimalComputeChart({ birthInput: null }))

    expect(result?.meta.birth_place).toBeUndefined()
  })
})

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
