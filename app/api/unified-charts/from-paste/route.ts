/**
 * POST /api/unified-charts/from-paste — Path B: Paste ChartInputV1 JSON.
 *
 * Accepts a ChartInputV1 JSON object (the practitioner's manually prepared
 * chart data), validates it, and persists as a UnifiedChart with source="paste".
 *
 * Domain JSONB columns are left null — the full Wave 1–4 pipeline will
 * run when AI analysis is triggered, extracting all foundation data via LLM.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { validateChartInput } from '@/lib/validation'
import { ChartValidationError } from '@/lib/errors'
import { mapPastedToUnified } from '@/lib/chart-mapper'
import { resolveRequestUser } from '@/lib/auth'

// ─── Route Handler ──────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const userId = await resolveRequestUser(request)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized', message: 'Sign in required.' }, { status: 401 })
  }

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
  let chartInput
  try {
    chartInput = validateChartInput(body)
  } catch (err) {
    if (err instanceof ChartValidationError) {
      return NextResponse.json(
        { error: err.message, fieldErrors: err.fieldErrors },
        { status: 400 }
      )
    }
    throw err
  }

  try {
    // Map to UnifiedChart create input
    const createInput = mapPastedToUnified(chartInput)

    // Check for duplicate, scoped to this user (the same birth data may be
    // saved independently by a different practitioner).
    const existing = await prisma.unifiedChart.findUnique({
      where: { userId_chartHash: { userId, chartHash: createInput.chartHash } },
      select: { id: true, name: true },
    })

    if (existing) {
      return NextResponse.json(
        {
          id: existing.id,
          name: existing.name,
          message: `Chart already exists for "${existing.name}"`,
          isDuplicate: true,
        },
        { status: 409 }
      )
    }

    // Persist to UnifiedChart
    const saved = await prisma.unifiedChart.create({
      data: { ...createInput, userId },
      select: {
        id: true,
        name: true,
        source: true,
        lagna: true,
        birthDatetime: true,
        createdAt: true,
      },
    })

    return NextResponse.json(
      {
        id: saved.id,
        name: saved.name,
        source: saved.source,
        lagna: saved.lagna,
        birthDatetime: saved.birthDatetime,
        createdAt: saved.createdAt,
        message: 'Chart saved successfully (paste path)',
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Paste unified chart error:', error)
    return NextResponse.json(
      {
        error: 'Failed to save chart',
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
