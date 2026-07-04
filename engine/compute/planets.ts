/**
 * engine/compute/planets.ts — Core planetary longitude computation using Swiss Ephemeris.
 *
 * Computes sidereal planetary positions using Lahiri ayanamsa for all 9 Vedic planets
 * (Sun, Moon, Mars, Mercury, Jupiter, Venus, Saturn, Rahu, Ketu) plus the Ascendant.
 */

import path from 'path'
import swisseph from 'swisseph-v2'
import type { BirthInput, PlanetPosition } from './types'

// ─── Ephemeris Path Setup ───────────────────────────────────────────

/**
 * Points Swiss Ephemeris at the bundled .se1 data files so that
 * swe_calc_ut uses the true Swiss Ephemeris (SEFLG_SWIEPH) rather than
 * silently degrading to the Moshier fallback. The swisseph-v2 package
 * ships sepl_18/semo_18/seas_18.se1 (covering 1800–2399) in its ephe dir.
 *
 * Resolved once at module load. If resolution fails (unusual packaging),
 * calls will fall back to Moshier — still ~arcsecond accurate.
 */
let ephePathSet = false
function ensureEphemerisPath(): void {
  if (ephePathSet) return
  try {
    const pkgJson = require.resolve('swisseph-v2/package.json')
    const ephePath = path.join(path.dirname(pkgJson), 'ephe')
    swisseph.swe_set_ephe_path(ephePath)
  } catch {
    // Leave unset — library falls back to Moshier model.
  }
  ephePathSet = true
}

// ─── Constants ──────────────────────────────────────────────────────

const SIGNS = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
]

/** Planet IDs used by Swiss Ephemeris */
const PLANET_IDS: { name: string; id: number }[] = [
  { name: 'Sun', id: swisseph.SE_SUN },
  { name: 'Moon', id: swisseph.SE_MOON },
  { name: 'Mars', id: swisseph.SE_MARS },
  { name: 'Mercury', id: swisseph.SE_MERCURY },
  { name: 'Jupiter', id: swisseph.SE_JUPITER },
  { name: 'Venus', id: swisseph.SE_VENUS },
  { name: 'Saturn', id: swisseph.SE_SATURN },
  { name: 'Rahu', id: swisseph.SE_TRUE_NODE }, // True node = Rahu
]

// ─── Core Functions ─────────────────────────────────────────────────

/**
 * Converts birth input into Julian Day (Universal Time).
 */
export function birthInputToJulianDay(input: BirthInput): number {
  const [year, month, day] = input.date.split('-').map(Number)
  const [hours, minutes, seconds] = input.time.split(':').map(Number)

  // Convert local time to UT
  const decimalHours = hours + minutes / 60 + (seconds || 0) / 3600
  const ut = decimalHours - input.timezone

  // Handle day rollover
  let adjDay = day
  let adjMonth = month
  let adjYear = year
  let adjHour = ut

  if (ut < 0) {
    adjHour = ut + 24
    adjDay -= 1
    if (adjDay < 1) {
      adjMonth -= 1
      if (adjMonth < 1) {
        adjMonth = 12
        adjYear -= 1
      }
      adjDay = new Date(adjYear, adjMonth, 0).getDate()
    }
  } else if (ut >= 24) {
    adjHour = ut - 24
    adjDay += 1
    const daysInMonth = new Date(adjYear, adjMonth, 0).getDate()
    if (adjDay > daysInMonth) {
      adjDay = 1
      adjMonth += 1
      if (adjMonth > 12) {
        adjMonth = 1
        adjYear += 1
      }
    }
  }

  return swisseph.swe_julday(adjYear, adjMonth, adjDay, adjHour, swisseph.SE_GREG_CAL)
}

/**
 * Computes the sidereal ascendant (lagna) degree using whole-sign houses.
 */
export function computeAscendant(
  julianDay: number,
  latitude: number,
  longitude: number
): { longitude: number; sign: string; signNumber: number; degreeInSign: number } {
  ensureEphemerisPath()
  // Set sidereal mode to Lahiri
  swisseph.swe_set_sid_mode(swisseph.SE_SIDM_LAHIRI, 0, 0)

  const result = swisseph.swe_houses_ex(
    julianDay,
    swisseph.SEFLG_SIDEREAL,
    latitude,
    longitude,
    'W' // Whole sign houses
  )

  if ('error' in result) {
    throw new Error(`Ascendant computation failed: ${result.error}`)
  }

  const ascLongitude = result.ascendant
  const signNumber = Math.floor(ascLongitude / 30) + 1
  const degreeInSign = ascLongitude % 30

  return {
    longitude: ascLongitude,
    sign: SIGNS[signNumber - 1],
    signNumber,
    degreeInSign,
  }
}

/**
 * Computes sidereal positions for all 9 Vedic planets.
 * Uses Lahiri ayanamsa and returns positions with retrograde status.
 */
export function computePlanetPositions(
  julianDay: number,
  lagnaSignNumber: number
): PlanetPosition[] {
  ensureEphemerisPath()
  // Set Lahiri ayanamsa
  swisseph.swe_set_sid_mode(swisseph.SE_SIDM_LAHIRI, 0, 0)

  const flags = swisseph.SEFLG_SWIEPH | swisseph.SEFLG_SIDEREAL | swisseph.SEFLG_SPEED

  const positions: PlanetPosition[] = []

  for (const { name, id } of PLANET_IDS) {
    const result = swisseph.swe_calc_ut(julianDay, id, flags)

    if ('error' in result) {
      throw new Error(`Planet calculation failed for ${name}: ${(result as { error: string }).error}`)
    }

    const res = result as {
      longitude: number
      latitude: number
      longitudeSpeed: number
    }

    let longitude = res.longitude
    // Normalize to 0–360
    if (longitude < 0) longitude += 360
    if (longitude >= 360) longitude -= 360

    const signNumber = Math.floor(longitude / 30) + 1
    const degreeInSign = longitude % 30
    const sign = SIGNS[signNumber - 1]
    const speed = res.longitudeSpeed
    const retrograde = speed < 0
    const house = ((signNumber - lagnaSignNumber + 12) % 12) + 1

    positions.push({
      planet: name,
      longitude,
      latitude: res.latitude,
      speed,
      retrograde,
      sign,
      signNumber,
      degreeInSign,
      house,
    })
  }

  // Compute Ketu (always 180° from Rahu)
  const rahu = positions.find((p) => p.planet === 'Rahu')!
  let ketuLongitude = (rahu.longitude + 180) % 360
  const ketuSignNumber = Math.floor(ketuLongitude / 30) + 1
  const ketuDegreeInSign = ketuLongitude % 30
  const ketuHouse = ((ketuSignNumber - lagnaSignNumber + 12) % 12) + 1

  positions.push({
    planet: 'Ketu',
    longitude: ketuLongitude,
    latitude: -rahu.latitude,
    speed: rahu.speed, // Same speed magnitude
    retrograde: true, // Ketu is always retrograde
    sign: SIGNS[ketuSignNumber - 1],
    signNumber: ketuSignNumber,
    degreeInSign: ketuDegreeInSign,
    house: ketuHouse,
  })

  return positions
}

/**
 * Gets the ayanamsa value for a given Julian Day.
 */
export function getAyanamsa(julianDay: number): number {
  ensureEphemerisPath()
  swisseph.swe_set_sid_mode(swisseph.SE_SIDM_LAHIRI, 0, 0)
  return swisseph.swe_get_ayanamsa_ut(julianDay)
}

/**
 * Returns the sign name for a given sign number (1-indexed).
 */
export function getSignName(signNumber: number): string {
  return SIGNS[((signNumber - 1) % 12 + 12) % 12]
}

/**
 * Returns the sign number (1-indexed) for a sidereal longitude.
 */
export function longitudeToSign(longitude: number): number {
  return Math.floor(((longitude % 360) + 360) % 360 / 30) + 1
}

export { SIGNS }
