/**
 * engine/compute/nakshatras.ts — Nakshatra computation from sidereal longitude.
 *
 * Computes nakshatra, pada, nakshatra lord, and sub-lord for all planets.
 * Pure arithmetic — no external calls needed.
 */

import type { NakshatraInfo, PlanetPosition } from './types'

// ─── Nakshatra Data ─────────────────────────────────────────────────

/** Span of each nakshatra in degrees (360 / 27) */
const NAKSHATRA_SPAN = 360 / 27 // 13.3333...°

/** Span of each pada in degrees (360 / 108) */
const PADA_SPAN = 360 / 108 // 3.3333...°

/** The 27 nakshatras with their ruling planets (Vimshottari lords) */
const NAKSHATRA_DATA: { name: string; lord: string }[] = [
  { name: 'Ashwini', lord: 'Ketu' },
  { name: 'Bharani', lord: 'Venus' },
  { name: 'Krittika', lord: 'Sun' },
  { name: 'Rohini', lord: 'Moon' },
  { name: 'Mrigashira', lord: 'Mars' },
  { name: 'Ardra', lord: 'Rahu' },
  { name: 'Punarvasu', lord: 'Jupiter' },
  { name: 'Pushya', lord: 'Saturn' },
  { name: 'Ashlesha', lord: 'Mercury' },
  { name: 'Magha', lord: 'Ketu' },
  { name: 'Purva Phalguni', lord: 'Venus' },
  { name: 'Uttara Phalguni', lord: 'Sun' },
  { name: 'Hasta', lord: 'Moon' },
  { name: 'Chitra', lord: 'Mars' },
  { name: 'Swati', lord: 'Rahu' },
  { name: 'Vishakha', lord: 'Jupiter' },
  { name: 'Anuradha', lord: 'Saturn' },
  { name: 'Jyeshtha', lord: 'Mercury' },
  { name: 'Mula', lord: 'Ketu' },
  { name: 'Purva Ashadha', lord: 'Venus' },
  { name: 'Uttara Ashadha', lord: 'Sun' },
  { name: 'Shravana', lord: 'Moon' },
  { name: 'Dhanishtha', lord: 'Mars' },
  { name: 'Shatabhisha', lord: 'Rahu' },
  { name: 'Purva Bhadrapada', lord: 'Jupiter' },
  { name: 'Uttara Bhadrapada', lord: 'Saturn' },
  { name: 'Revati', lord: 'Mercury' },
]

// ─── Computation Functions ──────────────────────────────────────────

/**
 * Computes the nakshatra index (0–26) from a sidereal longitude.
 */
export function getNakshatraIndex(longitude: number): number {
  const normalizedLong = ((longitude % 360) + 360) % 360
  return Math.floor(normalizedLong / NAKSHATRA_SPAN)
}

/**
 * Computes the pada (1–4) from a sidereal longitude.
 */
export function getPada(longitude: number): number {
  const normalizedLong = ((longitude % 360) + 360) % 360
  const posInNakshatra = normalizedLong % NAKSHATRA_SPAN
  return Math.floor(posInNakshatra / (NAKSHATRA_SPAN / 4)) + 1
}

/**
 * Computes full nakshatra info for a single longitude.
 */
export function computeNakshatraForLongitude(
  longitude: number,
  planetName: string
): NakshatraInfo {
  const normalizedLong = ((longitude % 360) + 360) % 360
  const nakshatraIndex = Math.floor(normalizedLong / NAKSHATRA_SPAN)
  const posInNakshatra = normalizedLong % NAKSHATRA_SPAN
  const pada = Math.floor(posInNakshatra / (NAKSHATRA_SPAN / 4)) + 1

  const nakshatraData = NAKSHATRA_DATA[nakshatraIndex]

  return {
    planet: planetName,
    nakshatra: nakshatraData.name,
    nakshatraIndex,
    pada,
    nakshatraLord: nakshatraData.lord,
    degreeInNakshatra: posInNakshatra,
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
