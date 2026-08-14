/**
 * engine/compute/gochar.cuspProximity.test.ts — the correctness-critical tests
 * for the adaptive, end-bounded boundary scanner (`scanGocharStateChange()`).
 *
 * ── Why these tests exist ──────────────────────────────────────────────────
 *
 * A plain fixed-step scan advances while `stateAt(hi) === startState`. If a
 * graha crosses a 30° sign cusp and returns *within a single step*, both
 * samples read the same sign, no bracket forms, bisection never runs, and BOTH
 * crossings are lost — silently. The coverage guarantee (R2.9) still looks
 * intact because the dropped pair leaves the interval list seamless, and the
 * sub-day guarantee (R2.8) is violated with no failing assertion. So a test
 * that only checks "coverage is contiguous" proves nothing here; the assertion
 * has to be *differential* against a deliberately naive scan.
 *
 * A generic retrograde fixture is also useless for this: an ordinary
 * retrograde re-entry spans weeks and any step size finds it. The defect only
 * appears when a station sits inside the vulnerable window of a cusp.
 *
 * ── Fixture derivation (task 2.5) ─────────────────────────────────────────
 *
 * The instants below were NOT guessed. A throwaway search (run once, not
 * committed) walked 1800-01-01 → 2200-01-01 at a 0.25-day sampling step for
 * Jupiter (id 5), Saturn (id 6) and Rahu (id 11), recording every sign change
 * and then every consecutive pair forming a round trip (`A → B → A`). Each
 * candidate's midpoint longitude and instantaneous `longitudeSpeed` were
 * logged to confirm the event is a genuine near-cusp station.
 *
 * What that search found, over 400 years:
 *
 *   Rahu    — round trips as short as ~0.5 day, many under the 5-day base step.
 *   Jupiter — shortest round trip 5.75 days (2144-02-17 → 2144-02-23, ~59.99°).
 *   Saturn  — shortest round trip 9.5 days (2041-01-28 → 2041-02-06, ~180.02°).
 *
 * A second, wider search (1000 → 3000, refining each near-cusp station rather
 * than sampling on a grid) confirmed those two are close to the physical floor:
 * Jupiter's shortest possible round trip is 5.65 days (station 2144-02-20) and
 * Saturn's is 5.10 days (station 2294-09-09) — both still longer than the
 * 5-day base step.
 *
 * That is why the differential fixtures are all Rahu. A round trip can only be
 * skipped by a fixed step when it is *shorter* than that step: at 5 days, any
 * dip lasting ≥ 5 days is guaranteed to contain a grid sample, so the naive
 * scan finds it too and the differential is not observable. Jupiter's and
 * Saturn's shortest round trips in four centuries both exceed the 5-day base
 * step, so no Jupiter/Saturn window can demonstrate the defect. Rahu carries
 * the identical 5-day base step and the identical code path, so the slow-graha
 * scan is fully exercised; Jupiter and Saturn additionally appear below as
 * round-trip-integrity fixtures, where both scanners must find the dip and the
 * adaptive one must still refine both boundaries off the coarse grid.
 *
 * Design: Testing Strategy — "Cusp-proximity tests (the correctness-critical
 * case)", "Derive the fixture, do not guess a date"
 * Requirements: R2.7, R2.8, R2.9
 */

import { afterEach, describe, expect, it } from 'vitest'
import {
  getSiderealLongitude,
  scanGocharStateChange,
  degreesToNearestCusp,
  stepIsSafe,
  MIN_STEP_DAYS,
  CUSP_SAFETY_FACTOR,
  __setStepIsSafeOverrideForTests,
  __resetGocharSampleCounterForTests,
  __getGocharSampleCounterForTests,
} from './gochar'
import swisseph from 'swisseph-v2'

// ─── Bodies and base coarse steps (task 2.4's table) ──────────────────────

const RAHU = 11
const JUPITER = 5
const SATURN = 6

/** Base coarse step for Jupiter / Saturn / Rahu-Ketu, per task 2.4. */
const SLOW_STEP_DAYS = 5

// ─── Pinned fixtures ──────────────────────────────────────────────────────

interface CuspDipFixture {
  label: string
  bodyId: number
  /** Window start (inclusive) — chosen so the dip falls strictly inside ONE naive step. */
  from: string
  /** Window end (exclusive). */
  to: string
  /** Sign the body occupies at the window start, i.e. the `A` of `A → B → A`. */
  outerSign: number
  /** Sign it dips into, i.e. the `B`. */
  dipSign: number
  /**
   * Upper bound asserted on the middle (dipped) interval's duration.
   * `1` marks the sub-day cases design.md calls out explicitly; the others are
   * bounded by the 5-day base step, which is what makes them skippable.
   */
  maxMiddleDurationDays: number
}

/**
 * Rahu round trips across a 30° cusp, each shorter than the 5-day base step
 * and each positioned so a naive 5-day grid starting at `from` steps straight
 * over it.
 *
 * Derived as described in the file header. Recorded at derivation time
 * (0.25-day search resolution):
 *
 *  | fixture | in → out (UTC)                         | dur    | signs   | mid longitude | mid speed  |
 *  |---------|----------------------------------------|--------|---------|---------------|------------|
 *  | 1802    | 1802-02-09T12:00Z → 1802-02-10T00:00Z  | 0.50 d | 11→12→11| 330.0001°     | -0.00355   |
 *  | 2133    | 2133-12-04T18:00Z → 2133-12-05T06:00Z  | 0.50 d | 2→1→2   | 29.9998°      | +0.00189   |
 *  | 1994    | 1994-06-06T06:00Z → 1994-06-08T12:00Z  | 2.25 d | 7→8→7   | 210.0128°     | -0.00104   |
 *  | 2087    | 2087-04-19T12:00Z → 2087-04-21T06:00Z  | 1.75 d | 8→7→8   | 209.9916°     | +0.00236   |
 *
 * Every one is Rahu within ~0.01° of a cusp with |speed| ~0.001–0.004°/day —
 * a station essentially on the cusp, which is precisely the event class the
 * adaptive stepping exists to catch.
 *
 * Each window below starts a couple of days before the dip so a naive 5-day
 * grid anchored at the window start steps straight over it, and (for the 2133
 * and 2087 fixtures) ends before the next *genuine* ingress into the dipped
 * sign, which a fixed step would legitimately find. Bisection-refined dip
 * boundaries actually produced by the scanner at pin time:
 *
 *   1802  sign 11 → 12 at 1802-02-09T09:47:39Z, back to 11 at T18:20:05Z (0.356 d)
 *   2133  sign  2 →  1 at 2133-12-04T15:23:19Z, back to  2 at 12-05T01:57:32Z (0.440 d)
 *   1994  sign  7 →  8 at 1994-06-06T00:28:38Z, back to  7 at 06-08T11:44:52Z (2.470 d)
 *   2087  sign  8 →  7 at 2087-04-19T07:50:34Z, back to  8 at 04-21T05:58:59Z (1.922 d)
 *
 * The naive fixed-step baseline reports a single unbroken interval across all
 * four of those windows — it loses both crossings every time.
 */
const RAHU_DIP_FIXTURES: CuspDipFixture[] = [
  {
    label: 'Rahu 1802 — 330° cusp, ~0.5 day dip',
    bodyId: RAHU,
    from: '1802-02-07T00:00:00Z',
    to: '1802-02-22T00:00:00Z',
    outerSign: 11,
    dipSign: 12,
    maxMiddleDurationDays: 1,
  },
  {
    // Window deliberately ends before 2133-12-13T15:19Z, where Rahu makes a
    // *genuine* (non-dip) ingress into sign 1 that a fixed step also finds —
    // including it would let the naive baseline report sign 1 for the wrong
    // reason and mask the lost pair.
    label: 'Rahu 2133 — 30° cusp, ~0.5 day dip',
    bodyId: RAHU,
    from: '2133-12-02T00:00:00Z',
    to: '2133-12-12T00:00:00Z',
    outerSign: 2,
    dipSign: 1,
    maxMiddleDurationDays: 1,
  },
  {
    label: 'Rahu 1994 — 210° cusp, ~2.25 day dip',
    bodyId: RAHU,
    from: '1994-06-05T00:00:00Z',
    to: '1994-06-20T00:00:00Z',
    outerSign: 7,
    dipSign: 8,
    maxMiddleDurationDays: SLOW_STEP_DAYS,
  },
  {
    // Ends before 2087-04-30T06:04Z for the same reason as the 2133 fixture:
    // that instant is a real ingress into sign 7, not part of the dip.
    label: 'Rahu 2087 — 210° cusp, ~1.75 day dip',
    bodyId: RAHU,
    from: '2087-04-18T00:00:00Z',
    to: '2087-04-28T00:00:00Z',
    outerSign: 8,
    dipSign: 7,
    maxMiddleDurationDays: SLOW_STEP_DAYS,
  },
]

/**
 * Jupiter's and Saturn's shortest near-cusp round trips in 1800–2200. Both
 * exceed the 5-day base step, so a fixed step also finds them — they are here
 * for round-trip integrity (A → B → A, bisection-refined boundaries) on the
 * two bodies that are not Rahu, NOT for the differential assertion.
 */
const SLOW_BODY_DIP_FIXTURES: CuspDipFixture[] = [
  {
    label: 'Jupiter 2144 — 60° cusp, ~5.75 day dip (shortest in 1800–2200)',
    bodyId: JUPITER,
    from: '2144-02-14T00:00:00Z',
    to: '2144-03-01T00:00:00Z',
    outerSign: 3,
    dipSign: 2,
    maxMiddleDurationDays: 8,
  },
  {
    label: 'Saturn 2041 — 180° cusp, ~9.5 day dip (shortest in 1800–2200)',
    bodyId: SATURN,
    from: '2041-01-24T00:00:00Z',
    to: '2041-02-12T00:00:00Z',
    outerSign: 6,
    dipSign: 7,
    maxMiddleDurationDays: 12,
  },
]

/**
 * A calm window for the cost guard: Jupiter mid-sign, no cusp anywhere near,
 * so `stepIsSafe()` must short-circuit and the adaptive scanner must cost
 * exactly what the naive one costs. Verified below by asserting the window
 * really is far from a cusp, so the fixture cannot silently rot into a
 * near-cusp window and make the guard vacuous.
 */
const CALM_WINDOW = {
  label: 'Jupiter mid-sign, no ingress',
  bodyId: JUPITER,
  from: '2024-02-01T00:00:00Z',
  to: '2024-03-01T00:00:00Z',
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function toJD(iso: string): number {
  const d = new Date(iso)
  return swisseph.swe_julday(
    d.getUTCFullYear(),
    d.getUTCMonth() + 1,
    d.getUTCDate(),
    d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600,
    swisseph.SE_GREG_CAL
  )
}

interface ScannedInterval {
  signNumber: number
  startJd: number
  endJd: number
}

function signSampler(bodyId: number) {
  return (jd: number) => {
    const s = getSiderealLongitude(jd, bodyId)
    return {
      state: Math.floor(s.longitude / 30) + 1,
      longitude: s.longitude,
      longitudeSpeed: s.longitudeSpeed,
    }
  }
}

/**
 * Walks a window with `scanGocharStateChange()`, closing/reopening an interval
 * at each returned boundary. This is the same loop `computeGocharRange()`
 * (Task 3) will perform, kept local here so these tests exercise the scanner
 * directly rather than waiting on the public entry point.
 */
function scanIntervals(
  bodyId: number,
  fromIso: string,
  toIso: string,
  coarseStepDays: number
): ScannedInterval[] {
  const startJd = toJD(fromIso)
  const endJd = toJD(toIso)
  const sampleAt = signSampler(bodyId)

  const intervals: ScannedInterval[] = []
  let cursor = startJd
  let guard = 0
  while (cursor < endJd && guard++ < 1000) {
    const signNumber = sampleAt(cursor).state
    const boundary = scanGocharStateChange(cursor, endJd, coarseStepDays, sampleAt)
    intervals.push({ signNumber, startJd: cursor, endJd: boundary })
    if (boundary >= endJd) break
    cursor = boundary
  }
  return intervals
}

/**
 * The deliberately naive baseline: identical window, identical base step, but
 * with `stepIsSafe()` stubbed to always return `true` so the scanner never
 * subdivides — i.e. exactly the fixed-step behaviour design.md rejects.
 */
function scanIntervalsNaive(
  bodyId: number,
  fromIso: string,
  toIso: string,
  coarseStepDays: number
): ScannedInterval[] {
  __setStepIsSafeOverrideForTests(() => true)
  try {
    return scanIntervals(bodyId, fromIso, toIso, coarseStepDays)
  } finally {
    __setStepIsSafeOverrideForTests(null)
  }
}

function countSamples(run: () => void): number {
  __resetGocharSampleCounterForTests()
  run()
  return __getGocharSampleCounterForTests()
}

afterEach(() => {
  __setStepIsSafeOverrideForTests(null)
})

// ─── The two pure helpers (task 2.3) ─────────────────────────────────────

describe('degreesToNearestCusp', () => {
  it('is 0 exactly on a 30° cusp', () => {
    for (const lon of [0, 30, 90, 180, 330]) {
      expect(degreesToNearestCusp(lon)).toBe(0)
    }
  })

  it('is 15 at the midpoint of a sign (the maximum)', () => {
    for (const lon of [15, 45, 195, 345]) {
      expect(degreesToNearestCusp(lon)).toBe(15)
    }
  })

  it('measures the nearer cusp from either side', () => {
    expect(degreesToNearestCusp(29.5)).toBeCloseTo(0.5, 10)
    expect(degreesToNearestCusp(30.5)).toBeCloseTo(0.5, 10)
    expect(degreesToNearestCusp(359.9)).toBeCloseTo(0.1, 10)
  })

  it('stays within [0, 15] for any longitude, including out-of-range input', () => {
    for (const lon of [-0.5, -47.3, 0, 123.456, 359.999, 400, 720.25]) {
      const d = degreesToNearestCusp(lon)
      expect(d).toBeGreaterThanOrEqual(0)
      expect(d).toBeLessThanOrEqual(15)
    }
  })
})

describe('stepIsSafe', () => {
  it('is unsafe when a cross-and-return could complete within the step', () => {
    // 0.1° from the cusp, 0.2°/day, 5-day step → reach 2° ≫ 0.1°.
    expect(stepIsSafe(29.9, 0.2, SLOW_STEP_DAYS)).toBe(false)
  })

  it('is safe mid-sign at the same speed and step', () => {
    expect(stepIsSafe(15, 0.2, SLOW_STEP_DAYS)).toBe(true)
  })

  it('uses the magnitude of the speed, so retrograde motion is treated identically', () => {
    expect(stepIsSafe(29.9, -0.2, SLOW_STEP_DAYS)).toBe(stepIsSafe(29.9, 0.2, SLOW_STEP_DAYS))
    expect(stepIsSafe(15, -0.2, SLOW_STEP_DAYS)).toBe(stepIsSafe(15, 0.2, SLOW_STEP_DAYS))
  })

  it('applies CUSP_SAFETY_FACTOR as a margin over the bare excursion', () => {
    // Bare excursion 1.0° would call 1.5° "safe"; with the ×2 margin it is not.
    expect(1.5 > 0.2 * SLOW_STEP_DAYS).toBe(true)
    expect(stepIsSafe(31.5, 0.2, SLOW_STEP_DAYS)).toBe(false)
    expect(CUSP_SAFETY_FACTOR).toBe(2)
  })

  it('becomes safe again as the step shrinks (the subdivision termination condition)', () => {
    const lon = 29.99
    const speed = 0.05
    expect(stepIsSafe(lon, speed, SLOW_STEP_DAYS)).toBe(false)
    expect(stepIsSafe(lon, speed, MIN_STEP_DAYS)).toBe(true)
  })

  it('treats a station (speed 0) as safe at any step, per design.md\'s formula', () => {
    // Documented consequence of using instantaneous speed: at an exact station
    // the reach is 0. The scanner does not rely on this instant alone — it
    // subdivides on the approach, where the speed is still non-zero, which is
    // what the fixture windows above verify end to end.
    expect(stepIsSafe(29.999, 0, SLOW_STEP_DAYS)).toBe(true)
  })
})

// ─── Differential assertion ───────────────────────────────────────────────

describe('adaptive scanner vs naive fixed-step — differential', () => {
  it.each(RAHU_DIP_FIXTURES)(
    '$label: adaptive finds strictly more intervals than a fixed step',
    (fx) => {
      const adaptive = scanIntervals(fx.bodyId, fx.from, fx.to, SLOW_STEP_DAYS)
      const naive = scanIntervalsNaive(fx.bodyId, fx.from, fx.to, SLOW_STEP_DAYS)

      expect(adaptive.length).toBeGreaterThan(naive.length)
    }
  )

  it.each(RAHU_DIP_FIXTURES)(
    '$label: the naive fixed step loses the crossing pair entirely',
    (fx) => {
      // Stronger than a count difference: the naive scan never reports the
      // dipped sign at all, so the whole crossing pair is gone — the silent
      // data loss R2.8 forbids. A count-only assertion would still pass if a
      // scanner reported the dip but mangled the surrounding intervals.
      const naive = scanIntervalsNaive(fx.bodyId, fx.from, fx.to, SLOW_STEP_DAYS)
      expect(naive.some((i) => i.signNumber === fx.dipSign)).toBe(false)
      expect(naive).toHaveLength(1)

      const adaptive = scanIntervals(fx.bodyId, fx.from, fx.to, SLOW_STEP_DAYS)
      expect(adaptive.filter((i) => i.signNumber === fx.dipSign)).toHaveLength(1)
      expect(adaptive).toHaveLength(3)
    }
  )
})

// ─── Round-trip integrity ─────────────────────────────────────────────────

describe.each([...RAHU_DIP_FIXTURES, ...SLOW_BODY_DIP_FIXTURES])(
  'round-trip integrity — $label',
  (fx) => {
    const adaptive = scanIntervals(fx.bodyId, fx.from, fx.to, SLOW_STEP_DAYS)
    const dipIndex = adaptive.findIndex((i) => i.signNumber === fx.dipSign)

    it('finds the dip', () => {
      expect(dipIndex).toBeGreaterThan(0)
    })

    it('reports the sign sequence as A → B → A', () => {
      expect(adaptive[dipIndex - 1].signNumber).toBe(fx.outerSign)
      expect(adaptive[dipIndex].signNumber).toBe(fx.dipSign)
      expect(adaptive[dipIndex + 1]?.signNumber).toBe(fx.outerSign)
    })

    it(`keeps the dipped interval under ${fx.maxMiddleDurationDays} day(s) and does not merge it away`, () => {
      const dip = adaptive[dipIndex]
      const durationDays = dip.endJd - dip.startJd
      expect(durationDays).toBeGreaterThan(0)
      expect(durationDays).toBeLessThan(fx.maxMiddleDurationDays)
    })

    it('refines both dip boundaries by bisection, not to the coarse-step grid', () => {
      const startJd = toJD(fx.from)
      const dip = adaptive[dipIndex]
      // A coarse-grid-aligned boundary would be an exact multiple of the base
      // step from the window start. Bisection lands on an arbitrary instant.
      for (const boundary of [dip.startJd, dip.endJd]) {
        const stepsFromStart = (boundary - startJd) / SLOW_STEP_DAYS
        const distanceToGrid = Math.abs(stepsFromStart - Math.round(stepsFromStart))
        expect(distanceToGrid).toBeGreaterThan(1e-6)
      }
    })

    it('places both dip boundaries within a bisection tolerance of the 30° cusp', () => {
      const dip = adaptive[dipIndex]
      for (const boundary of [dip.startJd, dip.endJd]) {
        const { longitude } = getSiderealLongitude(boundary, fx.bodyId)
        // 42 bisections over a ≤5-day bracket resolve to far below a second;
        // 1e-6° is a generous bound on the residual longitude error.
        expect(degreesToNearestCusp(longitude)).toBeLessThan(1e-6)
      }
    })

    it('keeps intervals contiguous and chronological across the whole window', () => {
      const endJd = toJD(fx.to)
      expect(adaptive[0].startJd).toBeCloseTo(toJD(fx.from), 9)
      expect(adaptive[adaptive.length - 1].endJd).toBeCloseTo(endJd, 9)
      for (let i = 1; i < adaptive.length; i++) {
        expect(adaptive[i].startJd).toBe(adaptive[i - 1].endJd)
        expect(adaptive[i].endJd).toBeGreaterThan(adaptive[i].startJd)
      }
    })
  }
)

// ─── Cost guard ───────────────────────────────────────────────────────────

describe('cost guard — the refinement must not become a whole-range fine scan', () => {
  it('the calm fixture really is far from a cusp (guard against a rotted fixture)', () => {
    const startJd = toJD(CALM_WINDOW.from)
    const endJd = toJD(CALM_WINDOW.to)
    for (let jd = startJd; jd <= endJd; jd += 1) {
      const { longitude, longitudeSpeed } = getSiderealLongitude(jd, CALM_WINDOW.bodyId)
      const reach = Math.abs(longitudeSpeed) * SLOW_STEP_DAYS * 2
      expect(degreesToNearestCusp(longitude)).toBeGreaterThan(reach)
    }
  })

  it('costs no more ephemeris samples than the naive fixed-step baseline', () => {
    const adaptiveSamples = countSamples(() => {
      scanIntervals(CALM_WINDOW.bodyId, CALM_WINDOW.from, CALM_WINDOW.to, SLOW_STEP_DAYS)
    })
    const naiveSamples = countSamples(() => {
      scanIntervalsNaive(CALM_WINDOW.bodyId, CALM_WINDOW.from, CALM_WINDOW.to, SLOW_STEP_DAYS)
    })

    expect(adaptiveSamples).toBe(naiveSamples)
  })

  it('does not degrade into a MIN_STEP_DAYS scan of the calm window', () => {
    const spanDays = toJD(CALM_WINDOW.to) - toJD(CALM_WINDOW.from)
    const wholeRangeFineScanSamples = spanDays / MIN_STEP_DAYS

    const adaptiveSamples = countSamples(() => {
      scanIntervals(CALM_WINDOW.bodyId, CALM_WINDOW.from, CALM_WINDOW.to, SLOW_STEP_DAYS)
    })

    expect(adaptiveSamples).toBeLessThan(wholeRangeFineScanSamples / 10)
  })

  it('subdivision near a cusp stays bounded (no runaway sampling)', () => {
    const fx = RAHU_DIP_FIXTURES[2]
    const spanDays = toJD(fx.to) - toJD(fx.from)
    const naiveSamples = countSamples(() => {
      scanIntervalsNaive(fx.bodyId, fx.from, fx.to, SLOW_STEP_DAYS)
    })
    const adaptiveSamples = countSamples(() => {
      scanIntervals(fx.bodyId, fx.from, fx.to, SLOW_STEP_DAYS)
    })

    // The adaptive scan necessarily costs more here — it finds two extra
    // boundaries, each refined by 42 bisections. What it must NOT do is fine
    // scan the whole window.
    expect(adaptiveSamples).toBeGreaterThan(naiveSamples)
    expect(adaptiveSamples).toBeLessThan(spanDays / MIN_STEP_DAYS)
  })
})

// ─── MIN_STEP_DAYS floor behaviour ────────────────────────────────────────

describe('MIN_STEP_DAYS floor', () => {
  it('accepts the 1-hour floor and continues rather than throwing when still unsafe', () => {
    // Force "always unsafe": the scanner must bottom out at MIN_STEP_DAYS,
    // accept the floor, and still terminate at the window end — per
    // design.md's Error Handling row for this case.
    __setStepIsSafeOverrideForTests(() => false)
    const sampleAt = signSampler(JUPITER)
    const startJd = toJD('2024-02-01T00:00:00Z')
    const endJd = startJd + 0.5

    expect(() => scanGocharStateChange(startJd, endJd, SLOW_STEP_DAYS, sampleAt)).not.toThrow()
    expect(scanGocharStateChange(startJd, endJd, SLOW_STEP_DAYS, sampleAt)).toBe(endJd)
  })
})

// ─── End-boundedness ──────────────────────────────────────────────────────

describe('end-boundedness (distinct from transits.ts nextStateChange)', () => {
  it('returns end and never samples past it when no state change occurs', () => {
    const startJd = toJD(CALM_WINDOW.from)
    const endJd = toJD(CALM_WINDOW.to)
    let maxSampledJd = -Infinity
    const sampleAt = (jd: number) => {
      maxSampledJd = Math.max(maxSampledJd, jd)
      return signSampler(CALM_WINDOW.bodyId)(jd)
    }

    const result = scanGocharStateChange(startJd, endJd, SLOW_STEP_DAYS, sampleAt)

    expect(result).toBe(endJd)
    expect(maxSampledJd).toBeLessThanOrEqual(endJd)
  })

  it('never samples past end even when a state change exists beyond it', () => {
    // Jupiter's next ingress is well outside this deliberately short window.
    const startJd = toJD('2024-02-01T00:00:00Z')
    const endJd = startJd + 3
    let maxSampledJd = -Infinity
    const sampleAt = (jd: number) => {
      maxSampledJd = Math.max(maxSampledJd, jd)
      return signSampler(JUPITER)(jd)
    }

    const result = scanGocharStateChange(startJd, endJd, SLOW_STEP_DAYS, sampleAt)

    expect(result).toBe(endJd)
    expect(maxSampledJd).toBeLessThanOrEqual(endJd)
  })
})
