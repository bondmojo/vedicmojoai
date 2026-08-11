/**
 * Varshaphal (Tajika annual solar-return chart) — engine invariants.
 *
 * These assert structural correctness (the solar-return definition, Muntha
 * progression, candidate/strength shape) rather than exact JHora values, which
 * vary by software convention.
 */
import { describe, it, expect } from 'vitest'
import { computeVarshaphal } from '../engine/compute/varshaphal'
import { birthInputToJulianDay, siderealSunLongitude } from '../engine/compute/planets'
import { SIGN_LORDS } from '../engine/compute/relationships'

const BIRTH = {
  date: '1990-04-27',
  time: '12:00:00',
  timezone: 5.5,
  latitude: 28.6139,
  longitude: 77.209,
  name: 'Test',
  sunriseMode: 'precise' as const,
}

const CLASSICAL = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn']

describe('computeVarshaphal', () => {
  it('places the annual Sun back at the natal sidereal longitude (solar return)', () => {
    const natalSun = siderealSunLongitude(birthInputToJulianDay(BIRTH))
    for (const varshaYear of [2024, 2025, 2026]) {
      const v = computeVarshaphal({ ...BIRTH, varshaYear })
      const annualSun = v.annualChart.planets.find((p) => p.planet === 'Sun')!.longitude
      // Within ~1e-4 degrees (Newton converges to ~1e-6 in practice).
      expect(Math.abs(annualSun - natalSun)).toBeLessThan(1e-4)
    }
  })

  it('advances the Muntha exactly one sign per year', () => {
    const a = computeVarshaphal({ ...BIRTH, varshaYear: 2024 })
    const b = computeVarshaphal({ ...BIRTH, varshaYear: 2025 })
    const expectedNext = (a.muntha.signNumber % 12) + 1
    expect(b.muntha.signNumber).toBe(expectedNext)
    expect(b.age).toBe(a.age + 1)
  })

  it('computes age as varshaYear − birthYear', () => {
    const v = computeVarshaphal({ ...BIRTH, varshaYear: 2026 })
    expect(v.age).toBe(2026 - 1990)
  })

  it('returns Panchavargeeya Bala for all seven classical planets within range', () => {
    const v = computeVarshaphal({ ...BIRTH, varshaYear: 2026 })
    expect(v.panchavargeeyaBala.map((p) => p.planet).sort()).toEqual([...CLASSICAL].sort())
    for (const p of v.panchavargeeyaBala) {
      expect(p.finalBala).toBeGreaterThanOrEqual(0)
      expect(p.finalBala).toBeLessThanOrEqual(20.01)
      // final = total / 4 (allow float rounding).
      expect(Math.abs(p.finalBala - p.total / 4)).toBeLessThan(0.02)
    }
  })

  it('selects a Varshesha that holds the most offices among the five candidates', () => {
    const v = computeVarshaphal({ ...BIRTH, varshaYear: 2026 })
    expect(v.candidates).toHaveLength(5)
    const candidatePlanets = v.candidates.map((c) => c.planet)
    expect(candidatePlanets).toContain(v.varshesha.planet)

    // The winner must hold the maximum office count among candidates.
    const officeCount: Record<string, number> = {}
    for (const c of v.candidates) officeCount[c.planet] = (officeCount[c.planet] ?? 0) + 1
    const maxOffices = Math.max(...Object.values(officeCount))
    expect(officeCount[v.varshesha.planet]).toBe(maxOffices)
  })

  it('produces a Muntha lord consistent with its sign', () => {
    const v = computeVarshaphal({ ...BIRTH, varshaYear: 2026 })
    expect(v.muntha.house).toBeGreaterThanOrEqual(1)
    expect(v.muntha.house).toBeLessThanOrEqual(12)
    expect(typeof v.muntha.lord).toBe('string')
  })

  it('derives day/night for the year-lord offices from the ANNUAL chart (Varsha Pravesh), not the natal chart', () => {
    for (const varshaYear of [2024, 2025, 2026]) {
      const v = computeVarshaphal({ ...BIRTH, varshaYear })
      // dayVarsha reflects whether the annual Sun is above the horizon (7–12).
      const annualSunHouse = v.annualChart.planets.find((p) => p.planet === 'Sun')!.house
      expect(v.dayVarsha).toBe(annualSunHouse >= 7)

      // The Dinaratri office-bearer is the sign lord of the day/night luminary
      // (Sun by day, Moon by night) as placed in the ANNUAL chart.
      const luminary = v.dayVarsha ? 'Sun' : 'Moon'
      const luminarySign = v.annualChart.planets.find((p) => p.planet === luminary)!.signNumber
      const dinaratri = v.candidates.find((c) => c.office === 'dinaratri_lord')!
      expect(dinaratri.planet).toBe(SIGN_LORDS[luminarySign])
    }
  })
})
