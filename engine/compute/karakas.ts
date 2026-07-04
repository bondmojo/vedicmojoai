/**
 * engine/compute/karakas.ts — Chara Karaka (Jaimini) computation.
 *
 * Assigns the 7 Chara Karakas based on degree within sign (descending order).
 * The planet with the highest degree becomes Atmakaraka, and so on.
 *
 * Default: the 7-karaka system (Rahu and Ketu excluded). Pass includeRahu=true
 * to use the 8-karaka system, in which Rahu participates via a special rule —
 * its effective degree is (30 − degree), i.e. reverse counting within the sign.
 */

import type { CharaKaraka, PlanetPosition } from './types'

// ─── Karaka Definitions ─────────────────────────────────────────────

const KARAKA_NAMES: { name: string; abbr: string }[] = [
  { name: 'Atmakaraka', abbr: 'AK' },
  { name: 'Amatyakaraka', abbr: 'AmK' },
  { name: 'Bhratrukaraka', abbr: 'BK' },
  { name: 'Matrukaraka', abbr: 'MK' },
  { name: 'Putrakaraka', abbr: 'PK' },
  { name: 'Gnatikaraka', abbr: 'GK' },
  { name: 'Darakaraka', abbr: 'DK' },
  { name: 'Pitrukaraka', abbr: 'PiK' }, // 8th karaka (if using 8-karaka system)
]

// ─── Computation ────────────────────────────────────────────────────

/**
 * Computes Chara Karakas from planet positions.
 *
 * Uses the 7-karaka system (excluding Rahu/Ketu) by default.
 * Rahu is excluded because its degree interpretation varies by school.
 *
 * @param planets - Array of planet positions
 * @param includeRahu - Whether to include Rahu (8-karaka system). Default: false.
 * @returns Array of CharaKaraka assignments, sorted highest degree first.
 */
export function computeCharaKarakas(
  planets: PlanetPosition[],
  includeRahu: boolean = false
): CharaKaraka[] {
  // Filter to applicable planets
  const candidates = planets.filter((p) => {
    if (p.planet === 'Ketu') return false
    if (p.planet === 'Rahu' && !includeRahu) return false
    return true
  })

  // Get effective degree for each planet
  const withDegree = candidates.map((p) => {
    let effectiveDegree = p.degreeInSign

    // Rahu special rule: 30 - degree (reverse counting in some schools)
    if (p.planet === 'Rahu') {
      effectiveDegree = 30 - p.degreeInSign
    }

    return {
      planet: p.planet,
      degreeInSign: effectiveDegree,
    }
  })

  // Sort by degree descending (highest degree = Atmakaraka)
  withDegree.sort((a, b) => b.degreeInSign - a.degreeInSign)

  // Assign karakas
  const karakas: CharaKaraka[] = withDegree.map((item, index) => {
    const karakaInfo = KARAKA_NAMES[index] ?? { name: 'Unknown', abbr: '?' }
    return {
      planet: item.planet,
      karaka: karakaInfo.name,
      karakaAbbr: karakaInfo.abbr,
      degreeInSign: item.degreeInSign,
    }
  })

  return karakas
}
