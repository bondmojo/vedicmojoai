/**
 * engine/compute/index.ts — Main entry point for the chart computation engine.
 *
 * Takes DOB + time + lat/long and produces a complete Vedic chart with:
 * - Planetary positions (sidereal, Lahiri ayanamsa)
 * - Divisional charts (D1, D4, D7, D9, D10, D30)
 * - Nakshatra details for all planets
 * - Chara Karakas (Jaimini)
 * - Ashtakavarga (BAV + SAV)
 * - Vimshottari Dasha tree
 *
 * All astronomical computations use Swiss Ephemeris via swisseph-v2.
 * All astrological derivations are purely deterministic (no LLM calls).
 */

import type { BirthInput, ComputedChart } from './types'
import {
  birthInputToJulianDay,
  computeAscendant,
  computePlanetPositions,
  getAyanamsa,
} from './planets'
import { computeDivisionalCharts } from './divisional'
import { computeNakshatras } from './nakshatras'
import { computeCharaKarakas } from './karakas'
import { computeAshtakavarga } from './ashtakavarga'

// Re-export types
export type { BirthInput, ComputedChart } from './types'
export type {
  PlanetPosition,
  NakshatraInfo,
  DivisionalChart,
  DivisionalPlacement,
  CharaKaraka,
  AshtakavargaResult,
} from './types'

/**
 * Computes a complete Vedic chart from birth data.
 *
 * This is the primary function for the computation engine.
 * It orchestrates all sub-computations and returns a unified result.
 *
 * @param input - Birth date, time, timezone, and geographic coordinates.
 * @returns Complete chart with all computations.
 *
 * @example
 * ```typescript
 * const chart = computeFullChart({
 *   date: '1990-04-15',
 *   time: '06:30:00',
 *   timezone: 5.5,
 *   latitude: 28.6139,
 *   longitude: 77.2090,
 *   name: 'Test User',
 * })
 * ```
 */
export function computeFullChart(input: BirthInput): ComputedChart {
  // Step 1: Convert to Julian Day (UT)
  const julianDay = birthInputToJulianDay(input)

  // Step 2: Get ayanamsa value
  const ayanamsa = getAyanamsa(julianDay)

  // Step 3: Compute ascendant (lagna)
  const ascendant = computeAscendant(julianDay, input.latitude, input.longitude)

  // Step 4: Compute planetary positions
  const planets = computePlanetPositions(julianDay, ascendant.signNumber)

  // Step 5: Compute nakshatra details
  const nakshatras = computeNakshatras(planets)

  // Step 6: Compute divisional charts (D1, D4, D7, D9, D10, D30)
  const divisionalCharts = computeDivisionalCharts(planets, ascendant.longitude)

  // Step 7: Compute Chara Karakas
  const charaKarakas = computeCharaKarakas(planets)

  // Step 8: Compute Ashtakavarga
  const ashtakavarga = computeAshtakavarga(planets, ascendant.signNumber)

  return {
    input,
    julianDay,
    ayanamsa,
    lagna: ascendant.sign,
    lagnaSignNumber: ascendant.signNumber,
    lagnaLongitude: ascendant.longitude,
    lagnaDegreeInSign: ascendant.degreeInSign,
    planets,
    nakshatras,
    divisionalCharts,
    charaKarakas,
    ashtakavarga,
  }
}
