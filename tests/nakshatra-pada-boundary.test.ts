/**
 * Nakshatra, pada and sub-lord — longitudes exactly on a boundary.
 *
 * NAKSHATRA_SPAN (360/27) rounds up, so `40 / span` rounds to exactly 3
 * (Rohini) while `40 % span` is just under one span. The engine used to take
 * the index from the first and the position from the second, which read 40°
 * as Rohini pada 4 with the Sun sub-lord instead of pada 1 with the Moon.
 * The same rounding misread pada starts (30° as Krittika pada 1, so Aries),
 * exact sub-lord cut points (33°, 37°, 101°, …), and `((lon % 360) + 360) % 360`
 * put 1 × and 4 × (360/27) just below their boundary.
 *
 * Exact boundaries are reachable: UnifiedChart.moonLongitude and
 * lagnaLongitude are Decimal(8,4), so 40.0000 arrives as 40. Matchmaking
 * derives each native's Moon nakshatra/pada/rashi from that stored value.
 */
import { describe, it, expect } from 'vitest'
import {
  computeNakshatraForLongitude,
  computeSubLord,
  getNakshatraIndex,
  getPada,
} from '../engine/compute/nakshatras'
import { longitudeToNakshatraPadaRashi } from '../engine/compute/matchmaking'
import { DASHA_SEQUENCE, NAKSHATRAS } from '../engine/constants'

/** Vimshottari sub-lords of nakshatra `index`, in order, from its own lord. */
function subLordsOf(index: number): { lord: string; years: number }[] {
  return Array.from({ length: 9 }, (_, i) => DASHA_SEQUENCE[(index + i) % 9])
}

/**
 * Exact oracle for lon = k / 10000°. Dasha years run at 9 per degree, so
 * 9k is the position in 1/10000 years since 0° Ashwini: 120 years (1,200,000)
 * per nakshatra, 30 years (300,000) per pada, whole years per sub-lord.
 */
function oracle(k: number) {
  const units = 9 * k
  const index = Math.floor(units / 1_200_000)
  const intoNakshatra = units % 1_200_000
  let cumulative = 0
  let subLord = ''
  for (const { lord, years } of subLordsOf(index)) {
    cumulative += years * 10_000
    if (intoNakshatra < cumulative) {
      subLord = lord
      break
    }
  }
  return {
    index,
    pada: Math.floor(intoNakshatra / 300_000) + 1,
    subLord,
    degreeInNakshatra: intoNakshatra / 90_000,
    rashiNumber: Math.floor(k / 300_000) + 1,
  }
}

// Every nakshatra boundary as the engine sees it: n × (360/27), the same
// doubles the 4-decimal values 40, 80, …, 320 parse to.
const BOUNDARIES = Array.from({ length: 27 }, (_, n) => ({ n, lon: n * (360 / 27) }))

describe('nakshatras — longitude exactly on a nakshatra boundary', () => {
  it.each(BOUNDARIES)('n=$n ($lon°) is pada 1 of the new nakshatra under its own lord', ({ n, lon }) => {
    const { name, lord } = NAKSHATRAS[n]
    expect(getNakshatraIndex(lon)).toBe(n)
    expect(getPada(lon)).toBe(1)
    expect(computeSubLord(lon)).toBe(lord)

    const info = computeNakshatraForLongitude(lon, 'Moon')
    expect(info).toMatchObject({ nakshatra: name, nakshatraIndex: n, pada: 1, nakshatraLord: lord, subLord: lord })
    expect(info.degreeInNakshatra).toBeGreaterThanOrEqual(0)
    expect(info.degreeInNakshatra).toBeLessThan(1e-12)
  })

  it.each(['40.0000', '80.0000', '120.0000', '160.0000', '200.0000', '240.0000', '280.0000', '320.0000'])(
    'a stored Decimal(8,4) longitude of %s is pada 1 with the new lord as sub-lord',
    (stored) => {
      const lon = Number(stored)
      const n = lon / 40 * 3
      const info = computeNakshatraForLongitude(lon, 'Moon')
      expect(info.nakshatraIndex).toBe(n)
      expect(info.pada).toBe(1)
      expect(info.subLord).toBe(NAKSHATRAS[n].lord)
    }
  )

  it.each(BOUNDARIES.filter(({ n }) => n > 0))(
    'n=$n: just below is the last pada and sub-lord of the previous nakshatra',
    ({ n, lon }) => {
      const below = computeNakshatraForLongitude(lon - 1e-9, 'Moon')
      expect(below.nakshatraIndex).toBe(n - 1)
      expect(below.pada).toBe(4)
      expect(below.subLord).toBe(subLordsOf(n - 1)[8].lord)

      const above = computeNakshatraForLongitude(lon + 1e-9, 'Moon')
      expect(above.nakshatraIndex).toBe(n)
      expect(above.pada).toBe(1)
      expect(above.subLord).toBe(NAKSHATRAS[n].lord)
    }
  )

  it('handles 0°, the top of Revati, and longitudes outside [0, 360)', () => {
    expect(computeNakshatraForLongitude(0, 'Moon')).toMatchObject({ nakshatraIndex: 0, pada: 1, subLord: 'Ketu' })
    expect(computeNakshatraForLongitude(360, 'Moon')).toMatchObject({ nakshatraIndex: 0, pada: 1, subLord: 'Ketu' })
    expect(computeNakshatraForLongitude(-1e-300, 'Moon')).toMatchObject({ nakshatraIndex: 0, pada: 1, subLord: 'Ketu' })
    expect(getNakshatraIndex(-0)).toBe(0)

    // Revati's sub-lords run Mercury → … → Saturn.
    for (const lon of [359.9999, 360 - 1e-9, 359.99999999999994]) {
      const top = computeNakshatraForLongitude(lon, 'Moon')
      expect(top).toMatchObject({ nakshatra: 'Revati', nakshatraIndex: 26, pada: 4, subLord: 'Saturn' })
      expect(top.degreeInNakshatra).toBeLessThan(360 / 27)
    }

    expect(computeNakshatraForLongitude(-40, 'Moon')).toMatchObject({ nakshatraIndex: 24, pada: 1, subLord: 'Jupiter' })
    expect(computeNakshatraForLongitude(400, 'Moon')).toMatchObject({ nakshatraIndex: 3, pada: 1, subLord: 'Moon' })
  })

  it('keeps NaN as NaN, so matchmaking reports the koota unavailable instead of scoring Ashwini', () => {
    expect(getNakshatraIndex(NaN)).toBeNaN()
    expect(getPada(NaN)).toBeNaN()
  })

  it('gives matchmaking the true Moon sign at every sign boundary', () => {
    for (let sign = 0; sign < 12; sign++) {
      expect(longitudeToNakshatraPadaRashi(sign * 30).rashiNumber).toBe(sign + 1)
    }
  })

  it('matches an exact integer oracle for every 4-decimal longitude near a boundary', () => {
    // Around each nakshatra boundary (n × 40/3) and each whole degree. A
    // boundary a 4-decimal value can hit exactly — nakshatra, pada, sign or
    // sub-lord cut point — is always a whole degree, since 3 and 9 share no
    // factor with 10.
    const centres = new Set<number>()
    for (let n = 0; n <= 27; n++) centres.add(Math.round((n * 400_000) / 3))
    for (let d = 0; d <= 360; d++) centres.add(d * 10_000)

    const mismatches: string[] = []
    for (const centre of centres) {
      for (let k = Math.max(0, centre - 50); k <= Math.min(3_599_999, centre + 50); k++) {
        const lon = k / 10_000
        const want = oracle(k)
        const info = computeNakshatraForLongitude(lon, 'Moon')
        const match = longitudeToNakshatraPadaRashi(lon)
        if (
          info.nakshatraIndex !== want.index ||
          info.pada !== want.pada ||
          info.subLord !== want.subLord ||
          Math.abs(info.degreeInNakshatra - want.degreeInNakshatra) > 1e-9 ||
          getNakshatraIndex(lon) !== want.index ||
          getPada(lon) !== want.pada ||
          match.nakshatraNumber !== want.index + 1 ||
          match.padaNumber !== want.pada ||
          match.rashiNumber !== want.rashiNumber
        ) {
          mismatches.push(`${lon}: got ${info.nakshatra} P${info.pada} ${info.subLord}, want ${JSON.stringify(want)}`)
        }
      }
    }
    expect(mismatches).toEqual([])
  })
})
