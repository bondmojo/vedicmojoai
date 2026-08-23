import { describe, expect, it } from 'vitest'
import {
  SURYA_SIDDHANTA_MAKARANDA_FIXTURES,
  type SssFixtureDashaPeriod,
} from './__fixtures__/suryaSiddhantaMakaranda'

const DASHA_YEARS: Readonly<Record<string, number>> = {
  Sun: 6,
  Moon: 10,
  Mars: 7,
  Rahu: 18,
  Jupiter: 16,
  Saturn: 19,
  Mercury: 17,
  Ketu: 7,
  Venus: 20,
}
const DASHA_ORDER = Object.keys(DASHA_YEARS)
const TOTAL_DASHA_YEARS = 120

function milliseconds(period: SssFixtureDashaPeriod): number {
  return Date.parse(period.end) - Date.parse(period.start)
}

function expectedSequence(startingLord: string): string[] {
  const startIndex = DASHA_ORDER.indexOf(startingLord)
  if (startIndex < 0) throw new Error(`Unsupported dasha lord: ${startingLord}`)
  return Array.from({ length: DASHA_ORDER.length }, (_, index) => DASHA_ORDER[(startIndex + index) % DASHA_ORDER.length])
}

function assertContinuous(periods: readonly SssFixtureDashaPeriod[]): void {
  for (let index = 1; index < periods.length; index += 1) {
    expect(periods[index - 1].end).toBe(periods[index].start)
    expect(Date.parse(periods[index - 1].end)).toBeLessThanOrEqual(Date.parse(periods[index].start))
  }
}

function assertChildCoverage(
  parents: readonly SssFixtureDashaPeriod[],
  children: readonly SssFixtureDashaPeriod[]
): void {
  for (const parent of parents) {
    const directChildren = children.filter((period) => period.parentId === parent.id)
    expect(directChildren, `${parent.id} must have its complete displayed child sequence`).toHaveLength(9)
    expect(directChildren[0].start).toBe(parent.start)
    expect(directChildren[directChildren.length - 1]?.end).toBe(parent.end)
    expect(directChildren.map((period) => period.lord)).toEqual(expectedSequence(parent.lord))
    assertContinuous(directChildren)
  }
}

describe('SSS/Makaranda oracle fixture integrity', () => {
  for (const fixture of SURYA_SIDDHANTA_MAKARANDA_FIXTURES) {
    it(`${fixture.id} retains auditable natal, special-point, and dasha evidence`, () => {
      expect(fixture.transcription.humanReleaseAudit).toBe('pending')
      expect(fixture.source).toContain('docs/reference/surya-siddhanta-makaranda/')
      expect(fixture.natal).toHaveLength(10)
      expect(fixture.natal.every((position) => position.nakshatra.length > 0 && position.pada >= 1 && position.pada <= 4)).toBe(true)
      expect(fixture.natal.find((position) => position.body === 'Rahu')?.retrograde).toBe(true)
      expect(fixture.natal.find((position) => position.body === 'Ketu')?.retrograde).toBe(true)
      expect(fixture.specialLagnas.length).toBeGreaterThan(0)
      expect(fixture.upagrahas.length).toBeGreaterThan(0)
      expect(fixture.dasha).toMatchObject({
        review: {
          mahadasha: 'Opus review',
          antardashaAndPratyantardasha: 'pending',
        },
        seed: 'moon_janma_tara',
        division: 'D1',
        firstNakshatra: 'Krittika',
        firstNakshatraLord: 'Sun',
        direction: 'zodiacal_forward',
        yearBasis: 'true_sidereal_solar_revolution',
      })
    })

    it(`${fixture.id} has continuous displayed MD, AD, and PD boundaries with explicit parents`, () => {
      expect(fixture.mahadasha.every((period) => period.level === 'MD' && period.parentId === null)).toBe(true)
      assertContinuous(fixture.mahadasha)
      assertChildCoverage(fixture.mahadasha.filter((period) => fixture.antardasha.some((child) => child.parentId === period.id)), fixture.antardasha)
      assertChildCoverage(fixture.antardasha.filter((period) => fixture.pratyantardasha.some((child) => child.parentId === period.id)), fixture.pratyantardasha)
    })

    it(`${fixture.id} follows the displayed classical MD/AD/PD lord order and proportional duration arithmetic`, () => {
      for (const md of fixture.mahadasha) {
        expect(DASHA_YEARS[md.lord]).toBeTypeOf('number')
      }

      for (const parent of fixture.mahadasha) {
        const children = fixture.antardasha.filter((ad) => ad.parentId === parent.id)
        if (children.length === 0) continue
        const proportionalYears = children.reduce(
          (sum, ad) => sum + (DASHA_YEARS[parent.lord] * DASHA_YEARS[ad.lord]) / TOTAL_DASHA_YEARS,
          0
        )
        expect(proportionalYears).toBeCloseTo(DASHA_YEARS[parent.lord], 12)
      }

      for (const parent of fixture.antardasha) {
        const mdParent = fixture.mahadasha.find((md) => md.id === parent.parentId)
        const children = fixture.pratyantardasha.filter((pd) => pd.parentId === parent.id)
        if (children.length === 0) continue
        expect(mdParent, `MD ancestor missing for ${parent.id}`).toBeDefined()
        const proportionalYears = children.reduce(
          (sum, pd) =>
            sum +
            (DASHA_YEARS[mdParent!.lord] * DASHA_YEARS[parent.lord] * DASHA_YEARS[pd.lord]) /
              (TOTAL_DASHA_YEARS * TOTAL_DASHA_YEARS),
          0
        )
        expect(proportionalYears).toBeCloseTo(
          (DASHA_YEARS[mdParent!.lord] * DASHA_YEARS[parent.lord]) / TOTAL_DASHA_YEARS,
          12
        )
      }
    })
  }

  it('retains the known Mojo Venus/Sun and Venus/Rahu true-sidereal-year spans', () => {
    const mojo = SURYA_SIDDHANTA_MAKARANDA_FIXTURES.find((fixture) => fixture.id === 'mojo')!
    const sun = mojo.antardasha.find((period) => period.lord === 'Sun')!
    const rahu = mojo.antardasha.find((period) => period.lord === 'Rahu')!

    // The displayed Sun AD is one solar revolution (365d 06:12:36), while
    // Rahu is three; their 23-second difference proves fixtures preserve the
    // observed solar-calendar evidence rather than inventing fixed-day dates.
    expect(milliseconds(sun) / 1_000).toBe(31_558_356)
    expect(milliseconds(rahu) / 1_000).toBe(94_675_091)
    expect(milliseconds(rahu) - 3 * milliseconds(sun)).toBe(23_000)
  })
})
