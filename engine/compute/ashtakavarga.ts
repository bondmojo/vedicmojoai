/**
 * engine/compute/ashtakavarga.ts — Ashtakavarga (BAV & SAV) computation.
 *
 * Computes Bhinnashtakavarga for 7 planets (Sun through Saturn) and
 * Sarvashtakavarga (sum of all 7 BAVs). Uses classical BPHS rules.
 *
 * Each planet contributes bindus (benefic points) to signs based on
 * its position relative to 7 other planets + the lagna.
 *
 * Rahu/Ketu are NOT included in traditional Ashtakavarga.
 */

import type { AshtakavargaHouseEntry, AshtakavargaResult, PlanetPosition } from './types'
import { getSignName } from './planets'

// ─── Benefic-Point Tables (BPHS) ───────────────────────────────────

/**
 * Each entry represents: from which houses (counted from the contributor)
 * does a planet get a bindu in the reference planet's BAV.
 *
 * Format: BINDU_TABLE[referencePlanet][contributor] = array of house numbers
 * where bindu is given (1-indexed, counting from contributor's position).
 *
 * Source: Brihat Parashara Hora Shastra, Chapter 66–72.
 */

type PlanetKey = 'Sun' | 'Moon' | 'Mars' | 'Mercury' | 'Jupiter' | 'Venus' | 'Saturn'

const BINDU_TABLE: Record<PlanetKey, Record<PlanetKey | 'Lagna', number[]>> = {
  Sun: {
    Sun: [1, 2, 4, 7, 8, 9, 10, 11],
    Moon: [3, 6, 10, 11],
    Mars: [1, 2, 4, 7, 8, 9, 10, 11],
    Mercury: [3, 5, 6, 9, 10, 11, 12],
    Jupiter: [5, 6, 9, 11],
    Venus: [6, 7, 12],
    Saturn: [1, 2, 4, 7, 8, 9, 10, 11],
    Lagna: [3, 4, 6, 10, 11, 12],
  },
  Moon: {
    Sun: [3, 6, 7, 8, 10, 11],
    Moon: [1, 3, 6, 7, 10, 11],
    Mars: [2, 3, 5, 6, 9, 10, 11],
    Mercury: [1, 3, 4, 5, 7, 8, 10, 11],
    Jupiter: [1, 4, 7, 8, 10, 11, 12],
    Venus: [3, 4, 5, 7, 9, 10, 11],
    Saturn: [3, 5, 6, 11],
    Lagna: [3, 6, 10, 11],
  },
  Mars: {
    Sun: [3, 5, 6, 10, 11],
    Moon: [3, 6, 11],
    Mars: [1, 2, 4, 7, 8, 10, 11],
    Mercury: [3, 5, 6, 11],
    Jupiter: [6, 10, 11, 12],
    Venus: [6, 8, 11, 12],
    Saturn: [1, 4, 7, 8, 9, 10, 11],
    Lagna: [1, 3, 6, 10, 11],
  },
  Mercury: {
    Sun: [5, 6, 9, 11, 12],
    Moon: [2, 4, 6, 8, 10, 11],
    Mars: [1, 2, 4, 7, 8, 9, 10, 11],
    Mercury: [1, 3, 5, 6, 9, 10, 11, 12],
    Jupiter: [6, 8, 11, 12],
    Venus: [1, 2, 3, 4, 5, 8, 9, 11],
    Saturn: [1, 2, 4, 7, 8, 9, 10, 11],
    Lagna: [1, 2, 4, 6, 8, 10, 11],
  },
  Jupiter: {
    Sun: [1, 2, 3, 4, 7, 8, 9, 10, 11],
    Moon: [2, 5, 7, 9, 11],
    Mars: [1, 2, 4, 7, 8, 10, 11],
    Mercury: [1, 2, 4, 5, 6, 9, 10, 11],
    Jupiter: [1, 2, 3, 4, 7, 8, 10, 11],
    Venus: [2, 5, 6, 9, 10, 11],
    Saturn: [3, 5, 6, 12],
    Lagna: [1, 2, 4, 5, 6, 7, 9, 10, 11],
  },
  Venus: {
    Sun: [8, 11, 12],
    Moon: [1, 2, 3, 4, 5, 8, 9, 11, 12],
    Mars: [3, 4, 6, 9, 11, 12],
    Mercury: [3, 5, 6, 9, 11],
    Jupiter: [5, 8, 9, 10, 11],
    Venus: [1, 2, 3, 4, 5, 8, 9, 10, 11],
    Saturn: [3, 4, 5, 8, 9, 10, 11],
    Lagna: [1, 2, 3, 4, 5, 8, 9, 11],
  },
  Saturn: {
    Sun: [1, 2, 4, 7, 8, 10, 11],
    Moon: [3, 6, 11],
    Mars: [3, 5, 6, 10, 11, 12],
    Mercury: [6, 8, 9, 10, 11, 12],
    Jupiter: [5, 6, 11, 12],
    Venus: [6, 11, 12],
    Saturn: [3, 5, 6, 11],
    Lagna: [1, 3, 4, 6, 10, 11],
  },
}

// ─── Computation ────────────────────────────────────────────────────

const ASHTAKAVARGA_PLANETS: PlanetKey[] = [
  'Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn',
]

/**
 * Computes the Bhinnashtakavarga and Sarvashtakavarga.
 *
 * @param planets - Planet positions (must include Sun through Saturn)
 * @param lagnaSignNumber - Lagna sign number (1–12)
 * @returns BAV for each planet (12 bindus per sign) and total SAV
 */
export function computeAshtakavarga(
  planets: PlanetPosition[],
  lagnaSignNumber: number
): AshtakavargaResult {
  // Build a lookup of planet → sign number
  const planetSigns: Record<string, number> = {}
  for (const p of planets) {
    planetSigns[p.planet] = p.signNumber
  }
  planetSigns['Lagna'] = lagnaSignNumber

  // Initialize BAV: each planet has 12 slots (one per sign, 0-indexed = Aries)
  const bav: Record<string, number[]> = {}
  for (const planet of ASHTAKAVARGA_PLANETS) {
    bav[planet] = new Array(12).fill(0)
  }

  // Compute BAV for each reference planet
  for (const refPlanet of ASHTAKAVARGA_PLANETS) {
    const binduRules = BINDU_TABLE[refPlanet]

    // For each contributor (7 planets + Lagna)
    const contributors: (PlanetKey | 'Lagna')[] = [...ASHTAKAVARGA_PLANETS, 'Lagna']

    for (const contributor of contributors) {
      const contributorSign = planetSigns[contributor]
      if (!contributorSign) continue

      const houses = binduRules[contributor]
      if (!houses) continue

      // Each house number is counted from the contributor's sign
      for (const houseNum of houses) {
        // Sign receiving the bindu: contributor's sign + (houseNum - 1)
        const targetSign = ((contributorSign - 1 + (houseNum - 1)) % 12) // 0-indexed
        bav[refPlanet][targetSign] += 1
      }
    }
  }

  // Compute SAV (sum of all BAVs per sign)
  const sav: number[] = new Array(12).fill(0)
  for (const planet of ASHTAKAVARGA_PLANETS) {
    for (let i = 0; i < 12; i++) {
      sav[i] += bav[planet][i]
    }
  }

  const savTotal = sav.reduce((sum, v) => sum + v, 0)

  // House-indexed view (house 1 = lagna sign). Pre-rotate the SIGN-indexed
  // arrays so consumers never re-derive the house→sign mapping by hand.
  const byHouse: AshtakavargaHouseEntry[] = []
  for (let house = 1; house <= 12; house++) {
    const signNumber = ((lagnaSignNumber - 1 + (house - 1)) % 12) + 1
    const signIndex = signNumber - 1 // 0-indexed = Aries
    const houseBav: Record<string, number> = {}
    for (const planet of ASHTAKAVARGA_PLANETS) {
      houseBav[planet] = bav[planet][signIndex]
    }
    byHouse.push({
      house,
      signNumber,
      sign: getSignName(signNumber),
      sav: sav[signIndex],
      bav: houseBav,
    })
  }

  return { bav, sav, savTotal, lagnaSignNumber, byHouse }
}
