/**
 * GET    /api/unified-charts/[id] — Load a single unified chart with full domain data.
 * PATCH  /api/unified-charts/[id] — Rename a unified chart.
 * DELETE /api/unified-charts/[id] — Delete a unified chart (cascades to pipeline
 *                                   runs AND duration analyses/messages).
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { resolveRequestUser } from '@/lib/auth'

const RenameSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
})

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await resolveRequestUser(request)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized', message: 'Sign in required.' }, { status: 401 })
    }

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

    if (!chart || chart.userId !== userId) {
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
      yogas: chart.yogas,

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

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await resolveRequestUser(request)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized', message: 'Sign in required.' }, { status: 401 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const parsed = RenameSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const chart = await prisma.unifiedChart.findUnique({
      where: { id: params.id },
      select: { id: true, userId: true },
    })
    if (!chart || chart.userId !== userId) {
      return NextResponse.json({ error: 'Chart not found' }, { status: 404 })
    }

    const updated = await prisma.unifiedChart.update({
      where: { id: params.id },
      data: { name: parsed.data.name },
      select: { id: true, name: true, updatedAt: true },
    })

    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      updatedAt: updated.updatedAt,
      message: 'Chart renamed successfully',
    })
  } catch (error) {
    console.error('Rename unified chart error:', error)
    return NextResponse.json(
      { error: 'Failed to rename chart', message: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await resolveRequestUser(request)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized', message: 'Sign in required.' }, { status: 401 })
    }

    const chart = await prisma.unifiedChart.findUnique({
      where: { id: params.id },
      select: { id: true, userId: true },
    })

    if (!chart || chart.userId !== userId) {
      return NextResponse.json(
        { error: 'Chart not found' },
        { status: 404 }
      )
    }

    // Cascade isn't automatic with Prisma — remove dependents in FK order:
    // duration messages → duration analyses → pipeline runs →
    // compatibility matches (bride- and groom-side FK) → chart.
    await prisma.$transaction([
      prisma.durationMessage.deleteMany({
        where: { analysis: { unifiedChartId: params.id } },
      }),
      prisma.durationAnalysis.deleteMany({
        where: { unifiedChartId: params.id },
      }),
      prisma.pipelineRun.deleteMany({
        where: { unifiedChartId: params.id },
      }),
      prisma.compatibilityMatch.deleteMany({
        where: { OR: [{ brideChartId: params.id }, { groomChartId: params.id }] },
      }),
      prisma.unifiedChart.delete({
        where: { id: params.id },
      }),
    ])

    return NextResponse.json({ message: 'Chart deleted successfully' })
  } catch (error) {
    console.error('Delete unified chart error:', error)
    return NextResponse.json(
      { error: 'Failed to delete chart', message: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
