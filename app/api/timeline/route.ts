/**
 * POST /api/timeline — Deterministic dasha-period timeline (NO LLM).
 *
 * Runs exactly the compute-first pre-steps of the Duration Analysis pipeline —
 * period slicer → transit overlay → category extraction → deterministic 0–100
 * scoring → peak identification — and returns them as JSON **without invoking
 * any LLM agent**. This is the backbone the MCP `get_timeline_periods` and
 * `get_domain_dataset` tools call so Claude Desktop can narrate the numbers at
 * no API cost.
 *
 * Mirrors engine/durationAnalysis/index.ts steps 0a–0d (see executeDurationPipeline).
 * This route NEVER touches the paid pipeline (DA-1/DA-2/DA-3) or callLLM.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireMcpToken } from '@/lib/mcpAuth'
import { sliceDashaTree } from '@/engine/durationAnalysis/slicer'
import { buildTransitOverlay } from '@/engine/durationAnalysis/transitOverlay'
import { extractCategoryData, toScoringChartData, pickScoringRawChart } from '@/engine/durationAnalysis/extractor'
import { scorePeriod, identifyPeaks } from '@/engine/durationAnalysis/scoring'
import { resolveDomainWeights, WEIGHTS_VERSION } from '@/engine/durationAnalysis/scoringWeights'
import { buildPeriodInsights } from '@/engine/durationAnalysis/periodInsights'
import type { DurationCategory, ScoredDashaSlice, TransitOverlay, PeriodInsights, DomainContext } from '@/lib/durationTypes'

// ─── Input Validation ────────────────────────────────────────────────

const TimelineSchema = z.object({
  unifiedChartId: z.string().uuid(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dateFrom must be YYYY-MM-DD'),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dateTo must be YYYY-MM-DD'),
  category: z.enum(['health', 'career', 'wealth', 'marriage', 'property', 'cashflow', 'family']),
  // Include the domain-scoped chart dataset (vargas + significators) in the
  // response. `get_domain_dataset` wants it; `get_timeline_periods` can omit it.
  includeCategoryData: z.boolean().optional().default(true),
})

const MAX_SPAN_DAYS = 3653 // 10 years — same guard as the duration pipeline

// ─── Route Handler ───────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const auth = requireMcpToken(request)
  if (auth) return auth

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = TimelineSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const { unifiedChartId, dateFrom, dateTo, category, includeCategoryData } = parsed.data

  const dateFromDate = new Date(dateFrom)
  const dateToDate = new Date(dateTo)
  if (dateFromDate >= dateToDate) {
    return NextResponse.json({ error: 'dateFrom must be before dateTo' }, { status: 400 })
  }
  const spanDays = (dateToDate.getTime() - dateFromDate.getTime()) / (1000 * 60 * 60 * 24)
  if (spanDays > MAX_SPAN_DAYS) {
    return NextResponse.json({ error: 'Date range must not exceed 10 years' }, { status: 400 })
  }

  // ── Load chart ────────────────────────────────────────────────────
  const chart = await prisma.unifiedChart.findUnique({ where: { id: unifiedChartId } })
  if (!chart) {
    return NextResponse.json({ error: 'Chart not found' }, { status: 404 })
  }
  if (chart.dashaTree === null) {
    return NextResponse.json(
      { error: 'Chart has no dasha tree. Compute the chart first.' },
      { status: 422 }
    )
  }

  // ── Step 0a: Period slice (MD→AD→PD overlapping the range) ─────────
  const { slices: periodSlice, truncated } = sliceDashaTree(
    chart.dashaTree,
    dateFromDate,
    dateToDate,
    {
      planets: chart.planets,
      nakshatras: chart.nakshatras,
      relationships: chart.relationships,
      karakas: chart.karakas,
    }
  )

  if (periodSlice.length === 0) {
    return NextResponse.json(
      {
        error:
          'No dasha periods overlap the requested date range. If this chart was ' +
          'computed before full-PD storage, run `npm run db:backfill-pd` and retry.',
      },
      { status: 422 }
    )
  }

  // ── Step 0b: Transit overlay (Sade Sati / BAV per AD boundary) ─────
  const natalMoonSign = Math.floor(Number(chart.moonLongitude) / 30) + 1
  const natalLagnaSign = Math.floor(Number(chart.lagnaLongitude) / 30) + 1
  const birthYear = new Date(chart.birthDatetime).getUTCFullYear()
  let transitOverlay: TransitOverlay[] = []
  try {
    transitOverlay = buildTransitOverlay(
      periodSlice,
      natalMoonSign,
      natalLagnaSign,
      birthYear,
      chart.transits,
      chart.ashtakavarga
    )
  } catch (err) {
    console.warn('[timeline] buildTransitOverlay failed:', err)
    // transitOverlay stays [] — scoring degrades gracefully
  }

  // ── Step 0c: Category (domain-scoped) chart data ──────────────────
  const categoryData = extractCategoryData(
    {
      planets: chart.planets,
      nakshatras: chart.nakshatras,
      relationships: chart.relationships,
      shadbala: chart.shadbala,
      divisionalCharts: chart.divisionalCharts,
      jaimini: chart.jaimini,
      ashtakavarga: chart.ashtakavarga,
      dashaTree: chart.dashaTree,
      bhavaBala: chart.bhavaBala,
      arudhaPadas: chart.arudhaPadas,
      specialLagnas: chart.specialLagnas,
      karakas: chart.karakas,
      upagrahas: chart.upagrahas,
    },
    category as DurationCategory
  )

  // ── Step 0d: Deterministic scoring + peaks ────────────────────────
  const domainWeights = resolveDomainWeights(category as DurationCategory)
  const scoringChartData = toScoringChartData(categoryData, pickScoringRawChart(chart))

  const overlayByAdStart = new Map(transitOverlay.map((o) => [o.adStart, o]))
  const scoredSlices: Array<ScoredDashaSlice & { insights: PeriodInsights | null }> = periodSlice.map((slice) => {
    const overlayEntry =
      overlayByAdStart.get(slice.ad.start) ??
      transitOverlay.find((o) => o.adLord === slice.ad.lord) ??
      null
    const { score, breakdown } = scorePeriod(slice, scoringChartData, overlayEntry, domainWeights)
    const scored: ScoredDashaSlice = {
      ...slice,
      score,
      intensity: breakdown.intensity,
      favorable: breakdown.favorable,
      scoreBreakdown: breakdown,
    }
    // Deterministic driver digest (drishti / control / nakshatra) — the no-LLM UI's
    // stand-in for the interpretation the MCP path leaves to Claude Desktop.
    const insights = buildPeriodInsights(scored, categoryData, domainWeights)
    return { ...scored, insights }
  })

  const { peakStress, peakFavorable } = identifyPeaks(
    scoredSlices.map((s) => ({ period: s, result: { score: s.score, breakdown: s.scoreBreakdown } }))
  )

  // Compact domain model so the UI (and Claude Desktop) can label houses/karakas
  // without re-deriving them — single source of truth is DOMAIN_SCORING_WEIGHTS.
  const domainContext: DomainContext = {
    category: category as DurationCategory,
    primaryHouses: domainWeights.primaryHouses,
    beneficHouses: domainWeights.beneficHouses,
    maleficHouses: domainWeights.maleficHouses,
    primaryDivision: domainWeights.primaryDivision,
    relevantKarakaRoles: domainWeights.relevantKarakaRoles,
    relevantNaturalKarakas: domainWeights.relevantNaturalKarakas,
    specialPoints: domainWeights.specialPoints.map((s) => ({ key: s.key, selector: s.selector })),
  }

  return NextResponse.json({
    unifiedChartId,
    category,
    dateFrom,
    dateTo,
    truncated,
    periodCount: scoredSlices.length,
    periods: scoredSlices,
    domainContext,
    transitOverlay,
    peaks: { peakStress, peakFavorable },
    // Provisional/uncalibrated per the scoring engine — surfaced so callers
    // (and Claude Desktop) never present raw scores as calibrated to a client.
    scoring: {
      weightsVersion: WEIGHTS_VERSION,
      disclaimer:
        'Phase-1 provisional weights (uncalibrated). Treat scores as relative ' +
        'signal, not calibrated probabilities. Narrate — do not override.',
    },
    ...(includeCategoryData ? { categoryData } : {}),
  })
}
