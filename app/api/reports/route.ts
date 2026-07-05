/**
 * API: /api/reports
 * GET — List all completed pipeline runs (reports).
 *
 * Returns all runs with status "done", ordered by completion date.
 * Includes chart name, lagna, query types, cost, and source info.
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  try {
    const runs = await prisma.pipelineRun.findMany({
      where: { status: 'done' },
      orderBy: { completedAt: 'desc' },
      select: {
        id: true,
        chartId: true,
        unifiedChartId: true,
        runType: true,
        queryTypes: true,
        status: true,
        totalTokenIn: true,
        totalTokenOut: true,
        totalCostUsd: true,
        createdAt: true,
        completedAt: true,
        chart: {
          select: { clientName: true, lagna: true },
        },
        unifiedChart: {
          select: { source: true },
        },
      },
    })

    const result = runs.map((run) => ({
      id: run.id,
      chartId: run.chartId,
      clientName: run.chart.clientName,
      lagna: run.chart.lagna,
      source: run.unifiedChart?.source ?? null,
      runType: run.runType,
      queryTypes: run.queryTypes,
      status: run.status,
      totalTokenIn: run.totalTokenIn,
      totalTokenOut: run.totalTokenOut,
      totalCostUsd: Number(run.totalCostUsd),
      createdAt: run.createdAt,
      completedAt: run.completedAt,
    }))

    return NextResponse.json(result)
  } catch (error) {
    console.error('List reports error:', error)
    return NextResponse.json(
      { error: 'Failed to load reports' },
      { status: 500 }
    )
  }
}
