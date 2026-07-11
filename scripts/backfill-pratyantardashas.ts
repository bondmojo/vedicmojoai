/**
 * scripts/backfill-pratyantardashas.ts
 *
 * One-off backfill: charts computed BEFORE full-PD storage only carry
 * pratyantardashas for the current + next mahadasha, so the Duration Analysis
 * slicer finds few or no periods for most date ranges. This script fills the
 * missing PDs into every UnifiedChart.dashaTree using the same arithmetic as
 * the compute engine (computePratyantardashas).
 *
 * Idempotent — ADs that already have PDs are left untouched.
 *
 * Run: npm run db:backfill-pd   (requires DATABASE_URL)
 */

import { PrismaClient } from '@prisma/client'
import { computePratyantardashas } from '../engine/computeVimshottari'
import type { Planet } from '../lib/types'

const prisma = new PrismaClient()

interface StoredPd {
  lord: string
  start: string
  end: string
  duration_days: number
}

interface StoredAd {
  lord: string
  start: string
  end: string
  duration_days?: number
  pratyantardashas?: StoredPd[]
}

interface StoredMd {
  lord: string
  start: string
  end: string
  duration_days?: number
  antardashas?: StoredAd[]
}

interface StoredTree {
  balance_years?: number
  mahadashas?: StoredMd[]
}

const MS_PER_DAY = 1000 * 60 * 60 * 24

/** Fills missing PDs in-place. Returns true when the tree was modified. */
function backfillTree(tree: StoredTree): boolean {
  if (!Array.isArray(tree.mahadashas)) return false

  let changed = false
  for (const md of tree.mahadashas) {
    if (!md || !Array.isArray(md.antardashas)) continue

    for (const ad of md.antardashas) {
      if (!ad || (Array.isArray(ad.pratyantardashas) && ad.pratyantardashas.length > 0)) {
        continue
      }

      const adStart = new Date(ad.start)
      const adEnd = new Date(ad.end)
      if (isNaN(adStart.getTime()) || isNaN(adEnd.getTime())) continue

      const durationDays =
        typeof ad.duration_days === 'number'
          ? ad.duration_days
          : (adEnd.getTime() - adStart.getTime()) / MS_PER_DAY

      const pds = computePratyantardashas(
        md.lord as Planet,
        ad.lord as Planet,
        adStart,
        durationDays
      )

      ad.pratyantardashas = pds.map((pd) => ({
        lord: pd.lord,
        start: pd.start.toISOString(),
        end: pd.end.toISOString(),
        duration_days: pd.duration_days,
      }))
      changed = true
    }
  }
  return changed
}

async function main() {
  const charts = await prisma.unifiedChart.findMany({
    select: { id: true, name: true, dashaTree: true },
  })
  console.log(`Scanning ${charts.length} unified charts for missing pratyantardashas...`)

  let updated = 0
  let skipped = 0
  let noTree = 0

  for (const chart of charts) {
    const tree = chart.dashaTree as StoredTree | null
    if (!tree || typeof tree !== 'object') {
      noTree++
      continue
    }

    if (backfillTree(tree)) {
      await prisma.unifiedChart.update({
        where: { id: chart.id },
        data: { dashaTree: tree as object },
      })
      updated++
      console.log(`  ✓ Backfilled: ${chart.name} (${chart.id})`)
    } else {
      skipped++
    }
  }

  console.log(
    `\nDone. ${updated} chart(s) backfilled, ${skipped} already complete, ${noTree} without a dasha tree.`
  )
}

main()
  .catch((err) => {
    console.error('Backfill failed:', err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
