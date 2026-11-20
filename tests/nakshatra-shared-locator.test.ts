/**
 * The shared nakshatra locator (.kiro/specs/nakshatra-shared-locator).
 *
 * `engine/compute/nakshatras.ts` is the single source of nakshatra arithmetic:
 * matchmaking's boundary risk and the Sree Lagna take their position from it
 * (Vimshottari: tests/vimshottari-nakshatra-boundary.test.ts). Pada and sub-lord
 * are decided by one exact comparison, `9 × lon ≥ years`, so they never name an
 * impossible pair such as Revati pada 2 with the Mars sub-lord.
 */
import { describe, it, expect } from 'vitest'
import {
  computeNakshatraForLongitude,
  distanceToNakshatraBoundary,
  getNakshatraData,
  getNakshatraLord,
  getNakshatraName,
  getPada,
  locateInNakshatra,
  normalizeLongitude,
} from '../engine/compute/nakshatras'
import { computeBoundaryRisk } from '../engine/compute/matchmaking'
import { computeSpecialLagnas } from '../engine/compute/specialLagnas'
import { computeVimshottari } from '../engine/computeVimshottari'
import { DashaIntegrityError } from '../lib/errors'
import { DASHA_SEQUENCE, NAKSHATRAS } from '../engine/constants'
import type { PlanetPosition } from '../engine/compute/types'

/** The double `steps` ulps away from x (x ≥ 0). */
function ulpStep(x: number, steps: number): number {
  const buf = new Float64Array([x])
  const bits = new BigInt64Array(buf.buffer)
  bits[0] += BigInt(steps)
  return buf[0]
}

/** Exactly: has double x ≥ 0 reached `years` dasha years (9 × x ≥ years)? BigInt on the mantissa. */
function exactlyReached(x: number, years: number): boolean {
  const word = new BigUint64Array(new Float64Array([x]).buffer)[0]
  const biasedExponent = Number((word >> 52n) & 0x7ffn)
  let mantissa = word & ((1n << 52n) - 1n)
  let exponent = -1074
  if (biasedExponent !== 0) {
    mantissa |= 1n << 52n
    exponent = biasedExponent - 1075
  }
  const lhs = 9n * mantissa
  return exponent >= 0
    ? lhs * (1n << BigInt(exponent)) >= BigInt(years)
    : lhs >= BigInt(years) * (1n << BigInt(-exponent))
}

/** Sub-lords of nakshatra `index` with their [from, to) years into it. */
function subSpans(index: number) {
  let from = 0
  return Array.from({ length: 9 }, (_, i) => {
    const { lord, years } = DASHA_SEQUENCE[(index + i) % 9]
    const span = { lord, from, to: from + years }
    from += years
    return span
  })
}

/** BigInt oracle for a double: index, pada and sub-lord. */
function exactOracle(x: number) {
  let index = 0
  while (index < 26 && exactlyReached(x, 120 * (index + 1))) index++
  let pada = 1
  for (let cut = 1; cut < 4; cut++) if (exactlyReached(x, 120 * index + 30 * cut)) pada++
  const sub = subSpans(index).find(({ to }) => !exactlyReached(x, 120 * index + to)) ?? subSpans(index)[8]
  return { index, pada, subLord: sub.lord }
}

/** Every pada, sub-lord and nakshatra cut, as the nearest double. */
const CUTS = (() => {
  const cuts = new Set<number>()
  for (let index = 0; index < 27; index++) {
    for (let p = 0; p <= 4; p++) cuts.add((120 * index + 30 * p) / 9)
    for (const { to } of subSpans(index)) cuts.add((120 * index + to) / 9)
  }
  return [...cuts]
})()

describe('normalizeLongitude / locateInNakshatra — exported contract', () => {
  it('leaves an in-range longitude untouched and wraps the rest', () => {
    for (const lon of [0, 1e-300, 13.333333333333334, 40, 123.456789, 359.99999999999994]) {
      expect(normalizeLongitude(lon)).toBe(lon)
    }
    expect(Object.is(normalizeLongitude(-0), 0)).toBe(true)
    expect(normalizeLongitude(-1e-300)).toBe(0) // rounds up to 360, which is 0°
    expect(normalizeLongitude(360)).toBe(0)
    expect(normalizeLongitude(-40)).toBe(320)
    expect(normalizeLongitude(400)).toBe(40)
    expect(normalizeLongitude(NaN)).toBeNaN()
  })

  it('returns index 0–26, fraction in [0, 1) and pada 1–4 for any finite longitude', () => {
    const lons = [0, 360 - 1e-13, ...CUTS.flatMap((c) => [c, ulpStep(c, 1), c > 0 ? ulpStep(c, -1) : 0]), -1e-300, 720.5, -359.9]
    for (const lon of lons) {
      const { normalizedLong, nakshatraIndex, fraction, pada } = locateInNakshatra(lon)
      expect(normalizedLong).toBeGreaterThanOrEqual(0)
      expect(normalizedLong).toBeLessThan(360)
      expect(Number.isInteger(nakshatraIndex) && nakshatraIndex >= 0 && nakshatraIndex <= 26).toBe(true)
      expect(fraction).toBeGreaterThanOrEqual(0)
      expect(fraction).toBeLessThan(1)
      expect([1, 2, 3, 4]).toContain(pada)
    }
  })

  it('gives NaN index, fraction and pada for NaN', () => {
    const location = locateInNakshatra(NaN)
    expect(location.nakshatraIndex).toBeNaN()
    expect(location.fraction).toBeNaN()
    expect(location.pada).toBeNaN()
    expect(distanceToNakshatraBoundary(NaN)).toBeNaN()
  })

  it('reads its nakshatra table from engine/constants.ts with the same { name, lord } shape', () => {
    expect(getNakshatraData()).toEqual(NAKSHATRAS.map(({ name, lord }) => ({ name, lord })))
    for (const entry of getNakshatraData()) expect(Object.keys(entry)).toEqual(['name', 'lord'])
    expect(getNakshatraName(3)).toBe('Rohini')
    expect(getNakshatraLord(26)).toBe('Mercury')
  })
})

describe('pada and sub-lord — one exact comparison', () => {
  it('matches the BigInt oracle within 64 ulps of every cut, and never names an impossible pair', () => {
    const misses: string[] = []
    for (const cut of CUTS) {
      for (let steps = -64; steps <= 64; steps++) {
        const lon = ulpStep(cut, steps)
        if (!(lon >= 0 && lon < 360)) continue
        const info = computeNakshatraForLongitude(lon, 'Moon')

        // The sub-lord's span must overlap the pada's 30 years.
        const span = subSpans(info.nakshatraIndex).find(({ lord }) => lord === info.subLord)!
        if (!(span.from < 30 * info.pada && span.to > 30 * (info.pada - 1))) {
          misses.push(`${lon}: impossible pair pada ${info.pada} / ${info.subLord}`)
        }

        // Where the quotient's index is exact, pada and sub-lord are exact too.
        const want = exactOracle(lon)
        if (info.nakshatraIndex === want.index && (info.pada !== want.pada || info.subLord !== want.subLord)) {
          misses.push(`${lon}: got P${info.pada} ${info.subLord}, want P${want.pada} ${want.subLord}`)
        }
      }
    }
    expect(misses).toEqual([])
  })

  it('splits pada 2 and pada 3 of Mars- and Mercury-led nakshatras at the same point as the sub-lord', () => {
    // Revati (Mercury-led): pada 3 and the Mars sub both start at 353.333…°. The
    // double 353.3333333333333 lies just below that, so it is pada 2, Moon sub.
    expect(computeNakshatraForLongitude(353.3333333333333, 'Moon')).toMatchObject({ nakshatra: 'Revati', pada: 2, subLord: 'Moon' })
    expect(computeNakshatraForLongitude(ulpStep(353.3333333333333, 1), 'Moon')).toMatchObject({ pada: 3, subLord: 'Mars' })

    // Mrigashira (Mars-led): pada 3 and the Mercury sub both start at exactly 60°.
    expect(computeNakshatraForLongitude(60, 'Moon')).toMatchObject({ nakshatra: 'Mrigashira', pada: 3, subLord: 'Mercury' })
    expect(computeNakshatraForLongitude(ulpStep(60, -1), 'Moon')).toMatchObject({ nakshatra: 'Mrigashira', pada: 2, subLord: 'Saturn' })
  })

  it('keeps a NaN pada, so matchmaking reports the koota unavailable', () => {
    expect(getPada(NaN)).toBeNaN()
  })
})

describe('computeBoundaryRisk — distance from the shared locator', () => {
  it('matches the exact oracle for every 4-decimal longitude near a boundary or 1° from one', () => {
    // lon = k / 10000; in units of 1/30000°, the position in its nakshatra is 3k mod 400000.
    const centres = new Set<number>()
    for (let n = 0; n <= 27; n++) {
      for (const offset of [-10_000, 0, 10_000]) centres.add(Math.round((n * 400_000) / 3) + offset)
    }
    const misses: string[] = []
    for (const centre of centres) {
      for (let k = Math.max(0, centre - 50); k <= Math.min(3_599_999, centre + 50); k++) {
        const lon = k / 10_000
        const intoNakshatra = (3 * k) % 400_000
        const distance = Math.min(intoNakshatra, 400_000 - intoNakshatra) / 30_000
        const risk = computeBoundaryRisk('bride', lon)
        if (risk.atRisk !== distance <= 1 || Math.abs(risk.distanceToBoundaryDeg! - distance) > 1e-12) {
          misses.push(`${lon}: got ${risk.distanceToBoundaryDeg} (${risk.atRisk}), want ${distance}`)
        }
      }
    }
    expect(misses).toEqual([])
  })

  it('puts a Moon exactly 1° from a whole-degree boundary at risk, and one on the boundary at 0', () => {
    for (const lon of [39, 41, 79, 359, 1]) {
      expect(computeBoundaryRisk('groom', lon)).toMatchObject({ distanceToBoundaryDeg: 1, atRisk: true })
    }
    for (let n = 0; n < 27; n++) {
      // (120 n) / 9 is the double nearest the boundary; n × (360/27) can sit an ulp off it.
      expect(computeBoundaryRisk('bride', (120 * n) / 9).distanceToBoundaryDeg).toBe(0)
      expect(computeBoundaryRisk('bride', n * (360 / 27)).distanceToBoundaryDeg).toBeLessThan(1e-12)
    }
    expect(computeBoundaryRisk('bride', 40).distanceToBoundaryDeg).toBe(0)
    expect(computeBoundaryRisk('bride', NaN)).toEqual({ role: 'bride', atRisk: false })
  })
})

describe('Sree Lagna — fraction from the shared locator', () => {
  const planet = (name: string, longitude: number) =>
    ({ planet: name, longitude, signNumber: Math.floor(longitude / 30) + 1 }) as PlanetPosition

  it('adds nothing to the Lagna for a Moon exactly on a nakshatra boundary', () => {
    // The old `moon % span` read 40° as the end of Krittika (fraction ≈ 1), so a
    // Lagna on a sign cusp came back an ulp short, in the previous sign.
    for (const moon of [40, 80, 120, 13.333333333333334]) {
      const sree = computeSpecialLagnas({
        planets: [planet('Sun', 100), planet('Moon', moon), planet('Rahu', 200)],
        lagnaSignNumber: 2,
        lagnaLongitude: 30,
        sunLongitudeAtSunrise: 100,
        elapsedHoursSinceSunrise: 3,
        sunLongitudeAtPreciseSunrise: 100,
        elapsedHoursFromPreciseSunrise: 3,
        d9AKSignNumber: 1,
      }).find((l) => l.abbr === 'SL')!
      expect(sree).toMatchObject({ longitude: 30, sign: 'Taurus', signNumber: 2, degreeInSign: 0 })
    }
  })
})

describe('computeVimshottari — input edges', () => {
  const BIRTH = new Date('1990-04-27T06:30:00.000Z')

  it('reads a stored 360.0000 as 0°, the start of Ashwini with a full Ketu MD', () => {
    // Decimal(8,4) rounds a Moon in [359.99995°, 360°) up to 360.0000.
    const at360 = computeVimshottari(Number('360.0000'), BIRTH)
    expect(at360).toEqual(computeVimshottari(0, BIRTH))
    expect(at360.mahadashas[0].lord).toBe('Ketu')
    expect(at360.balance_years).toBe(7)
  })

  it.each([NaN, -0.0001, 360.0001, Infinity, -Infinity])('rejects %s with DashaIntegrityError', (lon) => {
    expect(() => computeVimshottari(lon, BIRTH)).toThrow(DashaIntegrityError)
  })
})
