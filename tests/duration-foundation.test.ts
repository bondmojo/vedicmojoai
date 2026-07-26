/**
 * tests/duration-foundation.test.ts — Foundation sub-agent stage (Track 2).
 *
 * Covers the deterministic, no-LLM parts: per-domain planner selection, paste-path
 * skipping, the foundation catalogue/registry wiring, and the prompt-section builder.
 */
import { describe, it, expect } from 'vitest'
import {
  selectFoundationAgents,
  buildFoundationSection,
  type FoundationChartInputs,
} from '@/engine/durationAnalysis/foundation'
import {
  DOMAIN_AGENT_REGISTRY,
  FOUNDATION_AGENT_CATALOGUE,
  getFoundationAgentSpec,
} from '@/engine/durationAnalysis/registry'
import type { DurationCategory, FoundationOutput } from '@/lib/durationTypes'

const ALL: DurationCategory[] = ['health', 'career', 'wealth', 'marriage', 'property', 'cashflow']

const fullInputs: FoundationChartInputs = {
  planets: [{ planet: 'Sun', signNumber: 1, house: 1 }],
  divisionalCharts: [{ division: 10 }],
  nakshatras: [{ planet: 'Sun', nakshatra: 'Ashwini', nakshatraLord: 'Ketu' }],
  nakshatraRelationships: { depositorChains: [] },
  upagrahas: [{ abbr: 'Gu', house: 10, signNumber: 11 }],
  ashtakavarga: { sav: new Array(12).fill(28), bav: { Sun: new Array(12).fill(4) }, savTotal: 336 },
  lagnaSignNumber: 1,
}

describe('foundation registry wiring', () => {
  it('every domain declares foundation agents that all resolve in the catalogue', () => {
    for (const cat of ALL) {
      const ids = DOMAIN_AGENT_REGISTRY[cat].foundationAgents
      expect(ids.length).toBeGreaterThan(0)
      for (const id of ids) {
        expect(() => getFoundationAgentSpec(id)).not.toThrow()
        expect(FOUNDATION_AGENT_CATALOGUE[id].modelWaveId).toBe(id)
      }
    }
  })
})

describe('selectFoundationAgents (deterministic planner)', () => {
  it('runs every declared agent when all data is present', () => {
    const declared = DOMAIN_AGENT_REGISTRY.career.foundationAgents
    expect(selectFoundationAgents(declared, fullInputs)).toEqual(declared)
  })

  it('skips agents whose required facet is absent (paste-path chart)', () => {
    const pastePath: FoundationChartInputs = {
      planets: [], divisionalCharts: null, nakshatras: [], nakshatraRelationships: undefined,
      upagrahas: [], ashtakavarga: { sav: [], bav: {}, savTotal: 0 }, lagnaSignNumber: 1,
    }
    expect(selectFoundationAgents(DOMAIN_AGENT_REGISTRY.career.foundationAgents, pastePath)).toEqual([])
  })

  it('skips only the agents missing their data', () => {
    // planets + bav present, but no nakshatras and no upagrahas
    const partial: FoundationChartInputs = {
      ...fullInputs,
      nakshatras: [],
      upagrahas: [],
    }
    const selected = selectFoundationAgents(
      ['FOUND-PLANETS', 'FOUND-NAKSHATRA', 'FOUND-UPAGRAHA', 'FOUND-BAV'],
      partial,
    )
    expect(selected).toEqual(['FOUND-PLANETS', 'FOUND-BAV'])
  })

  it('treats an empty BAV map as absent', () => {
    const noBav: FoundationChartInputs = { ...fullInputs, ashtakavarga: { sav: [], bav: {}, savTotal: 0 } }
    expect(selectFoundationAgents(['FOUND-BAV'], noBav)).toEqual([])
  })
})

describe('buildFoundationSection', () => {
  it('returns empty string for null/empty output (safe to concatenate)', () => {
    expect(buildFoundationSection(null)).toBe('')
    expect(buildFoundationSection({})).toBe('')
  })

  it('renders a labelled section with summaries and findings', () => {
    const fo: FoundationOutput = {
      'FOUND-PLANETS': { agent_id: 'FOUND-PLANETS', summary: 'Strong 10th.', key_findings: ['Saturn exalted in H6'] },
      'FOUND-BAV': { agent_id: 'FOUND-BAV', summary: 'H11 well-supported.', key_findings: ['SAV 33 in Pisces'] },
    }
    const section = buildFoundationSection(fo)
    expect(section).toContain('--- FOUNDATION ANALYSIS')
    expect(section).toContain('[Planetary] Strong 10th.')
    expect(section).toContain('  - Saturn exalted in H6')
    expect(section).toContain('[Ashtakavarga] H11 well-supported.')
  })
})
