/**
 * API: /api/runs/[id]
 * GET — Run status, planner output, per-agent results
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const run = await prisma.pipelineRun.findUnique({
    where: { id: params.id },
    include: {
      waveOutputs: {
        orderBy: [{ waveNumber: 'asc' }, { startedAt: 'asc' }],
        select: {
          agentId: true,
          waveNumber: true,
          domain: true,
          outputJson: true,
          factSummary: true,
          status: true,
          modelId: true,
          provider: true,
          tokenIn: true,
          tokenOut: true,
          costUsd: true,
          errorMessage: true,
          startedAt: true,
          completedAt: true,
        },
      },
      chart: {
        select: { clientName: true, lagna: true },
      },
    },
  })

  if (!run) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 })
  }

  return NextResponse.json({
    id: run.id,
    chartId: run.chartId,
    clientName: run.chart.clientName,
    lagna: run.chart.lagna,
    runType: run.runType,
    queryTypes: run.queryTypes,
    userQuery: run.userQuery,
    isFollowup: run.isFollowup,
    status: run.status,
    plannerOutput: run.plannerOutput,
    reportPath: run.reportPath,
    haltReason: run.haltReason,
    overrideApplied: run.overrideApplied,
    totalTokenIn: run.totalTokenIn,
    totalTokenOut: run.totalTokenOut,
    totalCostUsd: Number(run.totalCostUsd),
    createdAt: run.createdAt,
    completedAt: run.completedAt,
    agents: run.waveOutputs.map((wo) => ({
      ...wo,
      costUsd: Number(wo.costUsd),
    })),
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
