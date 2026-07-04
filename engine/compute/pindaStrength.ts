/**
 * engine/compute/pindaStrength.ts — Pinda (Cosmic Body) Strength computation.
 *
 * Pinda Strength is a composite dignitary score for each planet based on
 * five factors (each scored 0–20, total 0–100):
 *
 * 1. Uccha Bala        — Proximity to exaltation degree (20 at exact exaltation)
 * 2. Saptha Varga Bala — Sum of dignities in 7 vargas (D1,D2,D3,D7,D9,D12,D30)
 * 3. Ojha Yugma Bala   — Odd/even sign placement (benefic planets prefer even, malefic odd)
 * 4. Kendradi Bala     — House type strength (kendra > panapara > apoklima)
 * 5. Drekana Bala      — Decanate (drekkana) strength by sex/gender rules
 *
 * The final Pinda strength is expressed as a percentage (sum/100 × 100%).
 *
 * Reference: Brihat Parashara Hora Shastra, Chapter 27 (Pinda Bala).
 */

import type { PlanetPosition } from './types'

// ─── Types ──────────────────────────────────────────────────────────

export interface PindaStrengthEntry {
  planet: string
  uchcha_bala: number        // 0–20
  sapta_varga_bala: number   // 0–20 (normalized)
  ojha_yugma_bala: number    // 0–20
  kendradi_bala: number      // 0–20
  drekana_bala: number       // 0–20
  total: number              // 0–100
  pct: number                // 0–100%
  grade: string              // Strong / Average / Weak
}

// ─── Constants ──────────────────────────────────────────────────────

/** Exact exaltation degrees (sidereal longitude) */
const EXALTATION_LONGITUDES: Record<string, number> = {
  Sun:     10,    // 10° Aries
  Moon:    33,    // 3° Taurus  (30+3)
  Mars:   298,    // 28° Capricorn (270+28)
  Mercury: 165,   // 15° Virgo  (150+15)
  Jupiter: 95,    // 5° Cancer  (90+5)
  Venus:   357,   // 27° Pisces (330+27)
  Saturn:  200,   // 20° Libra  (180+20)
  Rahu:     60,   // 3° Gemini (some schools)
  Ketu:    240,   // 3° Sag
}

/** Natural malefic planets */
const NATURAL_MALEFICS = new Set(['Sun', 'Mars', 'Saturn', 'Rahu', 'Ketu'])

// ─── 1. Uccha Bala ───────────────────────────────────────────────────

/**
 * Uccha Bala: 20 at exact exaltation, 0 at exact debilitation (opposite sign).
 * Linear interpolation based on distance from exaltation point.
 * Max distance = 180° → scale 0–20.
 */
function computeUcchaBala(planet: string, longitude: number): number {
  const exaltLon = EXALTATION_LONGITUDES[planet]
  if (exaltLon === undefined) return 10 // default for Rahu/Ketu variants

  let diff = Math.abs(longitude - exaltLon)
  if (diff > 180) diff = 360 - diff

  // At diff=0 → Uccha=20; at diff=180 → Uccha=0
  return Math.round(((180 - diff) / 180) * 20 * 100) / 100
}

// ─── 2. Saptha Varga Bala ────────────────────────────────────────────

/**
 * Saptha Varga Bala: dignity score from 7 divisional charts.
 * 
 * Dignity scoring per varga:
 *   Exalted:       20 pts
 *   Moolatrikona:  16 pts
 *   Own sign:      12 pts
 *   Great friend:   8 pts
 *   Friend:         6 pts
 *   Neutral:        4 pts
 *   Enemy:          2 pts
 *   Great enemy:    1 pt
 *   Debilitated:    0 pts
 *
 * Max per varga = 20; 7 vargas × 20 = 140 max. Normalized to 0–20.
 */

const DEBILITATION_SIGNS: Record<string, number> = {
  Sun: 7, Moon: 8, Mars: 4, Mercury: 12, Jupiter: 10, Venus: 6, Saturn: 1,
}
const EXALTATION_SIGNS: Record<string, number> = {
  Sun: 1, Moon: 2, Mars: 10, Mercury: 6, Jupiter: 4, Venus: 12, Saturn: 7,
}
const MOOLATRIKONA: Record<string, number> = {
  Sun: 5, Moon: 2, Mars: 1, Mercury: 6, Jupiter: 9, Venus: 7, Saturn: 11,
}
const OWN_SIGNS: Record<string, number[]> = {
  Sun: [5], Moon: [4], Mars: [1, 8], Mercury: [3, 6],
  Jupiter: [9, 12], Venus: [2, 7], Saturn: [10, 11],
}

// Simplified friendship table (natural friendships)
const PLANET_FRIENDS: Record<string, string[]> = {
  Sun:     ['Moon', 'Mars', 'Jupiter'],
  Moon:    ['Sun', 'Mercury'],
  Mars:    ['Sun', 'Moon', 'Jupiter'],
  Mercury: ['Sun', 'Venus'],
  Jupiter: ['Sun', 'Moon', 'Mars'],
  Venus:   ['Mercury', 'Saturn'],
  Saturn:  ['Mercury', 'Venus'],
}
const PLANET_ENEMIES: Record<string, string[]> = {
  Sun:     ['Venus', 'Saturn'],
  Moon:    ['Rahu', 'Ketu'],
  Mars:    ['Mercury'],
  Mercury: ['Moon'],
  Jupiter: ['Mercury', 'Venus'],
  Venus:   ['Sun', 'Moon'],
  Saturn:  ['Sun', 'Moon', 'Mars'],
}

const SIGN_LORDS: Record<number, string> = {
  1: 'Mars', 2: 'Venus', 3: 'Mercury', 4: 'Moon', 5: 'Sun', 6: 'Mercury',
  7: 'Venus', 8: 'Mars', 9: 'Jupiter', 10: 'Saturn', 11: 'Saturn', 12: 'Jupiter',
}

function signDignityScore(planet: string, signNumber: number): number {
  if (!EXALTATION_SIGNS[planet]) return 4 // nodes default neutral

  if (EXALTATION_SIGNS[planet] === signNumber) return 20
  if (DEBILITATION_SIGNS[planet] === signNumber) return 0
  if (MOOLATRIKONA[planet] === signNumber) return 16
  if (OWN_SIGNS[planet]?.includes(signNumber)) return 12

  const signLord = SIGN_LORDS[signNumber]
  const friends = PLANET_FRIENDS[planet] ?? []
  const enemies = PLANET_ENEMIES[planet] ?? []

  if (friends.includes(signLord)) return 6
  if (enemies.includes(signLord)) return 2
  return 4 // neutral
}

function computeSaptaVargaBala(
  planet: string,
  d1Sign: number,
  d2Sign: number,
  d3Sign: number,
  d7Sign: number,
  d9Sign: number,
  d12Sign: number,
  d30Sign: number
): number {
  const scores = [d1Sign, d2Sign, d3Sign, d7Sign, d9Sign, d12Sign, d30Sign]
    .map((sign) => signDignityScore(planet, sign))

  const total = scores.reduce((s, v) => s + v, 0)
  // Max = 7 × 20 = 140. Normalize to 0–20.
  return Math.round((total / 140) * 20 * 100) / 100
}

// ─── 3. Ojha Yugma Bala ──────────────────────────────────────────────

/**
 * Ojha (odd) / Yugma (even) sign placement.
 * Natural malefics (Sun, Mars, Saturn, Rahu, Ketu) prefer odd signs → 20 if odd.
 * Natural benefics (Moon, Mercury, Jupiter, Venus) prefer even signs → 20 if even.
 * Otherwise 10.
 */
function computeOjhaYugmaBala(planet: string, signNumber: number): number {
  const isOddSign = signNumber % 2 === 1
  const isMalefic = NATURAL_MALEFICS.has(planet)

  if (isMalefic && isOddSign) return 20
  if (!isMalefic && !isOddSign) return 20
  return 10
}

// ─── 4. Kendradi Bala ────────────────────────────────────────────────

/**
 * Kendradi (House Type) Strength:
 *   Kendra houses (1,4,7,10) → 20
 *   Panapara houses (2,5,8,11) → 15
 *   Apoklima houses (3,6,9,12) → 10
 */
function computeKendradiBala(houseNumber: number): number {
  const kendras    = [1, 4, 7, 10]
  const panaparas  = [2, 5, 8, 11]

  if (kendras.includes(houseNumber)) return 20
  if (panaparas.includes(houseNumber)) return 15
  return 10
}

// ─── 5. Drekana Bala ─────────────────────────────────────────────────

/**
 * Drekana (Drekkana / 3rd harmonic) Bala:
 * Each sign is divided into 3 decanates of 10°.
 * Male planets (Sun, Mars, Jupiter, Saturn) are strong in:
 *   1st decan (0–10°) of odd signs, 2nd decan (10–20°) of even signs,
 *   3rd decan (20–30°) elsewhere.
 * Female planets (Moon, Venus) are opposite.
 * Mercury is neuter → 15 everywhere.
 * Rahu/Ketu → 10.
 *
 * Simplified classical rule: 20 if strong decan, 15 if neutral, 10 if weak.
 */
function computeDekanaBala(planet: string, signNumber: number, degreeInSign: number): number {
  if (planet === 'Rahu' || planet === 'Ketu') return 10
  if (planet === 'Mercury') return 15

  const decan = Math.floor(degreeInSign / 10) + 1 // 1, 2, or 3
  const isOddSign = signNumber % 2 === 1
  const malePlanets = ['Sun', 'Mars', 'Jupiter', 'Saturn']
  const isMale = malePlanets.includes(planet)

  // Strong decan for male planets in odd signs = 1st; even signs = 2nd
  const strongDecan = isOddSign ? (isMale ? 1 : 2) : (isMale ? 2 : 3)

  if (decan === strongDecan) return 20
  if (decan === (strongDecan === 3 ? 1 : strongDecan + 1)) return 15
  return 10
}

// ─── Main Export ─────────────────────────────────────────────────────

/**
 * Computes Pinda Strength for all 9 planets.
 *
 * @param planets - Planet positions (D1)
 * @param divisionalCharts - Computed divisional charts (needs D2, D3, D7, D9, D12, D30)
 */
export function computePindaStrength(
  planets: PlanetPosition[],
  divisionalCharts: Array<{ division: number; planets: Array<{ planet: string; signNumber: number }> }>
): PindaStrengthEntry[] {
  // Build a lookup: division → planet → signNumber
  const vargaSign: Record<number, Record<string, number>> = {}
  for (const chart of divisionalCharts) {
    vargaSign[chart.division] = {}
    for (const p of chart.planets) {
      vargaSign[chart.division][p.planet] = p.signNumber
    }
  }

  // For D2 (Hora) and D3 (Drekkana) — compute if not in divisionalCharts
  // They are not currently in our standard 6-chart set; we approximate with D1
  const getSign = (division: number, planet: string): number => {
    return vargaSign[division]?.[planet]
      ?? vargaSign[1]?.[planet]  // fallback to D1 if not computed
      ?? planets.find((p) => p.planet === planet)?.signNumber
      ?? 1
  }

  const classicalPlanets = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu']

  return classicalPlanets.map((planetName) => {
    const p = planets.find((x) => x.planet === planetName)
    if (!p) {
      return {
        planet: planetName, uchcha_bala: 0, sapta_varga_bala: 0,
        ojha_yugma_bala: 0, kendradi_bala: 0, drekana_bala: 0,
        total: 0, pct: 0, grade: 'Weak',
      }
    }

    const uccha     = computeUcchaBala(planetName, p.longitude)
    const saptaVarga = computeSaptaVargaBala(
      planetName,
      getSign(1, planetName),
      getSign(2, planetName),
      getSign(3, planetName),
      getSign(7, planetName),
      getSign(9, planetName),
      getSign(12, planetName),
      getSign(30, planetName),
    )
    const ojha      = computeOjhaYugmaBala(planetName, p.signNumber)
    const kendradi  = computeKendradiBala(p.house)
    const drekana   = computeDekanaBala(planetName, p.signNumber, p.degreeInSign)

    const total = uccha + saptaVarga + ojha + kendradi + drekana
    const pct = Math.round(total)

    const grade = pct >= 80 ? 'Strong' : pct >= 50 ? 'Average' : 'Weak'

    return {
      planet: planetName,
      uchcha_bala: uccha,
      sapta_varga_bala: saptaVarga,
      ojha_yugma_bala: ojha,
      kendradi_bala: kendradi,
      drekana_bala: drekana,
      total,
      pct,
      grade,
    }
  })
}
