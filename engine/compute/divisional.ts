/**
 * engine/compute/divisional.ts — Divisional (Varga) chart computation.
 *
 * Computes D1, D4, D7, D9, D10, D30 charts from sidereal longitudes.
 * Each divisional chart divides the 30° sign into N equal parts and maps
 * each part to a sign according to classical Parashari rules (BPHS).
 *
 * All computations are purely arithmetic — no ephemeris calls needed.
 */

import type { DivisionalChart, DivisionalPlacement, PlanetPosition } from './types'
import { getSignName } from './planets'

// ─── Divisional Chart Definitions ───────────────────────────────────

interface VargaDefinition {
  division: number
  name: string
  shortName: string
  /** Computes the sign number (1–12) for a planet given its sidereal longitude */
  computeSign: (longitude: number) => number
}

/**
 * D1 — Rashi (Natal Chart)
 * Each 30° = 1 sign. Trivial: sign = floor(longitude / 30) + 1
 */
function computeD1Sign(longitude: number): number {
  return Math.floor(((longitude % 360) + 360) % 360 / 30) + 1
}

/**
 * D4 — Chaturthamsa (Property, Fixed Assets, Fortune)
 * Each sign is divided into 4 parts of 7°30' each.
 * The four quarters map to the sign itself and the 4th, 7th, and 10th from
 * it (the four kendras) — for ALL signs, with no odd/even distinction.
 * (Parashari Chaturthamsa rule, BPHS.)
 */
function computeD4Sign(longitude: number): number {
  const signNumber = Math.floor(longitude / 30) + 1 // 1-indexed
  const degreeInSign = longitude % 30
  const part = Math.floor(degreeInSign / 7.5) // 0–3

  // Each part advances by 3 signs (kendra progression) from the sign itself.
  const resultSign = ((signNumber - 1 + part * 3) % 12) + 1
  return resultSign
}

/**
 * D7 — Saptamsa (Children, Progeny)
 * Each sign divided into 7 parts of 4°17'8.57" (30/7 degrees).
 * For odd signs: counting starts from the same sign.
 * For even signs: counting starts from the 7th sign from it.
 */
function computeD7Sign(longitude: number): number {
  const signNumber = Math.floor(longitude / 30) + 1
  const degreeInSign = longitude % 30
  const part = Math.floor(degreeInSign / (30 / 7)) // 0–6

  const isOdd = signNumber % 2 === 1
  const startSign = isOdd ? signNumber : ((signNumber - 1 + 6) % 12) + 1
  const resultSign = ((startSign - 1 + part) % 12) + 1
  return resultSign
}

/**
 * D9 — Navamsa (Marriage, Dharma, Inner Strength)
 * Each sign divided into 9 parts of 3°20' each.
 * Starting sign depends on the element (triplicity) of the natal sign:
 * - Fire signs (Ari, Leo, Sag): start from Aries (1)
 * - Earth signs (Tau, Vir, Cap): start from Capricorn (10)
 * - Air signs (Gem, Lib, Aqu): start from Libra (7)
 * - Water signs (Can, Sco, Pis): start from Cancer (4)
 * Then count forward by navamsa parts from the start.
 *
 * This matches the continuous 108-navamsa cycle: the element-based start
 * sign plus the part index yields the correct navamsa sign directly. No
 * additional triplicity offset is needed — the starting signs already
 * account for each sign's position in the cycle.
 */
function computeD9Sign(longitude: number): number {
  const signNumber = Math.floor(longitude / 30) + 1
  const degreeInSign = longitude % 30
  const part = Math.floor(degreeInSign / (30 / 9)) // 0–8

  // Element-based starting sign
  const element = (signNumber - 1) % 4 // 0=Fire, 1=Earth, 2=Air, 3=Water
  const elementStarts = [1, 10, 7, 4] // Aries, Capricorn, Libra, Cancer
  const startSign = elementStarts[element]

  const resultSign = ((startSign - 1 + part) % 12) + 1
  return resultSign
}

/**
 * D10 — Dashamsa (Career, Profession, Status)
 * Each sign divided into 10 parts of 3° each.
 * For odd signs: counting starts from the same sign.
 * For even signs: counting starts from the 9th sign from it.
 */
function computeD10Sign(longitude: number): number {
  const signNumber = Math.floor(longitude / 30) + 1
  const degreeInSign = longitude % 30
  const part = Math.floor(degreeInSign / 3) // 0–9

  const isOdd = signNumber % 2 === 1
  const startSign = isOdd ? signNumber : ((signNumber - 1 + 8) % 12) + 1
  const resultSign = ((startSign - 1 + part) % 12) + 1
  return resultSign
}

/**
 * D30 — Trimshamsa (Misfortune, Disease, Evil)
 * This chart has UNEQUAL divisions (not 1° each).
 * For odd signs:
 *   0–5° → Mars (Aries=1), 5–10° → Saturn (Aquarius=11),
 *   10–18° → Jupiter (Sagittarius=9), 18–25° → Mercury (Gemini=3),
 *   25–30° → Venus (Libra=7)
 * For even signs (reverse):
 *   0–5° → Venus (Taurus=2), 5–12° → Mercury (Gemini=3),
 *   12–20° → Jupiter (Sagittarius=9), 20–25° → Saturn (Aquarius=11),
 *   25–30° → Mars (Aries=1)
 */
function computeD30Sign(longitude: number): number {
  const signNumber = Math.floor(longitude / 30) + 1
  const degreeInSign = longitude % 30
  const isOdd = signNumber % 2 === 1

  if (isOdd) {
    if (degreeInSign < 5) return 1       // Aries (Mars)
    if (degreeInSign < 10) return 11     // Aquarius (Saturn)
    if (degreeInSign < 18) return 9      // Sagittarius (Jupiter)
    if (degreeInSign < 25) return 3      // Gemini (Mercury)
    return 7                              // Libra (Venus)
  } else {
    if (degreeInSign < 5) return 2       // Taurus (Venus)
    if (degreeInSign < 12) return 6      // Virgo (Mercury)
    if (degreeInSign < 20) return 12     // Pisces (Jupiter)
    if (degreeInSign < 25) return 10     // Capricorn (Saturn)
    return 8                              // Scorpio (Mars)
  }
}

/**
 * D2 — Hora (Wealth, Prosperity)
 * Each sign divided into 2 parts of 15° each.
 * For odd signs: 0–15° → Leo (5), 15–30° → Cancer (4).
 * For even signs: 0–15° → Cancer (4), 15–30° → Leo (5).
 */
function computeD2Sign(longitude: number): number {
  const signNumber = Math.floor(longitude / 30) + 1
  const degreeInSign = longitude % 30
  const isOdd = signNumber % 2 === 1
  const firstHalf = degreeInSign < 15

  if (isOdd) {
    return firstHalf ? 5 : 4 // Leo then Cancer
  } else {
    return firstHalf ? 4 : 5 // Cancer then Leo
  }
}

/**
 * D3 — Drekkana (Siblings, Courage)
 * Each sign divided into 3 parts of 10° each.
 * 0–10° → same sign; 10–20° → 5th sign from it; 20–30° → 9th sign from it.
 */
function computeD3Sign(longitude: number): number {
  const signNumber = Math.floor(longitude / 30) + 1
  const degreeInSign = longitude % 30
  const part = Math.floor(degreeInSign / 10) // 0–2

  const offsets = [0, 4, 8] // same, 5th, 9th
  const resultSign = ((signNumber - 1 + offsets[part]) % 12) + 1
  return resultSign
}

/**
 * D12 — Dwadasamsa (Parents, Ancestry)
 * Each sign divided into 12 parts of 2°30' each.
 * part = floor(degreeInSign / 2.5) (0–11).
 * resultSign = ((signNumber - 1 + part) % 12) + 1
 */
function computeD12Sign(longitude: number): number {
  const signNumber = Math.floor(longitude / 30) + 1
  const degreeInSign = longitude % 30
  const part = Math.floor(degreeInSign / 2.5) // 0–11

  const resultSign = ((signNumber - 1 + part) % 12) + 1
  return resultSign
}

// ─── Chart Registry ─────────────────────────────────────────────────

const VARGA_DEFINITIONS: VargaDefinition[] = [
  { division: 1, name: 'Rashi', shortName: 'D1', computeSign: computeD1Sign },
  { division: 2, name: 'Hora', shortName: 'D2', computeSign: computeD2Sign },
  { division: 3, name: 'Drekkana', shortName: 'D3', computeSign: computeD3Sign },
  { division: 4, name: 'Chaturthamsa', shortName: 'D4', computeSign: computeD4Sign },
  { division: 7, name: 'Saptamsa', shortName: 'D7', computeSign: computeD7Sign },
  { division: 9, name: 'Navamsa', shortName: 'D9', computeSign: computeD9Sign },
  { division: 10, name: 'Dashamsa', shortName: 'D10', computeSign: computeD10Sign },
  { division: 12, name: 'Dwadasamsa', shortName: 'D12', computeSign: computeD12Sign },
  { division: 30, name: 'Trimshamsa', shortName: 'D30', computeSign: computeD30Sign },
]

// ─── Main Function ──────────────────────────────────────────────────

/**
 * Computes all requested divisional charts for the given planet positions.
 *
 * @param planets - Planet positions from computePlanetPositions()
 * @param lagnaLongitude - Sidereal longitude of the ascendant
 * @returns Array of divisional charts (D1, D4, D7, D9, D10, D30)
 */
export function computeDivisionalCharts(
  planets: PlanetPosition[],
  lagnaLongitude: number
): DivisionalChart[] {
  const charts: DivisionalChart[] = []

  for (const varga of VARGA_DEFINITIONS) {
    // Compute lagna sign in this divisional chart
    const lagnaVargaSign = varga.computeSign(lagnaLongitude)
    const lagnaDegreee = lagnaLongitude % 30

    // Compute planet placements
    const placements: DivisionalPlacement[] = planets.map((planet) => {
      const vargaSign = varga.computeSign(planet.longitude)
      // House from varga lagna (whole sign)
      const house = ((vargaSign - lagnaVargaSign + 12) % 12) + 1

      return {
        planet: planet.planet,
        sign: getSignName(vargaSign),
        signNumber: vargaSign,
        house,
        retrograde: planet.retrograde || undefined,
      }
    })

    charts.push({
      division: varga.division,
      name: varga.name,
      shortName: varga.shortName,
      lagna: getSignName(lagnaVargaSign),
      lagnaSignNumber: lagnaVargaSign,
      lagnaDegreee,
      planets: placements,
    })
  }

  return charts
}

/**
 * Returns the divisional-chart sign (1–12) for an arbitrary sidereal longitude.
 * Used to project points that have a real longitude (special lagnas, upagrahas)
 * into a given varga. Falls back to the D1 (rashi) sign for unknown divisions.
 */
export function vargaSignForLongitude(longitude: number, division: number): number {
  const lon = ((longitude % 360) + 360) % 360
  const varga = VARGA_DEFINITIONS.find((v) => v.division === division)
  return varga ? varga.computeSign(lon) : Math.floor(lon / 30) + 1
}

/**
 * Computes a single divisional chart by division number.
 */
export function computeSingleDivisionalChart(
  planets: PlanetPosition[],
  lagnaLongitude: number,
  division: number
): DivisionalChart | null {
  const varga = VARGA_DEFINITIONS.find((v) => v.division === division)
  if (!varga) return null

  const lagnaVargaSign = varga.computeSign(lagnaLongitude)
  const lagnaDegreee = lagnaLongitude % 30

  const placements: DivisionalPlacement[] = planets.map((planet) => {
    const vargaSign = varga.computeSign(planet.longitude)
    const house = ((vargaSign - lagnaVargaSign + 12) % 12) + 1
    return {
      planet: planet.planet,
      sign: getSignName(vargaSign),
      signNumber: vargaSign,
      house,
      retrograde: planet.retrograde || undefined,
    }
  })

  return {
    division: varga.division,
    name: varga.name,
    shortName: varga.shortName,
    lagna: getSignName(lagnaVargaSign),
    lagnaSignNumber: lagnaVargaSign,
    lagnaDegreee,
    planets: placements,
  }
}
