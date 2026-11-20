/**
 * engine/compute/tajikaAspects.test.ts — sign-based Tajika aspects (Phase 1).
 *
 * Exhaustive over all 144 sign pairs: the aspect is fixed by sign distance
 * alone, and every aspect is mutual.
 */

import { describe, expect, it } from 'vitest'
import { getTajikaSignAspect, TAJIKA_ASPECT_BY_DISTANCE } from './tajikaAspects'

/** Expected aspect by inclusive sign distance (same sign = 1). */
const EXPECTED: Record<number, { kind: string; nature: string } | null> = {
  1: { kind: 'conjunction', nature: 'inimical' },
  2: null,
  3: { kind: 'sextile', nature: 'friendly' },
  4: { kind: 'square', nature: 'inimical' },
  5: { kind: 'trine', nature: 'friendly' },
  6: null,
  7: { kind: 'opposition', nature: 'inimical' },
  8: null,
  9: { kind: 'trine', nature: 'friendly' },
  10: { kind: 'square', nature: 'inimical' },
  11: { kind: 'sextile', nature: 'friendly' },
  12: null,
}

const SIGNS = Array.from({ length: 12 }, (_, i) => i + 1)

describe('getTajikaSignAspect', () => {
  it('maps every sign pair to the aspect for its distance', () => {
    for (const from of SIGNS) {
      for (const to of SIGNS) {
        const distance = ((to - from + 12) % 12) + 1
        const expected = EXPECTED[distance]
        const aspect = getTajikaSignAspect(from, to)
        if (expected === null) {
          expect(aspect).toBeNull()
        } else {
          expect(aspect).toEqual({ ...expected, distance })
        }
      }
    }
  })

  it('is mutual: the reverse direction has the same kind and nature', () => {
    for (const from of SIGNS) {
      for (const to of SIGNS) {
        const forward = getTajikaSignAspect(from, to)
        const reverse = getTajikaSignAspect(to, from)
        expect(reverse?.kind).toBe(forward?.kind)
        expect(reverse?.nature).toBe(forward?.nature)
      }
    }
  })

  it('treats the same sign as an open inimical aspect, like the opposition', () => {
    expect(getTajikaSignAspect(4, 4)).toEqual({ kind: 'conjunction', nature: 'inimical', distance: 1 })
    expect(getTajikaSignAspect(4, 10)!.nature).toBe('inimical')
  })

  it('counts distance from the aspecting sign (Aries→Leo is the 5th, Leo→Aries the 9th)', () => {
    expect(getTajikaSignAspect(1, 5)).toEqual({ kind: 'trine', nature: 'friendly', distance: 5 })
    expect(getTajikaSignAspect(5, 1)).toEqual({ kind: 'trine', nature: 'friendly', distance: 9 })
  })

  it('keeps the aspect table frozen and returns copies', () => {
    expect(Object.isFrozen(TAJIKA_ASPECT_BY_DISTANCE)).toBe(true)
    for (const aspect of Object.values(TAJIKA_ASPECT_BY_DISTANCE)) {
      expect(Object.isFrozen(aspect)).toBe(true)
    }
    const copy = getTajikaSignAspect(1, 5)!
    copy.kind = 'square'
    expect(getTajikaSignAspect(1, 5)!.kind).toBe('trine')
  })

  it('returns null for out-of-range or non-integer sign numbers', () => {
    expect(getTajikaSignAspect(0, 5)).toBeNull()
    expect(getTajikaSignAspect(1, 13)).toBeNull()
    expect(getTajikaSignAspect(1.5, 5)).toBeNull()
    expect(getTajikaSignAspect(Number.NaN, 5)).toBeNull()
  })
})
