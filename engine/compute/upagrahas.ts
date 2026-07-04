/**
 * engine/compute/upagrahas.ts — Upagraha (shadow planet) computation.
 *
 * Computes the classical 8 upagrahas from the birth chart:
 * - Dhuma      (smoke)          — Sun + 133°20'
 * - Vyatipata  (calamity)       — 360° − Dhuma
 * - Parivesh   (halo)           — Vyatipata + 180°
 * - Indrachapa (Chapa/arc)      — 360° − Parivesh
 * - Upaketu    (comet)          — Dhuma − 30°
 *
 * Gulika and Mandi are the most important upagrahas. They are computed
 * from the weekday and daytime/nighttime arc of the birth.
 * Gulika = lord of the 8th part of the day/night arc starting from the
 * weekday ruler, where Saturn's portion gives Gulika's cusp.
 *
 * All positions are sidereal (Lahiri) longitudes.
 *
 * Reference: Brihat Parashara Hora Shastra, Chapter 3.
 */

import type { PlanetPosition } from './types'

// ─── Types ──────────────────────────────────────────────────────────

export interface Upagraha {
  name: string
  abbr: string
  longitude: number
  sign: string
  signNumber: number
  degreeInSign: number
  house: number
}

// ─── Constants ──────────────────────────────────────────────────────

const SIGNS = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
]

/**
 * Day lords in weekday order (0=Sunday...6=Saturday).
 * Each day is ruled by a planet for its hora sequence.
 */
const WEEKDAY_LORDS = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn']

/**
 * Hora (hour) sequence — the 24 hora lords cycle starting from the weekday lord.
 * Order: Sun, Venus, Mercury, Moon, Saturn, Jupiter, Mars, then repeat.
 */
const HORA_SEQUENCE = ['Sun', 'Venus', 'Mercury', 'Moon', 'Saturn', 'Jupiter', 'Mars']

// ─── Helper ──────────────────────────────────────────────────────────

function normLong(lon: number): number {
  return ((lon % 360) + 360) % 360
}

function longToPlacement(longitude: number, lagnaSignNumber: number) {
  const signNumber = Math.floor(longitude / 30) + 1
  const degreeInSign = longitude % 30
  const house = ((signNumber - lagnaSignNumber + 12) % 12) + 1
  return { signNumber, sign: SIGNS[signNumber - 1], degreeInSign, house }
}

// ─── Dhuma & Derived Upagrahas (from Sun longitude) ─────────────────

/**
 * Computes the 5 solar-derived upagrahas.
 * These are purely algebraic, derived from the Sun's sidereal longitude.
 */
function computeSolarUpagrahas(
  sunLongitude: number,
  lagnaSignNumber: number
): Upagraha[] {
  const dhuma      = normLong(sunLongitude + 133 + 20 / 60) // Sun + 133°20'
  const vyatipata  = normLong(360 - dhuma)
  const parivesh   = normLong(vyatipata + 180)
  const indrachapa = normLong(360 - parivesh)
  const upaketu    = normLong(dhuma - 30)

  return [
    { name: 'Dhuma',      abbr: 'Dh',  longitude: dhuma,      ...longToPlacement(dhuma,      lagnaSignNumber) },
    { name: 'Vyatipata',  abbr: 'Vy',  longitude: vyatipata,  ...longToPlacement(vyatipata,  lagnaSignNumber) },
    { name: 'Parivesh',   abbr: 'Pv',  longitude: parivesh,   ...longToPlacement(parivesh,   lagnaSignNumber) },
    { name: 'Indrachapa', abbr: 'IC',  longitude: indrachapa, ...longToPlacement(indrachapa, lagnaSignNumber) },
    { name: 'Upaketu',    abbr: 'Uk',  longitude: upaketu,    ...longToPlacement(upaketu,    lagnaSignNumber) },
  ]
}

// ─── Gulika & Mandi ──────────────────────────────────────────────────

/**
 * Computes Gulika and Mandi using the standard BPHS method.
 *
 * Each weekday is divided into 8 parts (for day or night arc).
 * The lord of each part follows the weekday-lord sequence.
 * The 8th part (owned by no planet = Saturn's shadow) gives Gulika.
 * Mandi = same cusp as Gulika, just different reckoning tradition
 * (some texts treat them as identical; we output both at the same position).
 *
 * Day arc = sunrise to sunset; Night arc = sunset to sunrise.
 * Each arc is divided by 8 to get the part duration.
 *
 * Since exact sunrise/sunset need ephemeris, we approximate using a
 * 12-hour day arc (6 AM to 6 PM) as default. If sunriseSecs and
 * sunsetSecs are provided, we use them.
 *
 * @param weekday - 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
 * @param birthTimeSeconds - Seconds from midnight
 * @param lagnaSignNumber - Lagna sign
 * @param sunriseSecs - Optional: sunrise in seconds from midnight (default 21600 = 6 AM)
 * @param sunsetSecs - Optional: sunset in seconds from midnight (default 64800 = 6 PM)
 * @param lagnaLongitude - Sidereal ascendant longitude for time-proportional placement
 */
function computeGulika(
  weekday: number,
  birthTimeSeconds: number,
  lagnaSignNumber: number,
  sunriseSecs: number = 21600,
  sunsetSecs: number = 64800,
  lagnaLongitude: number = 0
): { gulika: Upagraha; mandi: Upagraha } {
  const isDay = birthTimeSeconds >= sunriseSecs && birthTimeSeconds < sunsetSecs

  const dayArcSecs  = sunsetSecs - sunriseSecs
  const nightArcSecs = 86400 - dayArcSecs

  const arcSecs   = isDay ? dayArcSecs : nightArcSecs
  const partSecs  = arcSecs / 8

  // Starting hora lord index for this weekday
  const weekdayLord = WEEKDAY_LORDS[weekday]
  const startIdx = HORA_SEQUENCE.indexOf(weekdayLord)

  // Gulika is the 8th part (index 7 from start, but 8th part has no lord = Saturn's)
  // Classical: count weekday lords in order, the 8th slot (position 7) = Gulika cusp
  // The Gulika cusp is the start of the 8th part of the weekday's arc
  const gulikaPartIndex = 7 // 8th part (0-indexed)
  const gulikaPartStart = isDay
    ? sunriseSecs + gulikaPartIndex * partSecs
    : sunsetSecs + gulikaPartIndex * partSecs

  // Convert Gulika's time proportion to a sidereal longitude
  // Method: Gulika longitude = Lagna + (gulikaPartStart / 86400) * 360
  // Approximate: use the fractional day to advance the ascendant by time
  const dayFraction = gulikaPartStart / 86400
  const gulikaLongitude = normLong(lagnaLongitude + dayFraction * 360)

  // Mandi: In most schools Mandi = Gulika (same computation, different name)
  // Some schools put Mandi at the 7th part start instead of 8th
  const mandiPartIndex = 6
  const mandiPartStart = isDay
    ? sunriseSecs + mandiPartIndex * partSecs
    : sunsetSecs + mandiPartIndex * partSecs
  const mandiFraction = mandiPartStart / 86400
  const mandiLongitude = normLong(lagnaLongitude + mandiFraction * 360)

  return {
    gulika: {
      name: 'Gulika',
      abbr: 'Gu',
      longitude: gulikaLongitude,
      ...longToPlacement(gulikaLongitude, lagnaSignNumber),
    },
    mandi: {
      name: 'Mandi',
      abbr: 'Ma',
      longitude: mandiLongitude,
      ...longToPlacement(mandiLongitude, lagnaSignNumber),
    },
  }
}

// ─── Main Export ─────────────────────────────────────────────────────

/**
 * Computes all upagrahas for the birth chart.
 *
 * @param planets - Planet positions (must include Sun)
 * @param lagnaSignNumber - Ascendant sign number (1–12)
 * @param lagnaLongitude - Sidereal ascendant longitude
 * @param birthDate - Birth date (used to determine weekday)
 * @param birthTimeSeconds - Birth time in seconds from midnight (local)
 */
export function computeUpagrahas(
  planets: PlanetPosition[],
  lagnaSignNumber: number,
  lagnaLongitude: number,
  birthDate: Date,
  birthTimeSeconds: number
): Upagraha[] {
  const sun = planets.find((p) => p.planet === 'Sun')
  if (!sun) return []

  // Solar-derived upagrahas
  const solarUpagrahas = computeSolarUpagrahas(sun.longitude, lagnaSignNumber)

  // Weekday (0=Sun ... 6=Sat)
  const weekday = birthDate.getDay()

  // Gulika and Mandi
  const { gulika, mandi } = computeGulika(
    weekday,
    birthTimeSeconds,
    lagnaSignNumber,
    21600,  // default sunrise 6:00 AM
    64800,  // default sunset 6:00 PM
    lagnaLongitude
  )

  return [...solarUpagrahas, gulika, mandi]
}
