/**
 * API: /api/charts/[id]
 * GET — Chart detail with run history
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const chart = await prisma.chart.findUnique({
    where: { id: params.id },
    include: {
      runs: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          runType: true,
          queryTypes: true,
          status: true,
          totalTokenIn: true,
          totalTokenOut: true,
          totalCostUsd: true,
          reportPath: true,
          overrideApplied: true,
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
    clientName: chart.clientName,
    lagna: chart.lagna,
    yogakaraka: chart.yogakaraka,
    moonLongitude: Number(chart.moonLongitude),
    birthDatetime: chart.birthDatetime,
    createdAt: chart.createdAt,
    runs: chart.runs.map((r) => ({
      ...r,
      totalCostUsd: Number(r.totalCostUsd),
    })),
  })
}
