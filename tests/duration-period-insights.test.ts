/**
 * tests/duration-period-insights.test.ts — buildPeriodInsights digest.
 *
 * The digest is a pure SELECTION + LABELING pass over already-computed data. These
 * tests assert it selects the right drishti / control / nakshatra records per domain
 * (career vs health), tags houses by domain role, and degrades gracefully when a
 * facet (jaimini, relationships) is absent — never throwing.
 */
import { describe, it, expect } from 'vitest'
import { buildPeriodInsights } from '@/engine/durationAnalysis/periodInsights'
import { resolveDomainWeights } from '@/engine/durationAnalysis/scoringWeights'
import type { PeriodLordAnnotation, ScoreBreakdown, ScoredDashaSlice } from '@/lib/durationTypes'

// ─── Fixture factories ────────────────────────────────────────────────────

function ann(p: Partial<PeriodLordAnnotation> & { planet: string }): PeriodLordAnnotation {
  return {
    planet: p.planet,
    sign: p.sign ?? '',
    house: p.house ?? 0,
    nakshatra: p.nakshatra ?? '',
    nakshatraLord: p.nakshatraLord ?? '',
    subLord: p.subLord ?? '',
    retrograde: p.retrograde ?? false,
    combust: p.combust ?? false,
    cazimi: p.cazimi ?? false,
    activatedYogas: p.activatedYogas ?? [],
    ownsHouses: p.ownsHouses ?? [],
    occupiesHouse: p.occupiesHouse ?? p.house ?? 0,
    karakaRole: p.karakaRole ?? null,
  }
}

function breakdown(factors: { factor: string; value: unknown }[]): ScoreBreakdown {
  return {
    score: 50,
    intensity: 'medium',
    favorable: true,
    factors: factors.map((f) => ({ ...f, normalized: 0.5, weight: 1, contribution: 0.5 })) as ScoreBreakdown['factors'],
    omissions: [],
    weightSumApplied: 1,
    reducedConfidence: false,
    confidence: 1,
    weightsVersion: 'test',
  }
}

function slice(
  md: PeriodLordAnnotation,
  ad: PeriodLordAnnotation,
  pd: PeriodLordAnnotation,
  bd: ScoreBreakdown
): ScoredDashaSlice {
  return {
    md: { lord: md.planet, start: '2026-01-01', end: '2026-06-01' },
    ad: { lord: ad.planet, start: '2026-01-01', end: '2026-03-01' },
    pd: { lord: pd.planet, start: '2026-01-01', end: '2026-02-01' },
    lordAnnotations: { mdLord: md, adLord: ad, pdLord: pd },
    score: 50,
    intensity: 'medium',
    favorable: true,
    scoreBreakdown: bd,
  }
}

// Taurus lagna (sign 2, derived from Saturn's signNumber 5 / house 4).
const planets = [
  { planet: 'Saturn', signNumber: 5, house: 4 },
  { planet: 'Jupiter', signNumber: 11, house: 10 }, // occupies house 10 (Aquarius)
  { planet: 'Mars', signNumber: 6, house: 5 },
]

const relationships = {
  aspects: [
    // Saturn casts onto house 10 (career primary), landing on Jupiter
    { from: 'Saturn', fromHouse: 4, toHouse: 10, toSign: 11, toPlanets: ['Jupiter'], toUpagrahas: [], type: 'saturn_10th', strength: 60, school: 'parashari' },
    // Mars (malefic) casts onto house 6 (health)
    { from: 'Mars', fromHouse: 5, toHouse: 6, toSign: 7, toPlanets: [], toUpagrahas: [], type: '7th', strength: 60, school: 'parashari' },
    // Jupiter casts onto house 2
    { from: 'Jupiter', fromHouse: 10, toHouse: 2, toSign: 3, toPlanets: [], toUpagrahas: [], type: 'jupiter_5th', strength: 60, school: 'parashari' },
  ],
  conjunctions: [],
  mutualReception: [],
}

// D9 (trivial) and D10 (worked example) — divisionalCharts are already domain-filtered
// by extractCategoryData in production (covered by duration-extractor.test.ts); here we
// just feed buildPeriodInsights whatever it needs to prove it reads varga-relative
// control/drishti, not just D1.
const d9 = { division: 9, name: 'Navamsa', shortName: 'D9', lagna: 'Aries', lagnaSignNumber: 1, planets: [] }
// D10 with lagnaSignNumber=1 (Aries) so sign number == house number == 1:1 for easy hand-checking.
// Saturn sits in house 4 (Cancer): 7th-aspect lands on house 10 (career primary), and by
// SIGN_LORDS, Saturn independently OWNS house 10 (Capricorn) in this varga too.
const d10 = {
  division: 10,
  name: 'Dashamsa',
  shortName: 'D10',
  lagna: 'Aries',
  lagnaSignNumber: 1,
  planets: [{ planet: 'Saturn', sign: 'Cancer', signNumber: 4, house: 4 }],
}
const divisionalCharts = [d9, d10]

const nakshatraRelationships = {
  depositorChains: [{ planet: 'Saturn', chain: ['Venus', 'Mars'], selfReinforcing: false }],
  nakshatraParivartana: [],
}

const jaimini = {
  argala: [{ targetHouse: 10, targetSign: 11, argalaFrom: 4, argalaPlanets: ['Venus'], type: 'primary', kind: 'argala' }],
}

const bhavaBala = { houses: [{ house: 10, total: 400, rupas: 8 }] }
// sign-indexed SAV: index 10 = Aquarius = 29
const ashtakavarga = { sav: [30, 28, 26, 29, 37, 23, 30, 22, 27, 31, 29, 33], bav: {}, savTotal: 337 }

const categoryData = { planets, relationships, nakshatraRelationships, jaimini, bhavaBala, ashtakavarga, divisionalCharts }

const mdSaturn = ann({ planet: 'Saturn', sign: 'Leo', house: 4, ownsHouses: [9, 10], nakshatra: 'Pushya', nakshatraLord: 'Saturn', subLord: 'Sun', karakaRole: 'AmK' })
const adJupiter = ann({ planet: 'Jupiter', sign: 'Aquarius', house: 10, ownsHouses: [8, 11] })
const pdMars = ann({ planet: 'Mars', sign: 'Virgo', house: 5, ownsHouses: [7, 12] })

const bd = breakdown([
  { factor: 'mdLordDignity', value: 'own' },
  { factor: 'adLordDignity', value: 'neutral' },
  { factor: 'pdLordDignity', value: 'debilitated' },
  { factor: 'rashiDrishti', value: [{ lord: 'Saturn', toHouses: [10] }] },
])

describe('buildPeriodInsights — career lens', () => {
  const weights = resolveDomainWeights('career')
  const insights = buildPeriodInsights(slice(mdSaturn, adJupiter, pdMars, bd), categoryData, weights)!

  it('returns a digest with three lord drivers', () => {
    expect(insights).not.toBeNull()
    expect(insights.lords.map((l) => l.lord)).toEqual(['Saturn', 'Jupiter', 'Mars'])
  })

  it('tags controlled houses by domain role (10th = primary for career)', () => {
    const saturn = insights.lords[0]
    const h10 = saturn.owns.find((h) => h.house === 10)
    const h9 = saturn.owns.find((h) => h.house === 9)
    expect(h10?.role).toBe('primary')     // career primaryHouses = [10]
    expect(h10?.sign).toBe('Aquarius')    // shown WITH its sign
    expect(h9?.role).toBe('benefic')      // 9 ∈ career beneficHouses
  })

  it('surfaces graha-drishti cast onto the domain house', () => {
    const saturn = insights.lords[0]
    const onto10 = saturn.aspectsCast.find((a) => a.toHouse === 10)
    expect(onto10).toBeTruthy()
    expect(onto10?.ontoDomain).toBe(true)
    expect(onto10?.toPlanets).toContain('Jupiter')
  })

  it('carries dignity, karaka role, natural-karaka, rashi-drishti and nakshatra chain', () => {
    const saturn = insights.lords[0]
    expect(saturn.dignity).toBe('own')
    expect(saturn.karakaRole).toBe('AmK')
    expect(saturn.isNaturalKaraka).toBe(true)               // Saturn ∈ career natural karakas
    expect(saturn.rashiDrishtiOnDomain).toContain(10)
    expect(saturn.nakshatraChain).toEqual(['Venus', 'Mars'])
  })

  it('summarizes karaka involvement', () => {
    expect(insights.karakaSummary.amongRunningLords).toContain('Saturn')
    expect(insights.karakaSummary.karakaRoleMatch).toMatch(/AmK = MD lord \(Saturn\)/)
  })

  it('carries per-varga (D9/D10) control + drishti, not just D1', () => {
    const saturn = insights.lords[0]
    expect(saturn.vargas.map((v) => v.division)).toEqual([9, 10]) // D1 excluded — covered by owns/occupies above
    const d10 = saturn.vargas.find((v) => v.division === 10)!
    expect(d10.name).toBe('D10 — Dashamsa')
    expect(d10.occupies).toMatchObject({ house: 4, sign: 'Cancer' })
    expect(d10.owns).toContainEqual({ house: 10, sign: 'Capricorn', role: 'primary' }) // Saturn owns Capricorn
    expect(d10.aspectsOntoPrimary).toEqual([10]) // Saturn's 7th aspect from H4 lands on H10
  })

  it('varga ownership degrades to owns-only when the divisional chart has no planet placements', () => {
    const saturn = insights.lords[0]
    const d9 = saturn.vargas.find((v) => v.division === 9)!
    expect(d9.occupies).toBeNull()          // no D9 placements in the fixture
    expect(d9.aspectsOntoPrimary).toEqual([]) // no drishti without a placed lord
    expect(d9.owns).toContainEqual({ house: 10, sign: 'Capricorn', role: 'primary' }) // ownership is lagna-only
  })

  it('builds a domain-house focus for house 10 with lord/occupants/aspects/argala/BAV', () => {
    const h10 = insights.domainHouseFocus.find((f) => f.house === 10)!
    expect(h10.lord).toBe('Saturn')                          // lord of Aquarius
    expect(h10.occupants).toContain('Jupiter')
    expect(h10.aspectedBy.map((a) => a.planet)).toContain('Saturn')
    expect(h10.argalaFrom[0]).toMatchObject({ house: 4, planets: ['Venus'] })
    expect(h10.savBindu).toBe(29)
    expect(h10.bhavaBalaRupas).toBe(8)
  })
})

describe('buildPeriodInsights — health lens foregrounds afflictions on 1/6/8', () => {
  const weights = resolveDomainWeights('health')
  const insights = buildPeriodInsights(slice(mdSaturn, adJupiter, pdMars, bd), categoryData, weights)!

  it('focuses the health primary houses', () => {
    expect(insights.domainHouseFocus.map((f) => f.house).sort((a, b) => a - b)).toEqual([1, 6, 8])
  })

  it('shows a malefic (Mars) aspecting the disease house (6th)', () => {
    const h6 = insights.domainHouseFocus.find((f) => f.house === 6)!
    const mars = h6.aspectedBy.find((a) => a.planet === 'Mars')
    expect(mars).toBeTruthy()
    expect(mars?.benefic).toBe(false)
  })
})

describe('buildPeriodInsights — graceful degradation', () => {
  const weights = resolveDomainWeights('career')

  it('omits argala/aspects when jaimini/relationships are absent, never throws', () => {
    const bare = { planets } // no relationships / nakshatra / jaimini / balas
    const insights = buildPeriodInsights(slice(mdSaturn, adJupiter, pdMars, bd), bare, weights)!
    expect(insights).not.toBeNull()
    expect(insights.lords[0].aspectsCast).toEqual([])
    const h10 = insights.domainHouseFocus.find((f) => f.house === 10)!
    expect(h10.argalaFrom).toEqual([])
    expect(h10.savBindu).toBeNull()
  })

  it('returns null when there are no lord annotations', () => {
    const noAnn = { ...slice(mdSaturn, adJupiter, pdMars, bd), lordAnnotations: undefined } as unknown as ScoredDashaSlice
    expect(buildPeriodInsights(noAnn, categoryData, weights)).toBeNull()
  })

  it('returns null when planets are unavailable (cannot derive lagna)', () => {
    expect(buildPeriodInsights(slice(mdSaturn, adJupiter, pdMars, bd), { planets: [] }, weights)).toBeNull()
  })
})
