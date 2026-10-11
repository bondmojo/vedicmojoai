import { describe, expect, it } from 'vitest'
import { SURYA_SIDDHANTA_MAKARANDA_FIXTURES } from '../__fixtures__/suryaSiddhantaMakaranda'
import {
  compareSssCandidateToPvrOracle,
  type SssOracleCandidate,
} from './sssOracleComparison'

const fixture = SURYA_SIDDHANTA_MAKARANDA_FIXTURES[0]

function matchingCandidate(): SssOracleCandidate {
  const allPeriods = [...fixture.mahadasha, ...fixture.antardasha, ...fixture.pratyantardasha]
  const normalizedPeriods = (periods: typeof fixture.mahadasha | typeof fixture.antardasha | typeof fixture.pratyantardasha) =>
    periods.map((period) => ({
      level: period.level,
      parentLord: period.parentId === null
        ? null
        : allPeriods.find((parent) => parent.id === period.parentId)?.lord ?? null,
      lord: period.lord,
      start: period.start,
      end: period.end,
    }))

  return {
    fixtureId: fixture.id,
    candidateKind: 'production_provider',
    targetProfile: 'surya_siddhanta_makaranda_v1',
    calculationProfile: 'surya_siddhanta_makaranda_v1',
    implementationId: 'comparator-mechanics-test',
    provenance: {
      parameterSetId: 'test-only-independent-fixture-copy',
      formulaSourceIds: ['comparator-mechanics-test'],
    },
    birth: { ...fixture.birth },
    natal: fixture.natal.map((position) => ({ ...position })),
    upagrahas: fixture.upagrahas.map((point) => ({ ...point })),
    specialLagnas: fixture.specialLagnas.map((point) => ({ ...point })),
    additionalPoints: fixture.additionalPoints.map((point) => ({ ...point })),
    mahadasha: normalizedPeriods(fixture.mahadasha),
    antardasha: normalizedPeriods(fixture.antardasha),
    pratyantardasha: normalizedPeriods(fixture.pratyantardasha),
  }
}

describe('SSS/Makaranda PVR oracle comparison mechanics', () => {
  it('compares a normalized candidate to the independent fixture without manufacturing expected values', () => {
    const report = compareSssCandidateToPvrOracle(fixture, matchingCandidate())
    expect(report.summary.fail).toBe(0)
    expect(report.summary.candidate_missing).toBe(0)
    expect(report.summary.oracle_missing).toBe(2)
    expect(report.outcome).toBe('partial')
  })

  it('uses the shortest circular longitude delta and the one-arcsecond gate', () => {
    const candidate = matchingCandidate()
    const lagna = candidate.natal![0]
    const report = compareSssCandidateToPvrOracle(fixture, {
      ...candidate,
      natal: [
        { ...lagna, longitude: (lagna.longitude + 359 + 3_599 / 3_600) % 360 },
        ...candidate.natal!.slice(1),
      ],
    })
    const check = report.checks.find((entry) => entry.key === 'natal.Lagna.longitude')!
    expect(check.delta?.value).toBeCloseTo(-1, 8)
    expect(check.status).toBe('pass')
  })

  it('reports scientific deltas instead of widening tolerances', () => {
    const candidate = matchingCandidate()
    const moon = candidate.natal!.find((position) => position.body === 'Moon')!
    const report = compareSssCandidateToPvrOracle(fixture, {
      ...candidate,
      natal: candidate.natal!.map((position) =>
        position.body === 'Moon' ? { ...moon, longitude: moon.longitude + 2 / 3_600 } : position
      ),
    })
    const check = report.checks.find((entry) => entry.key === 'natal.Moon.longitude')!
    expect(check.status).toBe('fail')
    expect(check.delta?.value).toBeCloseTo(2, 8)
    expect(check.tolerance).toEqual({ value: 1, unit: 'arcseconds' })
  })

  it('fails closed when Drik/Lahiri output is presented as an SSS candidate', () => {
    const report = compareSssCandidateToPvrOracle(fixture, {
      ...matchingCandidate(),
      calculationProfile: 'drik_lahiri_v1',
    })
    expect(report.outcome).toBe('fail')
    expect(report.checks.find((entry) => entry.key === 'identity.noDrikSubstitution')).toMatchObject({
      status: 'fail',
    })
  })

  it('accepts documented JHora/engine nakshatra spelling aliases without rewriting the oracle', () => {
    const candidate = matchingCandidate()
    const report = compareSssCandidateToPvrOracle(fixture, {
      ...candidate,
      natal: candidate.natal!.map((position) =>
        position.nakshatra === 'Asresha' ? { ...position, nakshatra: 'Ashlesha' } : position
      ),
    })
    expect(report.checks.find((entry) => entry.key === 'natal.Sun.nakshatra')).toMatchObject({
      status: 'pass',
      actual: 'Ashlesha',
    })
  })

  it('fails duplicate natal identities instead of silently overwriting them in a map', () => {
    const candidate = matchingCandidate()
    const report = compareSssCandidateToPvrOracle(fixture, {
      ...candidate,
      natal: [...candidate.natal!, candidate.natal![0]],
    })
    expect(report.checks.find((entry) => entry.key === 'natal.uniqueBodies')).toMatchObject({
      status: 'fail',
    })
  })

  it('compares equivalent dasha timestamps as instants across displayed offsets', () => {
    const candidate = matchingCandidate()
    const first = candidate.mahadasha![0]
    const report = compareSssCandidateToPvrOracle(fixture, {
      ...candidate,
      mahadasha: [
        { ...first, start: new Date(first.start).toISOString() },
        ...candidate.mahadasha!.slice(1),
      ],
    })
    expect(report.checks.find((entry) => entry.key === 'dasha.MD:root:Saturn.start')).toMatchObject({
      status: 'pass',
      delta: { value: 0, unit: 'seconds' },
    })
  })

  it('reports a semantic dasha-order mismatch independently of timestamp deltas', () => {
    const candidate = matchingCandidate()
    const report = compareSssCandidateToPvrOracle(fixture, {
      ...candidate,
      mahadasha: [candidate.mahadasha![1], candidate.mahadasha![0], ...candidate.mahadasha!.slice(2)],
    })
    expect(report.checks.find((entry) => entry.key === 'dasha.MD.semanticOrder')).toMatchObject({
      status: 'fail',
    })
  })

  it('reports unavailable candidate sections separately from unavailable oracle fields', () => {
    const report = compareSssCandidateToPvrOracle(fixture, {
      fixtureId: fixture.id,
      candidateKind: 'research_prototype',
      targetProfile: 'surya_siddhanta_makaranda_v1',
      implementationId: 'not-yet-implemented',
      provenance: {
        parameterSetId: 'not-yet-selected',
        formulaSourceIds: [],
      },
    })
    expect(report.outcome).toBe('incomplete')
    expect(report.summary.candidate_missing).toBeGreaterThan(0)
    expect(report.summary.oracle_missing).toBe(2)
  })
})
