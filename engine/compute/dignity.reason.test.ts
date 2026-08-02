/**
 * engine/compute/dignity.reason.test.ts — Property-based tests for
 * `getVargaDignityReason()` and its agreement with `getVargaDignityLabel()`.
 *
 * See design.md "Correctness Properties" (Property 1, Property 2) for the
 * full statements this file validates.
 */

import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  getVargaDignityLabel,
  getVargaDignityReason,
  PERMANENT_FRIENDSHIP,
  MOOLATRIKONA_SIGNS,
  MOOLATRIKONA_RANGES,
  SIGN_LORDS,
  EXALTATION_SIGNS,
  DEBILITATION_SIGNS,
} from './dignity'

/** Local mirror of dignity.ts's private SIGN_NAMES — Aries…Pisces, 1-indexed. */
const SIGN_NAMES: readonly string[] = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
]

const ALL_PLANETS = Object.keys(PERMANENT_FRIENDSHIP) // Sun, Moon, Mars, Mercury, Jupiter, Venus, Saturn
const MAITRI_LABELS = new Set(['great_friend', 'friend', 'neutral', 'enemy', 'great_enemy'])

type MapShape = 'complete' | 'empty' | 'missingPlanet' | 'missingLord'

/**
 * Build a D1 sign map of one of the four required shapes. `complete` assigns
 * every planet a distinct-ish sign so `planetD1`/`lordD1` are always numbers;
 * `missingPlanet`/`missingLord` delete exactly one key from the complete map
 * (the two coincide when the sign's lord is the planet itself, which is a
 * valid case, not an error).
 */
function buildD1Map(shape: MapShape, planet: string, lord: string): Record<string, number> {
  if (shape === 'empty') return {}
  const complete: Record<string, number> = {}
  ALL_PLANETS.forEach((p, i) => {
    complete[p] = ((i * 5) % 12) + 1
  })
  if (shape === 'complete') return complete
  const copy = { ...complete }
  if (shape === 'missingPlanet') delete copy[planet]
  else delete copy[lord]
  return copy
}

/** Degree-in-sign case: omitted, a plain value in [0, 30], or non-finite/out-of-range. */
const degreeCaseArb = fc.oneof(
  fc.constant({ kind: 'omitted' as const }),
  fc.record({ kind: fc.constant('inRangeOfDomain' as const), value: fc.double({ min: 0, max: 30, noNaN: true }) }),
  fc.record({
    kind: fc.constant('unusable' as const),
    value: fc.oneof(
      fc.constant(NaN),
      fc.constant(Infinity),
      fc.constant(-Infinity),
      fc.double({ min: -1000, max: -0.0001, noNaN: true }),
      fc.double({ min: 30, max: 1000, noNaN: true }),
    ),
  }),
)

function degreeFromCase(c: { kind: string; value?: number }): number | undefined {
  return c.kind === 'omitted' ? undefined : c.value
}

const mapShapeArb: fc.Arbitrary<MapShape> = fc.constantFrom('complete', 'empty', 'missingPlanet', 'missingLord')

const caseArb = fc.record({
  planet: fc.constantFrom(...ALL_PLANETS),
  vargaSignNumber: fc.integer({ min: 1, max: 12 }),
  mapShape: mapShapeArb,
  degreeCase: degreeCaseArb,
})

const NO_MARKUP = /[<>&]/

describe('getVargaDignityReason — agreement with getVargaDignityLabel', () => {
  // Feature: chart-ui-enhancements, Property 1: Dignity reason agrees with the dignity label
  it('reason.label matches getVargaDignityLabel and rule selection matches precedence', () => {
    fc.assert(
      fc.property(caseArb, ({ planet, vargaSignNumber, mapShape, degreeCase }) => {
        const lord = SIGN_LORDS[vargaSignNumber]
        const d1SignByPlanet = buildD1Map(mapShape, planet, lord)
        const degreeInSign = degreeFromCase(degreeCase)

        const label = getVargaDignityLabel(planet, vargaSignNumber, d1SignByPlanet, degreeInSign)
        const reason = getVargaDignityReason(planet, vargaSignNumber, d1SignByPlanet, degreeInSign)

        // Both functions carry the same undefined-guards for planet (in PERMANENT_FRIENDSHIP)
        // and vargaSignNumber (integer 1..12) is enforced by the generator, so both must agree
        // on definedness and — since they are defined — on the label itself.
        if (reason === undefined) {
          throw new Error(
            `Expected a reason for ${planet} at sign ${vargaSignNumber} (map=${mapShape}, degree=${degreeInSign}), got undefined`
          )
        }
        if (label === undefined) {
          throw new Error(`Expected a label for ${planet} at sign ${vargaSignNumber}, got undefined`)
        }
        if (reason.label !== label) {
          throw new Error(
            `Label mismatch for ${planet} at sign ${vargaSignNumber} (map=${mapShape}, degree=${degreeInSign}): reason.label=${reason.label}, getVargaDignityLabel=${label}`
          )
        }

        // --- General text constraints (Property 1, universal clause) ---
        if (reason.text.length === 0) {
          throw new Error(`Expected non-empty text for ${planet} at sign ${vargaSignNumber}`)
        }
        if (reason.text.length > 160) {
          throw new Error(`Expected text <= 160 chars, got ${reason.text.length}: "${reason.text}"`)
        }
        if (NO_MARKUP.test(reason.text)) {
          throw new Error(`Expected no markup characters in text: "${reason.text}"`)
        }

        // --- Rule-selection conditions, computed independently from the tables ---
        const sign = SIGN_NAMES[vargaSignNumber - 1]
        const isExaltation = EXALTATION_SIGNS[planet] === vargaSignNumber
        const isDebilitation = DEBILITATION_SIGNS[planet] === vargaSignNumber
        const isMoolSign = MOOLATRIKONA_SIGNS[planet] === vargaSignNumber
        const noHigherPrecedence = !isExaltation && !isDebilitation
        const degreeUsable = Number.isFinite(degreeInSign) && (degreeInSign as number) >= 0 && (degreeInSign as number) < 30
        const range = MOOLATRIKONA_RANGES[planet]
        const inRange = degreeUsable && !!range && (degreeInSign as number) >= range.fromDeg && (degreeInSign as number) < range.toDeg

        const expectMoolatrikona = isMoolSign && noHigherPrecedence && inRange
        const expectMoolSignOnly = isMoolSign && noHigherPrecedence && !degreeUsable

        if ((reason.rule === 'moolatrikona') !== expectMoolatrikona) {
          throw new Error(
            `moolatrikona rule mismatch for ${planet} at sign ${vargaSignNumber} degree=${degreeInSign}: got rule=${reason.rule}, expected moolatrikona=${expectMoolatrikona}`
          )
        }
        if (expectMoolatrikona) {
          if (!reason.text.includes(sign)) {
            throw new Error(`Expected moolatrikona text to name the sign "${sign}": "${reason.text}"`)
          }
          if (!reason.text.includes(String(range!.fromDeg)) || !reason.text.includes(String(range!.toDeg))) {
            throw new Error(
              `Expected moolatrikona text to name both range bounds ${range!.fromDeg}/${range!.toDeg}: "${reason.text}"`
            )
          }
        }

        if ((reason.rule === 'moolatrikona_sign_only') !== expectMoolSignOnly) {
          throw new Error(
            `moolatrikona_sign_only rule mismatch for ${planet} at sign ${vargaSignNumber} degree=${degreeInSign}: got rule=${reason.rule}, expected=${expectMoolSignOnly}`
          )
        }
        if (expectMoolSignOnly) {
          if (!reason.text.includes(sign)) {
            throw new Error(`Expected sign-only text to name the sign "${sign}": "${reason.text}"`)
          }
          const lower = reason.text.toLowerCase()
          if (!lower.includes('no degree was available') || !lower.includes('sign alone was used')) {
            throw new Error(`Expected sign-only text to state the sign alone was used: "${reason.text}"`)
          }
        }

        const isMaitriLabel = MAITRI_LABELS.has(label)
        const planetD1 = d1SignByPlanet[planet]
        const lordD1 = d1SignByPlanet[lord]
        const expectMaitriPermanentOnly = isMaitriLabel && (planetD1 == null || lordD1 == null)

        if ((reason.rule === 'maitri_permanent_only') !== expectMaitriPermanentOnly) {
          throw new Error(
            `maitri_permanent_only rule mismatch for ${planet} at sign ${vargaSignNumber} (map=${mapShape}): got rule=${reason.rule}, expected=${expectMaitriPermanentOnly}`
          )
        }
        if (expectMaitriPermanentOnly) {
          if (reason.signLord !== lord) {
            throw new Error(`Expected signLord=${lord}, got ${reason.signLord}`)
          }
          if (!reason.text.includes(lord)) {
            throw new Error(`Expected text to name the sign lord "${lord}": "${reason.text}"`)
          }
          if (reason.permanentRelation && !reason.text.includes(reason.permanentRelation)) {
            throw new Error(`Expected text to name the permanent relation "${reason.permanentRelation}": "${reason.text}"`)
          }
          const lower = reason.text.toLowerCase()
          if (!lower.includes('no rasi positions were available for the temporary relation')) {
            throw new Error(`Expected text to state no temporary relation was available: "${reason.text}"`)
          }
        }

        // --- Precedence sanity: the rule selected must be the branch that
        // precedence assigns to this label, for the labels not covered above ---
        if (label === 'exalted' && reason.rule !== 'exaltation') {
          throw new Error(`Expected rule='exaltation' for label='exalted', got ${reason.rule}`)
        }
        if (label === 'debilitated' && reason.rule !== 'debilitation') {
          throw new Error(`Expected rule='debilitation' for label='debilitated', got ${reason.rule}`)
        }
        if (label === 'own' && reason.rule !== 'own') {
          throw new Error(`Expected rule='own' for label='own', got ${reason.rule}`)
        }
        if (isMaitriLabel && !expectMaitriPermanentOnly && reason.rule !== 'maitri') {
          throw new Error(`Expected rule='maitri' for maitri label '${label}', got ${reason.rule}`)
        }
      }),
      { numRuns: 100 }
    )
  })
})

// ─── Property 2 ────────────────────────────────────────────────────────

/** Any value that is not an integer from 1 through 12 — non-integers, zero, negatives, NaN, above 12. */
const invalidVargaSignNumberArb = fc.oneof(
  fc.double({ min: -100, max: 100, noNaN: true }).filter((v) => !Number.isInteger(v)),
  fc.constant(0),
  fc.integer({ min: -100, max: 0 }),
  fc.integer({ min: 13, max: 100 }),
  fc.constant(NaN),
)

/** A planet name that may or may not be classical (Sun..Saturn), or an arbitrary string. */
const anyPlanetArb = fc.oneof(
  fc.constantFrom(...ALL_PLANETS, 'Rahu', 'Ketu'),
  fc.string(),
)

/** A planet name deliberately absent from PERMANENT_FRIENDSHIP: Rahu, Ketu, or any other unknown string. */
const nonDignityPlanetArb = fc.oneof(
  fc.constantFrom('Rahu', 'Ketu'),
  fc.string().filter((s) => !ALL_PLANETS.includes(s)),
)

describe('getVargaDignityReason — unusable varga signs and non-dignity planets', () => {
  // Feature: chart-ui-enhancements, Property 2: An unusable varga sign yields no reason
  it('returns undefined for a non-integer / out-of-range vargaSignNumber, for any planet', () => {
    fc.assert(
      fc.property(
        anyPlanetArb,
        invalidVargaSignNumberArb,
        mapShapeArb,
        degreeCaseArb,
        (planet, vargaSignNumber, mapShape, degreeCase) => {
          const d1SignByPlanet = buildD1Map(mapShape, planet, SIGN_LORDS[1])
          const degreeInSign = degreeFromCase(degreeCase)
          const result = getVargaDignityReason(planet, vargaSignNumber, d1SignByPlanet, degreeInSign)
          if (result !== undefined) {
            throw new Error(
              `Expected undefined for vargaSignNumber=${vargaSignNumber} (planet=${planet}, degree=${degreeInSign}), got ${JSON.stringify(result)}`
            )
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  // Feature: chart-ui-enhancements, Property 2: An unusable varga sign yields no reason
  it('returns undefined for any planet absent from PERMANENT_FRIENDSHIP, regardless of sign, map or degree', () => {
    fc.assert(
      fc.property(
        nonDignityPlanetArb,
        fc.integer({ min: 1, max: 12 }),
        mapShapeArb,
        degreeCaseArb,
        (planet, vargaSignNumber, mapShape, degreeCase) => {
          const d1SignByPlanet = buildD1Map(mapShape, planet, SIGN_LORDS[vargaSignNumber])
          const degreeInSign = degreeFromCase(degreeCase)
          const result = getVargaDignityReason(planet, vargaSignNumber, d1SignByPlanet, degreeInSign)
          if (result !== undefined) {
            throw new Error(
              `Expected undefined for non-dignity planet=${planet} at sign ${vargaSignNumber} (degree=${degreeInSign}), got ${JSON.stringify(result)}`
            )
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})

/**
 * Deterministic guard for the sub-case of Property 2 that only surfaced on the
 * fast-check draws that happen to produce an Object.prototype key. `fc.string()`
 * biases toward '__proto__' / 'toString' / 'valueOf', and a bare
 * `PERMANENT_FRIENDSHIP[planet]` lookup resolves those inherited members — so the
 * "no dignity row" guard used to let them through and then throw on
 * `OWN_SIGNS[planet].includes`. Pinned here so the case is checked every run.
 */
describe('dignity gate rejects inherited Object.prototype keys', () => {
  const PROTOTYPE_KEYS = [
    '__proto__', 'toString', 'valueOf', 'constructor', 'hasOwnProperty',
    'isPrototypeOf', 'propertyIsEnumerable', 'toLocaleString',
    '__defineGetter__', '__defineSetter__', '__lookupGetter__', '__lookupSetter__',
  ]

  it.each(PROTOTYPE_KEYS)('treats "%s" as a non-dignity planet in both functions', (key) => {
    const d1SignByPlanet = { Sun: 5, Moon: 2, Mars: 1, Mercury: 6, Jupiter: 9, Venus: 7, Saturn: 11 }
    for (let sign = 1; sign <= 12; sign++) {
      expect(getVargaDignityReason(key, sign, d1SignByPlanet, 3.5)).toBeUndefined()
      expect(getVargaDignityReason(key, sign, d1SignByPlanet, undefined)).toBeUndefined()
      expect(getVargaDignityLabel(key, sign, d1SignByPlanet, 3.5)).toBeUndefined()
      expect(getVargaDignityLabel(key, sign, d1SignByPlanet, undefined)).toBeUndefined()
    }
  })
})
