/**
 * Vimshottari — Moon exactly on a nakshatra boundary.
 *
 * NAKSHATRA_SPAN_DEG (360/27) rounds up, so `40 / span` rounds to exactly 3
 * (Rohini) while `40 % span` is just under one span. The engine used to take
 * the index from the first and the elapsed fraction from the second, giving a
 * ~0 Moon balance and a Mars MD starting at birth. The correct reading is the
 * start of Rohini: a full 10-year Moon MD.
 *
 * Exact boundaries are reachable: UnifiedChart.moonLongitude is Decimal(8,4)
 * and the analyze route recomputes the tree from it, so 40.0000 arrives as 40.
 */
import { describe, it, expect } from 'vitest'
import { computeVimshottari } from '../engine/computeVimshottari'
import { DASHA_SEQUENCE, YEAR_DAYS } from '../engine/constants'
import type { DashaTree } from '../lib/types'

const BIRTH = new Date('1990-04-27T06:30:00.000Z')
const MS_PER_DAY = 86_400_000
const MS_PER_YEAR = YEAR_DAYS * MS_PER_DAY

const lordOf = (nakshatraIndex: number) => DASHA_SEQUENCE[nakshatraIndex % 9]

/** The MD running one day after birth, which a ~0 birth balance would skip past. */
function runningMd(tree: DashaTree) {
  const t = BIRTH.getTime() + MS_PER_DAY
  return tree.mahadashas.find((md) => md.start.getTime() <= t && t < md.end.getTime())!
}

// Every boundary as the engine sees it: n × (360/27), the same doubles the
// 4-decimal values 40, 80, …, 320 parse to.
const BOUNDARIES = Array.from({ length: 27 }, (_, n) => ({ n, lon: n * (360 / 27) }))

describe('computeVimshottari — Moon exactly on a nakshatra boundary', () => {
  it.each(BOUNDARIES)('n=$n ($lon°) starts the full MD of the new nakshatra lord', ({ n, lon }) => {
    const { lord, years } = lordOf(n)
    const tree = computeVimshottari(lon, BIRTH)
    const md = tree.mahadashas[0]

    expect(md.lord).toBe(lord)
    expect(Math.abs(tree.balance_years - years)).toBeLessThan(1e-9)
    expect(md.start.getTime()).toBe(BIRTH.getTime())
    expect(Math.abs(md.end.getTime() - md.start.getTime() - years * MS_PER_YEAR)).toBeLessThanOrEqual(1)

    // 9 ADs led by the MD lord, in Vimshottari order, starting at birth.
    const first = DASHA_SEQUENCE.findIndex((d) => d.lord === lord)
    expect(md.antardashas.map((ad) => ad.lord)).toEqual(
      Array.from({ length: 9 }, (_, i) => DASHA_SEQUENCE[(first + i) % 9].lord)
    )
    expect(md.antardashas[0].start.getTime()).toBe(BIRTH.getTime())
    expect(md.antardashas[0].duration_days).toBeCloseTo((years * years * YEAR_DAYS) / 120, 6)

    // The next MD is the following lord at full length.
    const next = lordOf(n + 1)
    expect(tree.mahadashas[1].lord).toBe(next.lord)
    expect(tree.mahadashas[1].duration_days).toBe(next.years * YEAR_DAYS)
  })

  it.each(['40.0000', '80.0000', '120.0000', '160.0000', '200.0000', '240.0000', '280.0000', '320.0000'])(
    'a stored Decimal(8,4) moonLongitude of %s gives the full MD',
    (stored) => {
      const lon = Number(stored)
      const n = Math.round(lon / (40 / 3))
      const tree = computeVimshottari(lon, BIRTH)
      expect(runningMd(tree).lord).toBe(lordOf(n).lord)
      expect(Math.abs(tree.balance_years - lordOf(n).years)).toBeLessThan(1e-9)
    }
  )

  it.each(BOUNDARIES.filter(({ n }) => n > 0))(
    'n=$n: the running MD and its end move continuously across the boundary',
    ({ n, lon }) => {
      const trees = [lon - 1e-9, lon, lon + 1e-9].map((l) => computeVimshottari(l, BIRTH))
      const running = trees.map(runningMd)
      for (const md of running) expect(md.lord).toBe(lordOf(n).lord)
      const ends = running.map((md) => md.end.getTime())
      expect(Math.max(...ends) - Math.min(...ends)).toBeLessThan(1000)
    }
  )

  it('handles 0° and the top of Revati', () => {
    const atZero = computeVimshottari(0, BIRTH)
    expect(atZero.mahadashas[0].lord).toBe('Ketu')
    expect(atZero.balance_years).toBe(7)

    const atTop = computeVimshottari(359.9999, BIRTH)
    expect(atTop.mahadashas[0].lord).toBe('Mercury')
    expect(atTop.balance_years).toBeGreaterThan(0)
    expect(atTop.balance_years).toBeLessThan(0.001)
    expect(atTop.mahadashas[1].lord).toBe('Ketu')
  })

  it('matches an exact integer oracle for every 4-decimal longitude near a boundary', () => {
    // lon = k / 10000°, so lon / (40/3) = 3k / 400000 — index and fraction are exact here.
    for (let n = 0; n < 27; n++) {
      const centre = Math.round((n * 400000) / 3)
      for (let k = Math.max(0, centre - 50); k <= Math.min(3_599_999, centre + 50); k++) {
        const lon = k / 10000
        const index = Math.floor((3 * k) / 400000)
        const fraction = ((3 * k) % 400000) / 400000
        const { lord, years } = lordOf(index)

        const tree = computeVimshottari(lon, BIRTH)
        expect(tree.mahadashas[0].lord).toBe(lord)
        expect(Math.abs(tree.balance_years - (1 - fraction) * years)).toBeLessThan(1e-9)
        expect(tree.balance_years).toBeGreaterThan(0)
        expect(tree.balance_years).toBeLessThanOrEqual(years)
      }
    }
  })
})
