/**
 * engine/compute/transits.degreeSadeSati.test.ts — Property-based tests for the
 * degree-based Sade Sati reading (`computeDegreeSadeSati`) and for the `asOf` /
 * `isCurrent` contract shared with the sign-based reading.
 *
 * Properties 5 through 10 of design.md's "Correctness Properties" section.
 *
 * ── Two deliberate testing decisions, per design.md's Testing Strategy ──
 *
 * 1. **Shortened scan horizon.** Every generated case is a full ephemeris scan
 *    (~5,200 Swiss Ephemeris evaluations at the production R6.9 horizon), so these
 *    six properties run through `computeDegreeSadeSatiWithTestHorizon` over a
 *    ~35-year window — long enough to contain one or two Saturn passages through the
 *    ±45° window, short enough that 100 iterations stay fast. The real R6.9 horizon
 *    is exercised separately by the calibration fixture (`transits.sadeSati.test.ts`).
 *
 * 2. **Independent recomputation of Saturn's separation.** `getSiderealLongitude` and
 *    `shorterArc` are module-private in `transits.ts`, and a property that called the
 *    very helper it validates would prove little. So Properties 5 and 9 recompute
 *    Saturn's Lahiri sidereal longitude here, straight from `swisseph-v2`, mirroring
 *    `getSiderealLongitude`'s configuration (`swe_set_sid_mode(SE_SIDM_LAHIRI, 0, 0)`;
 *    flags `SEFLG_SWIEPH | SEFLG_SIDEREAL | SEFLG_SPEED`; body 6 = Saturn), and
 *    recompute the shorter arc locally. Nothing private is exported for testability.
 */

import { describe, it } from 'vitest'
import fc from 'fast-check'
import swisseph from 'swisseph-v2'
import path from 'path'
import {
  computeDegreeSadeSatiWithTestHorizon,
  computeTransits,
  type DegreeSadeSatiPeriod,
} from './transits'

// ─── Independent ephemeris access (see decision 2 in the file header) ─────────

let ephePathSet = false
function ensureEph(): void {
  if (ephePathSet) return
  try {
    const pkg = require.resolve('swisseph-v2/package.json')
    swisseph.swe_set_ephe_path(path.join(path.dirname(pkg), 'ephe'))
  } catch {
    /* swisseph falls back to its built-in Moshier ephemeris */
  }
  ephePathSet = true
}

function normLong(lon: number): number {
  return ((lon % 360) + 360) % 360
}

/** Julian Day (UT) for a JS Date — same conversion `transits.ts` uses. */
function toJD(date: Date): number {
  ensureEph()
  return swisseph.swe_julday(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
    date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600,
    swisseph.SE_GREG_CAL
  )
}

/** Saturn's Lahiri sidereal longitude at `jd`, computed independently of `transits.ts`. */
function saturnSiderealLongitude(jd: number): number {
  ensureEph()
  swisseph.swe_set_sid_mode(swisseph.SE_SIDM_LAHIRI, 0, 0)
  const flags = swisseph.SEFLG_SWIEPH | swisseph.SEFLG_SIDEREAL | swisseph.SEFLG_SPEED
  const r = swisseph.swe_calc_ut(jd, 6, flags) as any
  return normLong(r.longitude ?? 0)
}

/** Shorter-arc angular separation between two longitudes, 0…180 — recomputed locally. */
function shorterArcLocal(a: number, b: number): number {
  const d = Math.abs((a - b + 360) % 360)
  return Math.min(d, 360 - d)
}

/** Separation between Saturn at `jd` and the natal Moon longitude, 0…180. */
function separationAt(jd: number, natalMoonLongitude: number): number {
  return shorterArcLocal(saturnSiderealLongitude(jd), natalMoonLongitude)
}

const ORB = 45

/**
 * Tolerance on the orb comparison, in degrees. Reported instants are rounded to whole
 * seconds by `jdToDate`, and Saturn moves at most ≈0.134°/day, so a reported boundary can
 * sit up to ≈1.6e-6° past the exact 45° crossing. 1e-4° is three orders of magnitude
 * below anything astrologically meaningful and two above that rounding error.
 */
const ORB_TOL_DEG = 1e-4

const insideAt = (jd: number, natalMoonLongitude: number): boolean =>
  separationAt(jd, natalMoonLongitude) <= ORB

// ─── Generators (per design.md's Testing Strategy) ───────────────────────────

const natalMoonLongitudeArb = fc.double({ min: 0, max: 360, noNaN: true })
const birthYearArb = fc.integer({ min: 1900, max: 2010 })

const MS_PER_DAY = 86_400_000
const MS_PER_YEAR = 365.2425 * MS_PER_DAY

/**
 * The shortened ~35-year test horizon for the properties that do not depend on an
 * evaluation instant. Anchored to the generated birth year so different Saturn epochs
 * are exercised across cases rather than one fixed window.
 */
function horizonForBirthYear(birthYear: number): { start: Date; end: Date } {
  return {
    start: new Date(Date.UTC(birthYear + 20, 0, 1)),
    end: new Date(Date.UTC(birthYear + 55, 0, 1)),
  }
}

/**
 * Evaluation instants spanning several decades either side of the present (1985–2059),
 * so the `asOf` properties genuinely exercise the case the old wall-clock `new Date()`
 * defect broke: a historical or far-future evaluation date. The range also sits inside
 * `computeSadeSatiPeriods`' own wall-clock-derived horizon for every generated birth
 * year (birthYear − 33 ≤ 1977, wall-clock year + 35 ≥ 2060), so the sign-based reading
 * is never asked about an instant outside the span it scanned.
 */
const asOfArb = fc.date({
  min: new Date(Date.UTC(1985, 0, 1)),
  max: new Date(Date.UTC(2059, 11, 31)),
  noInvalidDate: true,
})

/** A ~35-year test horizon centred on `asOf`, so the evaluation instant is always inside it. */
function horizonAround(asOf: Date): { start: Date; end: Date } {
  return {
    start: new Date(asOf.getTime() - 17.5 * MS_PER_YEAR),
    end: new Date(asOf.getTime() + 17.5 * MS_PER_YEAR),
  }
}

function fail(message: string): never {
  throw new Error(message)
}

// ─── Property 5 ──────────────────────────────────────────────────────────────

describe('computeDegreeSadeSati — orb bound', () => {
  // Feature: chart-ui-enhancements, Property 5: Every reported degree-based period's endpoints lie on the 45° orb
  it("every reported degree-based period's endpoints lie inside the 45° orb", () => {
    fc.assert(
      fc.property(
        natalMoonLongitudeArb,
        birthYearArb,
        (natalMoonLongitude, birthYear) => {
          const horizon = horizonForBirthYear(birthYear)
          const info = computeDegreeSadeSatiWithTestHorizon(
            natalMoonLongitude,
            birthYear,
            horizon.start,
            horizon
          )

          for (const period of info.allPeriods) {
            const startJd = toJD(new Date(period.start))
            const endJd = toJD(new Date(period.end))

            const startSep = separationAt(startJd, natalMoonLongitude)
            if (startSep > ORB + ORB_TOL_DEG) {
              fail(
                `Moon ${natalMoonLongitude}°, period #${period.sequence} start ${period.start}: separation ${startSep}° exceeds ${ORB}°`
              )
            }

            const endSep = separationAt(endJd, natalMoonLongitude)
            if (endSep > ORB + ORB_TOL_DEG) {
              fail(
                `Moon ${natalMoonLongitude}°, period #${period.sequence} end ${period.end}: separation ${endSep}° exceeds ${ORB}°`
              )
            }

            // INTERIOR INSTANTS ARE DELIBERATELY NOT ASSERTED.
            //
            // R6.5 requires the scan to merge two inside-the-orb segments separated by a
            // gap shorter than `DEGREE_SADE_SATI_MERGE_GAP_DAYS`, because a retrograde loop
            // straddling the window edge carries Saturn out of and back into the orb without
            // ending the passage. The reference implementation this reading is calibrated
            // against does exactly the same — the Reference_Chart's 1993 passage bridges a
            // 123.45-day excursion and its 2052 passage an 88.76-day one. A merged period
            // therefore provably contains instants whose separation exceeds 45°, so
            // "inside the orb at every interior instant" is not a property this reading has,
            // and asserting it would contradict R6.5 rather than test R6.4.
            //
            // What IS asserted, and is the strongest true statement available: both endpoints
            // lie on the orb (above), and both endpoints are genuine 45°-separation crossings
            // rather than arbitrary sample points — Property 9 below brackets each one and
            // requires insideness to differ either side of it. Between them these pin the
            // window membership rule (R6.3) without asserting away the merge.
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ─── Property 6 ──────────────────────────────────────────────────────────────

const MONTH_ABBR = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

/**
 * The sign-based reading reports only `"Mon YYYY"` display strings, so its periods can
 * only be bracketed to month precision. Returns the first instant of the named month.
 */
function monthStartMs(monthYear: string): number {
  const [mon, year] = monthYear.split(' ')
  const monthIndex = MONTH_ABBR.indexOf(mon)
  if (monthIndex < 0) fail(`Unparseable month-year string: "${monthYear}"`)
  return Date.UTC(Number(year), monthIndex, 1)
}

/** The first instant of the month AFTER the named month. */
function monthEndMs(monthYear: string): number {
  const [mon, year] = monthYear.split(' ')
  const monthIndex = MONTH_ABBR.indexOf(mon)
  if (monthIndex < 0) fail(`Unparseable month-year string: "${monthYear}"`)
  return Date.UTC(Number(year), monthIndex + 1, 1)
}

describe('Sade Sati — the current flag comes from asOf, in both readings', () => {
  // Feature: chart-ui-enhancements, Property 6: At most one period is current, in either reading, and only at `asOf`
  it('at most one period is current, in either reading, and only at `asOf`', () => {
    fc.assert(
      fc.property(natalMoonLongitudeArb, birthYearArb, asOfArb, (natalMoonLongitude, birthYear, asOf) => {
        const asOfMs = asOf.getTime()

        // ── Degree-based reading, over the shortened horizon centred on asOf ──
        const degree = computeDegreeSadeSatiWithTestHorizon(
          natalMoonLongitude,
          birthYear,
          asOf,
          horizonAround(asOf)
        )

        const currentDegree = degree.allPeriods.filter((p) => p.isCurrent)
        if (currentDegree.length > 1) {
          fail(
            `${currentDegree.length} degree-based periods flagged current at ${asOf.toISOString()}: ${currentDegree
              .map((p) => `#${p.sequence}`)
              .join(', ')}`
          )
        }

        for (const p of degree.allPeriods) {
          const startMs = Date.parse(p.start)
          const endMs = Date.parse(p.end)
          const containsAsOf = startMs <= asOfMs && asOfMs < endMs
          if (p.isCurrent !== containsAsOf) {
            fail(
              `Degree-based period #${p.sequence} ${p.start}..${p.end}: isCurrent=${p.isCurrent} but asOf ${asOf.toISOString()} ${containsAsOf ? 'is' : 'is not'} inside [start, end)`
            )
          }
        }

        // ── Sign-based reading, through the public `computeTransits` entry point ──
        // `natalMoonLongitude` is deliberately NOT passed: that would trigger a second,
        // full-horizon degree scan per generated case, and the degree clauses above are
        // already covered over the shortened horizon.
        const natalMoonSignNumber = Math.min(12, Math.floor(normLong(natalMoonLongitude) / 30) + 1)
        const transits = computeTransits(natalMoonSignNumber, 1, birthYear, asOf)

        if (transits.asOf !== asOf.toISOString()) {
          fail(`TransitAnalysis.asOf ${transits.asOf} does not echo the evaluation instant ${asOf.toISOString()}`)
        }

        const signPeriods = transits.sadeSati.allPeriods
        const currentSign = signPeriods.filter((p) => p.isCurrent)
        if (currentSign.length > 1) {
          fail(
            `${currentSign.length} sign-based periods flagged current at ${asOf.toISOString()}: ${currentSign
              .map((p) => `${p.phase} ${p.startApprox}..${p.endApprox}`)
              .join(', ')}`
          )
        }

        for (const p of signPeriods) {
          if (!p.isCurrent) continue
          const startMs = monthStartMs(p.startApprox)
          const endMs = monthEndMs(p.endApprox)
          if (!(startMs <= asOfMs && asOfMs < endMs)) {
            fail(
              `Sign-based ${p.phase} period ${p.startApprox}..${p.endApprox} flagged current, but asOf ${asOf.toISOString()} is outside it`
            )
          }
        }

        // `sadeSati.active` and "some sign-based period is flagged current" are equivalent in
        // ONE direction only, and the clause is scoped to that direction deliberately.
        //
        // `active` is the classical sign-based reading: Saturn's INSTANTANEOUS sign at asOf is
        // one of the 12th / 1st / 2nd from the natal Moon. The period list is the same trio
        // scanned over the horizon and then merged across short retrograde fragments (the
        // sign-based scan's own 240-day rule). So:
        //
        //   active === true  ⟹  asOf lies in a trio segment  ⟹  a period is flagged current.
        //     Always true, and asserted below.
        //
        //   a period is flagged current  ⟹  active === true.
        //     NOT true, and not a defect. A merged period stays flagged across the short
        //     excursion the merge bridged, during which Saturn is momentarily outside the
        //     trio. Counterexample from this very property: natal Moon sign 1, birth year
        //     1900, asOf 1995-08-09T20:32:06Z — a period is current while `active` is false.
        //
        // `active` is left as-is rather than re-derived from the period list: nothing in R6
        // requires it to be period-derived, R6.10 governs the periods' current flags only, and
        // the field is consumed elsewhere (`TransitsView`'s Sade Sati alert; and
        // `engine/durationAnalysis/transitOverlay.ts` derives its own `sadeSatiActive` from the
        // period list independently, so the two semantics already coexist on purpose).
        // Redefining `active` would change what that alert means for a merge artefact.
        const anySignCurrent = signPeriods.some((p) => p.isCurrent)
        if (transits.sadeSati.active && !anySignCurrent) {
          fail(
            `sadeSati.active=true but no sign-based period is flagged current at ${asOf.toISOString()} (natal Moon sign ${natalMoonSignNumber}, birth year ${birthYear})`
          )
        }
      }),
      { numRuns: 100 }
    )
  })
})

// ─── Property 7 ──────────────────────────────────────────────────────────────

/**
 * Tolerance in days on inter-period gap and ordering comparisons. The merge rule works
 * on unrounded Julian Days while the reported instants are rounded to whole seconds, so
 * a reported gap can read up to ~2 seconds short of the merge rule's threshold.
 */
const DAY_TOL = 1e-3

/**
 * The degree-based scan's own merge threshold — `DEGREE_SADE_SATI_MERGE_GAP_DAYS` in
 * `transits.ts`, restated here independently rather than imported, so a change to the engine
 * constant has to be made deliberately in both places. NOT the sign-based scan's 240 d: the
 * angular window admits longer genuine excursions than a sign boundary does, and 240 d
 * over-merged the Reference_Chart's calibrated passages.
 */
const MERGE_GAP_DAYS = 138

describe('computeDegreeSadeSati — ordering, non-overlap and merging', () => {
  // Feature: chart-ui-enhancements, Property 7: Periods are ascending, non-overlapping and correctly merged
  it('periods are ascending, non-overlapping and correctly merged', () => {
    fc.assert(
      fc.property(natalMoonLongitudeArb, birthYearArb, (natalMoonLongitude, birthYear) => {
        const horizon = horizonForBirthYear(birthYear)
        const info = computeDegreeSadeSatiWithTestHorizon(
          natalMoonLongitude,
          birthYear,
          horizon.start,
          horizon
        )

        const periods = info.allPeriods
        for (let i = 1; i < periods.length; i++) {
          const prev = periods[i - 1]
          const cur = periods[i]
          const prevEndMs = Date.parse(prev.end)
          const curStartMs = Date.parse(cur.start)

          if (Date.parse(cur.start) < Date.parse(prev.start)) {
            fail(`Periods out of ascending start order: #${prev.sequence} ${prev.start} then #${cur.sequence} ${cur.start}`)
          }

          const overlapDays = (prevEndMs - curStartMs) / MS_PER_DAY
          if (overlapDays > DAY_TOL) {
            fail(
              `Periods overlap: #${prev.sequence} ends ${prev.end} but #${cur.sequence} starts ${cur.start} (${overlapDays} days earlier)`
            )
          }

          const gapDays = (curStartMs - prevEndMs) / MS_PER_DAY
          if (gapDays < MERGE_GAP_DAYS - DAY_TOL) {
            fail(
              `Periods #${prev.sequence} and #${cur.sequence} are separated by ${gapDays} days, shorter than the ${MERGE_GAP_DAYS}-day merge rule (${prev.end} → ${cur.start})`
            )
          }
        }
      }),
      { numRuns: 100 }
    )
  })
})

// ─── Property 8 ──────────────────────────────────────────────────────────────

describe('computeDegreeSadeSati — sequence numbering', () => {
  // Feature: chart-ui-enhancements, Property 8: Sequence numbers are contiguous from 1 in start order
  it('sequence numbers are contiguous from 1 in start order', () => {
    fc.assert(
      fc.property(natalMoonLongitudeArb, birthYearArb, (natalMoonLongitude, birthYear) => {
        const horizon = horizonForBirthYear(birthYear)
        const info = computeDegreeSadeSatiWithTestHorizon(
          natalMoonLongitude,
          birthYear,
          horizon.start,
          horizon
        )

        const periods = info.allPeriods

        // Reported order is ascending by start, so index order IS start order.
        const byStart = [...periods].sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
        periods.forEach((p, i) => {
          if (byStart[i] !== p) {
            fail(`Reported order is not ascending by start at index ${i} (#${p.sequence} ${p.start})`)
          }
          if (p.sequence !== i + 1) {
            fail(`Period at start-order index ${i} carries sequence ${p.sequence}, expected ${i + 1}`)
          }
        })

        const sequences = periods.map((p) => p.sequence)
        const unique = new Set(sequences)
        if (unique.size !== sequences.length) {
          fail(`Sequence numbers repeat: [${sequences.join(', ')}]`)
        }
        for (let n = 1; n <= periods.length; n++) {
          if (!unique.has(n)) fail(`Sequence numbers are not 1..${periods.length}: [${sequences.join(', ')}]`)
        }
      }),
      { numRuns: 100 }
    )
  })
})

// ─── Property 9 ──────────────────────────────────────────────────────────────

/**
 * Bracket half-width for the crossing check, in days (3 hours). Saturn moves ≈0.017° in
 * 3 hours — comfortably more than the ≈1.6e-6° a whole-second-rounded instant can be off
 * by — while staying far below the spacing between two genuine crossings (the coarse scan
 * resolves crossings no closer than a few days, and merged periods sit ~29.5 years apart).
 */
const BRACKET_DAYS = 3 / 24

describe('computeDegreeSadeSati — boundary genuineness', () => {
  // Feature: chart-ui-enhancements, Property 9: Every reported boundary is a genuine 45°-separation crossing
  it('every reported boundary is a genuine 45°-separation crossing', () => {
    fc.assert(
      fc.property(natalMoonLongitudeArb, birthYearArb, (natalMoonLongitude, birthYear) => {
        const horizon = horizonForBirthYear(birthYear)
        const info = computeDegreeSadeSatiWithTestHorizon(
          natalMoonLongitude,
          birthYear,
          horizon.start,
          horizon
        )

        const horizonStartJd = toJD(horizon.start)
        const horizonEndJd = toJD(horizon.end)

        for (const period of info.allPeriods) {
          for (const [which, iso] of [
            ['start', period.start],
            ['end', period.end],
          ] as const) {
            const jd = toJD(new Date(iso))

            // A period clipped by the scan window's own edge is not a crossing: Saturn was
            // already inside the orb when the horizon opened, or still inside when it closed.
            // Only refined crossings are in scope for R6.8.
            if (Math.abs(jd - horizonStartJd) < DAY_TOL || Math.abs(jd - horizonEndJd) < DAY_TOL) continue

            const before = insideAt(jd - BRACKET_DAYS, natalMoonLongitude)
            const after = insideAt(jd + BRACKET_DAYS, natalMoonLongitude)
            if (before === after) {
              fail(
                `Moon ${natalMoonLongitude}°, period #${period.sequence} ${which} ${iso} is not a 45° crossing: inside=${before} both ${BRACKET_DAYS * 24}h before and after (separations ${separationAt(jd - BRACKET_DAYS, natalMoonLongitude)}° / ${separationAt(jd + BRACKET_DAYS, natalMoonLongitude)}°)`
              )
            }
          }
        }
      }),
      { numRuns: 100 }
    )
  })
})

// ─── Property 10 ─────────────────────────────────────────────────────────────

/** Rounds half away from zero to an integer — the R6.13 rule, restated independently. */
function roundHalfAwayFromZero(v: number): number {
  return v < 0 ? -Math.round(-v) : Math.round(v)
}

/**
 * Tolerance in days on `durationDays`. The engine reports the unrounded Julian-Day span
 * while `start` / `end` are rounded to whole seconds, so the two can differ by ~2 seconds.
 */
const DURATION_TOL_DAYS = 3 / 86400

describe('computeDegreeSadeSati — derived spans', () => {
  // Feature: chart-ui-enhancements, Property 10: The derived spans agree with the instants they came from
  it('the derived spans agree with the instants they came from', () => {
    fc.assert(
      fc.property(natalMoonLongitudeArb, birthYearArb, asOfArb, (natalMoonLongitude, birthYear, asOf) => {
        const asOfMs = asOf.getTime()
        const info = computeDegreeSadeSatiWithTestHorizon(
          natalMoonLongitude,
          birthYear,
          asOf,
          horizonAround(asOf)
        )

        for (const period of info.allPeriods) {
          const startMs = Date.parse(period.start)
          const endMs = Date.parse(period.end)

          // durationDays === end − start, in days.
          const spanDays = (endMs - startMs) / MS_PER_DAY
          if (Math.abs(period.durationDays - spanDays) > DURATION_TOL_DAYS) {
            fail(
              `Period #${period.sequence} durationDays=${period.durationDays} but ${period.start}..${period.end} spans ${spanDays} days`
            )
          }

          // completionPct: present exactly on the current period, integer 0–100, equal to
          // elapsed / duration as a percentage rounded half away from zero.
          if (period.isCurrent) {
            const expected = roundHalfAwayFromZero((100 * (asOfMs - startMs)) / (endMs - startMs))
            if (period.completionPct === undefined) {
              fail(`Current period #${period.sequence} carries no completionPct`)
            }
            if (!Number.isInteger(period.completionPct)) {
              fail(`Current period #${period.sequence} completionPct=${period.completionPct} is not an integer`)
            }
            if (period.completionPct! < 0 || period.completionPct! > 100) {
              fail(`Current period #${period.sequence} completionPct=${period.completionPct} is outside 0–100`)
            }
            if (period.completionPct !== expected) {
              fail(
                `Current period #${period.sequence} completionPct=${period.completionPct}, expected ${expected} (asOf ${asOf.toISOString()} in ${period.start}..${period.end})`
              )
            }
          } else if (period.completionPct !== undefined) {
            fail(`Non-current period #${period.sequence} carries completionPct=${period.completionPct}`)
          }

          // startsInDays: present exactly on future-start periods, equal to that gap in days.
          const startsLater = startMs > asOfMs
          if (startsLater) {
            const expectedGap = (startMs - asOfMs) / MS_PER_DAY
            if (period.startsInDays === undefined) {
              fail(`Future period #${period.sequence} (starts ${period.start}) carries no startsInDays`)
            }
            if (Math.abs(period.startsInDays! - expectedGap) > DURATION_TOL_DAYS) {
              fail(
                `Period #${period.sequence} startsInDays=${period.startsInDays}, expected ${expectedGap} (asOf ${asOf.toISOString()} → start ${period.start})`
              )
            }
          } else if (period.startsInDays !== undefined) {
            fail(
              `Period #${period.sequence} starts ${period.start}, at or before asOf ${asOf.toISOString()}, yet carries startsInDays=${period.startsInDays}`
            )
          }
        }

        // Sanity: the typing above relies on the reported shape, so keep the array typed.
        const _typed: DegreeSadeSatiPeriod[] = info.allPeriods
        void _typed
      }),
      { numRuns: 100 }
    )
  })
})
