/**
 * tests/duration-extractor.test.ts — extractCategoryData + domain-agent registry.
 *
 * The extractor is pure: given UnifiedChart JSONB columns and a category, it
 * must return exactly the columns DOMAIN_AGENT_REGISTRY specifies.
 */
import { describe, it, expect } from 'vitest'
import { extractCategoryData, pickScoringRawChart, toScoringChartData } from '@/engine/durationAnalysis/extractor'
import { DOMAIN_AGENT_REGISTRY, getDomainAgentSpec } from '@/engine/durationAnalysis/registry'
import type { DurationCategory } from '@/lib/durationTypes'

const ALL_CATEGORIES: DurationCategory[] = ['health', 'career', 'wealth', 'marriage', 'property', 'cashflow', 'family']

const d = (division: number) => ({ division, name: `D${division}`, placements: [] })

const chart = {
  planets: [{ planet: 'Sun' }],
  nakshatras: [{ planet: 'Sun', nakshatra: 'Ashwini' }],
  relationships: { combustion: [] },
  shadbala: { totals: {} },
  divisionalCharts: [d(1), d(2), d(3), d(4), d(6), d(7), d(9), d(10), d(12), d(30)],
  jaimini: { charaKarakas: [] },
  ashtakavarga: { bav: {} },
  dashaTree: { mahadashas: [] },
  upagrahas: [{ abbr: 'Gk', name: 'Gulika' }],
}

describe('DOMAIN_AGENT_REGISTRY', () => {
  it('has a spec for every category', () => {
    for (const category of ALL_CATEGORIES) {
      const spec = getDomainAgentSpec(category)
      expect(spec.promptFile).toMatch(/\.md$/)
      expect(spec.modelWaveId).toBeTruthy()
      expect(spec.divisions.length).toBeGreaterThan(0)
    }
  })

  it('career includes D1, D9, and D10', () => {
    expect(DOMAIN_AGENT_REGISTRY.career.divisions).toEqual([1, 9, 10])
  })

  it('family (new domain) includes D1, D4, and D9', () => {
    expect(DOMAIN_AGENT_REGISTRY.family.divisions).toEqual([1, 4, 9])
  })

  it('every category points at its own prompt file and model row', () => {
    for (const category of ALL_CATEGORIES) {
      const spec = getDomainAgentSpec(category)
      expect(spec.promptFile).toBe(`duration_da1_${category}.md`)
      expect(spec.modelWaveId).toBe(`DA1-${category.toUpperCase()}`)
    }
  })
})

describe('extractCategoryData', () => {
  it('always includes the base columns', () => {
    for (const category of ALL_CATEGORIES) {
      const data = extractCategoryData(chart, category)
      expect(data.category).toBe(category)
      expect(data.planets).toBe(chart.planets)
      expect(data.nakshatras).toBe(chart.nakshatras)
      expect(data.relationships).toBe(chart.relationships)
      expect(data.ashtakavarga).toBe(chart.ashtakavarga)
      expect(data.dashaTree).toBe(chart.dashaTree)
      expect(data.upagrahas).toBe(chart.upagrahas)
    }
  })

  it('nulls upagrahas when the stored column is absent, never omits the key', () => {
    const bare = { ...chart, upagrahas: undefined }
    const data = extractCategoryData(bare, 'career')
    expect(data.upagrahas).toBeNull()
  })

  it('returns the divisional charts listed in the registry, in spec order', () => {
    for (const category of ALL_CATEGORIES) {
      const spec = getDomainAgentSpec(category)
      const data = extractCategoryData(chart, category)
      const divisions = (data.divisionalCharts ?? []).map(
        (entry) => (entry as { division: number }).division
      )
      expect(divisions).toEqual(spec.divisions)
    }
  })

  it('includes exactly the extraColumns from the registry', () => {
    for (const category of ALL_CATEGORIES) {
      const spec = getDomainAgentSpec(category)
      const data = extractCategoryData(chart, category)
      expect('shadbala' in data).toBe(spec.extraColumns.includes('shadbala'))
      expect('jaimini' in data).toBe(spec.extraColumns.includes('jaimini'))
    }
  })

  it('omits divisionalCharts when the stored column is missing or empty', () => {
    const bare = { ...chart, divisionalCharts: null }
    expect('divisionalCharts' in extractCategoryData(bare, 'career')).toBe(false)

    const empty = { ...chart, divisionalCharts: [] }
    expect('divisionalCharts' in extractCategoryData(empty, 'career')).toBe(false)
  })

  it('silently skips divisions absent from the stored data', () => {
    const partial = { ...chart, divisionalCharts: [d(10)] } // career wants [9, 10]
    const data = extractCategoryData(partial, 'career')
    const divisions = (data.divisionalCharts ?? []).map(
      (entry) => (entry as { division: number }).division
    )
    expect(divisions).toEqual([10])
  })
})

describe('pickScoringRawChart carries every scoring input (dual-path parity guard)', () => {
  it('includes jaimini and all scoring columns so the pipeline and /api/timeline cannot diverge', () => {
    const raw = pickScoringRawChart(chart)
    // These keys MUST all be forwarded — a missing one silently drops a scoring factor.
    expect(Object.keys(raw).sort()).toEqual(
      ['ashtakavarga', 'bhavaBala', 'jaimini', 'karakas', 'planets', 'shadbala'].sort()
    )
    expect(raw.jaimini).toBe(chart.jaimini)
  })

  it('feeds jaimini through to ScoringChartData', () => {
    const categoryData = extractCategoryData(chart, 'career')
    const scoring = toScoringChartData(categoryData, pickScoringRawChart(chart))
    expect(scoring.jaimini).toBe(chart.jaimini)
  })

  // divisionalCharts + relationships reach the scorer via categoryData (extractCategoryData),
  // NOT via pickScoringRawChart — this guards the OTHER door. If a call site ever stops
  // passing them into extractCategoryData, divisionalChartStrength / rashiDrishti silently
  // drop out of that path's scores while the rawChart guard above stays green.
  it('feeds divisionalCharts and relationships through to ScoringChartData (categoryData door)', () => {
    const categoryData = extractCategoryData(chart, 'career')
    const scoring = toScoringChartData(categoryData, pickScoringRawChart(chart))

    // relationships: always-included base column, passed through by reference
    expect(scoring.relationships).toBe(chart.relationships)

    // divisionalCharts: domain-filtered (career = [9, 10]) — same entries, spec order
    const divisions = (scoring.divisionalCharts ?? []).map((entry) => entry.division)
    expect(divisions).toEqual(DOMAIN_AGENT_REGISTRY.career.divisions)
    // and the domain's primaryDivision (D10 for career) must be among them, or
    // divisionalChartStrength can never apply for this domain
    expect(divisions).toContain(10)
  })

  it('nulls divisionalCharts/relationships in ScoringChartData when the columns are absent (paste path)', () => {
    const bare = { ...chart, divisionalCharts: null, relationships: null }
    const categoryData = extractCategoryData(bare, 'career')
    const scoring = toScoringChartData(categoryData, pickScoringRawChart(bare))
    expect(scoring.divisionalCharts ?? null).toBeNull()
    expect(scoring.relationships ?? null).toBeNull()
  })
})
