/**
 * engine/compute/varshaphal.ts — Tajika Varshaphal (annual solar-return chart).
 *
 * The Varshaphal ("fruit of the year") is an annual horoscope cast for the exact
 * moment the transiting Sun returns to its natal sidereal longitude (the Varsha
 * Pravesh). This module:
 *
 *   1. Finds the Varsha Pravesh instant for a requested civil year.
 *   2. Casts a full chart for that instant at the birthplace (reuses
 *      {@link computeFullChart}) — so the annual planets, Varsha Lagna,
 *      divisional charts, and (Parashari) Shadbala all come for free. Its
 *      transit block (Gochar, Sade Sati) is reckoned from the NATAL Moon and
 *      Lagna as of the Varsha Pravesh, via computeFullChart's
 *      `transitReference`: by default it treats the return instant as a birth
 *      and would read Sade Sati from the annual Moon, as of the wall clock.
 *   3. Computes the Muntha (progressed ascendant, +1 sign/year).
 *   4. Computes Panchavargeeya Bala (Tajika 5-fold strength) for the seven
 *      classical planets.
 *   5. Identifies the five Varshesha (year-lord) office-bearers and picks the
 *      strongest one (Panchavargeeya Bala) that aspects the Varsha Lagna.
 *   6. Adds the year's dashas (varshaphalDashas.ts): the natal Vimshottari
 *      MD/AD/PD periods overlapping the year, and the Tajika Mudda dasha.
 *
 * METHOD NOTES / CAVEATS (documented, consistent with shadbala.ts's culture):
 *   - Panchavargeeya Bala uses the Neelakanthi/Charak component maxima
 *     (Kshetra 30, Uccha 20, Hadda 15, Drekkana 10, Navamsa 5 → sum ÷ 4 = 0–20).
 *     Kshetra is judged from the sign lord alone — moolatrikona plays no part,
 *     so the Moon in Taurus (exalted, Venus's sign) is not counted twice.
 *     Sub-division dignity uses PERMANENT (naisargika) friendship only. Exact
 *     Vishwa scales vary between texts/software; treat values as indicative.
 *   - Hadda uses the Egyptian terms (bounds) table, as is standard for Tajika.
 *   - Day/night (for Dinaratri & Trirashi lords) is taken from the ANNUAL chart
 *     — whether the year COMMENCES (Varsha Pravesh) by day or night, i.e. the
 *     annual Sun above vs below the horizon. This is the Tajika convention
 *     ("if the year commences by day, take the lord of the Sun's sign; if by
 *     night, the lord of the Moon's sign in the progressed chart") and matches
 *     JHora — not the natal birth's day/night. Above vs below is decided from
 *     the Sun's longitude against the Ascendant degree (isSunAboveHorizon), not
 *     whole-sign houses, which are wrong near sunrise and sunset.
 *   - Trirashi lord uses the Tajika Neelakanthi per-sign table (TRIRASHI_LORDS),
 *     not one pair per element: the second sign of each element swaps the
 *     day/night lords and the third has a single lord. Sources disagree on the
 *     Sagittarius night lord (Saturn here; some give Jupiter).
 *   - Varshesha (Tajika Neelakanthi): among the five office-bearers, the one
 *     with the highest Panchavargeeya Bala that aspects the Varsha Lagna; the
 *     number of offices held only breaks ties. If none aspects the Lagna, the
 *     strongest of all five. The Lagna aspect is sign-based (tajikaAspects.ts),
 *     so a planet in the Lagna counts (conjunction); which aspect natures count
 *     is VARSHESHA_LAGNA_ASPECT_NATURES below.
 *     Deeptamsha orbs are Phase 2. The ordering is still unverified against a
 *     JHora year-lord screen — see docs/computation_varshaphal.md §7.
 */

import type {
  BirthInput,
  ComputedChart,
  Muntha,
  PanchavargeeyaBalaEntry,
  PlanetPosition,
  TajikaAspectNature,
  VarsheshaCandidate,
  VarshaphalResult,
} from './types'
import {
  birthInputToJulianDay,
  computeAscendant,
  computePlanetPositions,
  siderealSunLongitude,
  findSolarReturnJulianDay,
  julianDayToLocalCivil,
  getSignName,
} from './planets'
import { computeFullChart } from './index'
import { birthInputToUtcDate } from './time'
import { computeVimshottari } from '../computeVimshottari'
import { computeMuddaDasha, sliceNatalVimshottari } from './varshaphalDashas'
import { SIGN_LORDS, arcDist, normLon } from './relationships'
import { getTajikaSignAspect, TAJIKA_ASPECT_BY_DISTANCE } from './tajikaAspects'

// ─── Constants ──────────────────────────────────────────────────────

const CLASSICAL_PLANETS = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn']

const WEEKDAY_LORDS = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn']
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** Exact exaltation longitudes (sidereal degrees). Debilitation = +180. */
const EXALTATION_LONGITUDES: Record<string, number> = {
  Sun: 10, Moon: 33, Mars: 298, Mercury: 165, Jupiter: 95, Venus: 357, Saturn: 200,
}

/** Permanent (naisargika) friendship — mirrors shadbala.ts. */
const PERMANENT_FRIENDSHIP: Record<string, { friends: string[]; enemies: string[] }> = {
  Sun:     { friends: ['Moon', 'Mars', 'Jupiter'], enemies: ['Venus', 'Saturn'] },
  Moon:    { friends: ['Sun', 'Mercury'], enemies: [] },
  Mars:    { friends: ['Sun', 'Moon', 'Jupiter'], enemies: ['Mercury'] },
  Mercury: { friends: ['Sun', 'Venus'], enemies: ['Moon'] },
  Jupiter: { friends: ['Sun', 'Moon', 'Mars'], enemies: ['Mercury', 'Venus'] },
  Venus:   { friends: ['Mercury', 'Saturn'], enemies: ['Sun', 'Moon'] },
  Saturn:  { friends: ['Mercury', 'Venus'], enemies: ['Sun', 'Moon', 'Mars'] },
}

/**
 * Egyptian terms (Hadda / bounds). For each sign 1–12, an ordered list of
 * { upTo, lord } segments; the lord governs degrees up to (but not including)
 * `upTo`. Sun and Moon are never term rulers.
 */
const HADDA_TERMS: Record<number, { upTo: number; lord: string }[]> = {
  1:  [{ upTo: 6, lord: 'Jupiter' }, { upTo: 12, lord: 'Venus' }, { upTo: 20, lord: 'Mercury' }, { upTo: 25, lord: 'Mars' }, { upTo: 30, lord: 'Saturn' }],
  2:  [{ upTo: 8, lord: 'Venus' }, { upTo: 14, lord: 'Mercury' }, { upTo: 22, lord: 'Jupiter' }, { upTo: 27, lord: 'Saturn' }, { upTo: 30, lord: 'Mars' }],
  3:  [{ upTo: 6, lord: 'Mercury' }, { upTo: 12, lord: 'Jupiter' }, { upTo: 17, lord: 'Venus' }, { upTo: 24, lord: 'Mars' }, { upTo: 30, lord: 'Saturn' }],
  4:  [{ upTo: 7, lord: 'Mars' }, { upTo: 13, lord: 'Venus' }, { upTo: 19, lord: 'Mercury' }, { upTo: 26, lord: 'Jupiter' }, { upTo: 30, lord: 'Saturn' }],
  5:  [{ upTo: 6, lord: 'Jupiter' }, { upTo: 11, lord: 'Venus' }, { upTo: 18, lord: 'Saturn' }, { upTo: 24, lord: 'Mercury' }, { upTo: 30, lord: 'Mars' }],
  6:  [{ upTo: 7, lord: 'Mercury' }, { upTo: 17, lord: 'Venus' }, { upTo: 21, lord: 'Jupiter' }, { upTo: 28, lord: 'Mars' }, { upTo: 30, lord: 'Saturn' }],
  7:  [{ upTo: 6, lord: 'Saturn' }, { upTo: 14, lord: 'Mercury' }, { upTo: 21, lord: 'Jupiter' }, { upTo: 28, lord: 'Venus' }, { upTo: 30, lord: 'Mars' }],
  8:  [{ upTo: 7, lord: 'Mars' }, { upTo: 11, lord: 'Venus' }, { upTo: 19, lord: 'Mercury' }, { upTo: 24, lord: 'Jupiter' }, { upTo: 30, lord: 'Saturn' }],
  9:  [{ upTo: 12, lord: 'Jupiter' }, { upTo: 17, lord: 'Venus' }, { upTo: 21, lord: 'Mercury' }, { upTo: 26, lord: 'Saturn' }, { upTo: 30, lord: 'Mars' }],
  10: [{ upTo: 7, lord: 'Mercury' }, { upTo: 14, lord: 'Jupiter' }, { upTo: 22, lord: 'Venus' }, { upTo: 26, lord: 'Saturn' }, { upTo: 30, lord: 'Mars' }],
  11: [{ upTo: 7, lord: 'Mercury' }, { upTo: 13, lord: 'Venus' }, { upTo: 20, lord: 'Jupiter' }, { upTo: 25, lord: 'Mars' }, { upTo: 30, lord: 'Saturn' }],
  12: [{ upTo: 12, lord: 'Venus' }, { upTo: 16, lord: 'Jupiter' }, { upTo: 19, lord: 'Mercury' }, { upTo: 28, lord: 'Mars' }, { upTo: 30, lord: 'Saturn' }],
}

/**
 * Trirashi lords per Varsha Lagna sign, split day / night (Tajika Neelakanthi).
 * Built from the three triplicity rulers of each element: the first sign takes
 * the day/night pair, the second swaps it, the third takes the participating
 * ruler by day and night.
 */
const TRIRASHI_LORDS: Record<number, { day: string; night: string }> = {
  1:  { day: 'Sun', night: 'Jupiter' },     // Aries
  2:  { day: 'Venus', night: 'Moon' },      // Taurus
  3:  { day: 'Saturn', night: 'Mercury' },  // Gemini
  4:  { day: 'Venus', night: 'Mars' },      // Cancer
  5:  { day: 'Jupiter', night: 'Sun' },     // Leo
  6:  { day: 'Moon', night: 'Venus' },      // Virgo
  7:  { day: 'Mercury', night: 'Saturn' },  // Libra
  8:  { day: 'Mars', night: 'Venus' },      // Scorpio
  9:  { day: 'Saturn', night: 'Saturn' },   // Sagittarius (night: some sources give Jupiter)
  10: { day: 'Mars', night: 'Mars' },       // Capricorn
  11: { day: 'Jupiter', night: 'Jupiter' }, // Aquarius
  12: { day: 'Moon', night: 'Moon' },       // Pisces
}

/** Panchavargeeya per-component maxima (Vishwa) — Neelakanthi/Charak. */
const PV_MAX = { kshetra: 30, uccha: 20, hadda: 15, drekkana: 10, navamsa: 5 } as const

// ─── Small helpers ──────────────────────────────────────────────────

type DignityLevel = 'own' | 'friend' | 'neutral' | 'enemy'

/** Naisargika dignity of `planet` toward the lord of a sign/term/division. */
function dignityToLord(planet: string, lord: string): DignityLevel {
  if (lord === planet) return 'own'
  const rel = PERMANENT_FRIENDSHIP[planet]
  if (!rel) return 'neutral'
  if (rel.friends.includes(lord)) return 'friend'
  if (rel.enemies.includes(lord)) return 'enemy'
  return 'neutral'
}

/** Scale a dignity level to a component maximum (own=max, friend=½, neutral=¼, enemy=⅛). */
function dignityScore(level: DignityLevel, max: number): number {
  switch (level) {
    case 'own': return max
    case 'friend': return max / 2
    case 'neutral': return max / 4
    case 'enemy': return max / 8
  }
}

/** Hadda (term) lord for a longitude given its sign + degree-in-sign. */
function haddaLord(signNumber: number, degreeInSign: number): string {
  const segments = HADDA_TERMS[signNumber] ?? []
  for (const seg of segments) {
    if (degreeInSign < seg.upTo) return seg.lord
  }
  return segments.length ? segments[segments.length - 1].lord : 'Saturn'
}

/**
 * Whether the Sun is above the horizon: its longitude lies 180°–360° ahead of
 * the Ascendant, i.e. in the half of the ecliptic that has already risen. Uses
 * the Ascendant degree rather than whole-sign houses, which misclassify a Sun
 * that is in the Lagna sign but already risen, or in the 7th sign but not yet
 * set.
 */
export function isSunAboveHorizon(sunLongitude: number, ascendantLongitude: number): boolean {
  return normLon(sunLongitude - ascendantLongitude) >= 180
}

/** Trirashi lord for a Varsha Lagna sign (1–12) in a day or night year. */
export function getTrirashiLord(varshaLagnaSignNumber: number, dayVarsha: boolean): string {
  const lords = TRIRASHI_LORDS[varshaLagnaSignNumber]
  return dayVarsha ? lords.day : lords.night
}

// ─── Panchavargeeya Bala ────────────────────────────────────────────

/**
 * Kshetra Bala (Grihabala): naisargika dignity toward the lord of the D1 sign
 * occupied; own sign scores full. Moolatrikona plays no part. (Exaltation
 * strength is captured separately by Uccha Bala to avoid double-counting.)
 */
export function computeKshetraBala(planet: string, signNumber: number): number {
  const lord = SIGN_LORDS[signNumber]
  return dignityScore(dignityToLord(planet, lord), PV_MAX.kshetra)
}

/** Uccha Bala: proximity to exaltation, scaled 0–20 (0 at debilitation). */
function computeUcchaBala(planet: string, longitude: number): number {
  const exalt = EXALTATION_LONGITUDES[planet]
  if (exalt == null) return 0
  const debil = normLon(exalt + 180)
  return (arcDist(longitude, debil) / 180) * PV_MAX.uccha
}

/** Hadda Bala: dignity toward the Egyptian-term lord, scaled to 15. */
function computeHaddaBala(planet: string, signNumber: number, degreeInSign: number): number {
  const lord = haddaLord(signNumber, degreeInSign)
  return dignityScore(dignityToLord(planet, lord), PV_MAX.hadda)
}

/** Drekkana Bala: dignity toward the D3 sign lord, scaled to 10. */
function computeDrekkanaBala(planet: string, d3SignNumber: number): number {
  const lord = SIGN_LORDS[d3SignNumber]
  return dignityScore(dignityToLord(planet, lord), PV_MAX.drekkana)
}

/** Navamsa Bala: dignity toward the D9 sign lord, scaled to 5. */
function computeNavamsaBala(planet: string, d9SignNumber: number): number {
  const lord = SIGN_LORDS[d9SignNumber]
  return dignityScore(dignityToLord(planet, lord), PV_MAX.navamsa)
}

function gradePanchavargeeya(finalBala: number): PanchavargeeyaBalaEntry['grade'] {
  if (finalBala < 5) return 'Weak'
  if (finalBala < 10) return 'Ordinary'
  if (finalBala < 15) return 'Powerful'
  if (finalBala <= 20) return 'VeryStrong'
  return 'Extraordinary'
}

/**
 * Panchavargeeya Bala for all seven classical planets, read off the annual
 * chart's D1/D3/D9 placements.
 */
export function computePanchavargeeyaBala(chart: ComputedChart): PanchavargeeyaBalaEntry[] {
  const d3 = chart.divisionalCharts.find((c) => c.division === 3)
  const d9 = chart.divisionalCharts.find((c) => c.division === 9)

  const entries: PanchavargeeyaBalaEntry[] = []
  for (const planet of CLASSICAL_PLANETS) {
    const pos = chart.planets.find((p) => p.planet === planet)
    if (!pos) continue

    const d3Sign = d3?.planets.find((p) => p.planet === planet)?.signNumber ?? pos.signNumber
    const d9Sign = d9?.planets.find((p) => p.planet === planet)?.signNumber ?? pos.signNumber

    const kshetraBala = computeKshetraBala(planet, pos.signNumber)
    const ucchaBala = computeUcchaBala(planet, pos.longitude)
    const haddaBala = computeHaddaBala(planet, pos.signNumber, pos.degreeInSign)
    const drekkanaBala = computeDrekkanaBala(planet, d3Sign)
    const navamsaBala = computeNavamsaBala(planet, d9Sign)

    const total = kshetraBala + ucchaBala + haddaBala + drekkanaBala + navamsaBala
    const finalBala = total / 4

    entries.push({
      planet,
      kshetraBala: round2(kshetraBala),
      ucchaBala: round2(ucchaBala),
      haddaBala: round2(haddaBala),
      drekkanaBala: round2(drekkanaBala),
      navamsaBala: round2(navamsaBala),
      total: round2(total),
      finalBala: round2(finalBala),
      grade: gradePanchavargeeya(finalBala),
    })
  }
  return entries
}

function round2(x: number): number {
  return Math.round(x * 100) / 100
}

// ─── Muntha ─────────────────────────────────────────────────────────

/**
 * Muntha: the progressed ascendant. It sits on the natal ascendant sign at
 * birth and advances one sign per completed year. Its house is counted from
 * the Varsha Lagna of the annual chart.
 */
export function computeMuntha(
  natalLagnaSignNumber: number,
  age: number,
  varshaLagnaSignNumber: number
): Muntha {
  const signNumber = ((natalLagnaSignNumber - 1 + age) % 12) + 1
  const house = ((signNumber - varshaLagnaSignNumber + 12) % 12) + 1
  return { signNumber, sign: getSignName(signNumber), house, lord: SIGN_LORDS[signNumber] }
}

// ─── Varshesha (year lord) ──────────────────────────────────────────

const OFFICE_LABELS: Record<VarsheshaCandidate['office'], string> = {
  muntha_lord: 'Lord of Muntha',
  varsha_lagna_lord: 'Lord of Varsha Lagna',
  janma_lagna_lord: 'Lord of Janma (natal) Lagna',
  dinaratri_lord: 'Dinaratri lord (day/night luminary sign lord)',
  trirashi_lord: 'Trirashi (triplicity) lord',
}

/**
 * Aspect natures that count as "aspecting the Varsha Lagna" when selecting the
 * Varshesha. Both by default; drop 'inimical' to make the rule friendly-only.
 * The method note is built from this list, so nothing else in code changes.
 */
export const VARSHESHA_LAGNA_ASPECT_NATURES: readonly TajikaAspectNature[] = Object.freeze([
  'friendly',
  'inimical',
] as TajikaAspectNature[])

/** Counted Lagna-aspect kinds in sign-distance order, e.g. "sextile, square, trine, opposition". */
function countedLagnaAspectKinds(): string {
  const kinds: string[] = []
  for (const aspect of Object.values(TAJIKA_ASPECT_BY_DISTANCE)) {
    if (VARSHESHA_LAGNA_ASPECT_NATURES.includes(aspect.nature) && !kinds.includes(aspect.kind)) {
      kinds.push(aspect.kind)
    }
  }
  return kinds.join(', ')
}

/**
 * Builds the five office-bearer candidates and selects the Varshesha by the
 * Tajika Neelakanthi rule: among the candidates that aspect the Varsha Lagna,
 * the one with the highest Panchavargeeya Bala wins. Ties go to the planet
 * holding more of the five offices, then to office priority order.
 *
 * If no candidate aspects the Lagna, the same ranking runs over all five and
 * `selectionBasis` says so. Each candidate carries its raw Lagna aspect plus
 * `aspectsLagna`, whether that aspect counts. The aspect is sign-based
 * (Phase 1); a candidate in the Varsha Lagna itself aspects it by conjunction.
 */
export function computeVarshesha(
  muntha: Muntha,
  varshaLagnaSignNumber: number,
  natalLagnaSignNumber: number,
  dinaratriLord: string,
  trirashiLord: string,
  panchavargeeya: PanchavargeeyaBalaEntry[],
  annualPlanets: PlanetPosition[]
): { candidates: VarsheshaCandidate[]; varshesha: VarshaphalResult['varshesha'] } {
  const balaOf = (planet: string): number =>
    panchavargeeya.find((p) => p.planet === planet)?.finalBala ?? 0

  const lagnaAspectOf = (planet: string): VarsheshaCandidate['lagnaAspect'] => {
    const signNumber = annualPlanets.find((p) => p.planet === planet)?.signNumber
    return signNumber === undefined ? null : getTajikaSignAspect(signNumber, varshaLagnaSignNumber)
  }

  const raw: { office: VarsheshaCandidate['office']; planet: string }[] = [
    { office: 'muntha_lord', planet: muntha.lord },
    { office: 'varsha_lagna_lord', planet: SIGN_LORDS[varshaLagnaSignNumber] },
    { office: 'janma_lagna_lord', planet: SIGN_LORDS[natalLagnaSignNumber] },
    { office: 'dinaratri_lord', planet: dinaratriLord },
    { office: 'trirashi_lord', planet: trirashiLord },
  ]

  // Lordship count: how many of the five offices each planet holds.
  const officeCount: Record<string, number> = {}
  for (const c of raw) officeCount[c.planet] = (officeCount[c.planet] ?? 0) + 1

  const candidates: VarsheshaCandidate[] = raw.map((c) => {
    const lagnaAspect = lagnaAspectOf(c.planet)
    return {
      office: c.office,
      planet: c.planet,
      officeLabel: OFFICE_LABELS[c.office],
      panchavargeeyaBala: balaOf(c.planet),
      officeCount: officeCount[c.planet],
      lagnaAspect,
      aspectsLagna: lagnaAspect !== null && VARSHESHA_LAGNA_ASPECT_NATURES.includes(lagnaAspect.nature),
    }
  })

  const aspecting = candidates.filter((c) => c.aspectsLagna)
  const selectionBasis = aspecting.length > 0 ? 'aspects_lagna' : 'no_candidate_aspects_lagna'
  const pool = aspecting.length > 0 ? aspecting : candidates

  // Strongest wins; tie → more offices; then office priority order (Muntha lord
  // first), which the stable sort preserves.
  const winner = [...pool].sort((a, b) => {
    const byBala = b.panchavargeeyaBala - a.panchavargeeyaBala
    if (byBala !== 0) return byBala
    return b.officeCount - a.officeCount
  })[0]

  return {
    candidates,
    varshesha: {
      planet: winner.planet,
      office: winner.office,
      officeLabel: winner.officeLabel,
      panchavargeeyaBala: winner.panchavargeeyaBala,
      lagnaAspect: winner.lagnaAspect,
      selectionBasis,
    },
  }
}

// ─── Main entry point ───────────────────────────────────────────────

export interface VarshaphalInput extends BirthInput {
  /** Civil year for which to cast the annual chart (e.g. 2026). */
  varshaYear: number
}

/**
 * Computes the complete Varshaphal for a birth and a requested civil year.
 */
export function computeVarshaphal(input: VarshaphalInput): VarshaphalResult {
  const { varshaYear, ...birth } = input

  // ── Natal reference points (cheap — no full natal chart needed) ──
  const natalJulianDay = birthInputToJulianDay(birth)
  const natalSunLongitude = siderealSunLongitude(natalJulianDay)
  const natalAscendant = computeAscendant(natalJulianDay, birth.latitude, birth.longitude)
  const natalLagnaSignNumber = natalAscendant.signNumber
  const natalMoon = computePlanetPositions(natalJulianDay, natalLagnaSignNumber).find(
    (p) => p.planet === 'Moon'
  )

  const [birthYear] = birth.date.split('-').map(Number)
  const age = varshaYear - birthYear

  // ── Varsha Pravesh: solar return for the requested year ──
  // Seed at the natal instant advanced by `age` sidereal years, then refine.
  const seedJulianDay = natalJulianDay + age * 365.25636
  const returnJulianDay = findSolarReturnJulianDay(natalSunLongitude, seedJulianDay)
  const civil = julianDayToLocalCivil(returnJulianDay, birth.timezone)
  const utcISO = julianDayToUtcISO(returnJulianDay)

  // ── Annual chart cast for the return instant at the birthplace ──
  const annualInput: BirthInput = {
    ...birth,
    date: civil.date,
    time: civil.time,
  }
  // Gochar & Sade Sati come from the natal Moon and Lagna, as of the Varsha
  // Pravesh: Sade Sati is always reckoned from the natal Moon. The default
  // reference (the annual Moon, as of today) would change with the year asked
  // for and with the day it was computed.
  const annualChart = computeFullChart(annualInput, {
    transitReference: {
      moonSignNumber: natalMoon?.signNumber ?? 1,
      moonLongitude: natalMoon?.longitude,
      lagnaSignNumber: natalLagnaSignNumber,
      birthYear,
      asOf: new Date(utcISO),
    },
  })
  const varshaLagnaSignNumber = annualChart.lagnaSignNumber

  // ── Muntha ──
  const muntha = computeMuntha(natalLagnaSignNumber, age, varshaLagnaSignNumber)

  // ── Panchavargeeya Bala (Tajika strength) ──
  const panchavargeeyaBala = computePanchavargeeyaBala(annualChart)

  // ── Day/night of the YEAR'S commencement (Varsha Pravesh) ──
  // Tajika rule: the Dinaratri & Trirashi lords depend on whether the year
  // commences by day or night — the annual Sun above vs below the horizon,
  // judged against the Ascendant degree — not on the natal birth's day/night.
  const annualSun = annualChart.planets.find((p) => p.planet === 'Sun')
  const dayVarsha =
    annualSun !== undefined && isSunAboveHorizon(annualSun.longitude, annualChart.lagnaLongitude)

  // ── Year-lord candidates ──
  const dinaratriLuminary = dayVarsha ? 'Sun' : 'Moon'
  const dinaratriPos = annualChart.planets.find((p) => p.planet === dinaratriLuminary)
  const dinaratriLord = SIGN_LORDS[dinaratriPos?.signNumber ?? varshaLagnaSignNumber]

  const trirashiLord = getTrirashiLord(varshaLagnaSignNumber, dayVarsha)

  const { candidates, varshesha } = computeVarshesha(
    muntha,
    varshaLagnaSignNumber,
    natalLagnaSignNumber,
    dinaratriLord,
    trirashiLord,
    panchavargeeyaBala,
    annualChart.planets
  )

  // ── Dashas for the year: this Varsha Pravesh to the next ──
  const nextReturnJulianDay = findSolarReturnJulianDay(natalSunLongitude, returnJulianDay + 365.25636)
  const yearStart = new Date(utcISO)
  const yearEnd = new Date(julianDayToUtcISO(nextReturnJulianDay))
  // The UTC birth instant built as POST /api/compute builds it (fractional
  // seconds included), so the natal tree here matches the chart's Dasha tab.
  const birthInstant = birthInputToUtcDate(birth)
  const natalMoonLongitude = natalMoon?.longitude ?? Number.NaN
  const dashas: VarshaphalResult['dashas'] = {
    natalVimshottari: natalMoon
      ? sliceNatalVimshottari(computeVimshottari(natalMoonLongitude, birthInstant), yearStart, yearEnd)
      : { atVarshaPravesh: null, antardashas: [], pratyantardashas: [] },
    mudda: computeMuddaDasha(natalMoonLongitude, age, yearStart, yearEnd),
  }

  return {
    varshaYear,
    age,
    natalSunLongitude,
    natalLagnaSignNumber,
    varshaPravesh: {
      julianDay: returnJulianDay,
      date: civil.date,
      time: civil.time,
      utcISO,
      weekday: WEEKDAY_NAMES[civil.weekday],
      weekdayLord: WEEKDAY_LORDS[civil.weekday],
    },
    annualChart,
    muntha,
    dayVarsha,
    panchavargeeyaBala,
    candidates,
    varshesha,
    dashas,
    method:
      'Solar return (sidereal Lahiri). Muntha +1 sign/year from natal lagna. ' +
      'Panchavargeeya Bala per Neelakanthi maxima (Kshetra 30 / Uccha 20 / Hadda 15 / ' +
      'Drekkana 10 / Navamsa 5, ÷4); Kshetra by sign lord, no moolatrikona. ' +
      'Dinaratri & Trirashi lords use the year\'s commencement (Varsha Pravesh) ' +
      'day/night, from the Sun against the Ascendant degree; Trirashi per the ' +
      'Neelakanthi sign table. Varshesha = strongest office-bearer (Panchavargeeya ' +
      'Bala) that aspects the Varsha Lagna, ties broken by number of offices; ' +
      'strongest of all five if none aspects it. Lagna aspect by sign, counted: ' +
      `${countedLagnaAspectKinds()}; deeptamsha orbs pending. Annual-chart transits ` +
      'and Sade Sati use the natal Moon and Lagna, as of the Varsha Pravesh. Dashas: ' +
      'natal Vimshottari MD/AD/PD overlapping the year (true dates); Mudda dasha = ' +
      'Vimshottari compressed into this Varsha Pravesh → the next, starting lord from ' +
      'Janma nakshatra + completed years, first period = natal balance with the rest ' +
      'closing the year (balance and year length unverified vs JHora).',
    computedAt: new Date().toISOString(),
  }
}

/** Julian Day (UT) → ISO-8601 UTC string. */
function julianDayToUtcISO(julianDay: number): string {
  // JD 2440587.5 = 1970-01-01T00:00:00Z.
  const unixMillis = (julianDay - 2440587.5) * 86400 * 1000
  return new Date(unixMillis).toISOString()
}
