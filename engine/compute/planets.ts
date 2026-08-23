/**
 * Compatibility façade for the historic Drik/Lahiri helpers.
 *
 * New profile-aware code must use `astronomy/` directly. This module remains so
 * existing derived modules (notably Varshaphal) retain their public imports
 * while the Swiss-Ephemeris implementation lives in one provider module.
 */

import {
  computeDrikSunrise,
  drikBirthInputToJulianDay,
  drikJulianDayToLocalCivil,
  drikLahiriProvider,
  findDrikSolarReturnJulianDay,
  SIGNS,
  siderealDrikSunLongitude,
} from './astronomy/drikLahiri'
import type { BirthInput, PlanetPosition } from './types'

export function birthInputToJulianDay(input: BirthInput): number {
  return drikBirthInputToJulianDay(input)
}

export function computeAscendant(
  julianDay: number,
  latitude: number,
  longitude: number
): { longitude: number; sign: string; signNumber: number; degreeInSign: number } {
  return drikLahiriProvider.computeAscendant(julianDay, latitude, longitude)
}

export function computePlanetPositions(julianDay: number, lagnaSignNumber: number): PlanetPosition[] {
  return drikLahiriProvider.computePlanets(julianDay, lagnaSignNumber)
}

export const computeSunrise = computeDrikSunrise

export const siderealSunLongitude = siderealDrikSunLongitude

export const findSolarReturnJulianDay = findDrikSolarReturnJulianDay

/**
 * Converts an arbitrary UT Julian day to civil local time. The legacy public
 * contract intentionally rounds to nearest second and emits HH:MM:SS.
 */
export function julianDayToLocalCivil(
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
  return drikJulianDayToLocalCivil(julianDay, timezoneHours)
}

export function getAyanamsa(julianDay: number): number {
  return drikLahiriProvider.getAyanamsa(julianDay)
}

export function getSignName(signNumber: number): string {
  return SIGNS[((signNumber - 1) % 12 + 12) % 12]
}

export function longitudeToSign(longitude: number): number {
  return Math.floor((((longitude % 360) + 360) % 360) / 30) + 1
}

export { SIGNS }
