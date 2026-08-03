/**
 * GET /api/unified-charts — List all unified charts.
 *
 * Returns a lightweight list with metadata and run counts.
 * Supports optional query params:
 *   ?search=name    — filter by name (case-insensitive contains)
 *   ?lagna=Taurus   — filter by lagna sign
 *   ?source=compute — filter by source (compute|paste)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { resolveRequestUser } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const userId = await resolveRequestUser(request)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized', message: 'Sign in required.' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')
    const lagna = searchParams.get('lagna')
    const source = searchParams.get('source')

    const where: any = { userId }

    if (search) {
      where.name = { contains: search, mode: 'insensitive' }
    }
    if (lagna) {
      where.lagna = lagna
    }
    if (source) {
      where.source = source
    }

    const charts = await prisma.unifiedChart.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        name: true,
        source: true,
        lagna: true,
        lagnaLongitude: true,
        moonLongitude: true,
        ayanamsa: true,
        birthDatetime: true,
        sunriseMode: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { pipelineRuns: true } },
        pipelineRuns: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true, status: true, createdAt: true },
        },
      },
    })

    const result = charts.map((c) => ({
      id: c.id,
      name: c.name,
      source: c.source,
      lagna: c.lagna,
      lagnaLongitude: Number(c.lagnaLongitude),
      moonLongitude: Number(c.moonLongitude),
      ayanamsa: Number(c.ayanamsa),
      birthDatetime: c.birthDatetime,
      sunriseMode: c.sunriseMode,
      runCount: c._count.pipelineRuns,
      lastRun: c.pipelineRuns[0] ?? null,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }))

    return NextResponse.json(result)
  } catch (error) {
    console.error('List unified charts error:', error)
    return NextResponse.json(
      { error: 'Failed to load charts', message: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
