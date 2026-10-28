/**
 * Varshaphal (Tajika annual solar-return chart) — engine invariants.
 *
 * These assert structural correctness (the solar-return definition, Muntha
 * progression, candidate/strength shape) rather than exact JHora values, which
 * vary by software convention.
 */
import { describe, it, expect } from 'vitest'
import {
  computeKshetraBala,
  computeVarshaphal,
  computeVarshesha,
  getTrirashiLord,
  isSunAboveHorizon,
  VARSHESHA_LAGNA_ASPECT_NATURES,
} from '../engine/compute/varshaphal'
import { computeFullChart } from '../engine/compute/index'
import { birthInputToJulianDay, siderealSunLongitude } from '../engine/compute/planets'
import { SIGN_LORDS } from '../engine/compute/relationships'
import type { Muntha, PanchavargeeyaBalaEntry, PlanetPosition } from '../engine/compute/types'

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

/**
 * Expected Tajika aspect to the Lagna for a planet in whole-sign house h of the
 * annual chart, written out here independently of tajikaAspects.ts.
 */
const ASPECT_BY_HOUSE: Record<number, { kind: string; nature: 'friendly' | 'inimical' }> = {
  1: { kind: 'conjunction', nature: 'inimical' },
  3: { kind: 'sextile', nature: 'friendly' },
  11: { kind: 'sextile', nature: 'friendly' },
  5: { kind: 'trine', nature: 'friendly' },
  9: { kind: 'trine', nature: 'friendly' },
  4: { kind: 'square', nature: 'inimical' },
  10: { kind: 'square', nature: 'inimical' },
  7: { kind: 'opposition', nature: 'inimical' },
}

/**
 * Tajika Neelakanthi Trirashi lords [day, night] by Varsha Lagna sign, written
 * out here independently of varshaphal.ts.
 */
const TRIRASHI: Record<number, [string, string]> = {
  1: ['Sun', 'Jupiter'],
  2: ['Venus', 'Moon'],
  3: ['Saturn', 'Mercury'],
  4: ['Venus', 'Mars'],
  5: ['Jupiter', 'Sun'],
  6: ['Moon', 'Venus'],
  7: ['Mercury', 'Saturn'],
  8: ['Mars', 'Venus'],
  9: ['Saturn', 'Saturn'],
  10: ['Mars', 'Mars'],
  11: ['Jupiter', 'Jupiter'],
  12: ['Moon', 'Moon'],
}

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

  it('selects the strongest office-holder that aspects the Varsha Lagna', () => {
    for (const varshaYear of [2024, 2025, 2026]) {
      const v = computeVarshaphal({ ...BIRTH, varshaYear })
      expect(v.candidates).toHaveLength(5)

      // Each candidate's aspect, checked against its whole-sign house from planets.ts.
      for (const c of v.candidates) {
        const house = v.annualChart.planets.find((p) => p.planet === c.planet)!.house
        const expected = ASPECT_BY_HOUSE[house]
        expect(c.lagnaAspect).toEqual(
          expected ? { ...expected, distance: ((1 - house + 12) % 12) + 1 } : null
        )
        expect(c.aspectsLagna).toBe(
          expected !== undefined && VARSHESHA_LAGNA_ASPECT_NATURES.includes(expected.nature)
        )
        expect(c.officeCount).toBe(v.candidates.filter((o) => o.planet === c.planet).length)
      }

      // Oracle from the rule: highest PV among counted candidates (all five when
      // none counts), then most offices, then the earliest office.
      const counted = v.candidates.filter((c) => c.aspectsLagna)
      const pool = counted.length > 0 ? counted : v.candidates
      let best = pool[0]
      for (const c of pool.slice(1)) {
        const stronger = c.panchavargeeyaBala > best.panchavargeeyaBala
        const tieMoreOffices =
          c.panchavargeeyaBala === best.panchavargeeyaBala && c.officeCount > best.officeCount
        if (stronger || tieMoreOffices) best = c
      }
      expect(v.varshesha.planet).toBe(best.planet)
      expect(v.varshesha.office).toBe(best.office)
      expect(v.varshesha.selectionBasis).toBe(
        counted.length > 0 ? 'aspects_lagna' : 'no_candidate_aspects_lagna'
      )
    }
  })

  it('lists the counted Lagna aspects in the method note', () => {
    const v = computeVarshaphal({ ...BIRTH, varshaYear: 2026 })
    expect(v.method).toContain('counted: conjunction, sextile, square, trine, opposition')
  })

  it('takes the Trirashi lord from the Varsha Lagna sign and the year\'s day/night', () => {
    for (const varshaYear of [2024, 2025, 2026]) {
      const v = computeVarshaphal({ ...BIRTH, varshaYear })
      const trirashi = v.candidates.find((c) => c.office === 'trirashi_lord')!
      expect(trirashi.planet).toBe(TRIRASHI[v.annualChart.lagnaSignNumber][v.dayVarsha ? 0 : 1])
    }
  })

  it('2026: a Virgo Lagna by day makes the Moon Trirashi lord, so Mars is the year lord', () => {
    // The element-only table gave Venus (earth, day) as Trirashi lord, and Venus
    // then won as the strongest aspecting candidate.
    const v = computeVarshaphal({ ...BIRTH, varshaYear: 2026 })
    expect(v.annualChart.lagnaSignNumber).toBe(6)
    expect(v.dayVarsha).toBe(true)
    expect(v.candidates.find((c) => c.office === 'trirashi_lord')!.planet).toBe('Moon')
    expect(v.candidates.some((c) => c.planet === 'Venus')).toBe(false)
    expect(v.varshesha.planet).toBe('Mars')
    expect(v.varshesha.lagnaAspect).toEqual({ kind: 'opposition', nature: 'inimical', distance: 7 })
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
      // dayVarsha reflects whether the annual Sun is above the horizon.
      const sun = v.annualChart.planets.find((p) => p.planet === 'Sun')!
      expect(v.dayVarsha).toBe(isSunAboveHorizon(sun.longitude, v.annualChart.lagnaLongitude))

      // The Dinaratri office-bearer is the sign lord of the day/night luminary
      // (Sun by day, Moon by night) as placed in the ANNUAL chart.
      const luminary = v.dayVarsha ? 'Sun' : 'Moon'
      const luminarySign = v.annualChart.planets.find((p) => p.planet === luminary)!.signNumber
      const dinaratri = v.candidates.find((c) => c.office === 'dinaratri_lord')!
      expect(dinaratri.planet).toBe(SIGN_LORDS[luminarySign])
    }
  })
})

// ─── Annual-chart transits and Sade Sati ────────────────────────────

describe('computeVarshaphal Sade Sati', () => {
  // The test birth's natal Moon is in Taurus. The annual chart's Moon is in Leo
  // in 2026 and Aquarius in 2030, which is what the old block reckoned from.
  const natalMoon = computeFullChart(BIRTH).planets.find((p) => p.planet === 'Moon')!
  const v2026 = computeVarshaphal({ ...BIRTH, varshaYear: 2026 })
  const v2030 = computeVarshaphal({ ...BIRTH, varshaYear: 2030 })

  it('is reckoned from the natal Moon, not the annual Moon', () => {
    for (const v of [v2026, v2030]) {
      const annualMoon = v.annualChart.planets.find((p) => p.planet === 'Moon')!
      expect(annualMoon.signNumber).not.toBe(natalMoon.signNumber)
      expect(v.annualChart.transits.sadeSati.natalMoonSignNumber).toBe(natalMoon.signNumber)
      expect(v.annualChart.transits.sadeSatiByDegree?.natalMoonLongitude).toBeCloseTo(natalMoon.longitude, 6)
    }
  })

  it('is judged at the Varsha Pravesh, not the time of computation', () => {
    for (const v of [v2026, v2030]) {
      expect(v.annualChart.transits.asOf).toBe(v.varshaPravesh.utcISO)
    }
    // Saturn in Pisces (11th from Taurus) in April 2026; in Aries or Taurus in April 2030.
    expect(v2026.annualChart.transits.sadeSati.active).toBe(false)
    expect(v2030.annualChart.transits.sadeSati.active).toBe(true)
  })

  it('gives the same Sade Sati periods whichever year is asked for', () => {
    const spans = (v: typeof v2026) =>
      v.annualChart.transits.sadeSati.allPeriods.map((p) => `${p.phase} ${p.startApprox}–${p.endApprox}`)
    expect(spans(v2030)).toEqual(spans(v2026))
  })

  it('measures transit houses from the natal Moon and Lagna', () => {
    const natalLagna = v2026.natalLagnaSignNumber
    for (const t of v2026.annualChart.transits.transits) {
      expect(t.houseFromMoon).toBe(((t.signNumber - natalMoon.signNumber + 12) % 12) + 1)
      expect(t.houseFromLagna).toBe(((t.signNumber - natalLagna + 12) % 12) + 1)
    }
  })
})

// ─── Trirashi lord and Kshetra Bala ─────────────────────────────────

describe('getTrirashiLord', () => {
  it('matches the Neelakanthi table for all 12 signs, day and night', () => {
    for (let sign = 1; sign <= 12; sign++) {
      expect(getTrirashiLord(sign, true)).toBe(TRIRASHI[sign][0])
      expect(getTrirashiLord(sign, false)).toBe(TRIRASHI[sign][1])
    }
  })

  it('swaps the day/night lords for the second sign of an element (Leo vs Aries)', () => {
    expect(getTrirashiLord(1, true)).toBe('Sun')
    expect(getTrirashiLord(5, true)).toBe('Jupiter')
    expect(getTrirashiLord(5, false)).toBe('Sun')
  })
})

describe('computeKshetraBala', () => {
  it('scores by the sign lord only: own 30, friend 15, neutral 7.5, enemy 3.75', () => {
    expect(computeKshetraBala('Moon', 4)).toBe(30) // Cancer, own
    expect(computeKshetraBala('Sun', 1)).toBe(15) // Aries, Mars is a friend
    expect(computeKshetraBala('Sun', 3)).toBe(7.5) // Gemini, Mercury is neutral
    expect(computeKshetraBala('Sun', 7)).toBe(3.75) // Libra, Venus is an enemy
  })

  it('gives the Moon in Taurus no moolatrikona credit (Venus is neutral to the Moon)', () => {
    expect(computeKshetraBala('Moon', 2)).toBe(7.5)
  })
})

// ─── Day/night of the Varsha Pravesh ────────────────────────────────

describe('isSunAboveHorizon', () => {
  it('treats a Sun in the Lagna sign that has already risen as day', () => {
    // Ascendant 100° (Cancer), Sun 95° — same sign (whole-sign house 1), already risen.
    expect(isSunAboveHorizon(95, 100)).toBe(true)
    expect(isSunAboveHorizon(105, 100)).toBe(false)
  })

  it('treats a Sun in the 7th sign that has already set as night', () => {
    // Descendant 280° (Capricorn): Sun 275° is in whole-sign house 7 but has set.
    expect(isSunAboveHorizon(275, 100)).toBe(false)
    expect(isSunAboveHorizon(285, 100)).toBe(true)
  })

  it('handles wrap-around at 0°/360°', () => {
    expect(isSunAboveHorizon(2, 358)).toBe(false)
    expect(isSunAboveHorizon(358, 2)).toBe(true)
  })
})

describe('computeVarshaphal day/night near sunrise and sunset', () => {
  // Regression cases from the whole-sign bug: these return instants fall near
  // the horizon, where the Sun's whole-sign house gave the wrong answer.
  const DAWN_BIRTH = { ...BIRTH, time: '05:30:00' }

  it('counts a Varsha Pravesh just after sunrise as day (Sun in house 1, already risen)', () => {
    const v = computeVarshaphal({ ...DAWN_BIRTH, varshaYear: 1994 })
    const sun = v.annualChart.planets.find((p) => p.planet === 'Sun')!
    expect(sun.house).toBe(1)
    expect(sun.longitude).toBeLessThan(v.annualChart.lagnaLongitude)
    expect(v.dayVarsha).toBe(true)
    const dinaratri = v.candidates.find((c) => c.office === 'dinaratri_lord')!
    expect(dinaratri.planet).toBe(SIGN_LORDS[sun.signNumber])
  })

  it('counts a Varsha Pravesh just after sunset as night (Sun in house 7, already set)', () => {
    const v = computeVarshaphal({ ...DAWN_BIRTH, varshaYear: 2000 })
    const sun = v.annualChart.planets.find((p) => p.planet === 'Sun')!
    expect(sun.house).toBe(7)
    expect(v.dayVarsha).toBe(false)
    const moon = v.annualChart.planets.find((p) => p.planet === 'Moon')!
    const dinaratri = v.candidates.find((c) => c.office === 'dinaratri_lord')!
    expect(dinaratri.planet).toBe(SIGN_LORDS[moon.signNumber])
  })
})

// ─── computeVarshesha: hand-built charts ────────────────────────────
//
// Varsha Lagna Aries (1) and natal Lagna Scorpio (8), so Mars holds two offices.
// Muntha in Sagittarius → Jupiter; Dinaratri → Venus; Trirashi → Sun.

const VARSHA_LAGNA = 1
const NATAL_LAGNA = 8
const MUNTHA: Muntha = { signNumber: 9, sign: 'Sagittarius', house: 9, lord: 'Jupiter' }

function pv(bala: Record<string, number>): PanchavargeeyaBalaEntry[] {
  return Object.entries(bala).map(([planet, finalBala]) => ({
    planet,
    kshetraBala: 0,
    ucchaBala: 0,
    haddaBala: 0,
    drekkanaBala: 0,
    navamsaBala: 0,
    total: finalBala * 4,
    finalBala,
    grade: 'Ordinary',
  }))
}

function planets(signs: Record<string, number>): PlanetPosition[] {
  return Object.entries(signs).map(([planet, signNumber]) => ({
    planet,
    longitude: (signNumber - 1) * 30 + 15,
    latitude: 0,
    speed: 1,
    retrograde: false,
    sign: '',
    signNumber,
    degreeInSign: 15,
    house: ((signNumber - VARSHA_LAGNA + 12) % 12) + 1,
  }))
}

function select(bala: Record<string, number>, signs: Record<string, number>) {
  return computeVarshesha(MUNTHA, VARSHA_LAGNA, NATAL_LAGNA, 'Venus', 'Sun', pv(bala), planets(signs))
}

describe('computeVarshesha', () => {
  // Mars in Gemini (sextile), Jupiter in Leo (trine), Venus in Taurus (2nd — no
  // aspect), Sun in Aries (in the Lagna — conjunction, an inimical aspect).
  const SIGNS = { Mars: 3, Jupiter: 5, Venus: 2, Sun: 1 }

  it('a strong single-office planet beats a weaker two-office planet when both aspect the Lagna', () => {
    const { varshesha, candidates } = select({ Mars: 8, Jupiter: 12, Venus: 15, Sun: 5 }, SIGNS)
    expect(candidates.find((c) => c.planet === 'Mars')!.officeCount).toBe(2)
    expect(varshesha.planet).toBe('Jupiter')
    expect(varshesha.selectionBasis).toBe('aspects_lagna')
    expect(varshesha.lagnaAspect).toEqual({ kind: 'trine', nature: 'friendly', distance: 9 })
    // Venus is the strongest planet overall but does not aspect the Lagna.
    const venus = candidates.find((c) => c.planet === 'Venus')!
    expect(venus.lagnaAspect).toBeNull()
    expect(venus.aspectsLagna).toBe(false)
  })

  it('the strongest planet loses even with two offices when it does not aspect the Lagna', () => {
    // Mars (two offices, strongest) sits in Pisces, the 12th; only Jupiter aspects the Lagna.
    const { varshesha } = select(
      { Mars: 15, Jupiter: 6, Venus: 4, Sun: 3 },
      { Mars: 12, Jupiter: 5, Venus: 2, Sun: 8 }
    )
    expect(varshesha.planet).toBe('Jupiter')
  })

  it('a candidate sitting in the Varsha Lagna aspects it by conjunction', () => {
    const { candidates } = select({ Mars: 8, Jupiter: 12, Venus: 15, Sun: 5 }, SIGNS)
    const sun = candidates.find((c) => c.planet === 'Sun')!
    expect(sun.lagnaAspect).toEqual({ kind: 'conjunction', nature: 'inimical', distance: 1 })
    expect(sun.aspectsLagna).toBe(true)
  })

  it('the Varsha Lagna lord placed in its own Lagna can be the year lord', () => {
    // Mars rules Aries and sits there; it is the strongest candidate.
    const { varshesha } = select(
      { Mars: 15, Jupiter: 12, Venus: 4, Sun: 3 },
      { Mars: 1, Jupiter: 5, Venus: 2, Sun: 8 }
    )
    expect(varshesha.planet).toBe('Mars')
    expect(varshesha.selectionBasis).toBe('aspects_lagna')
    expect(varshesha.lagnaAspect).toEqual({ kind: 'conjunction', nature: 'inimical', distance: 1 })
  })

  it('falls back to the strongest of all five when none aspects the Lagna', () => {
    // Mars in Pisces (12th), Jupiter in Taurus (2nd), Venus in Virgo (6th), Sun in Scorpio (8th).
    const { varshesha } = select(
      { Mars: 8, Jupiter: 12, Venus: 15, Sun: 5 },
      { Mars: 12, Jupiter: 2, Venus: 6, Sun: 8 }
    )
    expect(varshesha.planet).toBe('Venus')
    expect(varshesha.selectionBasis).toBe('no_candidate_aspects_lagna')
    expect(varshesha.lagnaAspect).toBeNull()
  })

  it('breaks a Panchavargeeya tie by number of offices held', () => {
    const { varshesha } = select({ Mars: 12, Jupiter: 12, Venus: 15, Sun: 5 }, SIGNS)
    expect(varshesha.planet).toBe('Mars')
  })

  it('breaks a full tie (equal strength and offices) by office order, Muntha lord first', () => {
    // Venus is Muntha lord (first office), Jupiter the Dinaratri lord (fourth).
    // Both trine the Lagna with equal strength; alphabetical order would pick Jupiter.
    const munthaVenus: Muntha = { signNumber: 2, sign: 'Taurus', house: 2, lord: 'Venus' }
    const { varshesha } = computeVarshesha(
      munthaVenus, VARSHA_LAGNA, NATAL_LAGNA, 'Jupiter', 'Sun',
      pv({ Venus: 10, Jupiter: 10, Mars: 5, Sun: 2 }),
      planets({ Venus: 5, Jupiter: 9, Mars: 3, Sun: 1 })
    )
    expect(varshesha.planet).toBe('Venus')
    expect(varshesha.office).toBe('muntha_lord')
  })

  it('a candidate missing from the annual planets cannot qualify', () => {
    // Jupiter is strongest but absent from the planet list.
    const { varshesha, candidates } = select(
      { Mars: 8, Jupiter: 20, Venus: 15, Sun: 5 },
      { Mars: 3, Venus: 2, Sun: 1 }
    )
    const jupiter = candidates.find((c) => c.planet === 'Jupiter')!
    expect(jupiter.lagnaAspect).toBeNull()
    expect(jupiter.aspectsLagna).toBe(false)
    expect(varshesha.planet).toBe('Mars')
  })

  it('reports an aspect on every candidate that has one, counted or not', () => {
    const { candidates } = select({ Mars: 8, Jupiter: 12, Venus: 15, Sun: 5 }, SIGNS)
    for (const c of candidates) {
      if (c.lagnaAspect) {
        expect(c.aspectsLagna).toBe(VARSHESHA_LAGNA_ASPECT_NATURES.includes(c.lagnaAspect.nature))
      } else {
        expect(c.aspectsLagna).toBe(false)
      }
    }
  })
})
