/**
 * app/components/yogaGrouping.test.ts
 * ------------------------------------
 * Property 13: Yoga grouping and ordering are total and deterministic.
 *
 * Validates: Requirements 7.2, 7.4, 7.10
 */

import { describe, it } from 'vitest'
import fc from 'fast-check'
import { groupYogas, YOGA_CATEGORY_ORDER } from './yogaGrouping'
import type { Yoga, YogaCategory, YogaStrength } from '@/engine/compute/types'

const KNOWN_CATEGORIES = new Set<string>(YOGA_CATEGORY_ORDER)

const STRENGTH_RANK: Record<YogaStrength, number> = {
  strong: 0,
  moderate: 1,
  weak: 2,
}

/** A handful of injected unknown-category strings, alongside the nine known ones. */
const UNKNOWN_CATEGORIES = ['exotic', 'unclassified', 'special-x'] as const

const categoryArb: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom(...YOGA_CATEGORY_ORDER),
  fc.constantFrom(...UNKNOWN_CATEGORIES)
)

/** Small alphabet for `name` so duplicate names (and thus tie-breaking) are actually exercised. */
const nameArb = fc.constantFrom('Alpha', 'Beta', 'alpha', 'Gamma', 'Delta', 'beta')

const strengthArb: fc.Arbitrary<YogaStrength> = fc.constantFrom('strong', 'moderate', 'weak')

const planetArb = fc.constantFrom(
  'Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'
)

const yogaArb: fc.Arbitrary<Yoga> = fc.record({
  key: fc.string({ minLength: 1, maxLength: 8 }),
  name: nameArb,
  category: categoryArb as fc.Arbitrary<YogaCategory>,
  planets: fc.array(planetArb, { maxLength: 3 }),
  houses: fc.array(fc.integer({ min: 1, max: 12 }), { maxLength: 3 }),
  benefic: fc.boolean(),
  strength: strengthArb,
  activatingPlanets: fc.array(planetArb, { maxLength: 2 }),
  evidence: fc.record({
    rule: fc.string({ minLength: 1, maxLength: 8 }),
  }),
})

const yogasArrayArb = fc.array(yogaArb, { maxLength: 15 })

describe('Property 13: Yoga grouping and ordering are total and deterministic', () => {
  // Feature: chart-ui-enhancements, Property 13: Yoga grouping and ordering are total and deterministic
  it('emits every input entry exactly once, with the total equal to the input length', () => {
    fc.assert(
      fc.property(yogasArrayArb, (yogas) => {
        const groups = groupYogas(yogas)

        const flattened = groups.flatMap((g) => g.yogas)
        if (flattened.length !== yogas.length) {
          throw new Error(
            `Expected total entries ${yogas.length}, got ${flattened.length}`
          )
        }

        // Every input entry appears exactly once, by reference (the helper never clones entries).
        for (const entry of yogas) {
          const occurrences = flattened.filter((e) => e === entry).length
          if (occurrences !== 1) {
            throw new Error(
              `Expected entry ${JSON.stringify(entry.key)} to appear exactly once, appeared ${occurrences} times`
            )
          }
        }
        // And every output entry is one of the input entries (no fabrication).
        for (const entry of flattened) {
          if (!yogas.includes(entry)) {
            throw new Error('Output contains an entry not present in the input')
          }
        }
      }),
      { numRuns: 100 }
    )
  })

  // Feature: chart-ui-enhancements, Property 13: Yoga grouping and ordering are total and deterministic
  it('places every entry whose category is outside the nine known values into a single trailing group', () => {
    fc.assert(
      fc.property(yogasArrayArb, (yogas) => {
        const groups = groupYogas(yogas)

        const unknownGroups = groups.filter((g) => !KNOWN_CATEGORIES.has(g.category))
        if (unknownGroups.length > 1) {
          throw new Error(`Expected at most one trailing unknown-category group, got ${unknownGroups.length}`)
        }

        const expectedUnknownEntries = yogas.filter(
          (y) => typeof y.category !== 'string' || !KNOWN_CATEGORIES.has(y.category)
        )

        if (expectedUnknownEntries.length === 0) {
          if (unknownGroups.length !== 0) {
            throw new Error('Expected no trailing group when every entry has a known category')
          }
          return
        }

        if (unknownGroups.length !== 1) {
          throw new Error('Expected exactly one trailing group when unknown-category entries exist')
        }

        const trailing = unknownGroups[0]
        // The trailing group must be the last group in the output.
        if (groups[groups.length - 1] !== trailing) {
          throw new Error('Expected the unknown-category group to be positioned last')
        }

        // The trailing group must contain exactly the unknown-category entries (as a multiset, by reference).
        if (trailing.yogas.length !== expectedUnknownEntries.length) {
          throw new Error(
            `Expected trailing group to hold ${expectedUnknownEntries.length} entries, got ${trailing.yogas.length}`
          )
        }
        for (const entry of expectedUnknownEntries) {
          if (!trailing.yogas.includes(entry)) {
            throw new Error('Expected trailing group to contain every unknown-category entry')
          }
        }
      }),
      { numRuns: 100 }
    )
  })

  // Feature: chart-ui-enhancements, Property 13: Yoga grouping and ordering are total and deterministic
  it('orders entries within each group by strength descending then name ascending', () => {
    fc.assert(
      fc.property(yogasArrayArb, (yogas) => {
        const groups = groupYogas(yogas)

        for (const group of groups) {
          for (let i = 0; i + 1 < group.yogas.length; i++) {
            const a = group.yogas[i]
            const b = group.yogas[i + 1]
            const rankA = STRENGTH_RANK[a.strength]
            const rankB = STRENGTH_RANK[b.strength]
            if (rankA > rankB) {
              throw new Error(
                `Strength ordering violated in group '${group.category}' at index ${i}: '${a.strength}' before '${b.strength}'`
              )
            }
            if (rankA === rankB) {
              const cmp = a.name.localeCompare(b.name, 'en')
              if (cmp > 0) {
                throw new Error(
                  `Name ordering violated in group '${group.category}' at index ${i}: '${a.name}' before '${b.name}'`
                )
              }
            }
          }
        }
      }),
      { numRuns: 100 }
    )
  })

  // Feature: chart-ui-enhancements, Property 13: Yoga grouping and ordering are total and deterministic
  it('omits groups with zero entries', () => {
    fc.assert(
      fc.property(yogasArrayArb, (yogas) => {
        const groups = groupYogas(yogas)
        for (const group of groups) {
          if (group.yogas.length === 0) {
            throw new Error(`Expected no empty groups, found empty group '${group.category}'`)
          }
        }
      }),
      { numRuns: 100 }
    )
  })

  // Feature: chart-ui-enhancements, Property 13: Yoga grouping and ordering are total and deterministic
  it('produces an identical result when called twice on the same input', () => {
    fc.assert(
      fc.property(yogasArrayArb, (yogas) => {
        const first = groupYogas(yogas)
        const second = groupYogas(yogas)
        // Deep-equal comparison (JSON round-trip is fine here: Yoga entries are plain
        // JSON-serializable data with no functions, dates or cycles).
        if (JSON.stringify(first) !== JSON.stringify(second)) {
          throw new Error('Expected groupYogas to be deterministic across repeated calls on the same input')
        }
      }),
      { numRuns: 100 }
    )
  })
})
