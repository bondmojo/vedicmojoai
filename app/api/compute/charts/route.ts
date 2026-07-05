/**
 * GET /api/compute/charts — List all saved computed charts.
 *
 * Returns a lightweight list of saved charts with metadata (no full chart data).
 * Supports optional query params:
 *   ?search=name  — filter by name (case-insensitive contains)
 *   ?lagna=Taurus — filter by lagna sign
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')
    const lagna = searchParams.get('lagna')

    const where: any = {}

    if (search) {
      where.name = { contains: search, mode: 'insensitive' }
    }
    if (lagna) {
      where.lagna = lagna
    }

    const charts = await prisma.savedChart.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        name: true,
        birthDate: true,
        birthTime: true,
        timezone: true,
        latitude: true,
        longitude: true,
        sunriseMode: true,
        lagna: true,
        lagnaLongitude: true,
        moonLongitude: true,
        ayanamsa: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    const result = charts.map((c) => ({
      id: c.id,
      name: c.name,
      birthDate: c.birthDate,
      birthTime: c.birthTime,
      timezone: Number(c.timezone),
      latitude: Number(c.latitude),
      longitude: Number(c.longitude),
      sunriseMode: c.sunriseMode,
      lagna: c.lagna,
      lagnaLongitude: Number(c.lagnaLongitude),
      moonLongitude: Number(c.moonLongitude),
      ayanamsa: Number(c.ayanamsa),
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }))

    return NextResponse.json(result)
  } catch (error) {
    console.error('List saved charts error:', error)
    return NextResponse.json(
      { error: 'Failed to load charts', message: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
