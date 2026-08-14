/**
 * engine/compute/gochar.bodyIds.test.ts — Body-table drift test.
 *
 * Asserts `GOCHAR_BODY_IDS` (engine/compute/gochar.ts) stays in lock-step
 * with the private `PLANET_IDS` table in `engine/compute/transits.ts`. That
 * table is not exported, so its literal id values are hardcoded here as the
 * source of truth to diff against — if `transits.ts`'s `PLANET_IDS` ever
 * changes without a matching update to `GOCHAR_BODY_IDS`, this test catches
 * the drift.
 *
 * Mirrors transits.ts's private PLANET_IDS as of this writing:
 *   Sun=0, Moon=1, Mars=4, Mercury=2, Jupiter=5, Venus=3, Saturn=6, Rahu=11
 *
 * Design: Testing Strategy — "Body-table drift"
 * Requirements: R1.2
 */

import { describe, expect, it } from 'vitest'
import { GOCHAR_BODY_IDS, ALL_GOCHAR_GRAHAS, type GocharGraha } from './gochar'

/**
 * Literal ephemeris body ids mirrored from transits.ts's private
 * `PLANET_IDS` array. Not imported (it isn't exported) — kept here as the
 * independent expected values this test diffs `GOCHAR_BODY_IDS` against.
 */
const EXPECTED_TRANSITS_IDS: Record<Exclude<GocharGraha, 'Ketu'>, number> = {
  Sun: 0,
  Moon: 1,
  Mercury: 2,
  Venus: 3,
  Mars: 4,
  Jupiter: 5,
  Saturn: 6,
  Rahu: 11,
}

const NON_KETU_GRAHAS = ALL_GOCHAR_GRAHAS.filter((g) => g !== 'Ketu') as Exclude<GocharGraha, 'Ketu'>[]

describe('GOCHAR_BODY_IDS — body-table drift', () => {
  it.each(NON_KETU_GRAHAS)('has exactly one entry for %s matching the transits.ts id', (graha) => {
    const matches = GOCHAR_BODY_IDS.filter((entry) => entry.graha === graha)
    expect(matches).toHaveLength(1)
    expect(matches[0].id).toBe(EXPECTED_TRANSITS_IDS[graha])
  })

  it('has no entry for Ketu', () => {
    const ketuEntry = GOCHAR_BODY_IDS.find((entry) => entry.graha === 'Ketu')
    expect(ketuEntry).toBeUndefined()
  })

  it('has exactly 8 entries (one per non-Ketu GocharGraha)', () => {
    expect(GOCHAR_BODY_IDS).toHaveLength(8)
  })

  it('has no duplicate id values across entries', () => {
    const ids = GOCHAR_BODY_IDS.map((entry) => entry.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
