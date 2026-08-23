/**
 * Drik/Lahiri astronomy provider.
 *
 * This is the previous Swiss Ephemeris implementation, moved intact behind an
 * explicit provider so a standalone Surya Siddhanta provider can be added
 * without allowing Swiss/Lahiri values to leak into that calculation path.
 */

import path from 'path'
import swisseph from 'swisseph-v2'
import { DRIK_LAHIRI_V1 } from '../profiles'
import { parseBirthTime } from '../time'
import type { BirthInput, PlanetPosition } from '../types'
import type {
  AstronomyAscendant,
  AstronomyBody,
  AstronomyLongitudeSample,
  AstronomyProvider,
} from './types'

export const SIGNS = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
] as const

const BODY_IDS: Readonly<Record<Exclude<AstronomyBody, 'Ketu'>, number>> = {
  Sun: swisseph.SE_SUN,
  Moon: swisseph.SE_MOON,
  Mars: swisseph.SE_MARS,
  Mercury: swisseph.SE_MERCURY,
  Jupiter: swisseph.SE_JUPITER,
  Venus: swisseph.SE_VENUS,
  Saturn: swisseph.SE_SATURN,
  Rahu: swisseph.SE_TRUE_NODE,
}

const BODY_ORDER: ReadonlyArray<Exclude<AstronomyBody, 'Ketu'>> = [
  'Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu',
]

let ephePathSet = false
export function ensureDrikEphemerisPath(): void {
  if (ephePathSet) return
  try {
    const pkgJson = require.resolve('swisseph-v2/package.json')
    swisseph.swe_set_ephe_path(path.join(path.dirname(pkgJson), 'ephe'))
  } catch {
    // The native library's Moshier fallback remains available in unusual bundles.
  }
  ephePathSet = true
}

function setLahiriSiderealMode(): void {
  ensureDrikEphemerisPath()
  swisseph.swe_set_sid_mode(swisseph.SE_SIDM_LAHIRI, 0, 0)
}

/**
 * Modulo wrap used by the transit and Gochar accessors, which have always
 * normalized this way (`normLong` in the pre-extraction `transits.ts` /
 * `gochar.ts`). Not bit-exact for an already-in-range double — see
 * {@link wrapLongitudeExact}.
 */
export function normalizeLongitude(longitude: number): number {
  return ((longitude % 360) + 360) % 360
}

/**
 * Wrap used by the natal placement path, where it must be a bit-exact no-op for
 * a longitude already in [0, 360).
 *
 * The pre-extraction `computePlanetPositions` normalized with a branch
 * (`if (lon < 0) lon += 360; if (lon >= 360) lon -= 360`) and `computeAscendant`
 * did not normalize at all, so both left an in-range double untouched.
 * `normalizeLongitude` does not: its intermediate `longitude + 360` crosses a
 * binade and drops low mantissa bits, perturbing in-range values by ~1 ULP
 * (~6e-14°). That is far below any display or acceptance tolerance, but natal
 * longitudes feed `Math.floor(lon / 30)` sign and nakshatra boundaries, so the
 * exact form is retained here rather than rounded first.
 */
export function wrapLongitudeExact(longitude: number): number {
  if (longitude >= 0 && longitude < 360) return longitude
  const wrapped = longitude % 360
  if (wrapped >= 0) return wrapped
  // A tiny negative magnitude rounds `wrapped + 360` up to exactly 360, which is
  // out of range. The legacy branchy form caught this with its second `if`; keep
  // that behavior so the result is always in [0, 360).
  const shifted = wrapped + 360
  return shifted < 360 ? shifted : 0
}

export function signNumberForLongitude(longitude: number): number {
  return Math.floor(normalizeLongitude(longitude) / 30) + 1
}

/** Sign number from an exactly-wrapped longitude. See {@link wrapLongitudeExact}. */
export function signNumberForLongitudeExact(longitude: number): number {
  return Math.floor(wrapLongitudeExact(longitude) / 30) + 1
}

export function getDrikBodyForSwissId(id: number): AstronomyBody {
  const found = (Object.entries(BODY_IDS) as Array<[Exclude<AstronomyBody, 'Ketu'>, number]>)
    .find(([, bodyId]) => bodyId === id)
  if (!found) throw new RangeError(`Unsupported Swiss Ephemeris body ID: ${id}`)
  return found[0]
}

/** Retains the previous local-civil-time → UT Julian-day arithmetic exactly. */
export function drikBirthInputToJulianDay(input: BirthInput): number {
  const [year, month, day] = input.date.split('-').map(Number)
  const { secondsSinceMidnight } = parseBirthTime(input.time)
  const decimalHours = secondsSinceMidnight / 3600
  const ut = decimalHours - input.timezone

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
 * Drik Gochar inputs historically carry whole UTC seconds. Keep that contract:
 * callers may give a Date with milliseconds, but they do not alter the Julian
 * day fed into existing ingress scans.
 */
export function drikDateToJulianDay(date: Date): number {
  return swisseph.swe_julday(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
    date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600,
    swisseph.SE_GREG_CAL
  )
}

export function drikJulianDayToDate(julianDay: number, precision: 'second' | 'millisecond' = 'second'): Date {
  const r = swisseph.swe_revjul(julianDay, swisseph.SE_GREG_CAL) as {
    year: number
    month: number
    day: number
    hour: number
  }
  const hour = Math.floor(r.hour)
  const minuteFloat = (r.hour - hour) * 60
  const minute = Math.floor(minuteFloat)
  const secondFloat = (minuteFloat - minute) * 60
  if (precision === 'second') {
    return new Date(Date.UTC(r.year, r.month - 1, r.day, hour, minute, Math.round(secondFloat)))
  }
  const second = Math.floor(secondFloat)
  const milliseconds = Math.round((secondFloat - second) * 1000)
  return new Date(Date.UTC(r.year, r.month - 1, r.day, hour, minute, second, milliseconds))
}

/** Legacy rounded-second local civil conversion used by the Varshaphal façade. */
export function drikJulianDayToLocalCivil(
  julianDay: number,
  timezoneHours: number
): {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
  date: string
  time: string
  weekday: number
} {
  const local = swisseph.swe_revjul(
    julianDay + timezoneHours / 24,
    swisseph.SE_GREG_CAL
  ) as { year: number; month: number; day: number; hour: number }
  let year = local.year
  let month = local.month
  let day = local.day
  let totalSeconds = Math.round(local.hour * 3600)
  if (totalSeconds >= 86_400) {
    totalSeconds -= 86_400
    const next = new Date(Date.UTC(year, month - 1, day + 1))
    year = next.getUTCFullYear()
    month = next.getUTCMonth() + 1
    day = next.getUTCDate()
  }
  const hour = Math.floor(totalSeconds / 3600)
  const minute = Math.floor((totalSeconds % 3600) / 60)
  const second = totalSeconds % 60
  const pad = (value: number) => String(value).padStart(2, '0')
  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    date: `${year}-${pad(month)}-${pad(day)}`,
    time: `${pad(hour)}:${pad(minute)}:${pad(second)}`,
    weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
  }
}

/**
 * Unwrapped Swiss Ephemeris sample. Each caller then applies its own historical
 * wrap convention: the natal path uses {@link wrapLongitudeExact}, the
 * transit/Gochar accessor {@link rawLongitudeAt} uses {@link normalizeLongitude}.
 */
function swissLongitudeAt(
  julianDay: number,
  body: Exclude<AstronomyBody, 'Ketu'>
): AstronomyLongitudeSample {
  setLahiriSiderealMode()
  const result = swisseph.swe_calc_ut(
    julianDay,
    BODY_IDS[body],
    swisseph.SEFLG_SWIEPH | swisseph.SEFLG_SIDEREAL | swisseph.SEFLG_SPEED
  ) as { longitude?: number; latitude?: number; longitudeSpeed?: number; error?: string }
  if (result.error) throw new Error(`Planet calculation failed for ${body}: ${result.error}`)
  return {
    longitude: result.longitude ?? 0,
    latitude: result.latitude ?? 0,
    longitudeSpeed: result.longitudeSpeed ?? 0,
  }
}

function rawLongitudeAt(julianDay: number, body: AstronomyBody): AstronomyLongitudeSample {
  if (body === 'Ketu') {
    const rahu = rawLongitudeAt(julianDay, 'Rahu')
    return {
      longitude: normalizeLongitude(rahu.longitude + 180),
      longitudeSpeed: rahu.longitudeSpeed,
      latitude: -rahu.latitude,
    }
  }
  const sample = swissLongitudeAt(julianDay, body)
  return { ...sample, longitude: normalizeLongitude(sample.longitude) }
}

function computeDrikAscendant(julianDay: number, latitude: number, longitude: number): AstronomyAscendant {
  setLahiriSiderealMode()
  const result = swisseph.swe_houses_ex(
    julianDay,
    swisseph.SEFLG_SIDEREAL,
    latitude,
    longitude,
    'W'
  ) as { ascendant?: number; error?: string }
  if (result.error) throw new Error(`Ascendant computation failed: ${result.error}`)
  const ascendant = wrapLongitudeExact(result.ascendant ?? 0)
  const signNumber = signNumberForLongitudeExact(ascendant)
  return {
    longitude: ascendant,
    sign: SIGNS[signNumber - 1],
    signNumber,
    degreeInSign: ascendant % 30,
  }
}

function computeDrikPlanets(julianDay: number, lagnaSignNumber: number): PlanetPosition[] {
  const positions = BODY_ORDER.map((body): PlanetPosition => {
    const sample = swissLongitudeAt(julianDay, body)
    const longitude = wrapLongitudeExact(sample.longitude)
    const signNumber = signNumberForLongitudeExact(longitude)
    return {
      planet: body,
      longitude,
      latitude: sample.latitude,
      speed: sample.longitudeSpeed,
      retrograde: sample.longitudeSpeed < 0,
      sign: SIGNS[signNumber - 1],
      signNumber,
      degreeInSign: longitude % 30,
      house: ((signNumber - lagnaSignNumber + 12) % 12) + 1,
    }
  })
  const rahu = positions.find((position) => position.planet === 'Rahu')
  if (!rahu) throw new Error('Rahu position could not be computed')
  const ketuLongitude = wrapLongitudeExact(rahu.longitude + 180)
  const ketuSignNumber = signNumberForLongitudeExact(ketuLongitude)
  positions.push({
    planet: 'Ketu',
    longitude: ketuLongitude,
    latitude: -rahu.latitude,
    speed: rahu.speed,
    retrograde: true,
    sign: SIGNS[ketuSignNumber - 1],
    signNumber: ketuSignNumber,
    degreeInSign: ketuLongitude % 30,
    house: ((ketuSignNumber - lagnaSignNumber + 12) % 12) + 1,
  })
  return positions
}

export const DRIK_PRECISE_SUNRISE_SEARCH_ORIGIN_OFFSET_DAYS = -1

/**
 * External astronomical sunrise instant used by the current Drik path.
 *
 * The retained legacy query starts one day before birth so a pre-sunrise birth
 * resolves the preceding sunrise. It preserves the established 06:00 fallback
 * when a native rise result is absent. It deliberately does not claim a bounded
 * polar-day/night contract: the strict 72-hour failure behavior is Task 4's SSS
 * capability and must not be inferred from this legacy implementation.
 */
export function computeDrikSunriseInstant(
  julianDay: number,
  latitude: number,
  longitude: number,
  timezoneHours = 0,
  mode: 'precise' | 'jhora' = 'precise'
): { sunriseJulianDay: number; sunriseFallback: boolean } {
  setLahiriSiderealMode()
  const sixAmJulianDay = (): number => {
    const birthLocal = swisseph.swe_revjul(
      julianDay + timezoneHours / 24,
      swisseph.SE_GREG_CAL
    ) as { year: number; month: number; day: number }
    return swisseph.swe_julday(
      birthLocal.year,
      birthLocal.month,
      birthLocal.day,
      6 - timezoneHours,
      swisseph.SE_GREG_CAL
    )
  }

  let sunriseJulianDay: number
  let sunriseFallback = false
  if (mode === 'jhora') {
    sunriseJulianDay = sixAmJulianDay()
  } else {
    sunriseJulianDay = -1
    try {
      const rise = swisseph.swe_rise_trans(
        julianDay + DRIK_PRECISE_SUNRISE_SEARCH_ORIGIN_OFFSET_DAYS,
        swisseph.SE_SUN,
        '',
        swisseph.SEFLG_SWIEPH,
        (swisseph as { SE_CALC_RISE: number }).SE_CALC_RISE,
        longitude,
        latitude,
        0,
        0,
        0
      ) as { transitTime?: number }
      if (typeof rise.transitTime === 'number') sunriseJulianDay = rise.transitTime
    } catch {
      // Preserve the legacy 06:00 fallback until Task 4 changes the contract.
    }
    if (sunriseJulianDay < 0) {
      sunriseJulianDay = sixAmJulianDay()
      sunriseFallback = true
    }
  }

  return { sunriseJulianDay, sunriseFallback }
}

/**
 * Compatibility wrapper for legacy callers that need a Drik Sun at the
 * returned instant. New orchestration code must use the external instant and
 * ask its active astronomy provider for the Sun longitude instead.
 */
export function computeDrikSunrise(
  julianDay: number,
  latitude: number,
  longitude: number,
  timezoneHours = 0,
  mode: 'precise' | 'jhora' = 'precise'
): { sunriseJulianDay: number; sunLongitudeAtSunrise: number; sunriseFallback: boolean } {
  const sunrise = computeDrikSunriseInstant(julianDay, latitude, longitude, timezoneHours, mode)
  return {
    ...sunrise,
    sunLongitudeAtSunrise: rawLongitudeAt(sunrise.sunriseJulianDay, 'Sun').longitude,
  }
}

export function siderealDrikSunLongitude(julianDay: number): number {
  return rawLongitudeAt(julianDay, 'Sun').longitude
}

export function findDrikSolarReturnJulianDay(natalSunLongitude: number, seedJulianDay: number): number {
  const sunMeanMotion = 0.9856076686
  let julianDay = seedJulianDay
  for (let iteration = 0; iteration < 40; iteration++) {
    const longitude = siderealDrikSunLongitude(julianDay)
    const difference = (((natalSunLongitude - longitude) % 360) + 540) % 360 - 180
    if (Math.abs(difference) < 1e-8) break
    julianDay += difference / sunMeanMotion
  }
  return julianDay
}

export const drikLahiriProvider: AstronomyProvider = Object.freeze({
  profile: DRIK_LAHIRI_V1,
  birthInputToJulianDay: drikBirthInputToJulianDay,
  dateToJulianDay: drikDateToJulianDay,
  julianDayToDate: drikJulianDayToDate,
  getAyanamsa(julianDay: number): number {
    setLahiriSiderealMode()
    return swisseph.swe_get_ayanamsa_ut(julianDay)
  },
  computeAscendant: computeDrikAscendant,
  computePlanets: computeDrikPlanets,
  longitudeAt: rawLongitudeAt,
})
