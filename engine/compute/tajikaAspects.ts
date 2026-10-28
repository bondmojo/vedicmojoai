/**
 * engine/compute/tajikaAspects.ts — Tajika (annual-chart) aspects, sign-based.
 *
 * Tajika aspects are not the Parashari Graha Drishti in relationships.ts. Per
 * Tajika Neelakanthi, two planets in the same sign or the 7th from each other
 * are openly inimical (pratyaksha shatru), the 4th/10th secretly inimical (gupta
 * shatru), the 5th/9th openly friendly (pratyaksha mitra) and the 3rd/11th
 * secretly friendly (gupta mitra). Every aspect is mutual. The 2nd/6th/8th/12th
 * carry no aspect.
 *
 * METHOD NOTES / CAVEATS:
 *   - PHASE 1 — aspects are decided by sign distance only. Deeptamsha orbs
 *     (Sun 15°, Moon 12°, Mars 8°, Mercury 7°, Jupiter 9°, Venus 7°, Saturn 9°)
 *     and applying/separating motion, which Ithasala/Ishrafa need, are Phase 2.
 *   - Tajika works with the seven classical planets. Nothing here filters the
 *     nodes, so callers pass classical planets only.
 *   - Conjunction (same sign) is an aspect: it pairs with the opposition as the
 *     open inimical aspect.
 *   - This module is purely geometric. Which aspects count for a particular
 *     rule (e.g. the Varshesha's Lagna check) is decided by the caller.
 *
 * Pure functions: no DB, no I/O, never throws. The table is frozen.
 */

import type { TajikaAspectKind, TajikaAspectNature, TajikaSignAspect } from './types'

type TajikaAspectEntry = Readonly<Omit<TajikaSignAspect, 'distance'>>

function entry(kind: TajikaAspectKind, nature: TajikaAspectNature): TajikaAspectEntry {
  return Object.freeze({ kind, nature })
}

/** Inclusive sign distance (same sign = 1) → Tajika aspect. */
export const TAJIKA_ASPECT_BY_DISTANCE: Readonly<Record<number, TajikaAspectEntry>> = Object.freeze({
  1:  entry('conjunction', 'inimical'),
  3:  entry('sextile', 'friendly'),
  11: entry('sextile', 'friendly'),
  5:  entry('trine', 'friendly'),
  9:  entry('trine', 'friendly'),
  4:  entry('square', 'inimical'),
  10: entry('square', 'inimical'),
  7:  entry('opposition', 'inimical'),
})

/**
 * Tajika aspect between two signs (1–12), or null when there is none. Symmetric
 * in kind and nature; `distance` is counted from `fromSign` to `toSign`.
 */
export function getTajikaSignAspect(fromSign: number, toSign: number): TajikaSignAspect | null {
  if (!isSignNumber(fromSign) || !isSignNumber(toSign)) return null
  const distance = ((toSign - fromSign + 12) % 12) + 1
  const aspect = TAJIKA_ASPECT_BY_DISTANCE[distance]
  return aspect ? { ...aspect, distance } : null
}

function isSignNumber(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && n <= 12
}
