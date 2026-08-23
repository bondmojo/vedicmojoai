import { describe, expect, it } from 'vitest'
import {
  calculationSettingsSnapshot,
  CalculationProfileUnavailableError,
  CalculationProfileValidationError,
  DRIK_LAHIRI_V1,
  resolveCalculationProfile,
  SURYA_SIDDHANTA_MAKARANDA_V1,
} from './profiles'
import { resolveAstronomyProvider } from './astronomy'
import {
  birthInputToPreciseUtcInstant,
  birthInputToUtcDate,
  normalizeBirthTime,
  parseBirthTime,
} from './time'
import { SURYA_SIDDHANTA_MAKARANDA_FIXTURES } from './__fixtures__/suryaSiddhantaMakaranda'
import { computeFullChart } from './index'

describe('calculation profiles', () => {
  it('defines immutable Drik and approved SSS/Makaranda profiles', () => {
    expect(resolveCalculationProfile()).toBe(DRIK_LAHIRI_V1)
    expect(SURYA_SIDDHANTA_MAKARANDA_V1.nodeModel).toBe('mean')
    expect(SURYA_SIDDHANTA_MAKARANDA_V1.ayanamsa).toBe('sri_surya_siddhanta')
    expect(SURYA_SIDDHANTA_MAKARANDA_V1.vimshottari.yearBasis).toBe('true_sidereal_solar_revolution')
    expect(Object.isFrozen(calculationSettingsSnapshot(SURYA_SIDDHANTA_MAKARANDA_V1))).toBe(true)
  })

  it('rejects an unknown runtime profile with a typed validation error instead of returning undefined', () => {
    expect(() => resolveCalculationProfile('not-a-profile')).toThrow(CalculationProfileValidationError)
    try {
      resolveCalculationProfile('not-a-profile')
    } catch (error) {
      expect(error).toMatchObject({
        code: 'CALCULATION_PROFILE_INVALID',
        calculationProfile: 'not-a-profile',
      })
    }
  })

  it('never falls back from the registered SSS profile to Drik', () => {
    expect(() => resolveAstronomyProvider(SURYA_SIDDHANTA_MAKARANDA_V1)).toThrow(
      CalculationProfileUnavailableError
    )
  })

  it('rejects the legacy JHora sunrise convention for the SSS profile before provider use', () => {
    expect(() => computeFullChart({
      date: '1984-05-26',
      time: '07:00:00',
      timezone: 5.5,
      latitude: 24.88,
      longitude: 74.62,
      sunriseMode: 'jhora',
      calculationProfile: 'surya_siddhanta_makaranda_v1',
    })).toThrow(CalculationProfileValidationError)
  })
})

describe('fractional local birth time', () => {
  it('normalizes persisted unpadded hours while public schemas remain responsible for padded validation', () => {
    expect(normalizeBirthTime('7:00')).toBe('07:00:00')
    expect(normalizeBirthTime('7:00:00')).toBe('07:00:00')
    expect(normalizeBirthTime('7:00:00.601200')).toBe('07:00:00.6012')
    expect(normalizeBirthTime('07:00')).toBe('07:00:00')
    expect(parseBirthTime('7:00:00.6012').secondsSinceMidnight).toBeCloseTo(25_200.6012, 8)
  })

  it('retains all accepted fractional digits in the explicit UTC/JD carrier', () => {
    const india = SURYA_SIDDHANTA_MAKARANDA_FIXTURES[0]
    const instant = birthInputToPreciseUtcInstant(india.birth)
    expect(instant.secondsSinceUtcMidnight).toBeCloseTo(18 * 3600 + 30 * 60 + 0.6012, 12)
    expect(instant.julianDayUt).toBeCloseTo(2_432_412.27084, 5)
  })

  it('keeps the legacy Date bridge explicitly constrained to milliseconds', () => {
    const india = SURYA_SIDDHANTA_MAKARANDA_FIXTURES[0]
    const date = birthInputToUtcDate(india.birth)
    expect(date.toISOString()).toBe('1947-08-14T18:30:00.601Z')
    expect(date.getUTCMilliseconds()).toBe(601)
  })
})
