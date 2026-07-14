/**
 * engine/durationAnalysis/scoring.test.ts
 *
 * Deterministic regression tests for the Scoring Engine (task 4).
 * These lock in the corrected sign/house conversions and peak-ranking behavior,
 * and cover the core invariants that the (optional) property tests target.
 *
 * Tags: Feature: duration-analysis-scoring
 */

import { describe, it, expect } from 'vitest'
import {
  scorePeriod,
  identifyPeaks,
  FAVORABLE_THRESHOLD,
  INTENSITY_HIGH_DELTA,
  INTENSITY_MEDIUM_DELTA,
  PEAK_SIGNIFICANCE_DELTA,
  type PeriodScoreResult,
} from './scoring'
import { resolveDomainWeights, WEIGHTS_VERSION } from './scoringWeights'
import type {
  DashaSlice,
  ScoringChartData,
  PeriodLordAnnotation,
  TransitOverlay,
} from '@/lib/durationTypes'

// ─── Builders ─────────────────────────────────────────────────────────

function annot(planet: string, opts: Partial<PeriodLordAnnotation> = {}): PeriodLordAnnotation {
  return {
    planet,
    sign: '',
    house: opts.house ?? 1,
    nakshatra: '',
    nakshatraLord: '',
    subLord: '',
    retrograde: false,
    combust: false,
    cazimi: false,
    activatedYogas: opts.activatedYogas ?? [],
    ownsHouses: opts.ownsHouses ?? [],
    occupiesHouse: opts.house ?? 1,
    karakaRole: opts.karakaRole ?? null,
  }
}

function makeSlice(
  md: string,
  ad: string,
  pd: string,
  pdStart = '2024-01-01',
  pdEnd = '2024-04-01',
  yogas: string[] = []
): DashaSlice {
  return {
    md: { lord: md, start: '2020-01-01', end: '2030-01-01' },
    ad: { lord: ad, start: pdStart, end: pdEnd },
    pd: { lord: pd, start: pdStart, end: pdEnd },
    lordAnnotations: {
      mdLord: annot(md, { activatedYogas: yogas }),
      adLord: annot(ad, { activatedYogas: yogas }),
      pdLord: annot(pd, { activatedYogas: yogas }),
    },
  }
}

// Aries-ascendant chart (signNumber === house)
function ariesChart(): ScoringChartData {
  return {
    category: 'career',
    planets: [
      { planet: 'Sun',     signNumber: 1,  house: 1,  longitude: 5,   latitude: 0, speed: 1, retrograde: false, sign: 'Aries',       degreeInSign: 5 },
      { planet: 'Moon',    signNumber: 2,  house: 2,  longitude: 35,  latitude: 0, speed: 13, retrograde: false, sign: 'Taurus',      degreeInSign: 5 },
      { planet: 'Mars',    signNumber: 10, house: 10, longitude: 275, latitude: 0, speed: 0.5, retrograde: false, sign: 'Capricorn',   degreeInSign: 5 },
      { planet: 'Mercury', signNumber: 6,  house: 6,  longitude: 155, latitude: 0, speed: 1, retrograde: false, sign: 'Virgo',       degreeInSign: 5 },
      { planet: 'Jupiter', signNumber: 4,  house: 4,  longitude: 95,  latitude: 0, speed: 0.1, retrograde: false, sign: 'Cancer',      degreeInSign: 5 },
      { planet: 'Venus',   signNumber: 12, house: 12, longitude: 335, latitude: 0, speed: 1, retrograde: false, sign: 'Pisces',      degreeInSign: 5 },
      { planet: 'Saturn',  signNumber: 7,  house: 7,  longitude: 185, latitude: 0, speed: 0.03, retrograde: false, sign: 'Libra',       degreeInSign: 5 },
    ] as ScoringChartData['planets'],
    ashtakavarga: { sav: [30, 25, 28, 32, 22, 26, 35, 18, 29, 40, 33, 19], bav: {}, savTotal: 337 },
  }
}

// ─── Property 1: Score is a bounded integer ──────────────────────────

describe('Score is a bounded integer (Property 1)', () => {
  it('returns an integer 0–100 for a normal period', () => {
    const w = resolveDomainWeights('career')
    const { score } = scorePeriod(makeSlice('Sun', 'Venus', 'Moon'), ariesChart(), null, w)
    expect(Number.isInteger(score)).toBe(true)
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(100)
  })

  it('returns neutral 50 with reducedConfidence when only chart-free neutral factors resolve', () => {
    const w = resolveDomainWeights('career')
    const emptyChart: ScoringChartData = { category: 'career' }
    // Lords chosen to NOT match career natural karakas (Sun/Saturn/Mercury) or karakaRole,
    // so the only resolvable factors (karakaRole, naturalKaraka, activatedYogas) are all neutral 0.5.
    const { score, breakdown } = scorePeriod(makeSlice('Moon', 'Mars', 'Rahu'), emptyChart, null, w)
    expect(score).toBe(50)
    // Chart-data factors (shadbala, houseOwnership, natalHouseStrength, …) are omitted →
    // primary omissions → reduced confidence.
    expect(breakdown.reducedConfidence).toBe(true)
    expect(breakdown.confidence).toBeLessThan(1)
  })
})

// ─── Property 2: Determinism ─────────────────────────────────────────

describe('Determinism (Property 2)', () => {
  it('returns identical score + breakdown on repeated calls', () => {
    const w = resolveDomainWeights('marriage')
    const slice = makeSlice('Venus', 'Jupiter', 'Moon')
    const chart = ariesChart()
    const a = scorePeriod(slice, chart, null, w)
    const b = scorePeriod(slice, chart, null, w)
    expect(a.score).toBe(b.score)
    expect(JSON.stringify(a.breakdown)).toBe(JSON.stringify(b.breakdown))
  })
})

// ─── Property 5: Never throws on malformed input ─────────────────────

describe('Never throws on malformed input (Property 5)', () => {
  it('handles a garbage chart without throwing', () => {
    const w = resolveDomainWeights('health')
    const junk = { category: 'health', planets: 'not-an-array', shadbala: 42, ashtakavarga: { sav: [] } } as unknown as ScoringChartData
    expect(() => scorePeriod(makeSlice('Rahu', 'Ketu', 'Sun'), junk, null, w)).not.toThrow()
  })
})

// ─── Property 6 / 27: Factor itemization + weights version stamp ─────

describe('Factor itemization and weights version (Property 6, 27)', () => {
  it('records factor/value/normalized/weight/contribution for each applied factor', () => {
    const w = resolveDomainWeights('career')
    const { breakdown } = scorePeriod(makeSlice('Sun', 'Venus', 'Moon'), ariesChart(), null, w)
    expect(breakdown.factors.length).toBeGreaterThan(0)
    for (const f of breakdown.factors) {
      expect(f).toHaveProperty('factor')
      expect(f).toHaveProperty('value')
      expect(typeof f.normalized).toBe('number')
      expect(typeof f.weight).toBe('number')
      expect(f.contribution).toBeCloseTo(f.weight * f.normalized, 6)
    }
  })

  it('stamps the current WEIGHTS_VERSION', () => {
    const w = resolveDomainWeights('career')
    const { breakdown } = scorePeriod(makeSlice('Sun', 'Venus', 'Moon'), ariesChart(), null, w)
    expect(breakdown.weightsVersion).toBe(WEIGHTS_VERSION)
  })
})

// ─── Property 7: intensity/favorable are pure functions of score ─────

describe('Intensity/favorable purity (Property 7)', () => {
  it('derives favorable and intensity consistently from the score', () => {
    const w = resolveDomainWeights('career')
    const { score, breakdown } = scorePeriod(makeSlice('Sun', 'Venus', 'Moon'), ariesChart(), null, w)
    expect(breakdown.favorable).toBe(score >= FAVORABLE_THRESHOLD)
    const delta = Math.abs(score - 50)
    const expected = delta >= INTENSITY_HIGH_DELTA ? 'high' : delta >= INTENSITY_MEDIUM_DELTA ? 'medium' : 'low'
    expect(breakdown.intensity).toBe(expected)
  })
})

// ─── Lagna-correct house mapping (regression: sign vs house bug) ─────

describe('House ownership uses lagna-relative houses (non-Aries regression)', () => {
  it('scores a strong career house-lord placement above a dusthana placement for a non-Aries chart', () => {
    const w = resolveDomainWeights('career')

    // Cancer-ascendant chart: lagna sign 4. Sun in Leo (sign 5) = house 2 (benefic for career).
    const cancerChart: ScoringChartData = {
      category: 'career',
      planets: [
        { planet: 'Sun',    signNumber: 5,  house: 2,  longitude: 125, latitude: 0, speed: 1, retrograde: false, sign: 'Leo',      degreeInSign: 5 },
        { planet: 'Saturn', signNumber: 11, house: 8,  longitude: 305, latitude: 0, speed: 0.03, retrograde: false, sign: 'Aquarius', degreeInSign: 5 },
        { planet: 'Moon',   signNumber: 4,  house: 1,  longitude: 95,  latitude: 0, speed: 13, retrograde: false, sign: 'Cancer',   degreeInSign: 5 },
      ] as ScoringChartData['planets'],
      ashtakavarga: { sav: [30, 25, 28, 32, 22, 26, 35, 18, 29, 40, 33, 19], bav: {}, savTotal: 337 },
    }

    // Sun owns Leo (house 2 from Cancer lagna — benefic) and occupies house 2 — favorable ownership
    const sunPeriod = scorePeriod(makeSlice('Sun', 'Sun', 'Sun'), cancerChart, null, w)
    // Saturn occupies house 8 (dusthana) and owns Aquarius (house 8) + Capricorn (house 7) — mixed/challenged
    const saturnPeriod = scorePeriod(makeSlice('Saturn', 'Saturn', 'Saturn'), cancerChart, null, w)

    const sunHO = sunPeriod.breakdown.factors.find((f) => f.factor === 'houseOwnership')!
    const satHO = saturnPeriod.breakdown.factors.find((f) => f.factor === 'houseOwnership')!
    expect(sunHO.normalized).toBeGreaterThan(satHO.normalized)
  })
})

describe('NatalHouseStrength maps house→sign via lagna against sign-indexed SAV (regression)', () => {
  it('reads the SAV bindu of the correct sign for the domain primary house', () => {
    const w = resolveDomainWeights('career') // primaryHouses [10]
    // Cancer lagna (sign 4): house 10 → sign (4+10-1)=13→1 (Aries). SAV[0]=99 (spiked).
    const spikedChart: ScoringChartData = {
      category: 'career',
      planets: [
        { planet: 'Moon', signNumber: 4, house: 1, longitude: 95, latitude: 0, speed: 13, retrograde: false, sign: 'Cancer', degreeInSign: 5 },
      ] as ScoringChartData['planets'],
      ashtakavarga: { sav: [99, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], bav: {}, savTotal: 99 },
    }
    const { breakdown } = scorePeriod(makeSlice('Sun', 'Venus', 'Moon'), spikedChart, null, w)
    const nhs = breakdown.factors.find((f) => f.factor === 'natalHouseStrength')!
    // avg bindus = 99 (Aries sign) → normalized = clamp(99/(2*28),0,1) = 1.0
    expect(nhs.value).toBe(99)
    expect(nhs.normalized).toBe(1)
  })
})

// ─── Peaks: score extremes, ranking, significance floor ──────────────

function scoredEntry(score: number, pdStart: string, md = 'Sun', ad = 'Moon', pd = 'Mars'): { period: DashaSlice; result: PeriodScoreResult } {
  return {
    period: makeSlice(md, ad, pd, pdStart, '2099-01-01'),
    result: {
      score,
      breakdown: {
        score, intensity: 'low', favorable: score >= 50,
        factors: [{ factor: 'shadbala', value: score, normalized: score / 100, weight: 10, contribution: score / 10 }],
        omissions: [], weightSumApplied: 10, reducedConfidence: false, confidence: 1, weightsVersion: WEIGHTS_VERSION,
      },
    },
  }
}

describe('identifyPeaks: score extremes ranked correctly (Property 8, regression)', () => {
  it('returns the topN LOWEST as stress and topN HIGHEST as favorable, ranked by score not date', () => {
    // Scores intentionally out of chronological order to catch the "rest sliced by date" bug
    const scored = [
      scoredEntry(70, '2024-01-01'),  // favorable
      scoredEntry(10, '2024-02-01'),  // most stress
      scoredEntry(88, '2024-03-01'),  // most favorable
      scoredEntry(30, '2024-04-01'),  // stress
      scoredEntry(20, '2024-05-01'),  // stress
      scoredEntry(64, '2024-06-01'),  // favorable
    ]
    const { peakStress, peakFavorable } = identifyPeaks(scored, 3)

    // The 3 lowest are 10, 20, 30
    expect(peakStress.map((p) => p.score)).toEqual([10, 20, 30])
    // The 3 highest are 88, 70, 64
    expect(peakFavorable.map((p) => p.score)).toEqual([88, 70, 64])
  })

  it('respects the significance floor — a flat window yields no peaks (Property 26)', () => {
    const flat = [
      scoredEntry(48, '2024-01-01'),
      scoredEntry(50, '2024-02-01'),
      scoredEntry(52, '2024-03-01'),
      scoredEntry(45, '2024-04-01'),
    ]
    const { peakStress, peakFavorable } = identifyPeaks(flat, 3)
    // All within ±12 of 50 → no peaks
    expect(peakStress).toEqual([])
    expect(peakFavorable).toEqual([])
  })

  it('only counts periods past the significance threshold', () => {
    const scored = [
      scoredEntry(38, '2024-01-01'),  // exactly at stress floor (≤38) → qualifies
      scoredEntry(39, '2024-02-01'),  // just above floor → does NOT qualify
      scoredEntry(62, '2024-03-01'),  // exactly at favorable floor (≥62) → qualifies
      scoredEntry(61, '2024-04-01'),  // just below → does NOT qualify
    ]
    const { peakStress, peakFavorable } = identifyPeaks(scored, 3)
    expect(peakStress.map((p) => p.score)).toEqual([38])
    expect(peakFavorable.map((p) => p.score)).toEqual([62])
  })

  it('includes all tied extremes deterministically ordered by pd.start (Property 10)', () => {
    const scored = [
      scoredEntry(20, '2024-05-01'),
      scoredEntry(20, '2024-01-01'),
      scoredEntry(20, '2024-03-01'),
      scoredEntry(70, '2024-02-01'),
    ]
    const { peakStress } = identifyPeaks(scored, 3)
    // All three 20s included, ordered by pd.start ascending
    expect(peakStress.map((p) => p.periodKey.split('/').pop())).toEqual([
      '2024-01-01', '2024-03-01', '2024-05-01',
    ])
  })

  it('includes ties at the topN cutoff boundary (no silent drop)', () => {
    const scored = [
      scoredEntry(10, '2024-01-01'),
      scoredEntry(20, '2024-02-01'),
      scoredEntry(20, '2024-03-01'),
      scoredEntry(20, '2024-04-01'),  // three-way tie at the cutoff (topN=2)
    ]
    const { peakStress } = identifyPeaks(scored, 2)
    // 10 + all three 20s (tie at cutoff score 20) = 4 entries
    expect(peakStress.map((p) => p.score)).toEqual([10, 20, 20, 20])
  })
})

// ─── Neechabhanga lift is per-lord, not cross-lord (T4-1 regression) ─

describe('Neechabhanga lift only applies to the named lord (T4-1 regression)', () => {
  // Saturn is debilitated in Aries (sign 1). Build a chart where Saturn (AD lord) is
  // debilitated, and the only Neechabhanga yoga names the MD lord (Sun), NOT Saturn.
  function chartWithDebilitatedSaturn(): ScoringChartData {
    return {
      category: 'career',
      planets: [
        { planet: 'Sun',    signNumber: 1,  house: 1,  longitude: 5,   latitude: 0, speed: 1, retrograde: false, sign: 'Aries',     degreeInSign: 5 },
        { planet: 'Saturn', signNumber: 1,  house: 1,  longitude: 8,   latitude: 0, speed: 0.03, retrograde: false, sign: 'Aries',   degreeInSign: 8 },
        { planet: 'Moon',   signNumber: 4,  house: 4,  longitude: 95,  latitude: 0, speed: 13, retrograde: false, sign: 'Cancer',    degreeInSign: 5 },
      ] as ScoringChartData['planets'],
    }
  }

  it('does NOT lift a debilitated AD lord when the cancellation yoga names a different (MD) lord', () => {
    const w = resolveDomainWeights('career')
    const chart = chartWithDebilitatedSaturn()
    // Yoga names the MD lord (Sun), not Saturn.
    const slice = makeSlice('Sun', 'Saturn', 'Moon', '2024-01-01', '2024-04-01', [
      'Neechabhanga active — Sun debilitation cancelled',
    ])
    const { breakdown } = scorePeriod(slice, chart, null, w)
    const adDignity = breakdown.factors.find((f) => f.factor === 'adLordDignity')!
    // Saturn is debilitated and its own cancellation is NOT present → stays debilitated (0.0)
    expect(adDignity.normalized).toBe(0)
  })

  it('DOES lift a debilitated AD lord when the cancellation yoga names that lord', () => {
    const w = resolveDomainWeights('career')
    const chart = chartWithDebilitatedSaturn()
    const slice = makeSlice('Sun', 'Saturn', 'Moon', '2024-01-01', '2024-04-01', [
      'Neechabhanga active — Saturn debilitation cancelled',
    ])
    const { breakdown } = scorePeriod(slice, chart, null, w)
    const adDignity = breakdown.factors.find((f) => f.factor === 'adLordDignity')!
    // Saturn debilitation cancelled → lifted to neutral (0.5)
    expect(adDignity.normalized).toBe(0.5)
  })
})

// ─── Stress-peak topFactors surface the drags (T4-4 regression) ──────

describe('Stress-peak topFactors surface the biggest drags, not strengths (T4-4)', () => {
  it('a stress peak lists the low-normalized high-weight factors first', () => {
    // Hand-built scored entry: one strong factor (high contribution) and one big drag
    // (high weight, near-zero normalized). The stress peak must surface the drag.
    const entry = {
      period: makeSlice('Saturn', 'Rahu', 'Ketu', '2024-01-01', '2099-01-01'),
      result: {
        score: 20,
        breakdown: {
          score: 20, intensity: 'high' as const, favorable: false,
          factors: [
            { factor: 'naturalKaraka' as const, value: 'x', normalized: 0.95, weight: 7, contribution: 6.65 },   // a strength
            { factor: 'saturnAfflictions' as const, value: 'x', normalized: 0.1, weight: 12, contribution: 1.2 }, // biggest drag
            { factor: 'houseOwnership' as const, value: 'x', normalized: 0.2, weight: 14, contribution: 2.8 },    // big drag
          ],
          omissions: [], weightSumApplied: 33, reducedConfidence: false, confidence: 1, weightsVersion: WEIGHTS_VERSION,
        },
      } as PeriodScoreResult,
    }
    const { peakStress } = identifyPeaks([entry], 3)
    expect(peakStress).toHaveLength(1)
    // Drags first: houseOwnership deficit = 14*0.8=11.2, saturnAfflictions = 12*0.9=10.8, naturalKaraka = 7*0.05=0.35
    expect(peakStress[0].topFactors.map((f) => f.factor)).toEqual([
      'houseOwnership', 'saturnAfflictions', 'naturalKaraka',
    ])
  })

  it('a favorable peak still lists the highest-contribution factors first', () => {
    const entry = {
      period: makeSlice('Jupiter', 'Venus', 'Moon', '2024-01-01', '2099-01-01'),
      result: {
        score: 80,
        breakdown: {
          score: 80, intensity: 'high' as const, favorable: true,
          factors: [
            { factor: 'houseOwnership' as const, value: 'x', normalized: 0.9, weight: 14, contribution: 12.6 },
            { factor: 'naturalKaraka' as const, value: 'x', normalized: 1.0, weight: 7, contribution: 7 },
            { factor: 'shadbala' as const, value: 'x', normalized: 0.8, weight: 10, contribution: 8 },
          ],
          omissions: [], weightSumApplied: 31, reducedConfidence: false, confidence: 1, weightsVersion: WEIGHTS_VERSION,
        },
      } as PeriodScoreResult,
    }
    const { peakFavorable } = identifyPeaks([entry], 3)
    expect(peakFavorable[0].topFactors.map((f) => f.factor)).toEqual([
      'houseOwnership', 'shadbala', 'naturalKaraka',
    ])
  })
})

// ─── domainHouseActivation domain-house-lord limb (T4-3 regression) ──

describe('domainHouseActivation credits the domain-house lord limb (T4-3)', () => {
  it('activates when a transit aspects the domain-house lord even if not the primary house itself', () => {
    const w = resolveDomainWeights('marriage') // primaryHouses [7]
    // Aries lagna: 7th house = Libra (sign 7), lord Venus. Place Venus in house 3.
    // Saturn transiting house 12 aspects house 3 (3rd aspect: 12+... let's use house 1 → 3rd aspect = house 3).
    const chart: ScoringChartData = {
      category: 'marriage',
      planets: [
        { planet: 'Sun',   signNumber: 1, house: 1, longitude: 5,  latitude: 0, speed: 1, retrograde: false, sign: 'Aries', degreeInSign: 5 },
        { planet: 'Venus', signNumber: 3, house: 3, longitude: 65, latitude: 0, speed: 1, retrograde: false, sign: 'Gemini', degreeInSign: 5 },
      ] as ScoringChartData['planets'],
    }
    // Saturn in house 1 → aspects houses 1, 7 (7th), 3 (3rd), 10 (10th). House 3 = Venus's house.
    // Jupiter in house 5 → aspects 5, 11, 9, 1. Does not hit house 7 or Venus(3).
    const overlay: TransitOverlay = {
      adStart: '2024-01-01', adLord: 'x',
      saturn: { sign: 'Aries', signNumber: 1, houseFromLagna: 1, houseFromMoon: 1, retrograde: false },
      jupiter: { sign: 'Leo', signNumber: 5, houseFromLagna: 5, houseFromMoon: 5, retrograde: false },
      rahu: { sign: 'x', signNumber: 6, houseFromLagna: 6 },
      ketu: { sign: 'x', signNumber: 12, houseFromLagna: 12 },
      sadeSatiActive: false, sadeSatiPhase: null, ashtamaShani: false, kantakaShani: false,
      saturnBavScore: 4, jupiterBavScore: 4,
    }
    const { breakdown } = scorePeriod(makeSlice('Venus', 'Jupiter', 'Moon'), chart, overlay, w)
    const dha = breakdown.factors.find((f) => f.factor === 'domainHouseActivation')!
    // Saturn aspects the 7th-lord (Venus in H3, via Saturn's 3rd aspect) → at least "one activating" (0.7)
    expect(dha.normalized).toBeGreaterThanOrEqual(0.7)
  })
})

// ─── Reduced confidence on missing primary data (Property 19) ────────

describe('Reduced confidence tracks primary-factor omissions (Property 19)', () => {
  it('flags reducedConfidence when a primary factor is unavailable', () => {
    const w = resolveDomainWeights('career') // primaryFactors: shadbala, karakaRole, domainHouseActivation
    // No shadbala → shadbala factor omitted (primary for career)
    const chart: ScoringChartData = { ...ariesChart(), shadbala: null }
    const { breakdown } = scorePeriod(makeSlice('Sun', 'Venus', 'Moon'), chart, null, w)
    expect(breakdown.omissions.some((o) => o.factor === 'shadbala' && o.severity === 'primary')).toBe(true)
    expect(breakdown.reducedConfidence).toBe(true)
    expect(breakdown.confidence).toBeLessThan(1)
  })

  it('does not flag reducedConfidence when only secondary factors are missing', () => {
    const w = resolveDomainWeights('career')
    // Full data with shadbala/karaka/transit present, but bhavaBala (secondary) absent
    const chart: ScoringChartData = {
      ...ariesChart(),
      shadbala: { planets: [
        { planet: 'Sun',   strengthRatio: 1.4, beneficRatio: 0.8 },
        { planet: 'Venus', strengthRatio: 1.2, beneficRatio: 0.7 },
        { planet: 'Moon',  strengthRatio: 1.1, beneficRatio: 0.6 },
      ], strengthRanking: [], computedAt: '' } as unknown as ScoringChartData['shadbala'],
      bhavaBala: null,
    }
    const overlay: TransitOverlay = {
      adStart: '2024-01-01', adLord: 'Venus',
      saturn: { sign: 'Capricorn', signNumber: 10, houseFromLagna: 10, houseFromMoon: 7, retrograde: false },
      jupiter: { sign: 'Cancer', signNumber: 4, houseFromLagna: 4, houseFromMoon: 1, retrograde: false },
      rahu: { sign: 'Gemini', signNumber: 3, houseFromLagna: 3 },
      ketu: { sign: 'Sagittarius', signNumber: 9, houseFromLagna: 9 },
      sadeSatiActive: false, sadeSatiPhase: null, ashtamaShani: false, kantakaShani: false,
      saturnBavScore: 5, jupiterBavScore: 6,
    }
    const w2 = resolveDomainWeights('career')
    const karakaSlice = makeSlice('Sun', 'Venus', 'Moon')
    karakaSlice.lordAnnotations.mdLord.karakaRole = 'AmK' // satisfy karakaRole primary
    const { breakdown } = scorePeriod(karakaSlice, chart, overlay, w2)
    // bhavaBala is secondary for career → its omission must not reduce confidence
    expect(breakdown.omissions.some((o) => o.factor === 'bhavaBala')).toBe(true)
    expect(breakdown.reducedConfidence).toBe(false)
    // silence unused
    void w
  })
})
