/**
 * Shadbala — JHora-alignment changes (docs/computation_varshaphal.md §4–5):
 * Ayana Bala for all planets (Sun doubled), and luminary Cheshta = 0.
 */
import { describe, it, expect } from 'vitest'
import { computeAyanaBala, computeCheshtaBala } from '../engine/compute/shadbala'
import type { PlanetPosition } from '../engine/compute/types'

function pos(planet: string, longitude: number, extra: Partial<PlanetPosition> = {}): PlanetPosition {
  return {
    planet,
    longitude,
    latitude: 0,
    speed: 1,
    retrograde: false,
    sign: 'Aries',
    signNumber: Math.floor(longitude / 30) + 1,
    degreeInSign: longitude % 30,
    house: 1,
    ...extra,
  }
}

describe('computeAyanaBala', () => {
  // ayanamsa = 0 → tropical = sidereal. Max north declination at tropical 90°,
  // max south at 270°.
  it('peaks (doubled) for the Sun at maximum northern declination', () => {
    // North-preferring + Sun doubling → ~120 at tropical 90°.
    expect(computeAyanaBala('Sun', 90, 0)).toBeCloseTo(120, 1)
    // Minimum at max south.
    expect(computeAyanaBala('Sun', 270, 0)).toBeCloseTo(0, 1)
  })

  it('inverts for south-preferring planets (Moon, Saturn)', () => {
    expect(computeAyanaBala('Moon', 270, 0)).toBeCloseTo(60, 1) // south → strong
    expect(computeAyanaBala('Moon', 90, 0)).toBeCloseTo(0, 1)
    expect(computeAyanaBala('Saturn', 270, 0)).toBeCloseTo(60, 1)
  })

  it('gives north-preferring planets strength in the north', () => {
    expect(computeAyanaBala('Jupiter', 90, 0)).toBeCloseTo(60, 1)
    expect(computeAyanaBala('Jupiter', 270, 0)).toBeCloseTo(0, 1)
  })

  it('uses |declination| for Mercury (always gains)', () => {
    expect(computeAyanaBala('Mercury', 90, 0)).toBeCloseTo(60, 1)
    expect(computeAyanaBala('Mercury', 270, 0)).toBeCloseTo(60, 1)
    expect(computeAyanaBala('Mercury', 0, 0)).toBeCloseTo(30, 1) // δ=0
  })

  it('is 0 for the nodes', () => {
    expect(computeAyanaBala('Rahu', 90, 0)).toBe(0)
    expect(computeAyanaBala('Ketu', 90, 0)).toBe(0)
  })

  it('applies the ayanamsa to reach the tropical longitude', () => {
    // Sidereal 66° + 24° ayanamsa = tropical 90° → doubled peak.
    expect(computeAyanaBala('Sun', 66, 24)).toBeCloseTo(120, 0)
  })
})

describe('computeCheshtaBala — luminaries', () => {
  it('returns 0 for the Sun and Moon (JHora)', () => {
    expect(computeCheshtaBala('Sun', pos('Sun', 10), 10)).toBe(0)
    expect(computeCheshtaBala('Moon', pos('Moon', 200), 10)).toBe(0)
  })

  it('still returns 30 for the nodes', () => {
    expect(computeCheshtaBala('Rahu', pos('Rahu', 100), 10)).toBe(30)
    expect(computeCheshtaBala('Ketu', pos('Ketu', 280), 10)).toBe(30)
  })
})
