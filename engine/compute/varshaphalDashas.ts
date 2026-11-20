/**
 * engine/compute/varshaphalDashas.ts — Dashas for a Varsha (Tajika annual) year.
 *
 * The two timelines a practitioner reads an annual chart against:
 *
 *   1. sliceNatalVimshottari — the natal Mahadasha / Antardasha /
 *      Pratyantardasha periods that overlap the year, read from the tree that
 *      computeVimshottari builds. Period bounds are the true ones, not clipped.
 *   2. computeMuddaDasha — Tajika Mudda dasha: the Vimshottari sequence
 *      compressed into the year, each lord taking its Vimshottari years ÷ 120 of
 *      it, with Vimshottari antardashas inside each period.
 *
 * METHOD NOTES / CAVEATS:
 *   - Mudda starting lord (classical): (Janma nakshatra number + completed years
 *     − 2) mod 9 → 1 Sun, 2 Moon, 3 Mars, 4 Rahu, 5 Jupiter, 6 Saturn, 7 Mercury,
 *     8 Ketu, 0 Venus. Against the Ketu-first DASHA_SEQUENCE that is index
 *     (nakshatraIndex + age) % 9: the natal lord at age 0, one step on per year.
 *   - The first period runs for the natal balance fraction (the part of the
 *     Moon's nakshatra still to run at birth); the rest of that lord's period
 *     closes the year. Unverified against JHora.
 *   - The year runs from this Varsha Pravesh to the next. The classical table
 *     (3 days per Vimshottari year, 360 days) gives the proportions only.
 *
 * Pure functions: no DB, no I/O. Dates in and out are UTC.
 */

import type { DashaTree } from '@/lib/types'
import { DASHA_SEQUENCE, TOTAL_DASHA_YEARS } from '../constants'
import { getNakshatraName, locateInNakshatra } from './nakshatras'
import type {
  MuddaAntardasha,
  MuddaDasha,
  MuddaDashaPeriod,
  VarshaNatalAntardasha,
  VarshaNatalDasha,
  VarshaNatalPratyantardasha,
} from './types'

const DAY_MS = 86_400_000

/** Half-open span [start, end) in epoch milliseconds. */
interface Span {
  start: number
  end: number
}

function iso(ms: number): string {
  return new Date(ms).toISOString()
}

function round4(x: number): number {
  return Math.round(x * 10_000) / 10_000
}

function overlaps(period: { start: Date; end: Date }, window: Span): boolean {
  return period.start.getTime() < window.end && period.end.getTime() > window.start
}

function runsAt(period: { start: Date; end: Date }, ms: number): boolean {
  return period.start.getTime() <= ms && ms < period.end.getTime()
}

/** The part of `span` inside `window`, or null when under a millisecond is left. */
function clip(span: Span, window: Span): Span | null {
  const start = Math.max(span.start, window.start)
  const end = Math.min(span.end, window.end)
  return end - start >= 1 ? { start, end } : null
}

// ─── Natal Vimshottari through the year ─────────────────────────────

/**
 * The natal antardashas and pratyantardashas overlapping [yearStart, yearEnd),
 * in time order, plus the MD/AD/PD running at yearStart. Outside the tree the
 * chain is null and the lists are empty.
 */
export function sliceNatalVimshottari(
  tree: DashaTree,
  yearStart: Date,
  yearEnd: Date
): VarshaNatalDasha {
  const window: Span = { start: yearStart.getTime(), end: yearEnd.getTime() }
  const antardashas: VarshaNatalAntardasha[] = []
  const pratyantardashas: VarshaNatalPratyantardasha[] = []
  let atVarshaPravesh: VarshaNatalDasha['atVarshaPravesh'] = null

  for (const md of tree.mahadashas) {
    if (!overlaps(md, window)) continue
    for (const ad of md.antardashas) {
      if (!overlaps(ad, window)) continue
      antardashas.push({
        mahadasha: md.lord,
        antardasha: ad.lord,
        start: ad.start.toISOString(),
        end: ad.end.toISOString(),
      })
      for (const pd of ad.pratyantardashas) {
        if (!overlaps(pd, window)) continue
        pratyantardashas.push({
          mahadasha: md.lord,
          antardasha: ad.lord,
          pratyantardasha: pd.lord,
          start: pd.start.toISOString(),
          end: pd.end.toISOString(),
        })
        if (runsAt(pd, window.start)) {
          atVarshaPravesh = { mahadasha: md.lord, antardasha: ad.lord, pratyantardasha: pd.lord }
        }
      }
    }
  }

  return { atVarshaPravesh, antardashas, pratyantardashas }
}

// ─── Mudda dasha ────────────────────────────────────────────────────

/** Nine Vimshottari antardashas of a (virtual, unclipped) period, clipped to the year. */
function muddaAntardashas(lordIndex: number, period: Span, year: Span): MuddaAntardasha[] {
  const length = period.end - period.start
  const antardashas: MuddaAntardasha[] = []
  let cursor = period.start
  for (let j = 0; j < 9; j++) {
    const { lord, years } = DASHA_SEQUENCE[(lordIndex + j) % 9]
    // The last one ends exactly at the period end, so float drift cannot leave a gap.
    const end = j === 8 ? period.end : cursor + (length * years) / TOTAL_DASHA_YEARS
    const inYear = clip({ start: cursor, end }, year)
    if (inYear) {
      antardashas.push({
        lord,
        start: iso(inYear.start),
        end: iso(inYear.end),
        days: round4((inYear.end - inYear.start) / DAY_MS),
      })
    }
    cursor = end
  }
  return antardashas
}

/**
 * Tajika Mudda dasha for the Varsha year [yearStart, yearEnd).
 *
 * @param natalMoonLongitude natal Moon sidereal longitude, 0–360
 * @param age completed years at the Varsha Pravesh
 */
export function computeMuddaDasha(
  natalMoonLongitude: number,
  age: number,
  yearStart: Date,
  yearEnd: Date
): MuddaDasha {
  const validMoon = Number.isFinite(natalMoonLongitude)
  // The shared locator: index and fraction from one quotient, so a Moon exactly
  // on a boundary (40°) starts its nakshatra with a balance of exactly 1.
  const { nakshatraIndex, fraction } = locateInNakshatra(validMoon ? natalMoonLongitude : 0)
  const startIndex = (nakshatraIndex + Math.max(0, Math.floor(age))) % 9
  const balanceFraction = 1 - fraction

  const year: Span = { start: yearStart.getTime(), end: yearEnd.getTime() }
  const yearMs = year.end - year.start
  const periods: MuddaDashaPeriod[] = []

  if (validMoon && yearMs > 0) {
    const perYearMs = yearMs / TOTAL_DASHA_YEARS
    // Start the run early by the part of the starting lord's period already
    // used, then clip: the nine distinct lords fill exactly one year, so the
    // tenth (the starting lord again) supplies that used part at the end.
    const usedMs = (1 - balanceFraction) * DASHA_SEQUENCE[startIndex].years * perYearMs
    // Under a millisecond used means no remainder, so the opening period is whole.
    const opensWithBalance = usedMs >= 1
    let cursor = year.start - usedMs
    for (let i = 0; i < 10; i++) {
      const lordIndex = (startIndex + i) % 9
      const { lord, years } = DASHA_SEQUENCE[lordIndex]
      const virtual: Span = { start: cursor, end: cursor + years * perYearMs }
      cursor = virtual.end
      const inYear = clip(virtual, year)
      if (!inYear) continue
      periods.push({
        lord,
        start: iso(inYear.start),
        end: iso(inYear.end),
        days: round4((inYear.end - inYear.start) / DAY_MS),
        portion: i === 9 ? 'remainder' : i === 0 && opensWithBalance ? 'balance' : 'full',
        antardashas: muddaAntardashas(lordIndex, virtual, year),
      })
    }
  }

  return {
    janmaNakshatra: getNakshatraName(nakshatraIndex),
    janmaNakshatraNumber: nakshatraIndex + 1,
    startLord: DASHA_SEQUENCE[startIndex].lord,
    balanceFraction,
    yearStart: iso(year.start),
    yearEnd: iso(year.end),
    yearDays: round4(yearMs / DAY_MS),
    periods,
  }
}
