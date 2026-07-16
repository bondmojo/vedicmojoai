/**
 * engine/compute/divisional.ts — Divisional (Varga) chart computation.
 *
 * Computes D1, D2, D3, D4, D5, D6, D7, D9, D10, D12, D24, D30 charts from
 * sidereal longitudes. Each divisional chart divides the 30° sign into N
 * equal (or, for D30, unequal) parts and maps each part to a sign according
 * to classical Parashari rules (BPHS).
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
 * D5 — Panchamsa (Fame, Authority, Power)
 * Each sign is divided into 5 parts of 6° each.
 * Fixed-table method (same style as D30/D2): the target signs are the same for
 * every sign of a given parity, regardless of the natal sign itself.
 * - Odd signs:  parts 1–5 → Aries, Aquarius, Sagittarius, Gemini, Libra
 * - Even signs: parts 1–5 → Taurus, Virgo, Pisces, Capricorn, Scorpio
 * Source: classical Parashari Panchamsa table (ashtakvargajyoti.wordpress.com,
 * "Concept of Divisional Charts in Vedic Astrology").
 */
const D5_ODD_TARGETS = [1, 11, 9, 3, 7]   // Aries, Aquarius, Sagittarius, Gemini, Libra
const D5_EVEN_TARGETS = [2, 6, 12, 10, 8]  // Taurus, Virgo, Pisces, Capricorn, Scorpio

function computeD5Sign(longitude: number): number {
  const signNumber = Math.floor(longitude / 30) + 1
  const degreeInSign = longitude % 30
  const part = Math.floor(degreeInSign / 6) // 0–4

  const isOdd = signNumber % 2 === 1
  return isOdd ? D5_ODD_TARGETS[part] : D5_EVEN_TARGETS[part]
}

/**
 * D6 — Shashthamsa (Health Troubles, Obstacles, Debts)
 * Each sign is divided into 6 parts of 5° each.
 * Offset-counting method (same style as D9): counting starts from a fixed
 * sign depending on parity, then advances one sign per part.
 * - Odd signs:  counting starts from Aries (1)
 * - Even signs: counting starts from Libra (7)
 * Source: classical Parashari Shashthamsa rule (ashtakvargajyoti.wordpress.com,
 * "Concept of Divisional Charts in Vedic Astrology").
 */
function computeD6Sign(longitude: number): number {
  const signNumber = Math.floor(longitude / 30) + 1
  const degreeInSign = longitude % 30
  const part = Math.floor(degreeInSign / 5) // 0–5

  const isOdd = signNumber % 2 === 1
  const startSign = isOdd ? 1 : 7 // Aries : Libra
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
 *
 * Uses the PVR Uma-Shambhu (Parivritti Even-Reverse) method — the default in
 * Jagannatha Hora (JHora) software. The 24 horas cycle sequentially through
 * all 12 signs twice starting from Aries, with even-indexed signs counting
 * forward and odd-indexed signs counting in reverse within each pair.
 *
 * Mapping (derived from parivritti_even_reverse(2) in PyJHora):
 *   Aries      0–15° → Aries       | 15–30° → Taurus
 *   Taurus     0–15° → Cancer      | 15–30° → Gemini
 *   Gemini     0–15° → Leo         | 15–30° → Virgo
 *   Cancer     0–15° → Scorpio     | 15–30° → Libra
 *   Leo        0–15° → Sagittarius | 15–30° → Capricorn
 *   Virgo      0–15° → Pisces      | 15–30° → Aquarius
 *   (repeats for Libra–Pisces)
 *
 * The Traditional Parasara method (Cancer/Leo only, BPHS strict reading) is:
 *   Odd signs:  0–15° → Leo (5),    15–30° → Cancer (4)
 *   Even signs: 0–15° → Cancer (4), 15–30° → Leo (5)
 * That method is NOT used here because it does not match JHora output.
 *
 * Source: PyJHora charts.py `_hora_chart_by_pvr_method` / `__parivritti_even_reverse(2)`;
 *         PVR Narasimha Rao, "Parasara's Hora Chart Decoded" (Uma-Shambhu Hora).
 */

/**
 * Pre-computed PVR D2 lookup table.
 * Index: signIndex (0–11). Value: [firstHalfSign, secondHalfSign] (both 1-indexed).
 * Pattern repeats every 6 signs (Libra–Pisces mirrors Aries–Virgo).
 */
const PVR_D2_MAP: readonly [number, number][] = [
  [1,  2],  // Aries:       0–15→Aries,        15–30→Taurus
  [4,  3],  // Taurus:      0–15→Cancer,        15–30→Gemini
  [5,  6],  // Gemini:      0–15→Leo,           15–30→Virgo
  [8,  7],  // Cancer:      0–15→Scorpio,       15–30→Libra
  [9,  10], // Leo:         0–15→Sagittarius,   15–30→Capricorn
  [12, 11], // Virgo:       0–15→Pisces,        15–30→Aquarius
  [1,  2],  // Libra:       0–15→Aries,         15–30→Taurus
  [4,  3],  // Scorpio:     0–15→Cancer,        15–30→Gemini
  [5,  6],  // Sagittarius: 0–15→Leo,           15–30→Virgo
  [8,  7],  // Capricorn:   0–15→Scorpio,       15–30→Libra
  [9,  10], // Aquarius:    0–15→Sagittarius,   15–30→Capricorn
  [12, 11], // Pisces:      0–15→Pisces,        15–30→Aquarius
]

function computeD2Sign(longitude: number): number {
  const lon = ((longitude % 360) + 360) % 360
  const signIndex = Math.floor(lon / 30)        // 0–11
  const degreeInSign = lon % 30
  const hora = degreeInSign < 15 ? 0 : 1        // 0 = first half, 1 = second half
  return PVR_D2_MAP[signIndex][hora]
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

/**
 * D24 — Chaturvimshamsa / Siddhamsa (Education, Learning, Knowledge)
 * Each sign is divided into 24 parts of 1°15' each.
 * Offset-counting method (same style as D9/D6): counting starts from a fixed
 * sign depending on parity, then advances one sign per part.
 * - Odd signs:  counting starts from Leo (5)
 * - Even signs: counting starts from Cancer (4)
 * Source: BPHS via blog.indianastrologysoftware.com ("Chaturvimsamsa / Siddamsa
 * D24") and ashtakvargajyoti.wordpress.com ("Concept of Divisional Charts").
 */
function computeD24Sign(longitude: number): number {
  const signNumber = Math.floor(longitude / 30) + 1
  const degreeInSign = longitude % 30
  const part = Math.floor(degreeInSign / 1.25) // 0–23

  const isOdd = signNumber % 2 === 1
  const startSign = isOdd ? 5 : 4 // Leo : Cancer
  const resultSign = ((startSign - 1 + part) % 12) + 1
  return resultSign
}

// ─── Chart Registry ─────────────────────────────────────────────────

const VARGA_DEFINITIONS: VargaDefinition[] = [
  { division: 1, name: 'Rashi', shortName: 'D1', computeSign: computeD1Sign },
  { division: 2, name: 'Hora', shortName: 'D2', computeSign: computeD2Sign },
  { division: 3, name: 'Drekkana', shortName: 'D3', computeSign: computeD3Sign },
  { division: 4, name: 'Chaturthamsa', shortName: 'D4', computeSign: computeD4Sign },
  { division: 5, name: 'Panchamsa', shortName: 'D5', computeSign: computeD5Sign },
  { division: 6, name: 'Shashthamsa', shortName: 'D6', computeSign: computeD6Sign },
  { division: 7, name: 'Saptamsa', shortName: 'D7', computeSign: computeD7Sign },
  { division: 9, name: 'Navamsa', shortName: 'D9', computeSign: computeD9Sign },
  { division: 10, name: 'Dashamsa', shortName: 'D10', computeSign: computeD10Sign },
  { division: 12, name: 'Dwadasamsa', shortName: 'D12', computeSign: computeD12Sign },
  { division: 24, name: 'Chaturvimshamsa', shortName: 'D24', computeSign: computeD24Sign },
  { division: 30, name: 'Trimshamsa', shortName: 'D30', computeSign: computeD30Sign },
]

// ─── Main Function ──────────────────────────────────────────────────

/**
 * Computes all requested divisional charts for the given planet positions.
 *
 * @param planets - Planet positions from computePlanetPositions()
 * @param lagnaLongitude - Sidereal longitude of the ascendant
 * @returns Array of divisional charts (D1, D2, D3, D4, D5, D6, D7, D9, D10, D12, D24, D30)
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
