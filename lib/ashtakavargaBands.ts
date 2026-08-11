/**
 * lib/ashtakavargaBands.ts
 * ------------------------
 * Pure band + slot derivation for the Ashtakavarga bindu diagrams and tables.
 *
 * Thresholds below are transcribed UNCHANGED from `getBinduColor` in
 * `app/components/AshtakavargaView.tsx` (pre-migration):
 *
 *   SAV: >=30 favorable | >=25 moderate | else unfavorable
 *   BAV: >=5 favorable | ===4 moderate | ===3 cautionary | else unfavorable
 *
 * Pure TypeScript, no React import, so this module runs in the existing
 * `environment: 'node'` Vitest setup.
 */

import type { AshtakavargaResult } from '@/engine/compute/types'

// ─── Bands ─────────────────────────────────────────────────────────────────

export type BinduReckoning = 'bav' | 'sav'
export type BinduBand = 'favorable' | 'moderate' | 'cautionary' | 'unfavorable'

export interface BandDescriptor {
  band: BinduBand
  /** Inclusive integer range, e.g. "30–56" or "4". */
  range: string
  /** Legend wording, e.g. "Strong". */
  label: string
  /** Non_Colour_Signal glyph appended after the numeral. */
  marker: string
}

/** True when `v` is a finite integer within `[min, max]`. */
function isUsableInt(v: unknown, min: number, max: number): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max
}

/** null when count is absent, non-integer or outside 0–56 (R4.9). */
export function savBand(count: unknown): BinduBand | null {
  if (!isUsableInt(count, 0, 56)) return null
  if (count >= 30) return 'favorable'
  if (count >= 25) return 'moderate'
  return 'unfavorable'
}

/** null when count is absent, non-integer or outside 0–8 (R4.9). */
export function bavBand(count: unknown): BinduBand | null {
  if (!isUsableInt(count, 0, 8)) return null
  if (count >= 5) return 'favorable'
  if (count === 4) return 'moderate'
  if (count === 3) return 'cautionary'
  return 'unfavorable'
}

export function bandOf(count: unknown, reckoning: BinduReckoning): BinduBand | null {
  return reckoning === 'sav' ? savBand(count) : bavBand(count)
}

/** Exactly 3 bands — SAV has no `cautionary` step. */
export const SAV_BANDS: readonly BandDescriptor[] = [
  { band: 'favorable', range: '30–56', label: 'Favorable', marker: '▲' },
  { band: 'moderate', range: '25–29', label: 'Moderate', marker: '=' },
  { band: 'unfavorable', range: '0–24', label: 'Unfavorable', marker: '▼' },
]

/** Exactly 4 bands. */
export const BAV_BANDS: readonly BandDescriptor[] = [
  { band: 'favorable', range: '5–8', label: 'Favorable', marker: '▲' },
  { band: 'moderate', range: '4', label: 'Moderate', marker: '=' },
  { band: 'cautionary', range: '3', label: 'Cautionary', marker: '▽' },
  { band: 'unfavorable', range: '0–2', label: 'Unfavorable', marker: '▼' },
]

export function bandsFor(reckoning: BinduReckoning): readonly BandDescriptor[] {
  return reckoning === 'sav' ? SAV_BANDS : BAV_BANDS
}

// ─── Slot derivation ────────────────────────────────────────────────────────

/** The seven grahas Bhinnashtakavarga is computed for. */
export const BAV_PLANETS: readonly string[] = [
  'Sun',
  'Moon',
  'Mars',
  'Mercury',
  'Jupiter',
  'Venus',
  'Saturn',
]

/** Aries-first sign labels, used for the sign-indexed fallback. */
const SIGN_LABELS: readonly string[] = [
  'Ari',
  'Tau',
  'Gem',
  'Can',
  'Leo',
  'Vir',
  'Lib',
  'Sco',
  'Sag',
  'Cap',
  'Aqu',
  'Pis',
]

export interface BinduSlots {
  labels: string[] // 12
  signNumbers: (number | undefined)[] // 12
  houses: (number | undefined)[] // 12
  sav: (number | null)[] // 12
  bav: Record<string, (number | null)[]>
  savTotal: number | null
}

/** null unless `v` is a finite integer (no reckoning-specific range applied). */
function normalizeInt(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) ? v : null
}

/** True when `data.byHouse` is present and carries exactly 12 entries. */
function hasUsableByHouse(data: AshtakavargaResult): boolean {
  return Array.isArray(data.byHouse) && data.byHouse.length === 12
}

/**
 * Pure 12-slot derivation for the active index mode. Reads `byHouse` verbatim
 * in house mode — no house-to-sign arithmetic performed here. Falls back to
 * the sign-indexed arrays with Aries-first labels when `indexMode` is `'sign'`,
 * or when `'house'` was requested but `byHouse` is absent / not exactly 12
 * entries long.
 */
export function deriveBinduSlots(
  data: AshtakavargaResult,
  indexMode: 'sign' | 'house'
): BinduSlots {
  const savTotal = normalizeInt(data.savTotal)

  if (indexMode === 'house' && hasUsableByHouse(data)) {
    const byHouse = data.byHouse!
    const bav: Record<string, (number | null)[]> = {}
    for (const planet of BAV_PLANETS) {
      bav[planet] = byHouse.map((h) => {
        const v = h.bav?.[planet]
        return isUsableInt(v, 0, 8) ? v : null
      })
    }
    return {
      labels: byHouse.map((h) => `H${h.house}`),
      signNumbers: byHouse.map((h) => h.signNumber),
      houses: byHouse.map((h) => h.house),
      sav: byHouse.map((h) => (isUsableInt(h.sav, 0, 56) ? h.sav : null)),
      bav,
      savTotal,
    }
  }

  // Sign-indexed fallback (Aries-first).
  const bav: Record<string, (number | null)[]> = {}
  for (const planet of BAV_PLANETS) {
    const arr = data.bav?.[planet]
    bav[planet] = Array.from({ length: 12 }, (_, i) => {
      const v = arr?.[i]
      return isUsableInt(v, 0, 8) ? v : null
    })
  }
  return {
    labels: [...SIGN_LABELS],
    signNumbers: Array.from({ length: 12 }, (_, i) => i + 1),
    houses: Array.from({ length: 12 }, () => undefined),
    sav: Array.from({ length: 12 }, (_, i) => {
      const v = data.sav?.[i]
      return isUsableInt(v, 0, 56) ? v : null
    }),
    bav,
    savTotal,
  }
}
