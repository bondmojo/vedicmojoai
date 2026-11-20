/**
 * engine/compute/varshaphalDashas.test.ts — Mudda dasha and the natal
 * Vimshottari slice for a Varsha year. Hand-built inputs, no ephemeris.
 */

import { describe, expect, it } from 'vitest'
import { computeVimshottari } from '../computeVimshottari'
import { computeMuddaDasha, sliceNatalVimshottari } from './varshaphalDashas'

const SPAN = 360 / 27
const DAY_MS = 86_400_000

/** Vimshottari order and years, written out here independently of constants.ts. */
const ORDER = ['Ketu', 'Venus', 'Sun', 'Moon', 'Mars', 'Rahu', 'Jupiter', 'Saturn', 'Mercury']
const YEARS: Record<string, number> = {
  Ketu: 7, Venus: 20, Sun: 6, Moon: 10, Mars: 7, Rahu: 18, Jupiter: 16, Saturn: 19, Mercury: 17,
}

/** Classical Mudda rule: (Janma nakshatra number + years − 2) mod 9, 0 = Venus. */
const CLASSICAL = ['Venus', 'Sun', 'Moon', 'Mars', 'Rahu', 'Jupiter', 'Saturn', 'Mercury', 'Ketu']
function classicalStartLord(nakshatraNumber: number, age: number): string {
  return CLASSICAL[(((nakshatraNumber + age - 2) % 9) + 9) % 9]
}

const YEAR_START = new Date('2026-04-27T12:00:00.000Z')
const YEAR_END = new Date(YEAR_START.getTime() + 365.25 * DAY_MS)
const msOf = (iso: string) => Date.parse(iso)

describe('computeMuddaDasha — starting lord', () => {
  it('follows the classical (nakshatra + years − 2) mod 9 rule for all 27 nakshatras', () => {
    for (let n = 1; n <= 27; n++) {
      const lon = (n - 1) * SPAN + SPAN / 2
      for (let age = 0; age <= 40; age++) {
        const m = computeMuddaDasha(lon, age, YEAR_START, YEAR_END)
        expect(m.janmaNakshatraNumber).toBe(n)
        expect(m.startLord).toBe(classicalStartLord(n, age))
      }
    }
  })

  it('starts with the natal nakshatra lord and natal balance at age 0', () => {
    // A quarter through Rohini (Moon's nakshatra): 75% of the Moon period left.
    const lon = 3 * SPAN + SPAN / 4
    const m = computeMuddaDasha(lon, 0, YEAR_START, YEAR_END)
    expect(m.janmaNakshatra).toBe('Rohini')
    expect(m.startLord).toBe('Moon')
    expect(m.balanceFraction).toBeCloseTo(0.75, 10)
  })
})

describe('computeMuddaDasha — periods', () => {
  const lon = 3 * SPAN + SPAN / 4 // Rohini, 75% left
  const m = computeMuddaDasha(lon, 0, YEAR_START, YEAR_END)
  const perYearDays = 365.25 / 120

  it('tiles the year exactly, with no gaps', () => {
    expect(m.periods[0].start).toBe(YEAR_START.toISOString())
    expect(m.periods[m.periods.length - 1].end).toBe(YEAR_END.toISOString())
    for (let i = 1; i < m.periods.length; i++) {
      expect(m.periods[i].start).toBe(m.periods[i - 1].end)
    }
    expect(m.yearDays).toBeCloseTo(365.25, 4)
  })

  it('runs in Vimshottari order from the starting lord, which returns to close the year', () => {
    const start = ORDER.indexOf('Moon')
    const expected = Array.from({ length: 10 }, (_, i) => ORDER[(start + i) % 9])
    expect(m.periods.map((p) => p.lord)).toEqual(expected)
    expect(m.periods.map((p) => p.portion)).toEqual([
      'balance', 'full', 'full', 'full', 'full', 'full', 'full', 'full', 'full', 'remainder',
    ])
  })

  it('gives each full period its Vimshottari share, and splits the starting lord by the balance', () => {
    for (const p of m.periods.filter((x) => x.portion === 'full')) {
      expect(p.days).toBeCloseTo(YEARS[p.lord] * perYearDays, 3)
    }
    const moonDays = 10 * perYearDays
    expect(m.periods[0].days).toBeCloseTo(0.75 * moonDays, 3)
    expect(m.periods[9].days).toBeCloseTo(0.25 * moonDays, 3)
  })

  it('reproduces the classical 360-day table when the year is 360 days', () => {
    const end360 = new Date(YEAR_START.getTime() + 360 * DAY_MS)
    // Moon at the very start of Krittika (Sun): a full Sun period opens the year.
    const m360 = computeMuddaDasha(2 * SPAN, 0, YEAR_START, end360)
    const days = Object.fromEntries(m360.periods.map((p) => [p.lord, Math.round(p.days)]))
    expect(days).toEqual({
      Sun: 18, Moon: 30, Mars: 21, Rahu: 54, Jupiter: 48, Saturn: 57, Mercury: 51, Ketu: 21, Venus: 60,
    })
  })

  it('has nine periods and no remainder when the Moon is at the start of its nakshatra', () => {
    const full = computeMuddaDasha(2 * SPAN, 0, YEAR_START, YEAR_END)
    expect(full.balanceFraction).toBe(1)
    expect(full.periods).toHaveLength(9)
    expect(full.periods[0].portion).toBe('full')
    expect(full.periods.some((p) => p.portion === 'remainder')).toBe(false)
  })

  it('tiles every period with antardashas, a full one starting with its own lord', () => {
    for (const p of m.periods) {
      expect(p.antardashas[0].start).toBe(p.start)
      expect(p.antardashas[p.antardashas.length - 1].end).toBe(p.end)
      for (let i = 1; i < p.antardashas.length; i++) {
        expect(p.antardashas[i].start).toBe(p.antardashas[i - 1].end)
      }
    }
    for (const p of m.periods.filter((x) => x.portion === 'full')) {
      expect(p.antardashas).toHaveLength(9)
      expect(p.antardashas[0].lord).toBe(p.lord)
      for (const a of p.antardashas) {
        expect(a.days).toBeCloseTo((p.days * YEARS[a.lord]) / 120, 3)
      }
    }
  })

  it('returns no periods for an empty year or an unusable Moon, without throwing', () => {
    expect(computeMuddaDasha(lon, 0, YEAR_START, YEAR_START).periods).toEqual([])
    expect(computeMuddaDasha(Number.NaN, 0, YEAR_START, YEAR_END).periods).toEqual([])
  })
})

describe('sliceNatalVimshottari', () => {
  const tree = computeVimshottari(42.77, new Date('1990-04-27T06:30:00.000Z'))
  const slice = sliceNatalVimshottari(tree, YEAR_START, YEAR_END)
  const window = { start: YEAR_START.getTime(), end: YEAR_END.getTime() }

  it('lists every antardasha and pratyantardasha overlapping the year, in order', () => {
    const overlaps = (p: { start: string; end: string }) =>
      msOf(p.start) < window.end && msOf(p.end) > window.start

    const expectedAds = tree.mahadashas.flatMap((md) =>
      md.antardashas.filter((ad) => ad.start.getTime() < window.end && ad.end.getTime() > window.start)
    )
    expect(slice.antardashas).toHaveLength(expectedAds.length)
    expect(slice.antardashas.every(overlaps)).toBe(true)
    expect(slice.pratyantardashas.every(overlaps)).toBe(true)

    // Contiguous and covering the whole year.
    const pds = slice.pratyantardashas
    expect(msOf(pds[0].start)).toBeLessThanOrEqual(window.start)
    expect(msOf(pds[pds.length - 1].end)).toBeGreaterThanOrEqual(window.end)
    for (let i = 1; i < pds.length; i++) expect(pds[i].start).toBe(pds[i - 1].end)
  })

  it('names the chain running at the Varsha Pravesh', () => {
    const md = tree.mahadashas.find((p) => p.start.getTime() <= window.start && window.start < p.end.getTime())!
    const ad = md.antardashas.find((p) => p.start.getTime() <= window.start && window.start < p.end.getTime())!
    const pd = ad.pratyantardashas.find((p) => p.start.getTime() <= window.start && window.start < p.end.getTime())!
    expect(slice.atVarshaPravesh).toEqual({ mahadasha: md.lord, antardasha: ad.lord, pratyantardasha: pd.lord })
  })

  it('returns nothing for a year outside the 120-year tree', () => {
    const late = sliceNatalVimshottari(tree, new Date('2200-01-01T00:00:00Z'), new Date('2201-01-01T00:00:00Z'))
    expect(late).toEqual({ atVarshaPravesh: null, antardashas: [], pratyantardashas: [] })
  })
})
