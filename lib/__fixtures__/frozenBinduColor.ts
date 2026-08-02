/**
 * lib/__fixtures__/frozenBinduColor.ts
 * -------------------------------------
 * Frozen, verbatim transcription of the pre-migration `getBinduColor` from
 * `app/components/AshtakavargaView.tsx`.
 *
 * This is a TEST-SUPPORT fixture only — it exists so Property 11
 * (`lib/ashtakavargaBands.test.ts`) can check the new `savBand` / `bavBand`
 * token migration against the OLD literal-Tailwind-class behaviour, rather
 * than against itself. Do NOT use this in production code, and do NOT update
 * it to track future changes to `getBinduColor` / `savBand` / `bavBand` — its
 * entire value is staying frozen at what the thresholds were before the
 * migration (Design: Testing Strategy — "Properties 4 and 11 both assert
 * against frozen reference implementations").
 */

/**
 * Verbatim transcription of the pre-migration `getBinduColor`
 * (`app/components/AshtakavargaView.tsx`). Same signature, same threshold
 * ladder, same literal Tailwind class strings.
 */
export function frozenGetBinduColor(value: number, isSAV: boolean): string {
  if (isSAV) {
    if (value >= 30) return 'text-green-400 bg-green-900/20'
    if (value >= 25) return 'text-gray-200 bg-gray-800'
    return 'text-red-400 bg-red-900/20'
  }
  // BAV: max is 8
  if (value >= 5) return 'text-green-400 bg-green-900/20'
  if (value >= 4) return 'text-gray-200 bg-gray-800'
  if (value >= 3) return 'text-yellow-400 bg-yellow-900/20'
  return 'text-red-400 bg-red-900/20'
}
