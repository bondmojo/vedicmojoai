/**
 * app/components/yogaGrouping.ts — pure yoga grouping helper for the Yogas tab (R7).
 *
 * Groups a `Yoga[]` catalogue by `category` into a fixed, deterministic display order for
 * `YogasView`. No React import — this module is testable standalone (Property 13,
 * `app/components/yogaGrouping.test.ts`).
 *
 * Spec: .kiro/specs/chart-ui-enhancements/
 */

import type { Yoga, YogaCategory, YogaStrength } from '@/engine/compute/types'

/** Fixed category display order (Requirement 7.4). */
export const YOGA_CATEGORY_ORDER: readonly YogaCategory[] = [
  'mahapurusha',
  'raja',
  'dhana',
  'viparita',
  'lunar',
  'neechabhanga',
  'parivartana',
  'kartari',
  'combination',
] as const

const KNOWN_CATEGORIES: ReadonlySet<string> = new Set<string>(YOGA_CATEGORY_ORDER)

const STRENGTH_RANK: Record<YogaStrength, number> = {
  strong: 0,
  moderate: 1,
  weak: 2,
}

export interface YogaGroup {
  /**
   * One of the nine known `YogaCategory` values for a standard group, or — for the single
   * trailing group holding entries whose `category` is none of those nine — the distinct raw
   * category value(s) encountered, joined in first-seen order (Requirement 7.4).
   */
  category: string
  yogas: Yoga[]
}

/** Strength descending (strong, moderate, weak), then name ascending, fixed 'en' locale. */
function compareYogas(a: Yoga, b: Yoga): number {
  const rankA = STRENGTH_RANK[a?.strength as YogaStrength] ?? STRENGTH_RANK.weak
  const rankB = STRENGTH_RANK[b?.strength as YogaStrength] ?? STRENGTH_RANK.weak
  if (rankA !== rankB) return rankA - rankB
  return (a?.name ?? '').localeCompare(b?.name ?? '', 'en')
}

/**
 * Groups a yoga catalogue by category into a fixed, deterministic display order.
 *
 * - Groups by `category` in the order mahapurusha, raja, dhana, viparita, lunar,
 *   neechabhanga, parivartana, kartari, combination; a group with zero entries is omitted.
 * - Every entry whose `category` is not one of those nine values is placed into a single
 *   trailing group, positioned after all nine, so no entry is dropped.
 * - Within every group, entries are ordered by `strength` descending (strong, moderate, weak)
 *   then by `name` ascending (`localeCompare`, fixed `'en'` locale), so repeated calls on the
 *   same input produce an identical order.
 * - The total number of entries across the returned groups always equals `yogas.length`.
 * - Pure and no-throw: absent, null or non-array input yields an empty result.
 *
 * @param yogas The deterministic yoga catalogue (`chart.yogas`), or undefined/null when absent.
 */
export function groupYogas(yogas: Yoga[] | undefined | null): YogaGroup[] {
  if (!Array.isArray(yogas) || yogas.length === 0) return []

  const byCategory = new Map<YogaCategory, Yoga[]>()
  const trailing: Yoga[] = []
  const trailingCategoriesSeen: string[] = []
  const trailingCategoriesSet = new Set<string>()

  for (const yoga of yogas) {
    const category = yoga?.category
    if (typeof category === 'string' && KNOWN_CATEGORIES.has(category)) {
      const bucket = byCategory.get(category as YogaCategory)
      if (bucket) {
        bucket.push(yoga)
      } else {
        byCategory.set(category as YogaCategory, [yoga])
      }
    } else {
      trailing.push(yoga)
      const rawCategory = typeof category === 'string' ? category : String(category)
      if (!trailingCategoriesSet.has(rawCategory)) {
        trailingCategoriesSet.add(rawCategory)
        trailingCategoriesSeen.push(rawCategory)
      }
    }
  }

  const groups: YogaGroup[] = []

  for (const category of YOGA_CATEGORY_ORDER) {
    const bucket = byCategory.get(category)
    if (bucket && bucket.length > 0) {
      groups.push({ category, yogas: [...bucket].sort(compareYogas) })
    }
  }

  if (trailing.length > 0) {
    groups.push({
      category: trailingCategoriesSeen.join(', '),
      yogas: [...trailing].sort(compareYogas),
    })
  }

  return groups
}
