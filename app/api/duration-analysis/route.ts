/**
 * POST /api/duration-analysis — Create a Duration Analysis run.
 * GET  /api/duration-analysis — List recent runs (history), newest first.
 *
 * Validates the request body, loads the target UnifiedChart, creates a
 * DurationAnalysis record (status = 'queued'), optionally stores the initial
 * user question as a DurationMessage, fires executeDurationPipeline without
 * awaiting it (fire-and-forget), and returns 202 with the new analysisId.
 *
 * Client connects to GET /api/duration-analysis/[id]/events for SSE progress.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { executeDurationPipeline } from '@/engine/durationAnalysis'
import { reapStaleAnalyses } from '@/engine/durationAnalysis/reaper'
import { resolveRequestUser } from '@/lib/auth'

// ─── List Handler ────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const userId = await resolveRequestUser(request)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized', message: 'Sign in required.' }, { status: 401 })
  }

  // Sweep stalled runs so history never shows an eternal "running".
  await reapStaleAnalyses()

  const unifiedChartId = request.nextUrl.searchParams.get('unifiedChartId') ?? undefined

  const analyses = await prisma.durationAnalysis.findMany({
    where: {
      unifiedChart: { userId },
      ...(unifiedChartId ? { unifiedChartId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { unifiedChart: { select: { name: true } } },
  })

  return NextResponse.json({
    analyses: analyses.map((a) => ({
      id: a.id,
      unifiedChartId: a.unifiedChartId,
      chartName: a.unifiedChart.name,
      category: a.category,
      dateFrom: a.dateFrom.toISOString(),
      dateTo: a.dateTo.toISOString(),
      status: a.status,
      totalCostUsd: Number(a.totalCostUsd),
      createdAt: a.createdAt.toISOString(),
    })),
  })
}

// ─── Input Validation ────────────────────────────────────────────────

const CreateDurationAnalysisSchema = z.object({
  unifiedChartId: z.string().uuid(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dateFrom must be in YYYY-MM-DD format'),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dateTo must be in YYYY-MM-DD format'),
  category: z.enum(['health', 'career', 'wealth', 'marriage', 'property', 'cashflow']),
  symptoms: z.string().max(2000).optional(),
  userQuestion: z.string().max(2000).optional(),
  // Optional LLM overrides selected in the UI. Applied to all DA agents.
  // provider + model are persisted (non-secret); apiKey is used transiently
  // for this run and NEVER written to the database.
  provider: z.enum(['anthropic', 'openai']).optional(),
  model: z.string().min(1).max(100).optional(),
  apiKey: z.string().min(1).max(400).optional(),
})

const MAX_SPAN_DAYS = 3653 // 10 years

// ─── Route Handler ───────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const userId = await resolveRequestUser(request)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized', message: 'Sign in required.' }, { status: 401 })
  }

  // ── Parse body ──────────────────────────────────────────────────────
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // ── Zod validation ──────────────────────────────────────────────────
  const parsed = CreateDurationAnalysisSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const { unifiedChartId, dateFrom, dateTo, category, symptoms, userQuestion, provider, model, apiKey } = parsed.data

  // ── Date ordering check ─────────────────────────────────────────────
  const dateFromDate = new Date(dateFrom)
  const dateToDate = new Date(dateTo)

  if (dateFromDate >= dateToDate) {
    return NextResponse.json(
      { error: 'dateFrom must be before dateTo' },
      { status: 400 }
    )
  }

  // ── Date span check (max 10 years / 3653 days) ──────────────────────
  const spanMs = dateToDate.getTime() - dateFromDate.getTime()
  const spanDays = spanMs / (1000 * 60 * 60 * 24)

  if (spanDays > MAX_SPAN_DAYS) {
    return NextResponse.json(
      { error: 'Date range must not exceed 10 years' },
      { status: 400 }
    )
  }

  // ── Load UnifiedChart ───────────────────────────────────────────────
  const chart = await prisma.unifiedChart.findUnique({
    where: { id: unifiedChartId },
    select: { id: true, dashaTree: true, userId: true },
  })

  if (!chart || chart.userId !== userId) {
    return NextResponse.json({ error: 'Chart not found' }, { status: 404 })
  }

  // ── Validate dasha tree is present ─────────────────────────────────
  if (chart.dashaTree === null) {
    return NextResponse.json(
      { error: 'Chart has no dasha tree. Run compute first.' },
      { status: 422 }
    )
  }

  // ── Create DurationAnalysis record ──────────────────────────────────
  const record = await prisma.durationAnalysis.create({
    data: {
      unifiedChartId,
      dateFrom: dateFromDate,
      dateTo: dateToDate,
      category,
      symptoms: symptoms ?? null,
      userQuestion: userQuestion ?? null,
      status: 'queued',
      // Persist the provider/model selection (non-secret) so resume + chat
      // follow-ups reuse it. apiKey is intentionally NOT persisted.
      overrideProvider: provider ?? null,
      overrideModel: model ?? null,
    },
  })

  // ── Persist initial user question as a DurationMessage ──────────────
  if (userQuestion) {
    await prisma.durationMessage.create({
      data: {
        analysisId: record.id,
        role: 'user',
        content: userQuestion,
      },
    })
  }

  // ── Fire pipeline without await (fire-and-forget) ────────────────────
  executeDurationPipeline({
    analysisId: record.id,
    unifiedChartId,
    dateFrom: dateFromDate,
    dateTo: dateToDate,
    category,
    userQuestion: userQuestion ?? undefined,
    symptoms: symptoms ?? undefined,
    overrideProvider: provider ?? undefined,
    overrideModel: model ?? undefined,
    apiKey: apiKey ?? undefined,
    emitEvent: (_event) => {}, // events served via SSE at /api/duration-analysis/[id]/events
  }).catch((err) => {
    console.error(`[duration-analysis] Pipeline ${record.id} failed:`, err)
  })

  // ── Return 202 immediately ───────────────────────────────────────────
  return NextResponse.json(
    { analysisId: record.id },
    { status: 202 }
  )
}
