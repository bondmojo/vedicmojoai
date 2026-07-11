/**
 * tests/duration-extractor.test.ts — extractCategoryData + domain-agent registry.
 *
 * The extractor is pure: given UnifiedChart JSONB columns and a category, it
 * must return exactly the columns DOMAIN_AGENT_REGISTRY specifies.
 */
import { describe, it, expect } from 'vitest'
import { extractCategoryData } from '@/engine/durationAnalysis/extractor'
import { DOMAIN_AGENT_REGISTRY, getDomainAgentSpec } from '@/engine/durationAnalysis/registry'
import type { DurationCategory } from '@/lib/durationTypes'

const ALL_CATEGORIES: DurationCategory[] = ['health', 'career', 'wealth', 'marriage', 'property', 'cashflow']

const d = (division: number) => ({ division, name: `D${division}`, placements: [] })

const chart = {
  planets: [{ planet: 'Sun' }],
  nakshatras: [{ planet: 'Sun', nakshatra: 'Ashwini' }],
  relationships: { combustion: [] },
  shadbala: { totals: {} },
  divisionalCharts: [d(1), d(2), d(3), d(4), d(7), d(9), d(10), d(12), d(30)],
  jaimini: { charaKarakas: [] },
  ashtakavarga: { bav: {} },
  dashaTree: { mahadashas: [] },
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

  it('career includes D9 and D10', () => {
    expect(DOMAIN_AGENT_REGISTRY.career.divisions).toEqual([9, 10])
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
    }
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
