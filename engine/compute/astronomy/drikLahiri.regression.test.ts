import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { computeFullChart } from '../index'
import { resolveExternalSunriseReferences } from '../sunrise'
import {
  computeDrikSunrise,
  computeDrikSunriseInstant,
  drikDateToJulianDay,
  drikLahiriProvider,
  normalizeLongitude,
  wrapLongitudeExact,
} from './drikLahiri'

const MOJO_DRIK_BIRTH = {
  date: '1984-05-26',
  time: '07:00:00',
  timezone: 5.5,
  latitude: 24.9048313,
  longitude: 74.5803945,
  sunriseMode: 'jhora' as const,
}

/**
 * Established compatibility facts captured before profile-provider extraction.
 * The next update must add the historical numeric export/snapshot that supplied
 * this birth record before replacing any values; it must never use a freshly
 * calculated chart as its own expected output.
 */
const DRIK_MOJO_ESTABLISHED_LONGITUDES: Readonly<Record<string, number>> = {
  // Source: engine/durationAnalysis/__fixtures__/mojo_wealth_range.json,
  // captured from a fresh Drik compute before provider extraction.
  Sun: 41.35229226263819,
  Moon: 347.7598318098759,
  Mars: 202.114658836293,
  Mercury: 16.95172894141466,
  Jupiter: 258.2709742572504,
  Venus: 35.69167614009145,
  Saturn: 197.806337744053,
}

const DRIK_MOJO_ESTABLISHED_SIGNS =
  'Sun:Taurus|Moon:Pisces|Mars:Libra|Mercury:Aries|Jupiter:Sagittarius|Venus:Taurus|Saturn:Libra|Rahu:Taurus|Ketu:Scorpio'

describe('extracted Drik/Lahiri provider regressions', { timeout: 120_000 }, () => {
  it('retains the established Drik natal placement baseline', () => {
    const chart = computeFullChart(MOJO_DRIK_BIRTH)
    expect(chart.calculationProfile).toBe('drik_lahiri_v1')
    expect(chart.lagna).toBe('Taurus')
    expect(chart.planets.map((planet) => `${planet.planet}:${planet.sign}`).join('|')).toBe(DRIK_MOJO_ESTABLISHED_SIGNS)
    for (const planet of chart.planets.filter((planet) => planet.planet !== 'Rahu' && planet.planet !== 'Ketu')) {
      expect(
        Math.abs(planet.longitude - DRIK_MOJO_ESTABLISHED_LONGITUDES[planet.planet]!),
        `${planet.planet} must remain within one arcsecond of the independent fresh-compute fixture`
      ).toBeLessThanOrEqual(1 / 3_600)
    }
    const rahu = chart.planets.find((planet) => planet.planet === 'Rahu')!
    const ketu = chart.planets.find((planet) => planet.planet === 'Ketu')!
    // The duration-analysis snapshot predates this provider baseline and carries
    // a different node value. Retain the profile's true-node invariant here;
    // do not hide that provenance discrepancy with a wider numeric tolerance.
    expect(rahu.retrograde).toBe(true)
    expect(ketu.retrograde).toBe(true)
    expect(((ketu.longitude - rahu.longitude + 360) % 360)).toBeCloseTo(180, 12)
    expect(chart.ayanamsa).toBeGreaterThan(20)
    expect(chart.ayanamsa).toBeLessThan(30)
    expect(chart.specialLagnas.every((lagna) => Number.isFinite(lagna.longitude))).toBe(true)
  })

  it('uses actual prior and current precise sunrise instants on opposite sides of sunrise', () => {
    const beforeSunrise = { ...MOJO_DRIK_BIRTH, time: '04:00:00', sunriseMode: 'precise' as const }
    const afterSunrise = { ...MOJO_DRIK_BIRTH, time: '08:00:00', sunriseMode: 'precise' as const }
    const beforeJulianDay = drikLahiriProvider.birthInputToJulianDay(beforeSunrise)
    const afterJulianDay = drikLahiriProvider.birthInputToJulianDay(afterSunrise)
    const before = computeDrikSunriseInstant(beforeJulianDay, beforeSunrise.latitude, beforeSunrise.longitude, beforeSunrise.timezone)
    const after = computeDrikSunriseInstant(afterJulianDay, afterSunrise.latitude, afterSunrise.longitude, afterSunrise.timezone)

    expect(before.sunriseFallback).toBe(false)
    expect(after.sunriseFallback).toBe(false)
    expect(before.sunriseJulianDay).toBeLessThan(beforeJulianDay)
    expect(after.sunriseJulianDay).toBeLessThan(afterJulianDay)
    // A query that began at birth would return the same day's future sunrise for
    // the pre-sunrise input. Starting one day earlier instead yields yesterday's
    // rise; the two selected anchors are therefore about one solar day apart.
    expect(after.sunriseJulianDay - before.sunriseJulianDay).toBeGreaterThan(0.9)
    expect(after.sunriseJulianDay - before.sunriseJulianDay).toBeLessThan(1.1)
  })

  it('separates the external sunrise instant from provider-owned Sun longitude', () => {
    const julianDay = drikLahiriProvider.birthInputToJulianDay(MOJO_DRIK_BIRTH)
    const references = resolveExternalSunriseReferences({
      julianDay,
      latitude: MOJO_DRIK_BIRTH.latitude,
      longitude: MOJO_DRIK_BIRTH.longitude,
      timezone: MOJO_DRIK_BIRTH.timezone,
      sunriseMode: MOJO_DRIK_BIRTH.sunriseMode,
    })
    const legacy = computeDrikSunrise(
      julianDay,
      MOJO_DRIK_BIRTH.latitude,
      MOJO_DRIK_BIRTH.longitude,
      MOJO_DRIK_BIRTH.timezone,
      MOJO_DRIK_BIRTH.sunriseMode
    )

    expect(references.selected.sunriseJulianDay).toBe(legacy.sunriseJulianDay)
    expect(drikLahiriProvider.longitudeAt(references.selected.sunriseJulianDay, 'Sun').longitude)
      .toBeCloseTo(legacy.sunLongitudeAtSunrise, 12)
  })

  it('retains the pre-06:00 JHora elapsed-time convention', () => {
    const input = { ...MOJO_DRIK_BIRTH, time: '05:30:00' }
    const jd = drikLahiriProvider.birthInputToJulianDay(input)
    const sunrise = computeDrikSunrise(jd, input.latitude, input.longitude, input.timezone, 'jhora')
    // Legacy Drik/JHora intentionally represents the raw same-day 06:00 anchor
    // as the preceding local interval for special-lagna arithmetic.
    const elapsedHours = (jd - sunrise.sunriseJulianDay) * 24 + 24
    expect((jd - sunrise.sunriseJulianDay) * 24).toBeLessThan(0)
    expect(elapsedHours).toBeCloseTo(23.5, 8)
  })

  it('retains whole-UTC-second precision for existing Drik Gochar date inputs', () => {
    const atSecond = new Date('2024-01-01T12:34:56.000Z')
    const withMilliseconds = new Date('2024-01-01T12:34:56.987Z')
    expect(drikDateToJulianDay(withMilliseconds)).toBe(drikDateToJulianDay(atSecond))
  })

  /**
   * The pre-extraction natal path normalized with a branch, so an in-range
   * longitude passed through bit-for-bit. `normalizeLongitude`'s
   * `((x % 360) + 360) % 360` does not: `x + 360` crosses a binade and drops low
   * mantissa bits. Feeding that rounded value into the natal `Math.floor(lon / 30)`
   * sign/nakshatra boundaries is the deviation these cases pin down.
   */
  describe('natal longitude wrap is bit-exact', () => {
    // Values observed to shift under the modulo form.
    const IN_RANGE = [
      79.6151177699431,
      260.30962620904694,
      43.50225149749924,
      286.25899231624595,
      60.624278203236685,
      319.32990711097483,
      0,
      29.999999999999996,
      359.99999999999994,
    ]

    it('returns an already-in-range longitude unchanged, bit-for-bit', () => {
      for (const value of IN_RANGE) {
        expect(Object.is(wrapLongitudeExact(value), value), `${value} must pass through`).toBe(true)
      }
    })

    it('documents that the transit/Gochar modulo form is NOT bit-exact here', () => {
      // Guards the distinction: if this ever stops perturbing values the two
      // helpers could be merged, but until then the natal path needs its own.
      const perturbed = IN_RANGE.filter((value) => !Object.is(normalizeLongitude(value), value))
      expect(perturbed.length).toBeGreaterThan(0)
      // Away from the 360° seam the deviation is ~1 ULP — real, but far below any
      // display or acceptance tolerance.
      for (const value of perturbed.filter((value) => value < 359)) {
        expect(Math.abs(normalizeLongitude(value) - value)).toBeLessThan(1e-12)
      }
    })

    it('does not collapse a longitude just below 360° onto 0°, unlike the modulo form', () => {
      // `359.99999999999994 + 360` rounds up to 720, so the modulo form returns 0 —
      // a whole sign (Pisces to Aries) and nakshatra jump, not a rounding artifact.
      const justBelowWrap = 359.99999999999994
      expect(normalizeLongitude(justBelowWrap)).toBe(0)
      expect(Object.is(wrapLongitudeExact(justBelowWrap), justBelowWrap)).toBe(true)
      expect(Math.floor(wrapLongitudeExact(justBelowWrap) / 30) + 1).toBe(12)
    })

    it('never returns exactly 360 for a negative magnitude that rounds up', () => {
      // Denormal input: `wrapped + 360` evaluates to exactly 360.
      expect(wrapLongitudeExact(-Number.MIN_VALUE)).toBe(0)
    })

    it('matches the legacy branchy normalization on out-of-range input', () => {
      const legacy = (longitude: number): number => {
        let value = longitude
        if (value < 0) value += 360
        if (value >= 360) value -= 360
        return value
      }
      // Legacy Ketu derivation range: Rahu in [0, 360) plus 180°.
      for (const rahu of [0, 12.5, 179.9, 180, 250.30962620904694, 359.9999]) {
        expect(Object.is(wrapLongitudeExact(rahu + 180), (rahu + 180) % 360)).toBe(true)
      }
      for (const value of [-0.5, -359.9, 360.5, 719.5]) {
        expect(wrapLongitudeExact(value)).toBeCloseTo(legacy(value), 12)
      }
    })

    it('always lands in [0, 360) and never perturbs an in-range double', () => {
      fc.assert(
        fc.property(
          fc.double({ min: -1080, max: 1080, noNaN: true, noDefaultInfinity: true }),
          (value) => {
            const wrapped = wrapLongitudeExact(value)
            expect(wrapped).toBeGreaterThanOrEqual(0)
            expect(wrapped).toBeLessThan(360)
            if (value >= 0 && value < 360) expect(Object.is(wrapped, value)).toBe(true)
          }
        ),
        { numRuns: 2000 }
      )
    })
  })
})
