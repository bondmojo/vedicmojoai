/**
 * API: /api/charts/[id]/dasha
 * GET — Computed Vimshottari dasha tree with current period derived at request time
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { computeVimshottari } from '@/engine/computeVimshottari'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const chart = await prisma.chart.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      moonLongitude: true,
      birthDatetime: true,
      chartHash: true,
    },
  })

  if (!chart) {
    return NextResponse.json({ error: 'Chart not found' }, { status: 404 })
  }

  // Check cache first
  const cache = await prisma.wave1Cache.findUnique({
    where: { chartHash: chart.chartHash },
    select: { dashaTree: true },
  })

  let dashaTree
  if (cache?.dashaTree) {
    dashaTree = cache.dashaTree
  } else {
    // Compute fresh
    dashaTree = computeVimshottari(
      Number(chart.moonLongitude),
      chart.birthDatetime
    )
  }

  // Derive current period from today (always fresh, not stored)
  const now = new Date()
  const mahadashas = (dashaTree as { mahadashas: Array<{ lord: string; start: string; end: string; duration_days: number; antardashas: Array<{ lord: string; start: string; end: string; duration_days: number; pratyantardashas?: Array<{ lord: string; start: string; end: string; duration_days: number }> }> }> }).mahadashas

  let currentPeriod: {
    mahadasha?: string
    antardasha?: string
    pratyantar?: string
    md_start?: string
    md_end?: string
    ad_start?: string
    ad_end?: string
  } = {}

  for (const md of mahadashas) {
    const mdStart = new Date(md.start)
    const mdEnd = new Date(md.end)
    if (now >= mdStart && now < mdEnd) {
      currentPeriod.mahadasha = md.lord
      currentPeriod.md_start = md.start
      currentPeriod.md_end = md.end

      for (const ad of md.antardashas) {
        const adStart = new Date(ad.start)
        const adEnd = new Date(ad.end)
        if (now >= adStart && now < adEnd) {
          currentPeriod.antardasha = ad.lord
          currentPeriod.ad_start = ad.start
          currentPeriod.ad_end = ad.end

          if (ad.pratyantardashas) {
            for (const pd of ad.pratyantardashas) {
              const pdStart = new Date(pd.start)
              const pdEnd = new Date(pd.end)
              if (now >= pdStart && now < pdEnd) {
                currentPeriod.pratyantar = pd.lord
                break
              }
            }
          }
          break
        }
      }
      break
    }
  }

  return NextResponse.json({
    chartId: chart.id,
    currentPeriod,
    dashaTree,
  })
}
