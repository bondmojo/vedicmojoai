/**
 * scripts/backfill-birth-mahadasha.ts
 *
 * One-off backfill: charts computed before the birth-MD fix squeezed all nine
 * antardashas of the birth (first) mahadasha into its balance, starting at
 * birth with the MD lord's own AD, and laid the PDs out the same way. The
 * standard method (Parashara, JHora) treats the birth MD as the tail of a
 * full-length MD that began before birth, so its ADs and PDs keep their full
 * proportions and are clipped at birth. This script rebuilds the birth MD's
 * ADs and PDs in every UnifiedChart.dashaTree using the same arithmetic as the
 * compute engine (computeBirthMahadashaAntardashas).
 *
 * Only mahadashas[0].antardashas is rewritten. balance_years and every MD's
 * lord/start/end/duration_days stay as stored, so MDs 2–9 are untouched. The
 * birth MD is rebuilt from its own stored lord, start (birth) and duration
 * (balance) rather than from UnifiedChart.moonLongitude, which is rounded to
 * 4 decimals and would shift the balance.
 *
 * Idempotent — a tree whose birth MD already has the standard layout is left
 * untouched.
 *
 * Run: npm run db:backfill-birth-md              (requires DATABASE_URL)
 *      npm run db:backfill-birth-md -- --dry-run (report only, no writes)
 */

import { PrismaClient } from '@prisma/client'
import { computeBirthMahadashaAntardashas } from '../engine/computeVimshottari'
import { DASHA_YEARS, YEAR_DAYS } from '../engine/constants'
import type { Planet } from '../lib/types'

interface StoredPd {
  lord: string
  start: string
  end: string
  duration_days?: number
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

export interface StoredTree {
  balance_years?: number
  mahadashas?: StoredMd[]
}

const MS_PER_DAY = 1000 * 60 * 60 * 24

function samePeriod(a: StoredPd, b: StoredPd): boolean {
  return (
    a.lord === b.lord &&
    new Date(a.start).getTime() === new Date(b.start).getTime() &&
    new Date(a.end).getTime() === new Date(b.end).getTime() &&
    typeof a.duration_days === 'number' &&
    typeof b.duration_days === 'number' &&
    Math.abs(a.duration_days - b.duration_days) < 1e-9
  )
}

function sameAntardashas(stored: StoredAd[], rebuilt: StoredAd[]): boolean {
  if (stored.length !== rebuilt.length) return false
  return stored.every((ad, i) => {
    const pds = ad.pratyantardashas ?? []
    const rebuiltPds = rebuilt[i].pratyantardashas ?? []
    return (
      samePeriod(ad, rebuilt[i]) &&
      pds.length === rebuiltPds.length &&
      pds.every((pd, j) => samePeriod(pd, rebuiltPds[j]))
    )
  })
}

/**
 * Rebuilds the birth MD's ADs and PDs in-place. Returns true when the tree
 * was modified; false when it was already standard or is unusable.
 */
export function repairBirthMahadasha(tree: StoredTree): boolean {
  if (!Array.isArray(tree.mahadashas) || tree.mahadashas.length === 0) return false

  const md = tree.mahadashas[0]
  if (!md || !Object.prototype.hasOwnProperty.call(DASHA_YEARS, md.lord)) return false
  const lord = md.lord as Planet

  const birth = new Date(md.start)
  const mdEnd = new Date(md.end)
  if (isNaN(birth.getTime()) || isNaN(mdEnd.getTime())) return false

  const balanceDays =
    typeof md.duration_days === 'number'
      ? md.duration_days
      : (mdEnd.getTime() - birth.getTime()) / MS_PER_DAY

  // A birth MD longer than its lord's full MD isn't one this engine produced.
  if (!(balanceDays > 0) || balanceDays > DASHA_YEARS[lord] * YEAR_DAYS + 1) return false

  const rebuilt: StoredAd[] = computeBirthMahadashaAntardashas(lord, birth, balanceDays).map(
    (ad) => ({
      lord: ad.lord,
      start: ad.start.toISOString(),
      end: ad.end.toISOString(),
      duration_days: ad.duration_days,
      pratyantardashas: ad.pratyantardashas.map((pd) => ({
        lord: pd.lord,
        start: pd.start.toISOString(),
        end: pd.end.toISOString(),
        duration_days: pd.duration_days,
      })),
    })
  )

  if (Array.isArray(md.antardashas) && sameAntardashas(md.antardashas, rebuilt)) return false

  md.antardashas = rebuilt
  return true
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const prisma = new PrismaClient()

  try {
    const charts = await prisma.unifiedChart.findMany({
      select: { id: true, name: true, dashaTree: true },
    })
    console.log(
      `Scanning ${charts.length} unified charts for a compressed birth mahadasha` +
        `${dryRun ? ' (dry run — no writes)' : ''}...`
    )

    let updated = 0
    let skipped = 0
    let noTree = 0

    for (const chart of charts) {
      const tree = chart.dashaTree as StoredTree | null
      if (!tree || typeof tree !== 'object') {
        noTree++
        continue
      }

      if (repairBirthMahadasha(tree)) {
        if (!dryRun) {
          await prisma.unifiedChart.update({
            where: { id: chart.id },
            data: { dashaTree: tree as object },
          })
        }
        updated++
        console.log(`  ✓ ${dryRun ? 'Would rebuild' : 'Rebuilt'}: ${chart.name} (${chart.id})`)
      } else {
        skipped++
      }
    }

    console.log(
      `\nDone. ${updated} chart(s) ${dryRun ? 'would be rebuilt' : 'rebuilt'}, ` +
        `${skipped} already standard or unusable, ${noTree} without a dasha tree.`
    )
  } finally {
    await prisma.$disconnect()
  }
}

/**
 * Run the CLI only when this file IS the entry point, so
 * tests/vimshottari-birth-mahadasha.test.ts can import repairBirthMahadasha
 * without a Prisma connect. Same argv check as scripts/load-places.ts (Vitest
 * loads this file as ESM, where `require.main` does not exist).
 */
if ((process.argv[1] ?? '').includes('backfill-birth-mahadasha')) {
  main().catch((err) => {
    console.error('Backfill failed:', err)
    process.exitCode = 1
  })
}
