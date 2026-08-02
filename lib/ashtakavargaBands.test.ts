/**
 * lib/ashtakavargaBands.test.ts
 * ------------------------------
 * Property 11: Bindu band assignment survives the token migration and band
 * signals stay distinct.
 *
 * Validates: Requirements 4.2, 4.3, 4.4, 4.6, 4.9
 *
 * Property 12: SAV cells equal the BAV column sums and total the reported
 * savTotal.
 *
 * Validates: Requirements 5.2, 5.7
 */

import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import {
  savBand,
  bavBand,
  bandOf,
  SAV_BANDS,
  BAV_BANDS,
  deriveBinduSlots,
  BAV_PLANETS,
  type BinduBand,
} from './ashtakavargaBands'
import { frozenGetBinduColor } from './__fixtures__/frozenBinduColor'
import type { AshtakavargaResult, AshtakavargaHouseEntry } from '@/engine/compute/types'

/**
 * Maps a frozen `getBinduColor` Tailwind class string back to the band
 * concept it represents, so the migration can be checked against the OLD
 * behaviour rather than against itself.
 */
function bandFromFrozenClass(cls: string): BinduBand {
  switch (cls) {
    case 'text-green-400 bg-green-900/20':
      return 'favorable'
    case 'text-gray-200 bg-gray-800':
      return 'moderate'
    case 'text-yellow-400 bg-yellow-900/20':
      return 'cautionary'
    case 'text-red-400 bg-red-900/20':
      return 'unfavorable'
    default:
      throw new Error(`Unrecognized frozen class: ${cls}`)
  }
}

describe('Property 11: Bindu band assignment survives the token migration and band signals stay distinct', () => {
  // Feature: chart-ui-enhancements, Property 11: Bindu band assignment survives the token migration and band signals stay distinct
  it('savBand matches the frozen getBinduColor(value, true) classification for every SAV count 0-56', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 56 }), (count) => {
        const expected = bandFromFrozenClass(frozenGetBinduColor(count, true))
        return savBand(count) === expected && bandOf(count, 'sav') === expected
      }),
      { numRuns: 100 }
    )
  })

  // Feature: chart-ui-enhancements, Property 11: Bindu band assignment survives the token migration and band signals stay distinct
  it('bavBand matches the frozen getBinduColor(value, false) classification for every BAV count 0-8', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 8 }), (count) => {
        const expected = bandFromFrozenClass(frozenGetBinduColor(count, false))
        return bavBand(count) === expected && bandOf(count, 'bav') === expected
      }),
      { numRuns: 100 }
    )
  })

  // Feature: chart-ui-enhancements, Property 11: Bindu band assignment survives the token migration and band signals stay distinct
  it('the hostile arbitrary (NaN, -1, 57, 2.5, undefined, null) always yields a null band', () => {
    const hostile = fc.constantFrom(NaN, -1, 57, 2.5, undefined, null)
    fc.assert(
      fc.property(hostile, (count) => {
        return (
          savBand(count) === null &&
          bavBand(count) === null &&
          bandOf(count, 'sav') === null &&
          bandOf(count, 'bav') === null
        )
      }),
      { numRuns: 100 }
    )
  })

  // Feature: chart-ui-enhancements, Property 11: Bindu band assignment survives the token migration and band signals stay distinct
  it('SAV_BANDS markers are pairwise distinct', () => {
    const markers = SAV_BANDS.map((b) => b.marker)
    for (let i = 0; i < markers.length; i++) {
      for (let j = i + 1; j < markers.length; j++) {
        if (markers[i] === markers[j]) {
          throw new Error(`SAV_BANDS markers not distinct: ${markers[i]} at ${i} and ${j}`)
        }
      }
    }
  })

  // Feature: chart-ui-enhancements, Property 11: Bindu band assignment survives the token migration and band signals stay distinct
  it('BAV_BANDS markers are pairwise distinct', () => {
    const markers = BAV_BANDS.map((b) => b.marker)
    for (let i = 0; i < markers.length; i++) {
      for (let j = i + 1; j < markers.length; j++) {
        if (markers[i] === markers[j]) {
          throw new Error(`BAV_BANDS markers not distinct: ${markers[i]} at ${i} and ${j}`)
        }
      }
    }
  })
})

// ─── Property 12 ────────────────────────────────────────────────────────────

/** A single planet's SIGN-indexed 12-slot BAV array, each count 0-8. */
const bavSignArrayArb = fc.array(fc.integer({ min: 0, max: 8 }), {
  minLength: 12,
  maxLength: 12,
})

/**
 * Well-formed SIGN-indexed `AshtakavargaResult` (no `byHouse`): 7 BAV arrays
 * are generated freely, then `sav[i]` is DERIVED as the sum of the 7 BAV
 * values at slot `i`, and `savTotal` is derived as the sum of `sav`. This
 * guarantees internal consistency by construction, so the property actually
 * exercises whether `deriveBinduSlots` PRESERVES that consistency rather than
 * whether the input happens to already have it.
 */
const wellFormedSignDataArb: fc.Arbitrary<AshtakavargaResult> = fc
  .record(
    BAV_PLANETS.reduce<Record<string, fc.Arbitrary<number[]>>>((acc, planet) => {
      acc[planet] = bavSignArrayArb
      return acc
    }, {})
  )
  .map((bav) => {
    const sav = Array.from({ length: 12 }, (_, i) =>
      BAV_PLANETS.reduce((sum, planet) => sum + bav[planet][i], 0)
    )
    const savTotal = sav.reduce((a, b) => a + b, 0)
    return { bav, sav, savTotal }
  })

/** One house's per-planet BAV counts, each 0-8. */
const houseBavRecordArb = fc.record(
  BAV_PLANETS.reduce<Record<string, fc.Arbitrary<number>>>((acc, planet) => {
    acc[planet] = fc.integer({ min: 0, max: 8 })
    return acc
  }, {})
)

/**
 * Well-formed `AshtakavargaResult` carrying a consistent `byHouse`: 12 houses
 * are generated with independent per-planet counts, each house's `sav` is
 * DERIVED as the sum of its own BAV counts, and the top-level `savTotal` is
 * derived as the sum of the 12 house `sav` values — so `savTotal` is
 * consistent with `byHouse`, the mode under test. The sign-indexed `bav`/`sav`
 * fields are still required by the type but are irrelevant to house mode, so
 * they are filled independently and never asserted on here.
 */
const wellFormedHouseDataArb: fc.Arbitrary<AshtakavargaResult> = fc
  .tuple(
    fc.array(houseBavRecordArb, { minLength: 12, maxLength: 12 }),
    wellFormedSignDataArb
  )
  .map(([houseBavRecords, signData]) => {
    const byHouse: AshtakavargaHouseEntry[] = houseBavRecords.map((bavForHouse, i) => {
      const sav = BAV_PLANETS.reduce((sum, planet) => sum + bavForHouse[planet], 0)
      return {
        house: i + 1,
        signNumber: i + 1,
        sign: `Sign${i + 1}`,
        sav,
        bav: bavForHouse,
      }
    })
    const savTotal = byHouse.reduce((sum, h) => sum + h.sav, 0)
    return {
      ...signData,
      savTotal,
      lagnaSignNumber: 1,
      byHouse,
    }
  })

describe('Property 12: SAV cells equal the BAV column sums and total the reported savTotal', () => {
  // Feature: chart-ui-enhancements, Property 12: SAV cells equal the BAV column sums and total the reported savTotal
  it('sign mode: each slot SAV equals the sum of the 7 BAV values at that slot, and the total matches savTotal', () => {
    fc.assert(
      fc.property(wellFormedSignDataArb, (data) => {
        const slots = deriveBinduSlots(data, 'sign')
        for (let i = 0; i < 12; i++) {
          const bavSum = BAV_PLANETS.reduce(
            (sum, planet) => sum + (slots.bav[planet][i] ?? 0),
            0
          )
          if (slots.sav[i] !== bavSum) return false
          // The derived slot value matches the raw source value verbatim —
          // the same value the numeric-table derivation reads.
          for (const planet of BAV_PLANETS) {
            if (slots.bav[planet][i] !== data.bav[planet][i]) return false
          }
          if (slots.sav[i] !== data.sav[i]) return false
        }
        const total = slots.sav.reduce<number>((sum, v) => sum + (v ?? 0), 0)
        return total === slots.savTotal && slots.savTotal === data.savTotal
      }),
      { numRuns: 100 }
    )
  })

  // Feature: chart-ui-enhancements, Property 12: SAV cells equal the BAV column sums and total the reported savTotal
  it('house mode: each slot SAV equals the sum of the 7 BAV values at that slot, and the total matches savTotal', () => {
    fc.assert(
      fc.property(wellFormedHouseDataArb, (data) => {
        const slots = deriveBinduSlots(data, 'house')
        const byHouse = data.byHouse!
        for (let i = 0; i < 12; i++) {
          const bavSum = BAV_PLANETS.reduce(
            (sum, planet) => sum + (slots.bav[planet][i] ?? 0),
            0
          )
          if (slots.sav[i] !== bavSum) return false
          // The derived slot value matches byHouse verbatim.
          for (const planet of BAV_PLANETS) {
            if (slots.bav[planet][i] !== byHouse[i].bav[planet]) return false
          }
          if (slots.sav[i] !== byHouse[i].sav) return false
        }
        const total = slots.sav.reduce<number>((sum, v) => sum + (v ?? 0), 0)
        return total === slots.savTotal && slots.savTotal === data.savTotal
      }),
      { numRuns: 100 }
    )
  })

  // R5.5 — house-mode fidelity example: byHouse `sav` values that deliberately
  // contradict a naive rotation of the sign-indexed `sav` array. Proves house
  // mode reads `byHouse` verbatim with no house-to-sign arithmetic.
  it('house mode reads byHouse verbatim, not a rotation of the sign-indexed sav array (R5.5)', () => {
    const offset = 5
    // Sign-indexed sav: 0, 4, 8, ..., 44 (slot i -> i * 4), well within 0-56.
    const sav = Array.from({ length: 12 }, (_, i) => i * 4)
    // byHouse.sav is set so it does NOT equal a naive rotation of `sav` by
    // `offset`: every value is the rotated one PLUS 1, guaranteeing a
    // mismatch since the rotated values are all distinct, and staying within
    // the valid 0-56 SAV range so it is not nulled out by range validation.
    const byHouse: AshtakavargaHouseEntry[] = Array.from({ length: 12 }, (_, i) => {
      const rotatedValue = sav[(i + offset) % 12]
      const houseSav = rotatedValue + 1
      const bavForHouse = BAV_PLANETS.reduce<Record<string, number>>((acc, planet, idx) => {
        // Distribute the deliberately-non-rotated sav across the 7 planets
        // (first planet absorbs the remainder), each within 0-8.
        acc[planet] = idx === 0 ? Math.min(8, houseSav) : 0
        return acc
      }, {})
      return {
        house: i + 1,
        signNumber: ((i + offset) % 12) + 1,
        sign: `Sign${((i + offset) % 12) + 1}`,
        sav: houseSav,
        bav: bavForHouse,
      }
    })

    const data: AshtakavargaResult = {
      bav: BAV_PLANETS.reduce<Record<string, number[]>>((acc, planet) => {
        acc[planet] = Array.from({ length: 12 }, () => 0)
        return acc
      }, {}),
      sav,
      savTotal: sav.reduce((a, b) => a + b, 0),
      lagnaSignNumber: 1,
      byHouse,
    }

    const slots = deriveBinduSlots(data, 'house')

    // The derived SAV slots match byHouse's values verbatim...
    expect(slots.sav).toEqual(byHouse.map((h) => h.sav))
    // ...and NOT a rotated version of the sign-indexed sav array.
    const naiveRotation = Array.from({ length: 12 }, (_, i) => sav[(i + offset) % 12])
    expect(slots.sav).not.toEqual(naiveRotation)
  })
})
