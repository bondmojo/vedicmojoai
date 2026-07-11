/**
 * GET /api/duration-analysis/[id] — Fetch a full Duration Analysis record.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { reapStaleAnalyses } from '@/engine/durationAnalysis/reaper'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  // Mark the run failed if it stalled (server restart mid-pipeline).
  await reapStaleAnalyses(params.id)

  const analysis = await prisma.durationAnalysis.findUnique({
    where: { id: params.id },
    include: {
      messages: { orderBy: { createdAt: 'asc' } },
      unifiedChart: { select: { name: true } },
    },
  })

  if (!analysis) {
    return NextResponse.json({ error: 'Analysis not found' }, { status: 404 })
  }

  return NextResponse.json({
    id: analysis.id,
    unifiedChartId: analysis.unifiedChartId,
    chartName: analysis.unifiedChart.name,
    dateFrom: analysis.dateFrom.toISOString(),
    dateTo: analysis.dateTo.toISOString(),
    category: analysis.category,
    userQuestion: analysis.userQuestion,
    symptoms: analysis.symptoms,
    status: analysis.status,
    overrideApplied: analysis.overrideApplied,
    periodSlice: analysis.periodSlice,
    transitOverlay: analysis.transitOverlay,
    contextSummary: analysis.contextSummary,
    da1Output: analysis.da1Output,
    da2Output: analysis.da2Output,
    da3Output: analysis.da3Output,
    totalTokenIn: analysis.totalTokenIn,
    totalTokenOut: analysis.totalTokenOut,
    totalCostUsd: Number(analysis.totalCostUsd),
    messages: analysis.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      agentId: m.agentId,
      focusPeriod: m.focusPeriod,
      tokenIn: m.tokenIn,
      tokenOut: m.tokenOut,
      createdAt: m.createdAt.toISOString(),
    })),
    createdAt: analysis.createdAt.toISOString(),
    updatedAt: analysis.updatedAt.toISOString(),
  })
}
