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
 *      divisional charts, and (Parashari) Shadbala all come for free.
 *   3. Computes the Muntha (progressed ascendant, +1 sign/year).
 *   4. Computes Panchavargeeya Bala (Tajika 5-fold strength) for the seven
 *      classical planets.
 *   5. Identifies the five Varshesha (year-lord) office-bearers and picks the
 *      one holding the most offices (Panchavargeeya Bala breaks ties).
 *
 * METHOD NOTES / CAVEATS (documented, consistent with shadbala.ts's culture):
 *   - Panchavargeeya Bala uses the Neelakanthi/Charak component maxima
 *     (Kshetra 30, Uccha 20, Hadda 15, Drekkana 10, Navamsa 5 → sum ÷ 4 = 0–20).
 *     Sub-division dignity uses PERMANENT (naisargika) friendship only. Exact
 *     Vishwa scales vary between texts/software; treat values as indicative.
 *   - Hadda uses the Egyptian terms (bounds) table, as is standard for Tajika.
 *   - Day/night (for Dinaratri & Trirashi lords) is taken from the NATAL chart
 *     (Sun above vs below the horizon).
 *   - Trirashi (triplicity) lord uses the Dorothean day/night rulers applied to
 *     the Varsha Lagna's element.
 *   - Varshesha is selected by lordship count among the five office-bearers,
 *     with Panchavargeeya Bala as the tiebreak. The favourable-Lagna-aspect
 *     override (needs Tajika aspects/Ithasala) is DEFERRED.
 */

import type {
  BirthInput,
  ComputedChart,
  Muntha,
  PanchavargeeyaBalaEntry,
  VarsheshaCandidate,
  VarshaphalResult,
} from './types'
import {
  birthInputToJulianDay,
  computeAscendant,
  siderealSunLongitude,
  findSolarReturnJulianDay,
  julianDayToLocalCivil,
  getSignName,
} from './planets'
import { computeFullChart } from './index'
import { SIGN_LORDS, arcDist, normLon } from './relationships'

// ─── Constants ──────────────────────────────────────────────────────

const CLASSICAL_PLANETS = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn']

const WEEKDAY_LORDS = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn']
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** Exact exaltation longitudes (sidereal degrees). Debilitation = +180. */
const EXALTATION_LONGITUDES: Record<string, number> = {
  Sun: 10, Moon: 33, Mars: 298, Mercury: 165, Jupiter: 95, Venus: 357, Saturn: 200,
}

/** Moolatrikona sign per planet (treated as an "own" placement for Kshetra). */
const MOOLATRIKONA_SIGNS: Record<string, number> = {
  Sun: 5, Moon: 2, Mars: 1, Mercury: 6, Jupiter: 9, Venus: 7, Saturn: 11,
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
 * Dorothean triplicity (Trirashi) rulers by element, split day / night.
 * Elements keyed by sign number modality of fire/earth/air/water.
 */
const TRIPLICITY_RULERS: Record<'fire' | 'earth' | 'air' | 'water', { day: string; night: string }> = {
  fire:  { day: 'Sun', night: 'Jupiter' },   // Aries, Leo, Sagittarius
  earth: { day: 'Venus', night: 'Moon' },    // Taurus, Virgo, Capricorn
  air:   { day: 'Saturn', night: 'Mercury' },// Gemini, Libra, Aquarius
  water: { day: 'Venus', night: 'Mars' },    // Cancer, Scorpio, Pisces
}

/** Panchavargeeya per-component maxima (Vishwa) — Neelakanthi/Charak. */
const PV_MAX = { kshetra: 30, uccha: 20, hadda: 15, drekkana: 10, navamsa: 5 } as const

// ─── Small helpers ──────────────────────────────────────────────────

function elementOfSign(signNumber: number): 'fire' | 'earth' | 'air' | 'water' {
  // 1=Aries fire, 2=Taurus earth, 3=Gemini air, 4=Cancer water, then repeat.
  const idx = (signNumber - 1) % 4
  return (['fire', 'earth', 'air', 'water'] as const)[idx]
}

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

// ─── Panchavargeeya Bala ────────────────────────────────────────────

/**
 * Kshetra Bala (Grihabala): dignity in the D1 sign occupied. Moolatrikona and
 * own sign score full; otherwise naisargika dignity toward the sign lord.
 * (Exaltation strength is captured separately by Uccha Bala to avoid
 * double-counting.)
 */
function computeKshetraBala(planet: string, signNumber: number): number {
  if (MOOLATRIKONA_SIGNS[planet] === signNumber) return PV_MAX.kshetra
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
 * Builds the five office-bearer candidates and selects the Varshesha by the
 * classical lordship-count rule: the planet holding the MOST offices among the
 * five wins; ties are broken by Panchavargeeya Bala (then office priority order).
 *
 * DEFERRED: the classical favourable-Lagna-aspect override (which can promote a
 * candidate regardless of office count) needs Tajika aspects — see
 * docs/computation_varshaphal.md §6 Tier D.
 */
export function computeVarshesha(
  muntha: Muntha,
  varshaLagnaSignNumber: number,
  natalLagnaSignNumber: number,
  dinaratriLord: string,
  trirashiLord: string,
  panchavargeeya: PanchavargeeyaBalaEntry[]
): { candidates: VarsheshaCandidate[]; varshesha: VarshaphalResult['varshesha'] } {
  const balaOf = (planet: string): number =>
    panchavargeeya.find((p) => p.planet === planet)?.finalBala ?? 0

  const raw: { office: VarsheshaCandidate['office']; planet: string }[] = [
    { office: 'muntha_lord', planet: muntha.lord },
    { office: 'varsha_lagna_lord', planet: SIGN_LORDS[varshaLagnaSignNumber] },
    { office: 'janma_lagna_lord', planet: SIGN_LORDS[natalLagnaSignNumber] },
    { office: 'dinaratri_lord', planet: dinaratriLord },
    { office: 'trirashi_lord', planet: trirashiLord },
  ]

  const candidates: VarsheshaCandidate[] = raw.map((c) => ({
    office: c.office,
    planet: c.planet,
    officeLabel: OFFICE_LABELS[c.office],
    panchavargeeyaBala: balaOf(c.planet),
  }))

  // Lordship count: how many of the five offices each planet holds.
  const officeCount: Record<string, number> = {}
  for (const c of candidates) officeCount[c.planet] = (officeCount[c.planet] ?? 0) + 1

  // Most offices wins; tie → higher Panchavargeeya Bala; then office priority
  // order (Muntha lord first), which the stable sort preserves.
  const winner = [...candidates].sort((a, b) => {
    const byOffices = (officeCount[b.planet] ?? 0) - (officeCount[a.planet] ?? 0)
    if (byOffices !== 0) return byOffices
    return b.panchavargeeyaBala - a.panchavargeeyaBala
  })[0]

  return {
    candidates,
    varshesha: {
      planet: winner.planet,
      office: winner.office,
      officeLabel: winner.officeLabel,
      panchavargeeyaBala: winner.panchavargeeyaBala,
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

  const [birthYear] = birth.date.split('-').map(Number)
  const age = varshaYear - birthYear

  // Day/night from the natal chart: Sun above horizon (houses 7–12) ⇒ day.
  const natalSunSign = Math.floor(natalSunLongitude / 30) + 1
  const natalSunHouse = ((natalSunSign - natalLagnaSignNumber + 12) % 12) + 1
  const dayBirth = natalSunHouse >= 7

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
  const annualChart = computeFullChart(annualInput)
  const varshaLagnaSignNumber = annualChart.lagnaSignNumber

  // ── Muntha ──
  const muntha = computeMuntha(natalLagnaSignNumber, age, varshaLagnaSignNumber)

  // ── Panchavargeeya Bala (Tajika strength) ──
  const panchavargeeyaBala = computePanchavargeeyaBala(annualChart)

  // ── Year-lord candidates ──
  const dinaratriLuminary = dayBirth ? 'Sun' : 'Moon'
  const dinaratriPos = annualChart.planets.find((p) => p.planet === dinaratriLuminary)
  const dinaratriLord = SIGN_LORDS[dinaratriPos?.signNumber ?? varshaLagnaSignNumber]

  const trirashiRuler = TRIPLICITY_RULERS[elementOfSign(varshaLagnaSignNumber)]
  const trirashiLord = dayBirth ? trirashiRuler.day : trirashiRuler.night

  const { candidates, varshesha } = computeVarshesha(
    muntha,
    varshaLagnaSignNumber,
    natalLagnaSignNumber,
    dinaratriLord,
    trirashiLord,
    panchavargeeyaBala
  )

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
    dayBirth,
    panchavargeeyaBala,
    candidates,
    varshesha,
    method:
      'Solar return (sidereal Lahiri). Muntha +1 sign/year from natal lagna. ' +
      'Panchavargeeya Bala per Neelakanthi maxima (Kshetra 30 / Uccha 20 / Hadda 15 / ' +
      'Drekkana 10 / Navamsa 5, ÷4). Varshesha = office-bearer holding the most of ' +
      'the five offices, ties broken by Panchavargeeya Bala. Favourable-Lagna-aspect ' +
      'override deferred (needs Tajika aspects).',
    computedAt: new Date().toISOString(),
  }
}

/** Julian Day (UT) → ISO-8601 UTC string. */
function julianDayToUtcISO(julianDay: number): string {
  // JD 2440587.5 = 1970-01-01T00:00:00Z.
  const unixMillis = (julianDay - 2440587.5) * 86400 * 1000
  return new Date(unixMillis).toISOString()
}
