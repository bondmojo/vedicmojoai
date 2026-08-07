/**
 * prisma/backfill-gender.ts
 *
 * One-off, idempotent migration (Requirement OD-6): populates
 * UnifiedChart.gender from chartInputV1.meta.gender where present, for rows
 * where gender is still null. Rows with no chartInputV1.meta.gender are left
 * gender: null — gender is genuinely optional (see design.md §Prisma —
 * UnifiedChart.gender), so "nothing to backfill for this row" is a valid
 * terminal state, not an error.
 *
 * Values are validated through `chart-mapper.ts`'s `toGender` before being
 * written — a malformed value (garbage string, wrong casing surviving from
 * old pasted JSON) is skipped rather than written verbatim, so this script
 * can never produce a `UnifiedChart.gender` value the matchmaking picker's
 * `=== 'male'`/`'female'` comparisons or the Gender enum itself wouldn't
 * recognize. `toGender` already normalizes case/whitespace, so a
 * differently-cased but otherwise valid value (e.g. "Female") is still
 * backfilled — just written in its canonical lowercase form.
 *
 * Unlike prisma/backfill-owner.ts, this column has no later "tighten to
 * NOT NULL" migration, so there's no need to fall back to $executeRaw to
 * stay valid on both sides of a future migration — the typed Prisma Client
 * is used directly.
 *
 * Idempotent: only rows with gender: null are selected, and each row's
 * gender is set exactly once, so re-running finds nothing left to update
 * for the same source data (a no-op) rather than overwriting anything.
 *
 * Run: npm run db:backfill-gender
 */

import { prisma } from '../lib/db'
import { toGender } from '../lib/chart-mapper'

function extractGender(chartInputV1: unknown): string | undefined {
  if (!chartInputV1 || typeof chartInputV1 !== 'object') return undefined
  const meta = (chartInputV1 as { meta?: unknown }).meta
  if (!meta || typeof meta !== 'object') return undefined
  return toGender((meta as { gender?: unknown }).gender)
}

async function main() {
  const candidates = await prisma.unifiedChart.findMany({
    where: { gender: null },
    select: { id: true, chartInputV1: true },
  })

  let updated = 0
  let skippedInvalid = 0
  for (const chart of candidates) {
    const gender = extractGender(chart.chartInputV1)
    if (!gender) {
      // Distinguish "nothing there" from "something there but not a
      // recognized gender value" only for the summary line below —
      // `chartInputV1.meta.gender` itself isn't re-inspected for VALIDITY
      // here (toGender already made that one call), only for presence, so a
      // non-string value (e.g. a stray number/boolean in old pasted JSON)
      // still counts as "present but invalid" rather than silently folding
      // into "nothing there".
      const meta = (chart.chartInputV1 as { meta?: { gender?: unknown } } | null)?.meta
      const rawGender = meta?.gender
      const isPresent = typeof rawGender === 'string' ? rawGender.trim().length > 0 : rawGender != null
      if (isPresent) skippedInvalid++
      continue
    }

    await prisma.unifiedChart.update({
      where: { id: chart.id },
      data: { gender },
    })
    updated++
  }

  if (updated === 0 && skippedInvalid === 0) {
    console.log(
      'No UnifiedChart rows with a chartInputV1.meta.gender to backfill — nothing to do (idempotent no-op).'
    )
  } else {
    console.log(
      `Backfilled gender for ${updated} UnifiedChart row(s) out of ${candidates.length} candidate(s)` +
        (skippedInvalid > 0 ? ` (${skippedInvalid} skipped — meta.gender present but not a recognized value).` : '.')
    )
  }
}

main()
  .catch((err) => {
    console.error('Backfill failed:', err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
