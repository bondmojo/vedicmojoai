/**
 * API: /api/reports/[id]
 * GET — Serve the report data for a run (from DB, not disk)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  // id here is the run ID
  const run = await prisma.pipelineRun.findUnique({
    where: { id: params.id },
    include: {
      chart: { select: { clientName: true, lagna: true } },
      waveOutputs: {
        where: { status: 'done' },
        orderBy: [{ waveNumber: 'asc' }, { agentId: 'asc' }],
        select: {
          agentId: true,
          waveNumber: true,
          domain: true,
          outputJson: true,
          factSummary: true,
          status: true,
          tokenIn: true,
          tokenOut: true,
          costUsd: true,
        },
      },
    },
  })

  if (!run) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 })
  }

  if (run.status !== 'done') {
    return NextResponse.json(
      { error: 'Report not ready', status: run.status },
      { status: 404 }
    )
  }

  // Return structured report data from DB
  return NextResponse.json({
    id: run.id,
    clientName: run.chart.clientName,
    lagna: run.chart.lagna,
    queryTypes: run.queryTypes,
    status: run.status,
    totalTokenIn: run.totalTokenIn,
    totalTokenOut: run.totalTokenOut,
    totalCostUsd: Number(run.totalCostUsd),
    createdAt: run.createdAt,
    completedAt: run.completedAt,
    waveOutputs: run.waveOutputs.map((wo) => ({
      agentId: wo.agentId,
      waveNumber: wo.waveNumber,
      domain: wo.domain,
      outputJson: wo.outputJson,
      factSummary: wo.factSummary,
      status: wo.status,
      tokenIn: wo.tokenIn,
      tokenOut: wo.tokenOut,
      costUsd: Number(wo.costUsd),
    })),
  })
}
