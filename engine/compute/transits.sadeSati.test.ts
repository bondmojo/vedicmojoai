/**
 * engine/compute/transits.sadeSati.test.ts
 *
 * Fixture / example-based tests for the two Sade Sati readings:
 *
 *  - Task 8.7 — the PVR calibration fixture (R6.1, R6.5, R6.7, R6.15). A genuine third-party
 *    cross-check: the three reference periods come from PVR Narasimha Rao's implementation,
 *    so this exercises the scan, the merge rule and the bisection against an outside
 *    source rather than against our own output.
 *  - Task 8.8 — the `asOf` regression guard on the sign-based reading (R6.10, R6.11).
 *  - Task 8.9 — horizon equality plus a frozen sign-based baseline (R6.9).
 *
 * These are NOT property tests — the six properties over the degree-based reading live in
 * `transits.degreeSadeSati.test.ts`. No `fast-check` here.
 */

import { describe, it, expect } from 'vitest'
import { computeDegreeSadeSati, computeTransits } from './transits'

// ─── Reference_Chart ─────────────────────────────────────────────────
//
// The "Mojo" chart used as the calibration fixture across `docs/computation_*.md`:
// natal Moon sidereal longitude 347.76° (Pisces 17.76°, so sign 12), Taurus lagna (sign 2).
// Birth year 1984 is consistent with `docs/computation_chara_dasha.md`'s "birth + 30y (2014)"
// Sagittarius mahadasha, and it is what `computeTransits` already defaults to.
const REF_MOON_LONGITUDE = 347.76
const REF_MOON_SIGN = 12
const REF_LAGNA_SIGN = 2
const REF_BIRTH_YEAR = 1984

const DAY_MS = 86_400_000

/** Absolute distance in days between an ISO instant and a UTC calendar date. */
function daysFrom(iso: string, ymd: string): number {
  return Math.abs(new Date(iso).getTime() - Date.parse(`${ymd}T00:00:00Z`)) / DAY_MS
}

function describePeriods(periods: { start: string; end: string }[]): string {
  return periods.map((p) => `${p.start.slice(0, 10)} → ${p.end.slice(0, 10)}`).join(', ')
}

// ─── Task 8.7 — PVR calibration fixture (R6.7) ───────────────────────

/**
 * The three degree-based passages PVR Narasimha Rao's implementation reports for the
 * Reference_Chart, each carrying the R6.15 label verbatim. `durationDays` is the reference's
 * own stated duration converted to whole days.
 *
 * Three independent points, not two: the 1993 passage was supplied after the original
 * fixture was written and is what pins the merge threshold from BELOW. Its raw segments are
 * separated by a 123.45-day gap that the reference bridges and a 152.46-day gap that it does
 * not, so between them the three rows constrain `DEGREE_SADE_SATI_MERGE_GAP_DAYS` to
 * (123.45 d, 152.46 d] — which is why 182 d (6 months) is not a usable value here.
 */
const PVR_REFERENCE_PERIODS: { start: string; end: string; durationDays: number }[] = [
  { start: '1993-03-31', end: '2000-06-30', durationDays: 2648 }, // reference: 7y 91d
  { start: '2023-02-10', end: '2030-05-09', durationDays: 2645 }, // reference: 7y 88d
  { start: '2052-03-20', end: '2059-06-19', durationDays: 2648 }, // reference: 7y 91d
]

describe('degree-based Sade Sati — PVR calibration fixture (R6.7)', () => {
  // ONE full-horizon run, shared by every assertion below. The full horizon
  // (1 Jan 1951 → 1 Jan (wall-clock year + 35)) is deliberately used here rather than the
  // test-horizon override: this is the one test that exercises the production window.
  //
  // Horizon note (a consequence of R6.9's wall-clock upper end, not of this fixture): the
  // 2052–2059 passage is only inside the horizon while the present year exceeds 2024,
  // because the horizon ends at `1 Jan (present year + 35)`. True for the foreseeable life
  // of this test.
  const asOf = new Date('2024-01-01T00:00:00Z')
  const info = computeDegreeSadeSati(REF_MOON_LONGITUDE, REF_BIRTH_YEAR, asOf)

  // The ±3-day tolerance absorbs the ayanamsa variant and date rounding of the third-party
  // implementation the reference dates were taken from — at Saturn's mean motion of ~2
  // arcminutes/day, 3 days is ~6 arcminutes of separation (R6.7).
  const TOL_DAYS = 3

  for (const ref of PVR_REFERENCE_PERIODS) {
    describe(`the passage running ${ref.start} → ${ref.end}`, () => {
      const period = info.allPeriods.find((p) => daysFrom(p.start, ref.start) <= TOL_DAYS)

      it('starts and ends within tolerance of the reference dates', () => {
        expect(
          period,
          `no period starts within ${TOL_DAYS}d of ${ref.start}. Got: ${describePeriods(info.allPeriods)}`
        ).toBeDefined()
        expect(
          daysFrom(period!.end, ref.end),
          `period ${period!.start} → ${period!.end} does not end within ${TOL_DAYS}d of ${ref.end}`
        ).toBeLessThanOrEqual(TOL_DAYS)
      })

      // The reference's three durations cluster tightly at 7y 88–91d, which is strong
      // evidence in its own right: a merge-threshold regression that over-merges shows up
      // here as a duration hundreds of days long before the end date drifts far enough to
      // be obvious. Asserting the duration is therefore a sharper guard on R6.5 than the
      // end date alone, and it is not redundant — `durationDays` is the machine-readable
      // field R6.2 requires, computed from the unrounded Julian-Day span rather than from
      // the reported instants.
      it('reports a duration within tolerance of the reference duration', () => {
        expect(period).toBeDefined()
        expect(
          Math.abs(period!.durationDays - ref.durationDays),
          `period ${period!.start} → ${period!.end} lasts ${period!.durationDays.toFixed(2)}d, not within ${TOL_DAYS}d of the reference ${ref.durationDays}d`
        ).toBeLessThanOrEqual(TOL_DAYS)
      })
    })
  }

  // Dates only, never sequence numbers: PVR labels these three periods #1, #2 and #3, but
  // our horizon starts 33 years before birth, so our numbering is horizon-relative and
  // legitimately differs. Asserting a sequence number here would be asserting PVR's
  // horizon, not PVR's astronomy.
  it('does not depend on sequence numbering agreeing with the reference output', () => {
    const numbers = info.allPeriods.map((p) => p.sequence)
    expect(numbers).toEqual(numbers.map((_, i) => i + 1))
  })

  it('labels every period with the R6.15 string verbatim', () => {
    const expected = 'Saturn ±45° from natal Moon (347.76°) - 12th, 1st, 2nd houses'
    expect(info.allPeriods.length).toBeGreaterThan(0)
    for (const period of info.allPeriods) {
      expect(period.label).toBe(expected)
    }
  })
})

// ─── Task 8.8 — the `asOf` regression guard, sign-based side (R6.10, R6.11) ───

describe('sign-based Sade Sati — current flags follow asOf, not the wall clock', () => {
  // Chosen from the Reference_Chart's own period list: Saturn's 1993–2000 passage puts a
  // `peak` Pisces segment across mid-1995, so Sade Sati genuinely WAS running on this date.
  // Asserting the positive case is what makes this test non-vacuous — with `active: false`
  // and nothing flagged, the agreement assertion would pass trivially.
  const historicalAsOf = new Date('1995-06-15T00:00:00Z')

  const historical = computeTransits(
    REF_MOON_SIGN,
    REF_LAGNA_SIGN,
    REF_BIRTH_YEAR,
    historicalAsOf
  )

  it('flags exactly one period as current, relative to the historical asOf', () => {
    const current = historical.sadeSati.allPeriods.filter((p) => p.isCurrent)
    expect(current).toHaveLength(1)
  })

  it('agrees between sadeSati.active and the flagged period', () => {
    const current = historical.sadeSati.allPeriods.filter((p) => p.isCurrent)
    expect(historical.sadeSati.active).toBe(true)
    expect(current).toHaveLength(1)
    // The flagged period must be the same reading `active`/`phase` reports — the exact
    // disagreement the old wall-clock `const now = new Date()` produced, because it flagged
    // whichever period contains *today* while `active` was derived from Saturn at asOf.
    expect(current[0].phase).toBe(historical.sadeSati.phase)
    expect(current[0].phaseSign).toBe(historical.natalMoonSign)
  })

  it('reports asOf as the instant it was given', () => {
    expect(historical.asOf).toBe(historicalAsOf.toISOString())
  })

  it('flags a different period when evaluated at the present instant', () => {
    // The strongest form of the guard: the same chart evaluated at two instants must flag
    // two different periods. Under the wall-clock defect both runs flagged the same one.
    const present = computeTransits(REF_MOON_SIGN, REF_LAGNA_SIGN, REF_BIRTH_YEAR, new Date())
    const historicalFlag = historical.sadeSati.allPeriods.find((p) => p.isCurrent)
    const presentFlag = present.sadeSati.allPeriods.find((p) => p.isCurrent)
    expect(historicalFlag).toBeDefined()
    if (presentFlag) {
      expect(presentFlag.startApprox).not.toBe(historicalFlag!.startApprox)
    }
  })

  it('flags no period at a historical date when Sade Sati was not running', () => {
    // 2010 sits in the ~22-year gap between the Reference_Chart's 1993–2000 and 2022–2030
    // passages, so the negative case must report nothing current.
    const quiet = computeTransits(
      REF_MOON_SIGN,
      REF_LAGNA_SIGN,
      REF_BIRTH_YEAR,
      new Date('2010-01-01T00:00:00Z')
    )
    expect(quiet.sadeSati.active).toBe(false)
    expect(quiet.sadeSati.allPeriods.filter((p) => p.isCurrent)).toHaveLength(0)
  })
})

// ─── Task 8.9 — horizon equality + frozen sign-based baseline (R6.9) ───

describe('Sade Sati horizon equality (R6.9)', () => {
  it('scans from birthYear − 33 through wall-clock year + 35', () => {
    const info = computeDegreeSadeSati(
      REF_MOON_LONGITUDE,
      REF_BIRTH_YEAR,
      new Date('2024-01-01T00:00:00Z')
    )
    expect(info.scanFromYear).toBe(REF_BIRTH_YEAR - 33)
    expect(info.scanToYear).toBe(new Date().getUTCFullYear() + 35)
  })

  it('derives the horizon from birthYear, not from asOf', () => {
    // A historical asOf must not move the horizon: R6.9 keeps both endpoints
    // birth-year / wall-clock derived while only `isCurrent` follows asOf (task 7.3).
    const historical = computeDegreeSadeSati(
      REF_MOON_LONGITUDE,
      REF_BIRTH_YEAR,
      new Date('1995-06-15T00:00:00Z')
    )
    expect(historical.scanFromYear).toBe(REF_BIRTH_YEAR - 33)
    expect(historical.scanToYear).toBe(new Date().getUTCFullYear() + 35)
  })
})

describe('sign-based Sade Sati — frozen baseline is unchanged by this feature', () => {
  /**
   * Frozen transcription of the sign-based reading for the Reference_Chart, captured before
   * the degree-based work landed.
   *
   * Scoped to periods whose END year is at or before 2020 ON PURPOSE. The horizon's upper
   * end is `wall-clock year + 35`, so the tail of the list grows as years pass and a naively
   * frozen FULL list would rot every January. Everything ending at or before 2020 is bounded
   * by the horizon's fixed lower end (`birthYear − 33` = 1951) and sits far inside the
   * window under any present year, so this slice is stable indefinitely.
   *
   * `isCurrent` is deliberately excluded — it is asOf-derived (R6.10) and is covered by the
   * task 8.8 block above; only the period geometry is frozen here.
   */
  const FROZEN_THROUGH_2020: { phase: string; phaseSign: string; startApprox: string; endApprox: string }[] = [
    { phase: 'rising',  phaseSign: 'Aquarius', startApprox: 'Jan 1964', endApprox: 'Apr 1966' },
    { phase: 'peak',    phaseSign: 'Pisces',   startApprox: 'Apr 1966', endApprox: 'Nov 1966' },
    { phase: 'rising',  phaseSign: 'Aquarius', startApprox: 'Nov 1966', endApprox: 'Dec 1966' },
    { phase: 'peak',    phaseSign: 'Pisces',   startApprox: 'Dec 1966', endApprox: 'Jun 1968' },
    { phase: 'setting', phaseSign: 'Aries',    startApprox: 'Jun 1968', endApprox: 'Sep 1968' },
    { phase: 'peak',    phaseSign: 'Pisces',   startApprox: 'Sep 1968', endApprox: 'Mar 1969' },
    { phase: 'setting', phaseSign: 'Aries',    startApprox: 'Mar 1969', endApprox: 'Apr 1971' },
    { phase: 'rising',  phaseSign: 'Aquarius', startApprox: 'Mar 1993', endApprox: 'Jun 1995' },
    { phase: 'peak',    phaseSign: 'Pisces',   startApprox: 'Jun 1995', endApprox: 'Aug 1995' },
    { phase: 'rising',  phaseSign: 'Aquarius', startApprox: 'Aug 1995', endApprox: 'Feb 1996' },
    { phase: 'peak',    phaseSign: 'Pisces',   startApprox: 'Feb 1996', endApprox: 'Apr 1998' },
    { phase: 'setting', phaseSign: 'Aries',    startApprox: 'Apr 1998', endApprox: 'Jun 2000' },
  ]

  const CUTOFF_YEAR = 2020

  it('reproduces the frozen period list up to the fixed cutoff', () => {
    const result = computeTransits(
      REF_MOON_SIGN,
      REF_LAGNA_SIGN,
      REF_BIRTH_YEAR,
      new Date('2024-01-01T00:00:00Z')
    )
    const upToCutoff = result.sadeSati.allPeriods
      .filter((p) => Number(p.endApprox.split(' ').pop()) <= CUTOFF_YEAR)
      .map(({ phase, phaseSign, startApprox, endApprox }) => ({
        phase,
        phaseSign,
        startApprox,
        endApprox,
      }))

    expect(upToCutoff).toEqual(FROZEN_THROUGH_2020)
  })
})
