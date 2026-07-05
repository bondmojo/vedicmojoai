/**
 * GET    /api/unified-charts/[id] — Load a single unified chart with full domain data.
 * DELETE /api/unified-charts/[id] — Delete a unified chart (cascades to pipeline runs).
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const chart = await prisma.unifiedChart.findUnique({
      where: { id: params.id },
      include: {
        pipelineRuns: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            id: true,
            status: true,
            runType: true,
            queryTypes: true,
            totalTokenIn: true,
            totalTokenOut: true,
            totalCostUsd: true,
            createdAt: true,
            completedAt: true,
          },
        },
      },
    })

    if (!chart) {
      return NextResponse.json(
        { error: 'Chart not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      id: chart.id,
      name: chart.name,
      source: chart.source,
      lagna: chart.lagna,
      lagnaLongitude: Number(chart.lagnaLongitude),
      moonLongitude: Number(chart.moonLongitude),
      ayanamsa: Number(chart.ayanamsa),
      birthDatetime: chart.birthDatetime,
      sunriseMode: chart.sunriseMode,
      birthInput: chart.birthInput,

      // Domain data
      planets: chart.planets,
      nakshatras: chart.nakshatras,
      divisionalCharts: chart.divisionalCharts,
      karakas: chart.karakas,
      ashtakavarga: chart.ashtakavarga,
      upagrahas: chart.upagrahas,
      specialLagnas: chart.specialLagnas,
      arudhaPadas: chart.arudhaPadas,
      relationships: chart.relationships,
      shadbala: chart.shadbala,
      jaimini: chart.jaimini,
      bhavaBala: chart.bhavaBala,
      transits: chart.transits,
      pindaStrength: chart.pindaStrength,
      dashaTree: chart.dashaTree,

      // AI pipeline data
      chartInputV1: chart.chartInputV1,

      // Meta
      chartHash: chart.chartHash,
      createdAt: chart.createdAt,
      updatedAt: chart.updatedAt,

      // Recent runs
      pipelineRuns: chart.pipelineRuns.map((r) => ({
        ...r,
        totalCostUsd: Number(r.totalCostUsd),
      })),
    })
  } catch (error) {
    console.error('Load unified chart error:', error)
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
    const chart = await prisma.unifiedChart.findUnique({
      where: { id: params.id },
      select: { id: true },
    })

    if (!chart) {
      return NextResponse.json(
        { error: 'Chart not found' },
        { status: 404 }
      )
    }

    // Delete associated pipeline runs first (cascade isn't automatic with Prisma)
    await prisma.pipelineRun.deleteMany({
      where: { unifiedChartId: params.id },
    })

    await prisma.unifiedChart.delete({
      where: { id: params.id },
    })

    return NextResponse.json({ message: 'Chart deleted successfully' })
  } catch (error) {
    console.error('Delete unified chart error:', error)
    return NextResponse.json(
      { error: 'Failed to delete chart', message: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
