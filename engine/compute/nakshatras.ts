/**
 * engine/compute/nakshatras.ts — Nakshatra computation from sidereal longitude.
 *
 * Computes nakshatra, pada, nakshatra lord, and sub-lord for all planets.
 * Pure arithmetic — no external calls needed.
 *
 * `locateInNakshatra()` is the engine's single source of nakshatra arithmetic:
 * `computeVimshottari`, matchmaking's boundary risk and the Sree Lagna take their
 * position from it rather than from their own `% span`
 * (.kiro/specs/nakshatra-shared-locator).
 */

import { DASHA_SEQUENCE, NAKSHATRAS, NAKSHATRA_SPAN_DEG, TOTAL_DASHA_YEARS } from '../constants'
import type { NakshatraInfo, PlanetPosition } from './types'

// ─── Nakshatra Data ─────────────────────────────────────────────────

/** The 27 nakshatras with their ruling planets (Vimshottari lords), in order. */
const NAKSHATRA_DATA: { name: string; lord: string }[] = NAKSHATRAS.map(({ name, lord }) => ({ name, lord }))

/** Dasha years per degree of the zodiac: 27 × 120 years over 360° (exactly 9). */
const YEARS_PER_DEGREE = (27 * TOTAL_DASHA_YEARS) / 360

/** Dasha years per pada: a quarter of a nakshatra's 120. */
const YEARS_PER_PADA = TOTAL_DASHA_YEARS / 4

// ─── Computation Functions ──────────────────────────────────────────

/**
 * Normalizes a longitude to [0, 360) without moving a value already in range.
 *
 * `((lon % 360) + 360) % 360` rounds every longitude onto the coarser grid of
 * [360, 720) on the way through, which put 13.333…° (1 × 360/27) just below
 * the Bharani boundary. `%` itself is exact, so only a negative remainder needs
 * `+ 360` — and a tiny one rounds up to 360, which is 0°. NaN stays NaN.
 */
export function normalizeLongitude(longitude: number): number {
  const remainder = longitude % 360
  if (remainder >= 0) return remainder + 0 // `+ 0` turns -0 into 0
  const wrapped = remainder + 360
  return wrapped === 360 ? 0 : wrapped
}

/**
 * Whether a normalized longitude has reached the cut point `years` dasha years
 * from 0° Ashwini, i.e. whether 9 × lon ≥ years, decided exactly.
 *
 * Every pada and sub-lord cut is a whole number of years, at (years / 9)°.
 * Comparing the longitude with the double nearest years / 9 misplaces a
 * longitude equal to that double whenever it lies below the true cut:
 * 353.3333333333333 read as Revati's Mars sub-lord (which starts pada 3) while
 * its pada, from the fraction, came out 2. Here `8 × lon` is exact and `sum`
 * is 9 × lon rounded. Rounding is monotonic, so only a tie (`sum === years`)
 * is in doubt, and TwoSum recovers the rounding error that settles it.
 */
function hasReachedYears(normalizedLong: number, years: number): boolean {
  const eightTimes = 8 * normalizedLong
  const sum = eightTimes + normalizedLong
  const lonPart = sum - eightTimes
  const roundingError = (eightTimes - (sum - lonPart)) + (normalizedLong - lonPart)
  return sum > years || (sum === years && roundingError >= 0)
}

/** Where a longitude sits in its nakshatra; see `locateInNakshatra()`. */
export interface NakshatraLocation {
  /** The longitude in [0, 360), from `normalizeLongitude()`. */
  normalizedLong: number
  /** 0 (Ashwini) – 26 (Revati). */
  nakshatraIndex: number
  /** Fraction of the nakshatra traversed, in [0, 1). */
  fraction: number
  /** 1–4. */
  pada: number
}

/**
 * Pada (1–4) of a normalized longitude already located in `nakshatraIndex`:
 * one plus the number of pada cuts (30, 60, 90 years into the nakshatra) it has
 * reached. The same exact test as the sub-lord's, so the two always agree
 * where they share a cut (pada 3 of Mars- and Mercury-led nakshatras).
 */
function padaAt(normalizedLong: number, nakshatraIndex: number): number {
  if (Number.isNaN(normalizedLong)) return NaN
  const nakshatraStartYears = nakshatraIndex * TOTAL_DASHA_YEARS
  let pada = 1
  for (let cut = 1; cut < 4; cut++) {
    if (hasReachedYears(normalizedLong, nakshatraStartYears + cut * YEARS_PER_PADA)) pada++
  }
  return pada
}

/**
 * Locates a longitude in its nakshatra: the normalized longitude, the
 * nakshatra index (0–26), the fraction of the nakshatra traversed, in [0, 1),
 * and the pada (1–4). NaN gives NaN index, fraction and pada.
 *
 * Index and fraction both come from one quotient. Taking the index from
 * `lon / span` and the position from `lon % span` disagreed at exact
 * boundaries: NAKSHATRA_SPAN_DEG rounds up, so 40 / span rounds to 3 (Rohini)
 * while 40 % span is just under one span, which read 40° as Rohini pada 4 with
 * the last sub-lord. `quotient - index` is exact (Sterbenz lemma), so the
 * fraction never reaches 1, and below 360 the quotient stays below 27.
 *
 * The pada is counted against the pada cuts within that nakshatra (`padaAt`),
 * so within an ulp of a pada cut it can differ from `floor(fraction × 4) + 1`.
 */
export function locateInNakshatra(longitude: number): NakshatraLocation {
  const normalizedLong = normalizeLongitude(longitude)
  const quotient = normalizedLong / NAKSHATRA_SPAN_DEG
  const nakshatraIndex = Math.floor(quotient)
  const fraction = quotient - nakshatraIndex
  return { normalizedLong, nakshatraIndex, fraction, pada: padaAt(normalizedLong, nakshatraIndex) }
}

/**
 * Sub-lord of a normalized longitude already located in `nakshatraIndex`.
 *
 * Each sub-span ends where the dasha years counted from 0° Ashwini reach a
 * whole number. The longitude is tested against those cut points exactly
 * (`hasReachedYears`), because summing rounded (years / 120) × span sub-spans
 * misplaces exact cut points such as 37° (the start of Krittika's Ketu sub).
 */
function subLordAt(normalizedLong: number, nakshatraIndex: number): string {
  // Nakshatra lords follow the Vimshottari order, so the nakshatra's own lord
  // (where its sub-lord sequence starts) is entry nakshatraIndex % 9.
  const startIdx = nakshatraIndex % DASHA_SEQUENCE.length

  let elapsedYears = nakshatraIndex * TOTAL_DASHA_YEARS
  for (let i = 0; i < DASHA_SEQUENCE.length; i++) {
    const entry = DASHA_SEQUENCE[(startIdx + i) % DASHA_SEQUENCE.length]
    elapsedYears += entry.years
    if (!hasReachedYears(normalizedLong, elapsedYears)) {
      return entry.lord
    }
  }

  // The quotient kept a longitude an ulp past the next nakshatra's start in
  // this one: it is at this nakshatra's end, under its last sub-lord.
  return DASHA_SEQUENCE[(startIdx + DASHA_SEQUENCE.length - 1) % DASHA_SEQUENCE.length].lord
}

/**
 * Distance in degrees from a longitude to the nearer edge of its nakshatra
 * (≥ 0; NaN for NaN).
 *
 * Measured from the located nakshatra's cut points, (120 × index) / 9° and
 * (120 × (index + 1)) / 9°. Each is the double nearest the true boundary, and
 * exactly the boundary when it is a whole degree (40°, 80°, …), and the
 * subtraction from a longitude inside the nakshatra is exact (Sterbenz), so a
 * 4-decimal longitude 1° from a whole-degree boundary gets exactly 1.
 * `min(fraction, 1 − fraction) × span` gave 39° 1.0000000000000024. A longitude
 * the quotient placed an ulp outside its nakshatra's cut points gets 0.
 */
export function distanceToNakshatraBoundary(longitude: number): number {
  const { normalizedLong, nakshatraIndex } = locateInNakshatra(longitude)
  const startYears = nakshatraIndex * TOTAL_DASHA_YEARS
  const start = startYears / YEARS_PER_DEGREE
  const end = (startYears + TOTAL_DASHA_YEARS) / YEARS_PER_DEGREE
  return Math.max(0, Math.min(normalizedLong - start, end - normalizedLong))
}

/**
 * Computes the nakshatra index (0–26) from a sidereal longitude.
 */
export function getNakshatraIndex(longitude: number): number {
  return locateInNakshatra(longitude).nakshatraIndex
}

/**
 * Computes the pada (1–4) from a sidereal longitude.
 */
export function getPada(longitude: number): number {
  return locateInNakshatra(longitude).pada
}

/**
 * Computes the Vimshottari sub-lord for a given sidereal longitude.
 *
 * Within a nakshatra's 13°20' span, the nine dasha lords are laid out in
 * Vimshottari sequence, each occupying a fraction of the span equal to its
 * dasha years / 120. The sequence starts from the nakshatra's OWN lord (the
 * lord that opens the nakshatra), then proceeds in the standard order. The
 * sub-span containing the longitude yields the sub-lord.
 */
export function computeSubLord(longitude: number): string {
  const { normalizedLong, nakshatraIndex } = locateInNakshatra(longitude)
  return subLordAt(normalizedLong, nakshatraIndex)
}

/**
 * Computes full nakshatra info for a single longitude.
 */
export function computeNakshatraForLongitude(
  longitude: number,
  planetName: string
): NakshatraInfo {
  const { normalizedLong, nakshatraIndex, fraction, pada } = locateInNakshatra(longitude)
  const nakshatraData = NAKSHATRA_DATA[nakshatraIndex]

  return {
    planet: planetName,
    nakshatra: nakshatraData.name,
    nakshatraIndex,
    pada,
    nakshatraLord: nakshatraData.lord,
    degreeInNakshatra: fraction * NAKSHATRA_SPAN_DEG,
    subLord: subLordAt(normalizedLong, nakshatraIndex),
  }
}

/**
 * Computes nakshatra details for all planets.
 *
 * @param planets - Array of planet positions
 * @returns Array of nakshatra info for each planet
 */
export function computeNakshatras(planets: PlanetPosition[]): NakshatraInfo[] {
  return planets.map((planet) =>
    computeNakshatraForLongitude(planet.longitude, planet.planet)
  )
}

/**
 * Returns the nakshatra data array (for external use).
 */
export function getNakshatraData() {
  return NAKSHATRA_DATA
}

/**
 * Gets the nakshatra lord for a given nakshatra index.
 */
export function getNakshatraLord(nakshatraIndex: number): string {
  return NAKSHATRA_DATA[nakshatraIndex % 27].lord
}

/**
 * Gets the nakshatra name for a given index.
 */
export function getNakshatraName(nakshatraIndex: number): string {
  return NAKSHATRA_DATA[nakshatraIndex % 27].name
}
