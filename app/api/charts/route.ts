/**
 * API: /api/charts
 * GET  — List all charts with run counts
 * POST — Submit a new chart (validate + persist)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { validateChartInput, getValidationWarnings } from '@/lib/validation'
import { ChartValidationError } from '@/lib/errors'
import { YOGAKARAKA } from '@/engine/constants'
import crypto from 'crypto'

export async function GET() {
  const charts = await prisma.chart.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      clientName: true,
      lagna: true,
      yogakaraka: true,
      createdAt: true,
      _count: { select: { runs: true } },
      runs: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { createdAt: true, status: true },
      },
    },
  })

  const result = charts.map((chart) => ({
    id: chart.id,
    clientName: chart.clientName,
    lagna: chart.lagna,
    yogakaraka: chart.yogakaraka,
    runCount: chart._count.runs,
    lastRunAt: chart.runs[0]?.createdAt ?? null,
    lastRunStatus: chart.runs[0]?.status ?? null,
    createdAt: chart.createdAt,
  }))

  return NextResponse.json(result)
}

export async function POST(request: NextRequest) {
  let body: unknown

  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    )
  }

  // Validate against ChartInputV1 schema
  let chart
  try {
    chart = validateChartInput(body)
  } catch (err) {
    if (err instanceof ChartValidationError) {
      return NextResponse.json(
        { error: err.message, fieldErrors: err.fieldErrors },
        { status: 400 }
      )
    }
    throw err
  }

  // Compute chart hash for duplicate detection
  const chartHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(body))
    .digest('hex')

  // Check for duplicate
  const existing = await prisma.chart.findUnique({
    where: { chartHash },
    select: { id: true, clientName: true },
  })

  if (existing) {
    return NextResponse.json(
      {
        error: 'duplicate',
        message: `Chart already exists for "${existing.clientName}"`,
        existingId: existing.id,
      },
      { status: 409 }
    )
  }

  // Extract Moon longitude for dasha computation
  const moonEntry = chart.natal_nakshatras.find((p) => p.body === 'Moon')!
  const moonLongitude = ((moonEntry.sign_no - 1) * 30) + moonEntry.degree_decimal

  // Determine yogakaraka
  const yogakaraka = YOGAKARAKA[chart.meta.lagna_sign] ?? null

  // Persist chart
  const created = await prisma.chart.create({
    data: {
      clientName: chart.meta.client_name,
      lagna: chart.meta.lagna_sign,
      yogakaraka,
      chartJson: body as any,
      chartHash,
      moonLongitude,
      birthDatetime: new Date(chart.meta.birth_datetime),
    },
  })

  // Get warnings (non-blocking)
  const warnings = getValidationWarnings(chart)

  return NextResponse.json(
    {
      id: created.id,
      clientName: created.clientName,
      lagna: created.lagna,
      yogakaraka: created.yogakaraka,
      warnings,
    },
    { status: 201 }
  )
}
