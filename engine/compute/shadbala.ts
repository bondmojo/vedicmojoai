/**
 * engine/compute/shadbala.ts — Deterministic full Shadbala (replaces LLM agent 1C).
 *
 * Implements the six-fold classical planetary strength system (BPHS Ch. 27–28)
 * for the seven classical grahas, with partial bala for Rahu/Ketu. All values
 * are expressed in VIRUPAS (1 Rupa = 60 Virupas; a virupa IS a shashtiamsa).
 *
 * Authoritative spec: .kiro/specs/deterministic-1c-1d/requirements.md
 *   — the "REQUIREMENTS CORRECTIONS ADDENDUM (Senior Astrologer Review)"
 *     (REQ-0, FIX-1 … FIX-13) OVERRIDES the older REQ-1 tables and is the
 *     source of truth for every constant/formula below.
 *
 * Documented classical approximations (flagged inline):
 *   - FIX-6  Natonnata is proportional (not the binary 60/30/0 of old REQ-1.3a).
 *   - FIX-7  Cheshta uses |speed|/mean-motion as a proxy for the classical
 *            Cheshta-Kendra/3 epicyclic value (JHora divergence).
 *   - JHORA-ALIGN (docs/computation_varshaphal.md §4–5): Ayana Bala is now a
 *            Kaala Bala term for all seven planets (Sun doubled); both luminaries'
 *            Cheshta Bala = 0; Sun's required Shadbala = 5.0 rupas (300 virupas).
 *   - Paksha  elongation is folded to 0–180 so benefic/malefic balas stay 0–60.
 *   - Abda   year-lord uses an approximate fixed Mesha (Aries) ingress date
 *            (~Apr 14) — see {@link getAriesIngressWeekday}.
 *   - Masa   month-lord uses the Sun's sign as a lunar-month proxy.
 *
 * All angular inputs are sidereal (Lahiri) longitudes in degrees.
 */

import {
  arcDist,
  normLon,
  SIGN_LORDS,
  gradedAspectStrengthBetweenHouses,
  isNaturalBenefic,
  computeCombustion,
} from './relationships'
import type {
  ShadbalComponent,
  ShadbalPlanet,
  ShadbalResult,
  PlanetPosition,
  DivisionalChart,
  CombustionResult,
} from './types'

// ─── Constants (CORRECTED addendum values) ──────────────────────────

/** The seven classical grahas that receive full Shadbala. */
const CLASSICAL_PLANETS = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn']
/** Full planet order (nodes get partial bala). */
const ALL_PLANETS = [...CLASSICAL_PLANETS, 'Rahu', 'Ketu']

/** Exact exaltation longitudes (sidereal degrees). Debilitation = +180. */
const EXALTATION_LONGITUDES: Record<string, number> = {
  Sun: 10, Moon: 33, Mars: 298, Mercury: 165, Jupiter: 95, Venus: 357, Saturn: 200,
}

/** Exaltation sign number (1–12) per planet (= floor(exaltLon/30)+1). */
const EXALTATION_SIGNS: Record<string, number> = {
  Sun: 1, Moon: 2, Mars: 10, Mercury: 6, Jupiter: 4, Venus: 12, Saturn: 7,
}

/** Debilitation sign number (opposite the exaltation sign). */
const DEBILITATION_SIGNS: Record<string, number> = {
  Sun: 7, Moon: 8, Mars: 4, Mercury: 12, Jupiter: 10, Venus: 6, Saturn: 1,
}

/** Moolatrikona sign per planet (highest dignity that isn't captured by Uccha). */
const MOOLATRIKONA_SIGNS: Record<string, number> = {
  Sun: 5, Moon: 2, Mars: 1, Mercury: 6, Jupiter: 9, Venus: 7, Saturn: 11,
}

/** Own signs per planet. */
const OWN_SIGNS: Record<string, number[]> = {
  Sun: [5], Moon: [4], Mars: [1, 8], Mercury: [3, 6], Jupiter: [9, 12], Venus: [2, 7], Saturn: [10, 11],
}

/**
 * Permanent (naisargika maitri) friendship. `neutral` is implied by absence
 * from both lists. 7×7 from the addendum.
 */
const PERMANENT_FRIENDSHIP: Record<string, { friends: string[]; enemies: string[] }> = {
  Sun:     { friends: ['Moon', 'Mars', 'Jupiter'], enemies: ['Venus', 'Saturn'] },
  Moon:    { friends: ['Sun', 'Mercury'], enemies: [] },
  Mars:    { friends: ['Sun', 'Moon', 'Jupiter'], enemies: ['Mercury'] },
  Mercury: { friends: ['Sun', 'Venus'], enemies: ['Moon'] },
  Jupiter: { friends: ['Sun', 'Moon', 'Mars'], enemies: ['Mercury', 'Venus'] },
  Venus:   { friends: ['Mercury', 'Saturn'], enemies: ['Sun', 'Moon'] },
  Saturn:  { friends: ['Mercury', 'Venus'], enemies: ['Sun', 'Moon', 'Mars'] },
}

/** FIX-1 dignity scores (virupas). NO "Exalted" row — captured by Uccha Bala. */
const DIGNITY_MOOLATRIKONA = 45
const DIGNITY_OWN = 30
const DIGNITY_ADHIMITRA = 22.5 // great friend
const DIGNITY_MITRA = 15       // friend
const DIGNITY_SAMA = 7.5       // neutral
const DIGNITY_SHATRU = 3.75    // enemy
const DIGNITY_ADHISHATRU = 1.875 // great enemy

/** Dig Bala house of maximum strength per planet (Rahu/Ketu: none). */
const DIG_BALA_HOUSE: Record<string, number> = {
  Sun: 10, Moon: 4, Mars: 10, Mercury: 1, Jupiter: 1, Venus: 4, Saturn: 7,
}
/** Longitude offset (from lagna) of each dig-bala house cusp. */
const DIG_HOUSE_OFFSET: Record<number, number> = { 1: 0, 4: 90, 7: 180, 10: 270 }

/** FIX-2 Naisargika Bala (virupas = 60 × n/7). Rahu/Ketu = 0. */
const NAISARGIKA_BALA: Record<string, number> = {
  Sun: 60.0, Moon: 51.43, Venus: 42.86, Jupiter: 34.29, Mercury: 25.71, Mars: 17.14, Saturn: 8.57,
}

/**
 * Required Shadbala in RUPAS. JHora-aligned: the Sun uses 5.0 (300 virupas),
 * not the 6.5 of the older FIX-5 table — confirmed by two independent JHora
 * screens (natal + Varshaphal). See docs/computation_varshaphal.md §4.2.
 */
const REQUIRED_RUPAS: Record<string, number> = {
  Sun: 5.0, Moon: 6, Mars: 5, Mercury: 7, Jupiter: 6.5, Venus: 5.5, Saturn: 5,
}

/** Ayana Bala direction preference (declination that strengthens the planet). */
const AYANA_NORTH_PREFERRING = ['Sun', 'Mars', 'Jupiter', 'Venus']
const AYANA_SOUTH_PREFERRING = ['Moon', 'Saturn']
// Mercury always gains from |declination| (handled explicitly).

/** Mean daily motion (degrees/day) — Cheshta proxy denominator. */
const MEAN_DAILY_MOTION: Record<string, number> = {
  Sun: 0.9856, Moon: 13.1764, Mars: 0.524, Mercury: 1.3833, Jupiter: 0.0831, Venus: 1.2, Saturn: 0.0339,
}

/** Weekday lords indexed by Date.getDay() (0 = Sunday). */
const WEEKDAY_LORDS = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn']

/** Hora sequence beginning at the day-lord's slot, stepping each hora. */
const HORA_SEQUENCE = ['Sun', 'Venus', 'Mercury', 'Moon', 'Saturn', 'Jupiter', 'Mars']

/** Lunar-month lords (Chaitra … Phalguna), indexed 0–11. */
const LUNAR_MONTH_LORDS = [
  'Mars', 'Venus', 'Mercury', 'Moon', 'Sun', 'Mercury',
  'Venus', 'Mars', 'Jupiter', 'Saturn', 'Jupiter', 'Saturn',
]

/** The seven Parashari vargas used by Saptavargaja Bala. */
const SAPTAVARGA_DIVISIONS = [1, 2, 3, 7, 9, 12, 30]

/** FIX-8 Vimsopaka (true Shadvarga) weights, total = 20. */
const VIMSOPAKA_WEIGHTS: Record<number, number> = { 1: 6, 2: 2, 3: 4, 9: 5, 12: 2, 30: 1 }

/** Parity preference for Ojha-Yugma (FIX-3). true = prefers EVEN (yugma). */
const PREFERS_EVEN: Record<string, boolean> = {
  Moon: true, Venus: true,
  Sun: false, Mars: false, Mercury: false, Jupiter: false, Saturn: false,
}

/** Drekkana gender bands (FIX-4). Saturn is NEUTER. */
const DREKKANA_MALE = ['Sun', 'Mars', 'Jupiter']    // 1st decan
const DREKKANA_NEUTER = ['Mercury', 'Saturn']       // 2nd decan
const DREKKANA_FEMALE = ['Moon', 'Venus']           // 3rd decan

const SECONDS_PER_DAY = 86400
const NOON_SECONDS = 43200

// ─── Small helpers ──────────────────────────────────────────────────

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x))
}

/** Degrees → radians. */
function degToRad(deg: number): number {
  return (deg * Math.PI) / 180
}

/** Radians → degrees. */
function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI
}

/** Mean obliquity of the ecliptic (degrees). */
const OBLIQUITY_EPS = 23.4392811

/**
 * Ayana Bala (Kaala Bala sub-component) for any classical planet.
 *
 * The declination δ is derived from the tropical longitude
 * (tropical = sidereal + ayanamsa), ignoring ecliptic latitude (DOCUMENTED
 * APPROXIMATION — exact for the Sun, slightly off for planets with latitude):
 *   δ = asin( sin(EPS) · sin(tropicalLon) )
 *
 * Direction preference (effective kranti):
 *   - North-preferring (Sun, Mars, Jupiter, Venus): +δ
 *   - South-preferring (Moon, Saturn):              −δ
 *   - Mercury:                                      +|δ| (always gains)
 * Score:  AyanaBala = ((EPS + effectiveKranti) / (2·EPS)) · 60  → 0..60.
 *
 * The Sun's Ayana Bala is DOUBLED (classical rule) → 0..120. Rahu/Ketu → 0.
 */
export function computeAyanaBala(planet: string, siderealLon: number, ayanamsa: number): number {
  if (planet === 'Rahu' || planet === 'Ketu') return 0
  const tropicalLon = normLon(siderealLon + ayanamsa)
  const declination = radToDeg(
    Math.asin(Math.sin(degToRad(OBLIQUITY_EPS)) * Math.sin(degToRad(tropicalLon)))
  )

  let effectiveKranti: number
  if (planet === 'Mercury') effectiveKranti = Math.abs(declination)
  else if (AYANA_SOUTH_PREFERRING.includes(planet)) effectiveKranti = -declination
  else if (AYANA_NORTH_PREFERRING.includes(planet)) effectiveKranti = declination
  else return 0

  let bala = ((OBLIQUITY_EPS + effectiveKranti) / (2 * OBLIQUITY_EPS)) * 60
  bala = clamp(bala, 0, 60)
  if (planet === 'Sun') bala *= 2 // classical doubling → 0..120
  return bala
}

/** Planet's sign number (1–12) in a given divisional chart. */
function getVargaSignNumber(
  planet: string,
  division: number,
  divisionalCharts: DivisionalChart[]
): number | null {
  const chart = divisionalCharts.find((c) => c.division === division)
  if (!chart) return null
  const placement = chart.planets.find((p) => p.planet === planet)
  return placement ? placement.signNumber : null
}

// ─── Dignity (shared by Saptavarga + Vimsopaka) ─────────────────────

type PermRelation = 'friend' | 'enemy' | 'neutral'

function permanentRelation(planet: string, other: string): PermRelation {
  const rel = PERMANENT_FRIENDSHIP[planet]
  if (!rel) return 'neutral'
  if (rel.friends.includes(other)) return 'friend'
  if (rel.enemies.includes(other)) return 'enemy'
  return 'neutral'
}

/**
 * Tatkalika (temporary) maitri from the rasi (D1) chart: `other` is a temporary
 * FRIEND of `planet` when it sits in the 2,3,4,10,11,12 houses counted from
 * `planet`; otherwise a temporary enemy.
 */
function temporaryRelation(planetSign: number, otherSign: number): 'friend' | 'enemy' {
  const count = ((otherSign - planetSign + 12) % 12) + 1 // 1..12
  return [2, 3, 4, 10, 11, 12].includes(count) ? 'friend' : 'enemy'
}

/**
 * FIX-B Panchadha (five-fold) maitri compound table for Saptavargaja Bala:
 *   perm Friend  + temp Friend → Adhimitra  22.5
 *   perm Friend  + temp Enemy  → Sama        7.5
 *   perm Neutral + temp Friend → Mitra      15
 *   perm Neutral + temp Enemy  → Shatru      3.75
 *   perm Enemy   + temp Friend → Sama        7.5
 *   perm Enemy   + temp Enemy  → Adhishatru  1.875
 * (Own sign / Moolatrikona overrides happen in the caller; no exalted row.)
 */
function combineRelationshipScore(perm: PermRelation, temp: 'friend' | 'enemy'): number {
  if (perm === 'friend') return temp === 'friend' ? DIGNITY_ADHIMITRA : DIGNITY_SAMA
  if (perm === 'neutral') return temp === 'friend' ? DIGNITY_MITRA : DIGNITY_SHATRU
  // perm === 'enemy'
  return temp === 'friend' ? DIGNITY_SAMA : DIGNITY_ADHISHATRU
}

/**
 * FIX-1 dignity score (0–45 virupas) of `planet` sitting in `vargaSignNumber`.
 * Own-sign overrides to 30; Moolatrikona overrides to 45; exaltation has NO
 * special row (its lord's friendship is scored instead). Combined relationship
 * uses permanent + tatkalika maitri drawn from the D1 positions in `allPlanets`.
 */
function dignityScoreForVarga(
  planet: string,
  vargaSignNumber: number,
  allPlanets: PlanetPosition[]
): number {
  if (!PERMANENT_FRIENDSHIP[planet]) return 0 // Rahu/Ketu: no friendship dignity

  if (MOOLATRIKONA_SIGNS[planet] === vargaSignNumber) return DIGNITY_MOOLATRIKONA
  if (OWN_SIGNS[planet]?.includes(vargaSignNumber)) return DIGNITY_OWN

  const lord = SIGN_LORDS[vargaSignNumber]
  if (lord === planet) return DIGNITY_OWN // safety (should be caught by OWN_SIGNS)

  const perm = permanentRelation(planet, lord)

  const planetD1 = allPlanets.find((p) => p.planet === planet)?.signNumber
  const lordD1 = allPlanets.find((p) => p.planet === lord)?.signNumber
  if (planetD1 == null || lordD1 == null) {
    // No positional data → score on permanent relationship alone.
    if (perm === 'friend') return DIGNITY_MITRA
    if (perm === 'enemy') return DIGNITY_SHATRU
    return DIGNITY_SAMA
  }

  const temp = temporaryRelation(planetD1, lordD1)
  return combineRelationshipScore(perm, temp)
}

/** FIX-G Vimsopaka dignity scale top rung: exaltation (above Moolatrikona). */
const VIMSOPAKA_EXALTED = 60
const VIMSOPAKA_DEBILITATED = 0

/**
 * FIX-G Vimsopaka dignity score. Unlike Saptavargaja (which has NO exalted
 * row — exaltation being captured by Uccha Bala), Vimsopaka scores exaltation
 * as its own TOP rung and debilitation as the LOWEST:
 *   exalted 60 > Moolatrikona 45 > own 30 > Adhimitra 22.5 > Mitra 15
 *   > Sama 7.5 > Shatru 3.75 > Adhishatru 1.875 > debilitated 0
 * Normalised against {@link VIMSOPAKA_EXALTED} by the caller.
 */
function dignityScoreForVargaVimsopaka(
  planet: string,
  vargaSignNumber: number,
  allPlanets: PlanetPosition[]
): number {
  if (!PERMANENT_FRIENDSHIP[planet]) return 0 // Rahu/Ketu
  if (EXALTATION_SIGNS[planet] === vargaSignNumber) return VIMSOPAKA_EXALTED
  if (DEBILITATION_SIGNS[planet] === vargaSignNumber) return VIMSOPAKA_DEBILITATED
  // Below the exaltation/debilitation rungs, reuse the shared dignity ladder.
  return dignityScoreForVarga(planet, vargaSignNumber, allPlanets)
}

// ─── Sthana Bala sub-components ─────────────────────────────────────

/** 1.1a Uccha Bala: 60 at exaltation, 0 at debilitation. Nodes → 0. */
export function computeUcchaBala(planet: string, longitude: number): number {
  const exalt = EXALTATION_LONGITUDES[planet]
  if (exalt == null) return 0
  return (180 - arcDist(longitude, exalt)) / 3
}

/** 1.1b Saptavargaja Bala: FIX-1 dignity summed over 7 vargas (max ~315). */
export function computeSaptaVargaBala(
  planet: string,
  allPlanets: PlanetPosition[],
  divisionalCharts: DivisionalChart[]
): number {
  if (!PERMANENT_FRIENDSHIP[planet]) return 0 // Rahu/Ketu
  let sum = 0
  for (const division of SAPTAVARGA_DIVISIONS) {
    const signNumber = getVargaSignNumber(planet, division, divisionalCharts)
    if (signNumber == null) continue
    sum += dignityScoreForVarga(planet, signNumber, allPlanets)
  }
  return sum
}

/** FIX-3 Ojha-Yugma Bala: 15 per chart (D1 + D9) when in preferred parity. Max 30. */
export function computeOjhaYugmaBala(
  planet: string,
  d1SignNumber: number,
  d9SignNumber: number
): number {
  const prefersEven = PREFERS_EVEN[planet]
  if (prefersEven === undefined) return 0 // Rahu/Ketu
  const score = (signNumber: number): number => {
    const isEven = signNumber % 2 === 0
    return isEven === prefersEven ? 15 : 0
  }
  return score(d1SignNumber) + score(d9SignNumber)
}

/** 1.1d Kendradi Bala from house: kendra 60, panapara 30, apoklima 15. */
export function computeKendradiBala(house: number): number {
  if ([1, 4, 7, 10].includes(house)) return 60
  if ([2, 5, 8, 11].includes(house)) return 30
  return 15
}

/** FIX-4 Drekkana Bala (binary 15/0). Saturn is NEUTER (2nd decan). */
export function computeDrekkanaBala(planet: string, degreeInSign: number): number {
  const decan = clamp(Math.floor(degreeInSign / 10), 0, 2) // 0,1,2
  if (decan === 0 && DREKKANA_MALE.includes(planet)) return 15
  if (decan === 1 && DREKKANA_NEUTER.includes(planet)) return 15
  if (decan === 2 && DREKKANA_FEMALE.includes(planet)) return 15
  return 0
}

/** Sthana Bala = uccha + saptaVarga + ojhaYugma + kendradi + drekkana. */
export function computeSthanaBala(
  uccha: number,
  saptaVarga: number,
  ojhaYugma: number,
  kendradi: number,
  drekkana: number
): number {
  return uccha + saptaVarga + ojhaYugma + kendradi + drekkana
}

// ─── Dig Bala ───────────────────────────────────────────────────────

/**
 * 1.2 Dig Bala: (180 − arcDist(longitude, digCusp)) / 3. Rahu/Ketu → 0.
 *
 * DOCUMENTED APPROXIMATION (finding 8): the dig-bala cusps use an EQUAL-HOUSE
 * model — each cusp is a fixed 0/90/180/270° offset from the lagna longitude
 * (see {@link DIG_HOUSE_OFFSET}). A Sripati/Placidus bhava-madhya model would
 * place the cusps at the true house midpoints instead.
 */
export function computeDigBala(
  planet: string,
  longitude: number,
  lagnaLongitude: number
): number {
  const digHouse = DIG_BALA_HOUSE[planet]
  if (digHouse == null) return 0
  const cusp = normLon(lagnaLongitude + DIG_HOUSE_OFFSET[digHouse])
  return (180 - arcDist(longitude, cusp)) / 3
}

// ─── Kaala Bala sub-components ──────────────────────────────────────

/**
 * FIX-6 Natonnata Bala (proportional). Diurnal (Sun/Jupiter/Venus) peak at
 * noon; nocturnal (Moon/Mars/Saturn) peak at midnight; Mercury always 60.
 */
export function computeNatonnataBala(planet: string, birthTimeSeconds: number): number {
  if (planet === 'Mercury') return 60
  const hoursFromNoon = Math.abs(birthTimeSeconds - NOON_SECONDS) / 3600
  const secsFromMidnight = Math.min(birthTimeSeconds, SECONDS_PER_DAY - birthTimeSeconds)
  const hoursFromMidnight = secsFromMidnight / 3600

  if (planet === 'Sun' || planet === 'Jupiter' || planet === 'Venus') {
    return 60 * (1 - clamp(hoursFromNoon, 0, 12) / 12)
  }
  if (planet === 'Moon' || planet === 'Mars' || planet === 'Saturn') {
    return 60 * (1 - clamp(hoursFromMidnight, 0, 12) / 12)
  }
  return 0 // Rahu/Ketu
}

/** Raw elongation Moon − Sun, normalised to [0, 360). */
export function computeElongation(moonLon: number, sunLon: number): number {
  return normLon(moonLon - sunLon)
}

/**
 * 1.3b Paksha Bala. The elongation is folded to 0–180 (so benefic/malefic
 * balas stay within 0–60): benefics = folded/3, malefics = 60 − folded/3.
 * Rahu/Ketu = 30. `moonBala` (= folded/3) is reused as the Moon's Cheshta.
 */
export function computePakshaBala(planet: string, moonLon: number, sunLon: number): number {
  if (planet === 'Rahu' || planet === 'Ketu') return 30
  const raw = computeElongation(moonLon, sunLon)
  const folded = raw > 180 ? 360 - raw : raw
  const moonBala = folded / 3 // 0..60
  const benefic = planet === 'Moon' || planet === 'Mercury' || planet === 'Jupiter' || planet === 'Venus'
  return benefic ? moonBala : 60 - moonBala
}

/**
 * 1.3c Tribhaga Bala. The birth third (day thirds → Mercury/Sun/Saturn; night
 * thirds → Moon/Venus/Mars) awards 60 to its lord; Jupiter always gets 60.
 *
 * DOCUMENTED APPROXIMATION (finding 9): day/night lengths depend on the
 * `sunsetSeconds` supplied by the caller, which the engine derives with a
 * half-day model (sunset = sunrise + 12h). Real day/night thirds vary with
 * latitude and season, so the third boundaries here are approximate.
 */
export function computeTribhagaBala(
  planet: string,
  birthTimeSeconds: number,
  sunriseSeconds: number,
  sunsetSeconds: number
): number {
  if (planet === 'Jupiter') return 60

  const isDay = birthTimeSeconds >= sunriseSeconds && birthTimeSeconds < sunsetSeconds
  let lord: string
  if (isDay) {
    const dayLen = Math.max(1, sunsetSeconds - sunriseSeconds)
    const third = clamp(Math.floor((birthTimeSeconds - sunriseSeconds) / (dayLen / 3)), 0, 2)
    lord = ['Mercury', 'Sun', 'Saturn'][third]
  } else {
    const nightLen = Math.max(1, SECONDS_PER_DAY - sunsetSeconds + sunriseSeconds)
    const elapsed =
      birthTimeSeconds >= sunsetSeconds
        ? birthTimeSeconds - sunsetSeconds
        : birthTimeSeconds + (SECONDS_PER_DAY - sunsetSeconds)
    const third = clamp(Math.floor(elapsed / (nightLen / 3)), 0, 2)
    lord = ['Moon', 'Venus', 'Mars'][third]
  }
  return planet === lord ? 60 : 0
}

/**
 * Approximate weekday of the sidereal Mesha (Aries) ingress for a civil year.
 * DOCUMENTED APPROXIMATION (FIX-7 style): the ingress is near Apr 13/14; we use
 * Apr 14. Exact ingress varies year-to-year by ~a day.
 *
 * DOCUMENTED CAVEAT (finding 10): `new Date(year, 3, 14)` is constructed in the
 * SERVER's local timezone, so the ingress weekday can shift by a day depending
 * on where this code runs. A fully correct implementation would compute the
 * ingress instant in the birth locale's timezone.
 */
export function getAriesIngressWeekday(year: number): number {
  return new Date(year, 3, 14).getDay() // month index 3 = April
}

/**
 * 1.3d Abda Bala: the year lord (from the Aries-ingress weekday) gets 15.
 * FIX-E: when the birth is before sunrise the Vedic day belongs to the previous
 * weekday, so the ingress-weekday seed is shifted back one day.
 */
export function computeAbdaBala(
  planet: string,
  birthDate: Date,
  beforeSunrise: boolean
): number {
  let weekday = getAriesIngressWeekday(birthDate.getFullYear())
  if (beforeSunrise) weekday = (weekday - 1 + 7) % 7
  const yearLord = WEEKDAY_LORDS[weekday]
  return planet === yearLord ? 15 : 0
}

/**
 * 1.3e Masa Bala: the lunar-month lord gets 30. DOCUMENTED APPROXIMATION: the
 * Sun's sign index is used as the lunar-month (masa) proxy.
 */
export function computeMasaBala(planet: string, sunSignNumber: number): number {
  const monthLord = LUNAR_MONTH_LORDS[(sunSignNumber - 1 + 12) % 12]
  return planet === monthLord ? 30 : 0
}

/**
 * 1.3f Vara Bala: the weekday lord gets 45. FIX-E: `effectiveWeekday` is the
 * VEDIC weekday (sunrise-to-sunrise), computed once by the caller.
 */
export function computeVaraBala(planet: string, effectiveWeekday: number): number {
  const dayLord = WEEKDAY_LORDS[effectiveWeekday]
  return planet === dayLord ? 45 : 0
}

/**
 * 1.3g Hora Bala: the ruling hora lord at the birth moment gets 60. FIX-E: the
 * day-lord SEED uses the VEDIC weekday (`effectiveWeekday`); the hora index math
 * (seconds-since-sunrise) is unchanged.
 */
export function computeHoraBala(
  planet: string,
  effectiveWeekday: number,
  birthTimeSeconds: number,
  sunriseSeconds: number
): number {
  const secondsSinceSunrise = ((birthTimeSeconds - sunriseSeconds) % SECONDS_PER_DAY + SECONDS_PER_DAY) % SECONDS_PER_DAY
  const horaIndex = Math.floor(secondsSinceSunrise / 3600) % 24
  const dayLord = WEEKDAY_LORDS[effectiveWeekday]
  const startPos = HORA_SEQUENCE.indexOf(dayLord)
  const horaLord = HORA_SEQUENCE[(startPos + horaIndex) % 7]
  return planet === horaLord ? 60 : 0
}

/**
 * Kaala Bala = sum of the temporal sub-balas, now INCLUDING Ayana Bala
 * (declination-based, Sun doubled — see {@link computeAyanaBala}). Yuddha
 * (planetary-war) Bala is not yet implemented, so this stays ≥ 0.
 */
export function computeKaalaBala(parts: {
  natonnata: number
  pakshaBala: number
  tribhagaBala: number
  abdaBala: number
  masaBala: number
  varaBala: number
  horaBala: number
  ayana: number
}): number {
  return (
    parts.natonnata +
    parts.pakshaBala +
    parts.tribhagaBala +
    parts.abdaBala +
    parts.masaBala +
    parts.varaBala +
    parts.horaBala +
    parts.ayana
  )
}

// ─── Cheshta Bala ───────────────────────────────────────────────────

/**
 * 1.4 Cheshta Bala. DOCUMENTED APPROXIMATION: classical Cheshta =
 * Cheshta-Kendra/3 (epicyclic); we use |speed|/mean-motion as a proxy, which
 * diverges from JHora.
 *
 * JHora-ALIGNED (docs/computation_varshaphal.md §4.2, finding #2): the two
 * luminaries have NO Cheshta Bala — Sun = 0 and Moon = 0. (The Sun's
 * declination strength is now booked as Ayana Bala inside Kaala; the Moon's
 * Paksha is already a Kaala term.) Rahu/Ketu = 30. Combustion (single source,
 * REQ-2.7) halves the motional value for the five true planets. Capped 0–60.
 */
export function computeCheshtaBala(
  planet: string,
  planetPos: PlanetPosition,
  sunLon: number,
  combustionForPlanet?: CombustionResult
): number {
  if (planet === 'Sun' || planet === 'Moon') return 0 // luminaries have no Cheshta (JHora)
  if (planet === 'Rahu' || planet === 'Ketu') return 30

  const meanMotion = MEAN_DAILY_MOTION[planet]
  let value: number
  if (planetPos.retrograde) {
    value = (arcDist(planetPos.longitude, sunLon) / 180) * 60
  } else {
    value = meanMotion ? (Math.abs(planetPos.speed) / meanMotion) * 60 : 0
  }

  if (combustionForPlanet?.combust) value *= 0.5
  return clamp(value, 0, 60)
}

// ─── Naisargika Bala ────────────────────────────────────────────────

/** 1.5 / FIX-2 Naisargika Bala (fixed lookup). */
export function computeNaisargikaBala(planet: string): number {
  return NAISARGIKA_BALA[planet] ?? 0
}

// ─── Drik Bala ──────────────────────────────────────────────────────

/**
 * 1.6 / FIX-9 Drik Bala. Every OTHER planet casts a graded aspect on this
 * planet's house; benefic aspects add and malefic aspects subtract, then
 * DrikBala = (beneficSum − maleficSum) / 4. Combust benefics and the waning
 * Moon count as malefic (via {@link isNaturalBenefic}).
 */
export function computeDrikBala(
  planet: string,
  planetPos: PlanetPosition,
  allPlanets: PlanetPosition[],
  combustionByPlanet: Record<string, CombustionResult | undefined>,
  waxingMoon: boolean
): number {
  let beneficSum = 0
  let maleficSum = 0
  for (const x of allPlanets) {
    if (x.planet === planet) continue
    if (x.planet === 'Rahu' || x.planet === 'Ketu') continue // FIX-C: nodes cast no Drik aspect
    const strength = gradedAspectStrengthBetweenHouses(x.house, planetPos.house, x.planet)
    if (strength === 0) continue
    const benefic = isNaturalBenefic(x.planet, {
      waxingMoon,
      combust: combustionByPlanet[x.planet]?.combust,
    })
    if (benefic) beneficSum += strength
    else maleficSum += strength
  }
  return (beneficSum - maleficSum) / 4
}

// ─── Ishta / Kashta / Vimsopaka / Retro classification ──────────────

/** 1.7 Ishta & Kashta Phala and derived benefic ratio. */
export function computeIshtaKashta(
  uccha: number,
  cheshta: number
): { ishtaPhala: number; kashtaPhala: number; beneficRatio: number } {
  const ishtaPhala = Math.sqrt(Math.max(0, uccha) * Math.max(0, cheshta))
  const kashtaPhala = Math.sqrt(Math.max(0, 60 - uccha) * Math.max(0, 60 - cheshta))
  const denom = ishtaPhala + kashtaPhala
  const beneficRatio = denom > 0 ? ishtaPhala / denom : 0
  return { ishtaPhala, kashtaPhala, beneficRatio }
}

/**
 * FIX-8 / FIX-G Vimsopaka Bala (true Shadvarga, 0–20). Each of the six vargas
 * contributes (dignity/exalted) × weight; the weights sum to 20. Unlike
 * Saptavargaja, the dignity ladder here COUNTS exaltation as the top rung
 * (see {@link dignityScoreForVargaVimsopaka}).
 */
export function computeVimsopakaScore(
  planet: string,
  allPlanets: PlanetPosition[],
  divisionalCharts: DivisionalChart[]
): number {
  if (!PERMANENT_FRIENDSHIP[planet]) return 0 // Rahu/Ketu
  let sum = 0
  for (const division of Object.keys(VIMSOPAKA_WEIGHTS).map(Number)) {
    const signNumber = getVargaSignNumber(planet, division, divisionalCharts)
    if (signNumber == null) continue
    const fraction = dignityScoreForVargaVimsopaka(planet, signNumber, allPlanets) / VIMSOPAKA_EXALTED
    sum += fraction * VIMSOPAKA_WEIGHTS[division]
  }
  return Math.round(sum)
}

/** Retro-effect classification (see spec 1C). */
export function computeRetroEffect(
  planetPos: PlanetPosition,
  cheshtaBala: number,
  combust: boolean
): ShadbalPlanet['retroEffect'] {
  if (!planetPos.retrograde) return 'direct_normal'
  if (combust && cheshtaBala < 5) return 'near_combustion_exception'
  if (Math.abs(planetPos.speed) < 0.01) return 'stationary'
  if (cheshtaBala > 45) return 'brightening'
  return 'internalised'
}

// ─── Main assembly ──────────────────────────────────────────────────

/**
 * Compute the full Shadbala for every planet in the chart.
 *
 * @param planets           D1 planet positions (drives houses, signs, speeds).
 * @param divisionalCharts  Must include D1, D2, D3, D7, D9, D12, D30 (REQ-0).
 * @param birthDate         Local birth Date (used for weekday/year lords).
 * @param birthTimeSeconds  Seconds since local midnight (0–86400).
 * @param sunriseSeconds    Local sunrise, seconds since midnight.
 * @param sunsetSeconds     Local sunset, seconds since midnight.
 * @param lagnaLongitude    Sidereal longitude of the ascendant (for Dig Bala).
 * @param ayanamsa          Lahiri ayanamsa (deg) — Sun's Ayana/Cheshta (FIX-A).
 * @param combustion        Optional single combustion source (FIX-F). When
 *                          omitted it is computed internally.
 */
export function computeShadbala(
  planets: PlanetPosition[],
  divisionalCharts: DivisionalChart[],
  birthDate: Date,
  birthTimeSeconds: number,
  sunriseSeconds: number,
  sunsetSeconds: number,
  lagnaLongitude: number,
  ayanamsa: number,
  combustion?: CombustionResult[]
): ShadbalResult {
  const sun = planets.find((p) => p.planet === 'Sun')
  const moon = planets.find((p) => p.planet === 'Moon')
  const sunLon = sun?.longitude ?? 0
  const moonLon = moon?.longitude ?? 0
  const sunSignNumber = sun?.signNumber ?? 1

  const elongation = computeElongation(moonLon, sunLon)
  const waxingMoon = elongation < 180

  // FIX-F: reuse the caller-supplied combustion (single source) or compute once.
  const combustionResults = combustion ?? computeCombustion(planets)
  const combustionByPlanet: Record<string, CombustionResult | undefined> = {}
  for (const c of combustionResults) combustionByPlanet[c.planet] = c

  // FIX-E: Vedic (sunrise-to-sunrise) weekday. A birth before sunrise still
  // belongs to the previous Vedic day, so shift the civil weekday back one day.
  const beforeSunrise = birthTimeSeconds < sunriseSeconds
  const civilWeekday = birthDate.getDay()
  const effectiveWeekday = beforeSunrise ? (civilWeekday - 1 + 7) % 7 : civilWeekday

  const shadbalPlanets: ShadbalPlanet[] = []

  for (const name of ALL_PLANETS) {
    const pos = planets.find((p) => p.planet === name)
    if (!pos) continue

    // Sthana Bala sub-components
    const ucchaBala = computeUcchaBala(name, pos.longitude)
    const saptaVargaBala = computeSaptaVargaBala(name, planets, divisionalCharts)
    const d1Sign = pos.signNumber
    const d9Sign = getVargaSignNumber(name, 9, divisionalCharts) ?? pos.signNumber
    const ojhaYugmaBala = computeOjhaYugmaBala(name, d1Sign, d9Sign)
    const kendradiBala = computeKendradiBala(pos.house)
    const drekkanaBala = computeDrekkanaBala(name, pos.degreeInSign)
    const sthana = computeSthanaBala(ucchaBala, saptaVargaBala, ojhaYugmaBala, kendradiBala, drekkanaBala)

    // Dig Bala
    const dig = computeDigBala(name, pos.longitude, lagnaLongitude)

    // Kaala Bala sub-components
    const natonnata = computeNatonnataBala(name, birthTimeSeconds)
    const pakshaBala = computePakshaBala(name, moonLon, sunLon)
    const tribhagaBala = computeTribhagaBala(name, birthTimeSeconds, sunriseSeconds, sunsetSeconds)
    const abdaBala = computeAbdaBala(name, birthDate, beforeSunrise)
    const masaBala = computeMasaBala(name, sunSignNumber)
    const varaBala = computeVaraBala(name, effectiveWeekday)
    const horaBala = computeHoraBala(name, effectiveWeekday, birthTimeSeconds, sunriseSeconds)
    const ayanaBala = computeAyanaBala(name, pos.longitude, ayanamsa)
    const kaala = computeKaalaBala({ natonnata, pakshaBala, tribhagaBala, abdaBala, masaBala, varaBala, horaBala, ayana: ayanaBala })

    // Cheshta / Naisargika / Drik
    const cheshtaBala = computeCheshtaBala(name, pos, sunLon, combustionByPlanet[name])
    const naisargikaBala = computeNaisargikaBala(name)
    const drikBala = computeDrikBala(name, pos, planets, combustionByPlanet, waxingMoon)

    const components: ShadbalComponent = {
      sthana,
      dig,
      kaala,
      cheshta: cheshtaBala,
      naisargika: naisargikaBala,
      drik: drikBala,
      total: sthana + dig + kaala + cheshtaBala + naisargikaBala + drikBala,
    }

    const totalVirupas = components.total
    const totalRupas = totalVirupas / 60
    const requiredRupas = REQUIRED_RUPAS[name] ?? 0
    const strengthRatio = requiredRupas > 0 ? totalRupas / requiredRupas : 0
    const grade: ShadbalPlanet['grade'] =
      strengthRatio >= 1.0 ? 'Strong' : strengthRatio >= 0.75 ? 'Average' : 'Weak'
    const gradePct = strengthRatio * 100

    const { ishtaPhala, kashtaPhala, beneficRatio } = computeIshtaKashta(ucchaBala, cheshtaBala)
    const vimsopakaScore = computeVimsopakaScore(name, planets, divisionalCharts)
    const retroEffect = computeRetroEffect(pos, cheshtaBala, combustionByPlanet[name]?.combust ?? false)

    shadbalPlanets.push({
      planet: name,
      components,
      ucchaBala,
      saptaVargaBala,
      ojhaYugmaBala,
      kendradiBala,
      drekkanaBala,
      natonnata,
      pakshaBala,
      tribhagaBala,
      abdaBala,
      masaBala,
      varaBala,
      horaBala,
      ayanaBala,
      cheshtaBala,
      naisargikaBala,
      drikBala,
      totalVirupas,
      requiredRupas,
      totalRupas,
      strengthRatio,
      grade,
      gradePct,
      ishtaPhala,
      kashtaPhala,
      beneficRatio,
      vimsopakaScore,
      retroEffect,
    })
  }

  // FIX-H: rank only the seven classical planets. Rahu/Ketu keep their partial
  // values in `planets` but are excluded from the strength ranking.
  const strengthRanking = shadbalPlanets
    .filter((p) => CLASSICAL_PLANETS.includes(p.planet))
    .map((p) => ({ planet: p.planet, ratio: p.strengthRatio }))
    .sort((a, b) => b.ratio - a.ratio)
    .map((entry, i) => ({ rank: i + 1, planet: entry.planet, ratio: entry.ratio }))

  return {
    planets: shadbalPlanets,
    strengthRanking,
    computedAt: new Date().toISOString(),
  }
}
