/**
 * GET /api/compute/charts/[id] — Load a single saved computed chart.
 * DELETE /api/compute/charts/[id] — Delete a saved chart.
 *
 * Returns the full chart data including chartData JSON and dashaTree.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const chart = await prisma.savedChart.findUnique({
      where: { id: params.id },
    })

    if (!chart) {
      return NextResponse.json(
        { error: 'Saved chart not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      id: chart.id,
      name: chart.name,
      birthDate: chart.birthDate,
      birthTime: chart.birthTime,
      timezone: Number(chart.timezone),
      latitude: Number(chart.latitude),
      longitude: Number(chart.longitude),
      sunriseMode: chart.sunriseMode,
      lagna: chart.lagna,
      lagnaLongitude: Number(chart.lagnaLongitude),
      moonLongitude: Number(chart.moonLongitude),
      ayanamsa: Number(chart.ayanamsa),
      chartData: chart.chartData,
      dashaTree: chart.dashaTree,
      createdAt: chart.createdAt,
      updatedAt: chart.updatedAt,
    })
  } catch (error) {
    console.error('Load saved chart error:', error)
    return NextResponse.json(
      { error: 'Failed to load chart', message: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const chart = await prisma.savedChart.findUnique({
      where: { id: params.id },
      select: { id: true },
    })

    if (!chart) {
      return NextResponse.json(
        { error: 'Saved chart not found' },
        { status: 404 }
      )
    }

    await prisma.savedChart.delete({
      where: { id: params.id },
    })

    return NextResponse.json({ message: 'Chart deleted successfully' })
  } catch (error) {
    console.error('Delete saved chart error:', error)
    return NextResponse.json(
      { error: 'Failed to delete chart', message: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
