/**
 * engine/compute/dignity.moolatrikona.test.ts — Property-based tests for the
 * moolatrikona degree-range rule added to `getVargaDignityLabel`.
 *
 * See design.md "Correctness Properties" for the full statements this file
 * validates.
 */

import { describe, it } from 'vitest'
import fc from 'fast-check'
import {
  getVargaDignityLabel,
  MOOLATRIKONA_SIGNS,
  MOOLATRIKONA_RANGES,
  PERMANENT_FRIENDSHIP,
  SIGN_LORDS,
} from './dignity'
import { frozenWholeSignDignityLabel } from './__fixtures__/frozenWholeSignDignity'

/**
 * The five planets whose moolatrikona sign is neither their exaltation nor
 * debilitation sign, so the degree-range rule is actually reachable (see
 * design.md's R2.14 table — Moon and Mercury's moolatrikona sign coincides
 * with their exaltation sign, so exaltation always wins first for them).
 */
const REACHABLE_PLANETS = ['Sun', 'Mars', 'Jupiter', 'Venus', 'Saturn'] as const

const MAITRI_LABELS = ['great_friend', 'friend', 'neutral', 'enemy', 'great_enemy']

/**
 * Degree-in-sign arbitrary for `planet`'s moolatrikona range, biased toward the
 * exact `MOOLATRIKONA_RANGES` bounds (and values immediately on either side of
 * the upper bound) so the half-open `[from, to)` edges get hit, not just
 * uniformly-random floats deep inside or outside the range.
 */
function degreeArbitraryFor(range: { fromDeg: number; toDeg: number }): fc.Arbitrary<number> {
  const epsilon = 1e-9
  const justBelowTo = Math.max(range.fromDeg, range.toDeg - epsilon)
  const justAboveTo = Math.min(30 - epsilon, range.toDeg + epsilon)
  return fc.oneof(
    { weight: 3, arbitrary: fc.double({ min: 0, max: 30, noNaN: true, maxExcluded: true }) },
    { weight: 1, arbitrary: fc.constant(range.fromDeg) },
    { weight: 1, arbitrary: fc.constant(range.toDeg) },
    { weight: 1, arbitrary: fc.constant(justBelowTo) },
    { weight: 1, arbitrary: fc.constant(justAboveTo) },
  )
}

const reachablePlanetWithDegree = fc
  .constantFrom(...REACHABLE_PLANETS)
  .chain((planet) => fc.tuple(fc.constant(planet), degreeArbitraryFor(MOOLATRIKONA_RANGES[planet])))

describe('getVargaDignityLabel — moolatrikona degree range', () => {
  // Feature: chart-ui-enhancements, Property 3: The moolatrikona degree range decides moolatrikona versus own
  it('the moolatrikona degree range decides moolatrikona versus own', () => {
    fc.assert(
      fc.property(reachablePlanetWithDegree, ([planet, degreeInSign]) => {
        const range = MOOLATRIKONA_RANGES[planet]
        const vargaSignNumber = MOOLATRIKONA_SIGNS[planet]

        const label = getVargaDignityLabel(planet, vargaSignNumber, {}, degreeInSign)

        const inRange = degreeInSign >= range.fromDeg && degreeInSign < range.toDeg
        if (inRange) {
          if (label !== 'moolatrikona') {
            throw new Error(
              `Expected 'moolatrikona' for ${planet} at ${degreeInSign}° (range [${range.fromDeg}, ${range.toDeg})), got '${label}'`
            )
          }
        } else {
          if (label !== 'own') {
            throw new Error(
              `Expected 'own' for ${planet} at ${degreeInSign}° (range [${range.fromDeg}, ${range.toDeg})), got '${label}'`
            )
          }
        }

        if (label && MAITRI_LABELS.includes(label)) {
          throw new Error(`Expected label to never be a maitri label, got '${label}' for ${planet} at ${degreeInSign}°`)
        }
      }),
      { numRuns: 100 }
    )
  })
})

describe('getVargaDignityLabel — degree-omitted parity with the frozen whole-sign classifier', () => {
  /** All seven planets carrying classical friendship dignity (Rahu/Ketu are excluded — both return undefined). */
  const ALL_DIGNITY_PLANETS = Object.keys(PERMANENT_FRIENDSHIP)

  /** Every sign number 1–12. */
  const signArb = fc.integer({ min: 1, max: 12 })

  /** A D1 map with a valid sign (1–12) for every one of the seven dignity-bearing planets. */
  const completeD1MapArb: fc.Arbitrary<Record<string, number>> = fc
    .tuple(...ALL_DIGNITY_PLANETS.map(() => fc.integer({ min: 1, max: 12 })))
    .map((signs) => {
      const map: Record<string, number> = {}
      ALL_DIGNITY_PLANETS.forEach((planet, i) => {
        map[planet] = signs[i]
      })
      return map
    })

  /** Which of the four D1-map shapes the design calls for. */
  type MapShape = 'complete' | 'empty' | 'missing_planet' | 'missing_sign_lord'
  const mapShapeArb: fc.Arbitrary<MapShape> = fc.constantFrom(
    'complete',
    'empty',
    'missing_planet',
    'missing_sign_lord'
  )

  /** Builds the concrete D1 map for `shape`, given the current `planet` and `vargaSignNumber` under test. */
  function buildD1Map(
    shape: MapShape,
    completeMap: Record<string, number>,
    planet: string,
    vargaSignNumber: number
  ): Record<string, number> {
    if (shape === 'empty') return {}
    if (shape === 'complete') return completeMap
    const map = { ...completeMap }
    if (shape === 'missing_planet') {
      delete map[planet]
    } else {
      // missing_sign_lord
      const lord = SIGN_LORDS[vargaSignNumber]
      delete map[lord]
    }
    return map
  }

  /** A degree that is non-finite, below 0, or at/above 30 — every case "usable" must reject. */
  const unusableDegreeArb: fc.Arbitrary<number> = fc.oneof(
    fc.constant(NaN),
    fc.constant(Infinity),
    fc.constant(-Infinity),
    fc.double({ min: -1000, max: -Number.EPSILON, noNaN: true }),
    fc.double({ min: 30, max: 1000, noNaN: true }),
    fc.constant(30),
    fc.constant(-0.001),
    fc.constant(45),
    fc.constant(100)
  )

  const caseArb = fc
    .tuple(fc.constantFrom(...ALL_DIGNITY_PLANETS), signArb, completeD1MapArb, mapShapeArb, unusableDegreeArb)
    .map(([planet, vargaSignNumber, completeMap, shape, badDegree]) => ({
      planet,
      vargaSignNumber,
      d1Map: buildD1Map(shape, completeMap, planet, vargaSignNumber),
      badDegree,
    }))

  // Feature: chart-ui-enhancements, Property 4: Omitting the degree reproduces today's sign-only label exactly
  it("omitting the degree reproduces today's sign-only label exactly", () => {
    fc.assert(
      fc.property(caseArb, ({ planet, vargaSignNumber, d1Map, badDegree }) => {
        const expected = frozenWholeSignDignityLabel(planet, vargaSignNumber, d1Map)

        const threeArgLabel = getVargaDignityLabel(planet, vargaSignNumber, d1Map)
        if (threeArgLabel !== expected) {
          throw new Error(
            `3-arg call disagreed with frozen classifier for ${planet} in sign ${vargaSignNumber}: expected '${expected}', got '${threeArgLabel}'`
          )
        }

        const fourArgLabel = getVargaDignityLabel(planet, vargaSignNumber, d1Map, badDegree)
        if (fourArgLabel !== expected) {
          throw new Error(
            `4-arg call with unusable degree ${badDegree} disagreed with frozen classifier for ${planet} in sign ${vargaSignNumber}: expected '${expected}', got '${fourArgLabel}'`
          )
        }
      }),
      { numRuns: 100 }
    )
  })
})

describe('getVargaDignityLabel — 9×12 table-driven regression (whole-sign behaviour unchanged)', () => {
  /**
   * All 9 planets, including Rahu/Ketu (absent from `PERMANENT_FRIENDSHIP`, so both the live
   * classifier and the frozen fixture return `undefined` for them — that agreement is itself
   * part of what this table checks).
   */
  const ALL_NINE_PLANETS = [
    'Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu',
  ] as const

  /** Every sign number 1–12. */
  const ALL_TWELVE_SIGNS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const

  /**
   * A single "complete" D1 map — every one of the seven dignity-bearing planets placed in a sign
   * — used consistently for the whole 9×12 cross-product below, so every cell exercises the full
   * maitri (permanent + temporary) branch rather than the positional-data-missing fallback. Chosen
   * arbitrarily but fixed, matching the "one consistent choice, documented" instruction.
   */
  const SOME_D1_MAP: Record<string, number> = {
    Sun: 1, Moon: 4, Mars: 8, Mercury: 3, Jupiter: 9, Venus: 7, Saturn: 11,
  }

  it('matches the frozen whole-sign classifier for all 9 planets × 12 signs (3-arg call, no degree)', () => {
    for (const planet of ALL_NINE_PLANETS) {
      for (const sign of ALL_TWELVE_SIGNS) {
        const expected = frozenWholeSignDignityLabel(planet, sign, SOME_D1_MAP)
        const actual = getVargaDignityLabel(planet, sign, SOME_D1_MAP)
        if (actual !== expected) {
          throw new Error(
            `getVargaDignityLabel(${planet}, ${sign}) === '${actual}', expected frozen classifier's '${expected}'`
          )
        }
      }
    }
  })

  // R2.14: Moon's moolatrikona sign (Taurus, 2) and Mercury's moolatrikona sign (Virgo, 6) each
  // coincide with that planet's own EXALTATION_SIGNS entry (Moon: 2, Mercury: 6). Exaltation is
  // tested before moolatrikona in getVargaDignityLabel's precedence, so both planets return
  // 'exalted' at every degree in that sign — including degrees inside their nominal moolatrikona
  // ranges (Moon [4,30), Mercury [16,20)) — because the exaltation branch returns before the
  // moolatrikona/range logic is ever reached.
  it("Moon in Taurus (sign 2) is 'exalted' at every degree, including inside its nominal [4,30) moolatrikona range", () => {
    const degreesToCheck = [0, 4, 10, 16, 18, 25, 29.9]
    for (const degreeInSign of degreesToCheck) {
      const label = getVargaDignityLabel('Moon', 2, SOME_D1_MAP, degreeInSign)
      if (label !== 'exalted') {
        throw new Error(`Expected Moon in Taurus at ${degreeInSign}° to be 'exalted', got '${label}'`)
      }
    }
  })

  it("Mercury in Virgo (sign 6) is 'exalted' at every degree, including inside its nominal [16,20) moolatrikona range", () => {
    const degreesToCheck = [0, 4, 10, 16, 18, 19.9, 20, 25, 29.9]
    for (const degreeInSign of degreesToCheck) {
      const label = getVargaDignityLabel('Mercury', 6, SOME_D1_MAP, degreeInSign)
      if (label !== 'exalted') {
        throw new Error(`Expected Mercury in Virgo at ${degreeInSign}° to be 'exalted', got '${label}'`)
      }
    }
  })
})
