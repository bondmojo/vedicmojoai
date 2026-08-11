/**
 * scripts/migrate-saved-to-unified.ts
 *
 * One-off migration: promote legacy SavedChart rows into the canonical
 * UnifiedChart store so they appear in AI Analysis and Duration Analysis.
 *
 * Each SavedChart keeps its original birth inputs, so promotion recomputes
 * the chart through the same shared creator used by
 * POST /api/unified-charts/from-compute (full domain data + PD-level dasha
 * tree). Dedup on chartHash makes this idempotent — charts already promoted
 * report as duplicates and nothing is written.
 *
 * SavedChart rows are left untouched (legacy/read-only).
 *
 * Requirement 5.2/6.2: UnifiedChart.userId is required, so promoted charts
 * need an owner — pass the email of the account they should belong to.
 *
 * Run: npm run db:migrate-saved -- practitioner@example.com
 *   or: MIGRATE_SAVED_OWNER_EMAIL=practitioner@example.com npm run db:migrate-saved
 */

import { prisma } from '../lib/db'
import { createUnifiedChartFromBirthData } from '../lib/unified-chart-create'

async function main() {
  const email = (process.argv[2] || process.env.MIGRATE_SAVED_OWNER_EMAIL || '').trim().toLowerCase()
  if (!email) {
    console.error('Usage: npm run db:migrate-saved -- <owner-email>')
    console.error('   or: MIGRATE_SAVED_OWNER_EMAIL=<owner-email> npm run db:migrate-saved')
    process.exitCode = 1
    return
  }

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) {
    console.error(`No User found for ${email}. Sign up (or run db:backfill-owner) first.`)
    process.exitCode = 1
    return
  }

  const savedCharts = await prisma.savedChart.findMany({
    orderBy: { createdAt: 'asc' },
  })
  console.log(`Found ${savedCharts.length} saved chart(s) to promote to ${email}...`)

  let created = 0
  let duplicates = 0
  let failed = 0

  for (const sc of savedCharts) {
    try {
      const result = await createUnifiedChartFromBirthData({
        name: sc.name,
        date: sc.birthDate,
        time: sc.birthTime,
        timezone: Number(sc.timezone),
        latitude: Number(sc.latitude),
        longitude: Number(sc.longitude),
        sunriseMode: sc.sunriseMode === 'jhora' ? 'jhora' : 'precise',
        userId: user.id,
      })

      if (result.status === 'created') {
        created++
        console.log(`  ✓ Promoted: "${sc.name}" → unified ${result.id}`)
      } else {
        duplicates++
        console.log(`  = Already unified: "${sc.name}" (exists as "${result.name}", ${result.id})`)
      }
    } catch (err) {
      failed++
      console.error(`  ✗ Failed: "${sc.name}" — ${err instanceof Error ? err.message : err}`)
    }
  }

  console.log(
    `\nDone. ${created} promoted, ${duplicates} already unified, ${failed} failed. SavedChart rows were left untouched.`
  )
  if (failed > 0) process.exitCode = 1
}

main()
  .catch((err) => {
    console.error('Migration failed:', err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
