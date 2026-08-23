import { describe, expect, it } from 'vitest'
import { SURYA_SIDDHANTA_MAKARANDA_FIXTURES } from './__fixtures__/suryaSiddhantaMakaranda'

export const SSS_ORACLE_ACCEPTANCE_TOLERANCES = Object.freeze({
  natalArcseconds: 1,
  seededMahadashaSeconds: 1,
  endToEndMoonToDashaHours: 4,
  fixedYearDaysDifferentialHours: 60,
})

/**
 * Formula-dependent acceptance gates deliberately remain pending until Task 3
 * supplies an independent SSS/Makaranda provider and Task 5 supplies its
 * SSS-Sun root-finding calendar. These tests import the audited test fixture
 * now so the intended source data, tolerances, and scope cannot be replaced by
 * ad-hoc literals or silently forgotten.
 *
 * They are never allowed to pass by routing through the Drik provider.
 */
describe('Sri Surya Siddhanta — Generalized Makaranda JHora goldens', () => {
  const [india, mojo] = SURYA_SIDDHANTA_MAKARANDA_FIXTURES

  it('keeps explicit pending acceptance tolerances and the complete oracle scope', () => {
    expect(india.natal).toHaveLength(10)
    expect(mojo.natal).toHaveLength(10)
    expect(india.antardasha).toHaveLength(9)
    expect(india.pratyantardasha).toHaveLength(9)
    expect(mojo.antardasha).toHaveLength(9)
    expect(mojo.pratyantardasha).toHaveLength(9)
    expect(SSS_ORACLE_ACCEPTANCE_TOLERANCES).toEqual({
      natalArcseconds: 1,
      seededMahadashaSeconds: 1,
      endToEndMoonToDashaHours: 4,
      fixedYearDaysDifferentialHours: 60,
    })
  })

  it.todo('Requirement 8.4 / Task 3.5: matches India natal Lagna and nine grahas, nakshatra/pada, retrograde flags, and points within 1 arcsecond')
  it.todo('Requirement 8.4 / Task 3.5: matches Mojo natal Lagna and nine grahas, nakshatra/pada, retrograde flags, and points within 1 arcsecond')
  it.todo('Requirement 8.5 / Task 5.3: seeded true-sidereal SSS-Sun calendar reproduces every India/Mojo MD boundary within 1 displayed second')
  it.todo('Requirement 8.6 / Task 5.3: Moon-to-Dasha seed is within 4 hours and fixed YEAR_DAYS=365.2425 misses India by at least 60 hours')
  it.todo('Requirement 8.12 / Task 5.5: all India/Mojo AD and PD fixture boundaries, parent identities, lord order, and contiguity pass before lifting the fractional-dasha gate')
})
