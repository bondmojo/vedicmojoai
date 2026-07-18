/**
 * engine/durationAnalysis/scoring.backtest.test.ts
 *
 * Sanity_Backtest — Phase 1 calibration sanity check (Requirement 13.1/13.2, task 10.4).
 *
 * Asserts that the Scoring Engine ranks curated fixture periods consistently with their
 * expected relative rankings across multiple domains, AND pins the calibration constants
 * (BHAVA_RUPAS_CALIBRATION, SAV_MEAN) against the OBSERVED fixture distribution so
 * normalization never regresses to a saturating cap.
 *
 * NOTE (task 12): if BHAVA_RUPAS_CALIBRATION or SAV_MEAN is retuned, re-run the engine
 * property tests (scoring.test.ts) so a constant shift can't silently invalidate them.
 *
 * Tags: Feature: duration-analysis-scoring, Sanity_Backtest
 */

import { describe, it, expect } from 'vitest'
import { scorePeriod, BHAVA_RUPAS_CALIBRATION, SAV_MEAN } from './scoring'
import { resolveDomainWeights, WEIGHTS_VERSION } from './scoringWeights'
import type { DashaSlice, ScoringChartData, DurationCategory } from '@/lib/durationTypes'
import type { TransitOverlay } from '@/lib/durationTypes'

// Fixtures
import careerFixture from './__fixtures__/career_strong_weak.json'
import marriageFixture from './__fixtures__/marriage_dk_vs_dusthana.json'
import healthFixture from './__fixtures__/health_saturn_affliction.json'
import wealthFixture from './__fixtures__/wealth_dhana_vs_dusthana.json'

// ─── Types ────────────────────────────────────────────────────────────

type FixturePeriod = {
  expectedRank: number
  description: string
  slice: DashaSlice
  transitOverlay: TransitOverlay
}

type Fixture = {
  category: string
  description: string
  chartData: ScoringChartData
  periods: FixturePeriod[]
}

const ALL_FIXTURES: Record<string, Fixture> = {
  career: careerFixture as unknown as Fixture,
  marriage: marriageFixture as unknown as Fixture,
  health: healthFixture as unknown as Fixture,
  wealth: wealthFixture as unknown as Fixture,
}

// ─── Helpers ──────────────────────────────────────────────────────────

function scoreFixturePeriods(fixture: Fixture) {
  const domainWeights = resolveDomainWeights(fixture.category as DurationCategory)
  return fixture.periods.map((p) => {
    const { score } = scorePeriod(p.slice, fixture.chartData, p.transitOverlay, domainWeights)
    return { ...p, score }
  })
}

/** Collect every bhavaBala rupas value present across all fixtures. */
function observedRupas(): number[] {
  const rupas: number[] = []
  for (const fx of Object.values(ALL_FIXTURES)) {
    const houses = fx.chartData.bhavaBala?.houses ?? []
    for (const h of houses) if (typeof h.rupas === 'number') rupas.push(h.rupas)
  }
  return rupas
}

/** Collect every SAV bindu value present across all fixtures. */
function observedSav(): number[] {
  const sav: number[] = []
  for (const fx of Object.values(ALL_FIXTURES)) {
    for (const b of fx.chartData.ashtakavarga?.sav ?? []) if (typeof b === 'number') sav.push(b)
  }
  return sav
}

// ─── Relative ranking across domains (task 10.4 mandatory) ───────────

describe('Sanity_Backtest: relative ranking holds across domains', () => {
  for (const [domain, fixture] of Object.entries(ALL_FIXTURES)) {
    it(`${domain}: strong period outranks weak period`, () => {
      const scored = scoreFixturePeriods(fixture)
      const sorted = [...scored].sort((a, b) => a.expectedRank - b.expectedRank)
      for (let i = 0; i < sorted.length - 1; i++) {
        expect(sorted[i].score).toBeGreaterThan(sorted[i + 1].score)
      }
    })

    it(`${domain}: rank-1 period is favorable (≥50) and clearly separated from the weak period`, () => {
      const scored = scoreFixturePeriods(fixture)
      const best = scored.find((p) => p.expectedRank === 1)!
      const worst = scored.reduce((a, b) => (b.expectedRank > a.expectedRank ? b : a))
      // The strong period is favorable...
      expect(best.score).toBeGreaterThanOrEqual(50)
      // ...and the weak period is meaningfully lower. Since v0.6.0's decompression
      // (omit-on-no-signal) lets the denominator shrink, even a "weak" fixture whose
      // remaining factors are natal-chart-quality can land slightly above 50. The
      // meaningful constraint is the SEPARATION (≥ 8 below).
      expect(best.score - worst.score).toBeGreaterThanOrEqual(8)
      expect(worst.score).toBeLessThanOrEqual(55)
    })

    it(`${domain}: every breakdown is stamped with the current WEIGHTS_VERSION`, () => {
      const w = resolveDomainWeights(fixture.category as DurationCategory)
      for (const p of fixture.periods) {
        const { breakdown } = scorePeriod(p.slice, fixture.chartData, p.transitOverlay, w)
        expect(breakdown.weightsVersion).toBe(WEIGHTS_VERSION)
      }
    })
  }
})

// ─── Calibration constants pinned to observed fixture distribution ───
// These assertions READ the fixtures (not tautologies): they guard against a
// future edit that lets normalization saturate on real chart magnitudes.

describe('Calibration: BHAVA_RUPAS_CALIBRATION pinned to observed rupas (task 10.4)', () => {
  it('the observed fixture rupas routinely exceed the old wrong cap of 8', () => {
    const rupas = observedRupas()
    expect(rupas.length).toBeGreaterThan(0)
    const max = Math.max(...rupas)
    // Real houses exceed 8 rupas — the whole reason MAX_BHAVA_RUPAS=8 was wrong.
    expect(max).toBeGreaterThan(8)
  })

  it('BHAVA_RUPAS_CALIBRATION is ≥ the observed max rupas, so the absolute fallback never saturates', () => {
    const max = Math.max(...observedRupas())
    // If the calibration constant sat below the observed max, strong houses would clamp to 1.0
    // and lose discrimination — exactly the regression this pins against.
    expect(BHAVA_RUPAS_CALIBRATION).toBeGreaterThanOrEqual(max)
  })

  it('the absolute normalization discriminates across the observed rupas range (not all ≈1.0)', () => {
    const rupas = observedRupas()
    const normalized = rupas.map((r) => Math.min(r / BHAVA_RUPAS_CALIBRATION, 1))
    const spread = Math.max(...normalized) - Math.min(...normalized)
    // A saturating cap would collapse the spread toward 0. Require meaningful separation.
    expect(spread).toBeGreaterThan(0.3)
  })
})

describe('Calibration: SAV_MEAN pinned to observed SAV distribution (task 10.4)', () => {
  it('SAV_MEAN is within a sane band of the observed mean bindus', () => {
    const sav = observedSav()
    expect(sav.length).toBeGreaterThan(0)
    const mean = sav.reduce((a, b) => a + b, 0) / sav.length
    // Classical mean is 337/12 ≈ 28. Observed fixture mean should be near it, and SAV_MEAN
    // must track that mean so a mid-strength house maps to ≈0.5 (not saturated).
    expect(Math.abs(SAV_MEAN - mean)).toBeLessThanOrEqual(6)
  })

  it('the natalHouseStrength normalization discriminates across the observed SAV range', () => {
    const sav = observedSav()
    const normalized = sav.map((b) => Math.min(b / (2 * SAV_MEAN), 1))
    const spread = Math.max(...normalized) - Math.min(...normalized)
    expect(spread).toBeGreaterThan(0.2)
    // The strongest observed house should not saturate to exactly 1.0 (loss of headroom).
    expect(Math.max(...normalized)).toBeLessThan(1)
  })
})
