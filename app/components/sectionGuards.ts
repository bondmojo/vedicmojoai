/**
 * app/components/sectionGuards.ts
 * --------------------------------
 * Shape guards for the R8 unavailable-section mechanism (see design.md,
 * "R8 — the unavailable-section mechanism"). Each pane calls `guardSection`
 * with a narrow, named predicate to decide whether a payload section is
 * well-formed enough to render, or should render
 * `<SectionUnavailable section="…" />` (`./SectionUnavailable.tsx`) instead.
 *
 * Pure TypeScript, no React import — so it type-checks and can be exercised
 * standalone even though every consumer is a React component. No throwing on
 * malformed input, mirroring the established convention in
 * `engine/compute/dignity.ts` and `lib/ashtakavargaBands.ts`.
 *
 * These guards cover exactly the malformed shapes R8.1 enumerates: wrong
 * type, an array where an object is expected, a sign-indexed collection
 * whose length is not 12, and a BAV collection without the 7 graha keys.
 */

/** Result of guarding a section's data against its expected shape. */
export type SectionState<T> = { ok: true; data: T } | { ok: false }

/** True when `v` is an array with exactly `n` entries. */
export function isArrayOfLength<T>(v: unknown, n: number): v is T[] {
  return Array.isArray(v) && v.length === n
}

/** True when `v` is an array with at least one entry. */
export function isNonEmptyArray<T>(v: unknown): v is T[] {
  return Array.isArray(v) && v.length > 0
}

/**
 * True when `v` is a non-null, non-array object — R8.1's "an array where an
 * object is expected", plus the `null` and wrong-primitive-type cases, for a
 * payload section whose own field set is checked further down (or not at all,
 * because every field it carries is individually optional).
 *
 * `hasNumberArrays` is the stricter sibling for the keyed-arrays shape; this
 * one is what a pane's root prop is guarded with before any field is read.
 */
export function isPlainObject<T>(v: unknown): v is T {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * True when `v` is a non-null, non-array object carrying, for every key in
 * `keys`, an array of exactly `len` numbers. Used for BAV-shaped collections
 * keyed by graha name — R8.1's "a BAV collection without the 7 graha keys".
 * An array in place of the expected object (or any other non-object) fails,
 * as does a present key whose array is the wrong length or holds non-numbers.
 */
export function hasNumberArrays(v: unknown, keys: readonly string[], len: number): boolean {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false
  const obj = v as Record<string, unknown>
  return keys.every((key) => {
    const arr = obj[key]
    return Array.isArray(arr) && arr.length === len && arr.every((n) => typeof n === 'number')
  })
}

/**
 * Single entry point every pane uses to guard a section: runs `check`
 * against `value` and narrows to `{ ok: true; data: T }` on success or
 * `{ ok: false }` on any malformed shape. Never throws.
 *
 * Usage pattern, identical in every pane:
 * ```tsx
 * const bav = guardSection(data.bav, (v): v is Bav => hasNumberArrays(v, BAV_PLANETS, 12))
 * …
 * {bav.ok ? <BavDiagrams data={bav.data} /> : <SectionUnavailable section="Bhinnashtakavarga" />}
 * ```
 */
export function guardSection<T>(value: unknown, check: (v: unknown) => v is T): SectionState<T> {
  return check(value) ? { ok: true, data: value } : { ok: false }
}
