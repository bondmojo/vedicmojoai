/**
 * engine/compute/gochar.range.test.ts — Fixed-date regression tests for
 * `computeGocharRange()`, Moon opt-in tests, and whole-sign house arithmetic.
 *
 * These are integration tests against the real Swiss Ephemeris. Each describe
 * block runs with a 60-second timeout to allow for ephemeris I/O.
 *
 * Design: Testing Strategy — "Fixed-date regression tests", "Moon tests",
 *         "Whole-sign house arithmetic tests"
 * Requirements: R1.1, R1.4, R1.7, R2.5, R2.6, R2.9, R7.1, R7.2, R8.1
 */

import { describe, it, expect } from 'vitest'
import {
  computeGocharRange,
  DEFAULT_GOCHAR_GRAHAS,
  ALL_GOCHAR_GRAHAS,
  type GocharGraha,
  type GocharOccupancyInterval,
} from './gochar'

// ─── Shared fixtures ─────────────────────────────────────────────────────────

/** One full calendar year, UTC. */
const NATAL_MOON_SIGN  = 4              // Cancer
const NATAL_LAGNA_SIGN = 1              // Aries
const RANGE_START      = new Date('2024-01-01T00:00:00.000Z')
const RANGE_END        = new Date('2025-01-01T00:00:00.000Z')

// ─── Helper: group intervals by planet (preserving order within each group) ──
function byGraha(
  intervals: GocharOccupancyInterval[]
): Map<GocharGraha, GocharOccupancyInterval[]> {
  const map = new Map<GocharGraha, GocharOccupancyInterval[]>()
  for (const iv of intervals) {
    const list = map.get(iv.planet) ?? []
    list.push(iv)
    map.set(iv.planet, list)
  }
  return map
}

// ─── Task 3.3: Fixed-date regression tests ───────────────────────────────────

describe('computeGocharRange — fixed-date regression (2024)', { timeout: 60_000 }, () => {
  // Compute once; share across all tests in this block.
  let result: ReturnType<typeof computeGocharRange>

  // Using a beforeAll-style lazy init: just compute at describe level.
  // Vitest does not require beforeAll for shared setup that is purely synchronous
  // from the test runner's perspective — but ephemeris work IS synchronous here,
  // so we compute lazily on first access via a module-level variable.
  // We use a getter helper to keep the intent readable.
  function getResult() {
    if (!result) {
      result = computeGocharRange({
        natalMoonSignNumber:  NATAL_MOON_SIGN,
        natalLagnaSignNumber: NATAL_LAGNA_SIGN,
        start:       RANGE_START,
        end:         RANGE_END,
        includeMoon: false,
      })
    }
    return result
  }

  it('includedGrahas exactly matches DEFAULT_GOCHAR_GRAHAS order', () => {
    const r = getResult()
    expect(r.includedGrahas).toEqual(Array.from(DEFAULT_GOCHAR_GRAHAS))
  })

  it('intervals for each graha appear in the stable DEFAULT_GOCHAR_GRAHAS order', () => {
    const r = getResult()
    // Walk the flat intervals array — graha groups must appear in the same
    // order as DEFAULT_GOCHAR_GRAHAS (i.e. all Sun intervals come before
    // all Mars intervals, etc.)
    const seenOrder: GocharGraha[] = []
    for (const iv of r.intervals) {
      if (seenOrder.length === 0 || seenOrder[seenOrder.length - 1] !== iv.planet) {
        seenOrder.push(iv.planet)
      }
    }
    // Deduplicate to get the unique stable order.
    const uniqueOrder = [...new Set(seenOrder)]
    // Every graha that appears should be in the same relative order as DEFAULT_GOCHAR_GRAHAS.
    const defaultList = Array.from(DEFAULT_GOCHAR_GRAHAS)
    const filteredDefault = defaultList.filter((g) => uniqueOrder.includes(g))
    expect(uniqueOrder).toEqual(filteredDefault)
  })

  it('rangeStart equals RANGE_START.toISOString()', () => {
    const r = getResult()
    expect(r.rangeStart).toBe(RANGE_START.toISOString())
  })

  it('rangeEnd equals RANGE_END.toISOString()', () => {
    const r = getResult()
    expect(r.rangeEnd).toBe(RANGE_END.toISOString())
  })

  it('first interval for every graha starts at rangeStart (range clipping at start)', () => {
    const r = getResult()
    const grouped = byGraha(r.intervals)
    for (const graha of DEFAULT_GOCHAR_GRAHAS) {
      const list = grouped.get(graha)
      expect(list, `intervals for ${graha}`).toBeDefined()
      expect(list![0].start, `${graha} first interval start`).toBe(r.rangeStart)
    }
  })

  it('last interval for every graha ends at rangeEnd (range clipping at end)', () => {
    const r = getResult()
    const grouped = byGraha(r.intervals)
    for (const graha of DEFAULT_GOCHAR_GRAHAS) {
      const list = grouped.get(graha)!
      expect(list[list.length - 1].end, `${graha} last interval end`).toBe(r.rangeEnd)
    }
  })

  it('intervals per graha have no gaps (each end === next start) — complete coverage', () => {
    const r = getResult()
    const grouped = byGraha(r.intervals)
    for (const graha of DEFAULT_GOCHAR_GRAHAS) {
      const list = grouped.get(graha)!
      for (let i = 0; i < list.length - 1; i++) {
        expect(
          list[i].end,
          `${graha}[${i}].end !== [${i + 1}].start`
        ).toBe(list[i + 1].start)
      }
    }
  })

  it('intervals per graha are in non-overlapping chronological order', () => {
    const r = getResult()
    const grouped = byGraha(r.intervals)
    for (const graha of DEFAULT_GOCHAR_GRAHAS) {
      const list = grouped.get(graha)!
      for (let i = 0; i < list.length - 1; i++) {
        // end of this === start of next (from coverage test), so no overlap
        // is guaranteed if that holds. Assert start < end for each interval too.
        expect(
          new Date(list[i].start).getTime(),
          `${graha}[${i}] start < end`
        ).toBeLessThan(new Date(list[i].end).getTime())
      }
    }
  })

  it('every interval start and end string ends in "Z" (UTC serialization)', () => {
    const r = getResult()
    for (const iv of r.intervals) {
      expect(iv.start, `${iv.planet} interval start not UTC`).toMatch(/Z$/)
      expect(iv.end,   `${iv.planet} interval end not UTC`).toMatch(/Z$/)
    }
  })

  it('moonIncluded is false when includeMoon: false', () => {
    const r = getResult()
    expect(r.moonIncluded).toBe(false)
  })

  it('includedGrahas field is always present on the result', () => {
    const r = getResult()
    expect(Array.isArray(r.includedGrahas)).toBe(true)
  })
})

// ─── Task 3.4: Moon opt-in tests ─────────────────────────────────────────────

describe('computeGocharRange — Moon opt-in', { timeout: 60_000 }, () => {
  // Short range to keep Moon test fast (~1 month, ~30 sign changes).
  const SHORT_START = new Date('2024-03-01T00:00:00.000Z')
  const SHORT_END   = new Date('2024-04-01T00:00:00.000Z')

  it('includeMoon: false → includedGrahas deep-equals DEFAULT_GOCHAR_GRAHAS (8, no Moon)', () => {
    const r = computeGocharRange({
      natalMoonSignNumber:  NATAL_MOON_SIGN,
      natalLagnaSignNumber: NATAL_LAGNA_SIGN,
      start:       SHORT_START,
      end:         SHORT_END,
      includeMoon: false,
    })
    expect(r.includedGrahas).toEqual(Array.from(DEFAULT_GOCHAR_GRAHAS))
    expect(r.includedGrahas).not.toContain('Moon')
    expect(r.includedGrahas).toHaveLength(8)
    expect(r.moonIncluded).toBe(false)
  })

  it('includeMoon: true → includedGrahas deep-equals ALL_GOCHAR_GRAHAS (9, includes Moon)', () => {
    const r = computeGocharRange({
      natalMoonSignNumber:  NATAL_MOON_SIGN,
      natalLagnaSignNumber: NATAL_LAGNA_SIGN,
      start:       SHORT_START,
      end:         SHORT_END,
      includeMoon: true,
    })
    expect(r.includedGrahas).toEqual(Array.from(ALL_GOCHAR_GRAHAS))
    expect(r.includedGrahas).toContain('Moon')
    expect(r.includedGrahas).toHaveLength(9)
    expect(r.moonIncluded).toBe(true)
  })

  it('coverage check holds for all 9 grahas when includeMoon: true', () => {
    const r = computeGocharRange({
      natalMoonSignNumber:  NATAL_MOON_SIGN,
      natalLagnaSignNumber: NATAL_LAGNA_SIGN,
      start:       SHORT_START,
      end:         SHORT_END,
      includeMoon: true,
    })
    const grouped = byGraha(r.intervals)
    for (const graha of r.includedGrahas) {
      const list = grouped.get(graha)
      expect(list, `intervals for ${graha}`).toBeDefined()
      expect(list![0].start, `${graha} first start`).toBe(r.rangeStart)
      expect(list![list!.length - 1].end, `${graha} last end`).toBe(r.rangeEnd)
      for (let i = 0; i < list!.length - 1; i++) {
        expect(list![i].end, `${graha}[${i}].end gap`).toBe(list![i + 1].start)
      }
    }
  })
})

// ─── Task 3.5: Whole-sign house arithmetic tests ──────────────────────────────

describe('computeGocharRange — houseFromMoon / houseFromLagna', { timeout: 60_000 }, () => {
  // Use Saturn for these tests — it's slow and predictable (stays in one sign
  // for 2-3 years), so we know exactly which sign it occupies in a given window.
  // In 2024 Saturn is in Aquarius (sign 11) through most of the year.

  it('natal Moon=1 (Aries), lagna=1 (Aries): sign 1 → house 1/1, sign 2 → house 2/2', () => {
    // Use a short range where Saturn is in Aquarius (sign 11).
    // We want intervals in known signs. Use the year 2024; Saturn is in Aquarius (11).
    // For natal Moon=1: house = ((11-1+12)%12)+1 = 11
    // For natal lagna=1: house = ((11-1+12)%12)+1 = 11
    const r = computeGocharRange({
      natalMoonSignNumber:  1,
      natalLagnaSignNumber: 1,
      start:       new Date('2024-01-01T00:00:00.000Z'),
      end:         new Date('2024-03-01T00:00:00.000Z'),
      includeMoon: false,
    })
    const saturnIntervals = r.intervals.filter((iv) => iv.planet === 'Saturn')
    expect(saturnIntervals.length).toBeGreaterThan(0)
    // All Saturn intervals in this window should be in Aquarius (11)
    // or possibly Pisces (12) near year end — but early 2024 should be sign 11.
    for (const iv of saturnIntervals) {
      const expectedMoon   = ((iv.signNumber - 1 + 12) % 12) + 1
      const expectedLagna  = ((iv.signNumber - 1 + 12) % 12) + 1
      expect(iv.houseFromMoon,  `Moon house for sign ${iv.signNumber}`).toBe(expectedMoon)
      expect(iv.houseFromLagna, `Lagna house for sign ${iv.signNumber}`).toBe(expectedLagna)
    }
  })

  it('natal Moon=12 (Pisces), lagna=11 (Aquarius): wrap-around', () => {
    // For a graha in sign 1 (Aries):
    //   houseFromMoon  = ((1 - 12 + 12) % 12) + 1 = (1 % 12) + 1 = 2
    //   houseFromLagna = ((1 - 11 + 12) % 12) + 1 = (2 % 12) + 1 = 3
    // For a graha in sign 12 (Pisces):
    //   houseFromMoon  = ((12 - 12 + 12) % 12) + 1 = (12 % 12) + 1 = 1
    //   houseFromLagna = ((12 - 11 + 12) % 12) + 1 = (13 % 12) + 1 = 2
    const r = computeGocharRange({
      natalMoonSignNumber:  12,
      natalLagnaSignNumber: 11,
      start:       new Date('2024-01-01T00:00:00.000Z'),
      end:         new Date('2024-06-01T00:00:00.000Z'),
      includeMoon: false,
    })
    // Verify every interval's house numbers match the formula.
    for (const iv of r.intervals) {
      const expectedMoon   = ((iv.signNumber - 12 + 12) % 12) + 1
      const expectedLagna  = ((iv.signNumber - 11 + 12) % 12) + 1
      expect(iv.houseFromMoon,  `${iv.planet} sign${iv.signNumber} houseFromMoon`).toBe(expectedMoon)
      expect(iv.houseFromLagna, `${iv.planet} sign${iv.signNumber} houseFromLagna`).toBe(expectedLagna)
    }
  })

  it('natal Moon=6 (Virgo), lagna=6 (Virgo): sign 6 → house 1/1 (same sign as natal)', () => {
    // In early 2024 Saturn is in sign 11. Verify formula holds.
    // For sign 11 with natal 6: ((11-6+12)%12)+1 = (5%12)+1 = 6
    const r = computeGocharRange({
      natalMoonSignNumber:  6,
      natalLagnaSignNumber: 6,
      start:       new Date('2024-01-01T00:00:00.000Z'),
      end:         new Date('2024-03-01T00:00:00.000Z'),
      includeMoon: false,
    })
    // Verify the formula holds for all intervals.
    for (const iv of r.intervals) {
      const expected = ((iv.signNumber - 6 + 12) % 12) + 1
      expect(iv.houseFromMoon,  `${iv.planet} sign${iv.signNumber}`).toBe(expected)
      expect(iv.houseFromLagna, `${iv.planet} sign${iv.signNumber}`).toBe(expected)
    }

    // Specifically check that if any interval is in sign 6, it is house 1.
    const sign6 = r.intervals.find((iv) => iv.signNumber === 6)
    if (sign6) {
      expect(sign6.houseFromMoon).toBe(1)
      expect(sign6.houseFromLagna).toBe(1)
    }
  })
})

// ─── Millisecond-precision bounds (GAP 1 regression) ─────────────────────────
//
// ── THIS IS THE GUARD FOR PD GOCHAR (Task 10). ──
//
// Task 10.2 requires the PD expansion to pass the PD's **exact** `pd.start` /
// `pd.end` ISO strings — never truncated to calendar dates (R4.2). Vimshottari
// PD boundaries are produced by proportional division of a 120-year cycle, so
// they routinely carry non-zero milliseconds.
//
// The original implementation round-tripped both outer bounds through Julian Day
// and rounded to whole seconds (`sec = Math.round(...)` in `jdToDate()`). With
// ms-bearing bounds that produced:
//
//   requested start 2024-03-15T07:23:41.837Z → emitted 2024-03-15T07:23:41.000Z
//     (the first interval began 837 ms BEFORE the requested range → breaks
//      R1.7's "clipped, never backtracked")
//   requested end   2024-06-02T19:04:12.219Z → emitted 2024-06-02T19:04:12.000Z
//     (the last interval ended 219 ms short of rangeEnd → breaks R2.9's
//      complete-coverage guarantee)
//
// The fixed-date block above cannot catch this: its fixture uses
// 2024-01-01T00:00:00.000Z / 2025-01-01T00:00:00.000Z, which are whole-second
// instants, so its `list[0].start === r.rangeStart` assertions passed by fixture
// luck. Every bound below deliberately carries non-zero milliseconds so that a
// future refactor reintroducing second-rounding fails loudly HERE, in the
// engine suite, rather than silently in the PD UI.
//
// Requirements: R1.7, R2.9, R8.1

describe('computeGocharRange — millisecond-precision bounds', { timeout: 60_000 }, () => {
  const MS_START = new Date('2024-03-15T07:23:41.837Z')
  const MS_END   = new Date('2024-06-02T19:04:12.219Z')

  let msResult: ReturnType<typeof computeGocharRange>
  function getMsResult() {
    if (!msResult) {
      msResult = computeGocharRange({
        natalMoonSignNumber:  NATAL_MOON_SIGN,
        natalLagnaSignNumber: NATAL_LAGNA_SIGN,
        start:       MS_START,
        end:         MS_END,
        includeMoon: false,
      })
    }
    return msResult
  }

  it('the fixture bounds really do carry non-zero milliseconds', () => {
    // Guards against the fixture rotting into whole-second instants, which
    // would make every assertion in this block vacuous.
    expect(MS_START.getUTCMilliseconds()).not.toBe(0)
    expect(MS_END.getUTCMilliseconds()).not.toBe(0)
  })

  it('rangeStart / rangeEnd echo the caller bounds with milliseconds intact', () => {
    const r = getMsResult()
    expect(r.rangeStart).toBe('2024-03-15T07:23:41.837Z')
    expect(r.rangeEnd).toBe('2024-06-02T19:04:12.219Z')
  })

  it('every graha\'s first interval starts exactly at the requested start', () => {
    const r = getMsResult()
    const grouped = byGraha(r.intervals)
    for (const graha of r.includedGrahas) {
      const list = grouped.get(graha)
      expect(list, `intervals for ${graha}`).toBeDefined()
      expect(list![0].start, `${graha} first start`).toBe(MS_START.toISOString())
    }
  })

  it('no interval begins before the requested range (R1.7 clipping)', () => {
    const r = getMsResult()
    for (const iv of r.intervals) {
      expect(
        new Date(iv.start).getTime(),
        `${iv.planet} ${iv.start} precedes rangeStart`
      ).toBeGreaterThanOrEqual(MS_START.getTime())
    }
  })

  it('every graha\'s last interval ends exactly at the requested end', () => {
    const r = getMsResult()
    const grouped = byGraha(r.intervals)
    for (const graha of r.includedGrahas) {
      const list = grouped.get(graha)!
      expect(list[list.length - 1].end, `${graha} last end`).toBe(MS_END.toISOString())
    }
  })

  it('no interval extends past the requested range (R2.9 coverage, upper edge)', () => {
    const r = getMsResult()
    for (const iv of r.intervals) {
      expect(
        new Date(iv.end).getTime(),
        `${iv.planet} ${iv.end} exceeds rangeEnd`
      ).toBeLessThanOrEqual(MS_END.getTime())
    }
  })

  it('interior contiguity is exact — each end string equals the next start string', () => {
    const r = getMsResult()
    const grouped = byGraha(r.intervals)
    for (const graha of r.includedGrahas) {
      const list = grouped.get(graha)!
      for (let i = 0; i < list.length - 1; i++) {
        expect(
          list[i].end,
          `${graha}[${i}].end !== [${i + 1}].start`
        ).toBe(list[i + 1].start)
      }
    }
  })

  it('no interval has end <= start', () => {
    const r = getMsResult()
    for (const iv of r.intervals) {
      expect(
        new Date(iv.end).getTime(),
        `${iv.planet} ${iv.start} → ${iv.end}`
      ).toBeGreaterThan(new Date(iv.start).getTime())
    }
  })

  it('all endpoints still serialize as UTC ending in "Z" (R8.1)', () => {
    const r = getMsResult()
    for (const iv of r.intervals) {
      expect(iv.start, `${iv.planet} start not UTC`).toMatch(/Z$/)
      expect(iv.end,   `${iv.planet} end not UTC`).toMatch(/Z$/)
    }
  })

  it('interior boundaries retain sub-second precision (jdToDate no longer rounds to whole seconds)', () => {
    // The old `jdToDate()` truncated to whole seconds, so EVERY interior
    // boundary landed on .000. Bisection-refined ingress instants are
    // effectively arbitrary, so across a ~2.5 month, 8-graha range at least one
    // must carry a non-zero millisecond field. If this fails, second-rounding
    // has been reintroduced somewhere in the JD → Date path.
    const r = getMsResult()
    const grouped = byGraha(r.intervals)
    const interiorBoundaries: string[] = []
    for (const graha of r.includedGrahas) {
      const list = grouped.get(graha)!
      // Interior boundaries only — skip the clamped outer bounds, which are the
      // caller's own strings and prove nothing about the JD conversion.
      for (let i = 1; i < list.length; i++) interiorBoundaries.push(list[i].start)
    }
    expect(interiorBoundaries.length).toBeGreaterThan(0)
    expect(
      interiorBoundaries.some((iso) => new Date(iso).getUTCMilliseconds() !== 0),
      'every interior boundary landed on .000 — whole-second rounding is back'
    ).toBe(true)
  })

  it('the same ms-bearing request is deterministic across calls (R1.7)', () => {
    const args = {
      natalMoonSignNumber:  NATAL_MOON_SIGN,
      natalLagnaSignNumber: NATAL_LAGNA_SIGN,
      start:       MS_START,
      end:         MS_END,
      includeMoon: false,
    }
    const a = computeGocharRange(args)
    const b = computeGocharRange(args)
    expect(a.intervals).toEqual(b.intervals)
  })

  it('holds for includeMoon: true as well (Moon is the fastest boundary producer)', () => {
    // Short window so the Moon's ~2.25-day sign changes stay cheap, but with
    // ms-bearing bounds throughout.
    const start = new Date('2024-03-15T07:23:41.837Z')
    const end   = new Date('2024-04-15T19:04:12.219Z')
    const r = computeGocharRange({
      natalMoonSignNumber:  NATAL_MOON_SIGN,
      natalLagnaSignNumber: NATAL_LAGNA_SIGN,
      start, end,
      includeMoon: true,
    })
    const grouped = byGraha(r.intervals)
    for (const graha of r.includedGrahas) {
      const list = grouped.get(graha)!
      expect(list[0].start, `${graha} first start`).toBe(start.toISOString())
      expect(list[list.length - 1].end, `${graha} last end`).toBe(end.toISOString())
      for (let i = 0; i < list.length - 1; i++) {
        expect(list[i].end, `${graha}[${i}] contiguity`).toBe(list[i + 1].start)
      }
      for (const iv of list) {
        expect(new Date(iv.end).getTime()).toBeGreaterThan(new Date(iv.start).getTime())
      }
    }
  })
})

// ─── No degenerate intervals (GAP 3) ────────────────────────────────────────
//
// With millisecond precision restored, a segment whose two boundaries serialize
// to the same millisecond would emit a half-open `[t, t)` interval — the empty
// set. That breaks the `start < end` contract and the strict chronological
// ordering R2.9 depends on.
//
// This is NOT hypothetical. It fires systematically whenever the caller's
// `start` lands within a millisecond of a real ingress, because the sign at that
// instant is still the pre-ingress sign while the bisection-refined boundary
// serializes back to the very same millisecond. Aligning `start` to a boundary
// harvested from a previous response — a realistic chaining pattern for both the
// UI and MCP consumers — reproduced it on 211 of 211 boundaries tested.
//
// `computeGocharRange()` drops empty segments. That is deliberately NOT a
// minimum-duration filter: nothing is merged and every interval with any
// positive duration survives, including the sub-day retrograde slivers R2.8
// requires (proven by gochar.cuspProximity.test.ts).
//
// Requirements: R2.7, R2.8, R2.9

describe('computeGocharRange — no degenerate intervals', { timeout: 120_000 }, () => {
  /** Asserts the full ordering/coverage contract for one result. */
  function assertWellFormed(r: ReturnType<typeof computeGocharRange>, label: string) {
    const grouped = byGraha(r.intervals)
    for (const graha of r.includedGrahas) {
      const list = grouped.get(graha)
      expect(list, `${label}: ${graha} has no intervals`).toBeDefined()
      expect(list![0].start, `${label}: ${graha} first start`).toBe(r.rangeStart)
      expect(list![list!.length - 1].end, `${label}: ${graha} last end`).toBe(r.rangeEnd)
      for (const iv of list!) {
        // Strictly positive duration — the degenerate case this block guards.
        expect(
          new Date(iv.end).getTime(),
          `${label}: ${graha} degenerate interval ${iv.start} → ${iv.end}`
        ).toBeGreaterThan(new Date(iv.start).getTime())
      }
      for (let i = 0; i < list!.length - 1; i++) {
        expect(list![i].end, `${label}: ${graha}[${i}] contiguity`).toBe(list![i + 1].start)
      }
    }
  }

  // Harvest real bisection-refined ingress instants from a wide nine-graha
  // range, then re-request ranges anchored exactly on them. Derived at test
  // time rather than pinned, so the fixture cannot drift out of sync with the
  // ephemeris.
  let harvested: string[]
  function getHarvestedBoundaries(): string[] {
    if (!harvested) {
      const wide = computeGocharRange({
        natalMoonSignNumber:  NATAL_MOON_SIGN,
        natalLagnaSignNumber: NATAL_LAGNA_SIGN,
        start:       new Date('2024-01-01T00:00:00.000Z'),
        end:         new Date('2024-07-01T00:00:00.000Z'),
        includeMoon: true,
      })
      harvested = [
        ...new Set(wide.intervals.map((iv) => iv.start).filter((s) => s !== wide.rangeStart)),
      ]
    }
    return harvested
  }

  it('harvests real interior ingress boundaries to anchor on', () => {
    expect(getHarvestedBoundaries().length).toBeGreaterThan(10)
  })

  it('emits no zero-duration interval when start is anchored exactly on an ingress instant', () => {
    // The load-bearing case. Sampled rather than exhaustive to keep the suite
    // fast; every anchor drives the same code path.
    const anchors = getHarvestedBoundaries().slice(0, 12)
    for (const anchor of anchors) {
      const start = new Date(anchor)
      const end = new Date(start.getTime() + 20 * 24 * 60 * 60 * 1000)
      const r = computeGocharRange({
        natalMoonSignNumber:  NATAL_MOON_SIGN,
        natalLagnaSignNumber: NATAL_LAGNA_SIGN,
        start, end,
        includeMoon: true,
      })
      assertWellFormed(r, `start anchored at ${anchor}`)
    }
  })

  it('emits no zero-duration interval when end is anchored on or adjacent to an ingress instant', () => {
    const anchors = getHarvestedBoundaries().slice(0, 8)
    for (const anchor of anchors) {
      for (const deltaMs of [-1, 0, 1]) {
        const end = new Date(new Date(anchor).getTime() + deltaMs)
        const start = new Date(end.getTime() - 20 * 24 * 60 * 60 * 1000)
        const r = computeGocharRange({
          natalMoonSignNumber:  NATAL_MOON_SIGN,
          natalLagnaSignNumber: NATAL_LAGNA_SIGN,
          start, end,
          includeMoon: true,
        })
        assertWellFormed(r, `end anchored at ${anchor}${deltaMs >= 0 ? '+' : ''}${deltaMs}ms`)
      }
    }
  })

  it('emits no zero-duration interval across the suite\'s own standing fixtures', () => {
    const fixtures: Array<{ label: string; start: Date; end: Date; includeMoon: boolean }> = [
      { label: 'full year, 8 grahas', start: RANGE_START, end: RANGE_END, includeMoon: false },
      { label: 'one month, 9 grahas',
        start: new Date('2024-03-01T00:00:00.000Z'),
        end:   new Date('2024-04-01T00:00:00.000Z'), includeMoon: true },
      { label: 'ms-bearing bounds',
        start: new Date('2024-03-15T07:23:41.837Z'),
        end:   new Date('2024-06-02T19:04:12.219Z'), includeMoon: false },
      // A near-cusp Rahu station window from gochar.cuspProximity.test.ts —
      // the sub-day retrograde dip must survive, proving the degenerate-segment
      // drop is not acting as a minimum-duration filter.
      { label: 'Rahu 1802 near-cusp dip',
        start: new Date('1802-02-07T00:00:00.000Z'),
        end:   new Date('1802-02-22T00:00:00.000Z'), includeMoon: false },
    ]
    for (const fx of fixtures) {
      const r = computeGocharRange({
        natalMoonSignNumber:  NATAL_MOON_SIGN,
        natalLagnaSignNumber: NATAL_LAGNA_SIGN,
        start: fx.start, end: fx.end, includeMoon: fx.includeMoon,
      })
      assertWellFormed(r, fx.label)
    }
  })

  it('preserves the sub-day Rahu retrograde dip (no minimum-duration filter)', () => {
    // Positive control for the assertion above: the empty-segment drop must not
    // have swallowed a legitimate sliver. Rahu dips sign 11 → 12 → 11 across the
    // 330° cusp here in roughly 0.36 days.
    const r = computeGocharRange({
      natalMoonSignNumber:  NATAL_MOON_SIGN,
      natalLagnaSignNumber: NATAL_LAGNA_SIGN,
      start:       new Date('1802-02-07T00:00:00.000Z'),
      end:         new Date('1802-02-22T00:00:00.000Z'),
      includeMoon: false,
    })
    const rahu = r.intervals.filter((iv) => iv.planet === 'Rahu')
    const dipIndex = rahu.findIndex((iv) => iv.signNumber === 12)
    expect(dipIndex, 'Rahu dip into sign 12 was dropped').toBeGreaterThan(0)
    expect(rahu[dipIndex - 1].signNumber).toBe(11)
    expect(rahu[dipIndex + 1]?.signNumber).toBe(11)
    const durationMs =
      new Date(rahu[dipIndex].end).getTime() - new Date(rahu[dipIndex].start).getTime()
    expect(durationMs).toBeGreaterThan(0)
    expect(durationMs).toBeLessThan(24 * 60 * 60 * 1000) // sub-day, per R2.8
  })
})
