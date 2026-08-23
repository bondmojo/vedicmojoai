import type { CalculationProfile } from '../profiles'
import type { BirthInput, PlanetPosition } from '../types'

export type AstronomyBody =
  | 'Sun'
  | 'Moon'
  | 'Mars'
  | 'Mercury'
  | 'Jupiter'
  | 'Venus'
  | 'Saturn'
  | 'Rahu'
  | 'Ketu'

export interface AstronomyLongitudeSample {
  readonly longitude: number
  readonly longitudeSpeed: number
  readonly latitude: number
}

export interface AstronomyAscendant {
  readonly longitude: number
  readonly sign: string
  readonly signNumber: number
  readonly degreeInSign: number
}

/**
 * The sole astronomy boundary used by derived chart, Gochar, and transit code.
 * Implementations own their astronomical model; derived modules only consume
 * sidereal longitudes and whole-sign placement.
 */
export interface AstronomyProvider {
  readonly profile: CalculationProfile
  birthInputToJulianDay(input: BirthInput): number
  dateToJulianDay(date: Date): number
  julianDayToDate(julianDayUt: number, precision: 'second' | 'millisecond'): Date
  getAyanamsa(julianDayUt: number): number
  computeAscendant(
    julianDayUt: number,
    latitude: number,
    longitude: number
  ): AstronomyAscendant
  computePlanets(julianDayUt: number, lagnaSignNumber: number): PlanetPosition[]
  longitudeAt(julianDayUt: number, body: AstronomyBody): AstronomyLongitudeSample
}
