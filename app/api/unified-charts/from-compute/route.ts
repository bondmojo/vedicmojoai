/**
 * POST /api/unified-charts/from-compute — Path A: Compute from birth data.
 *
 * Accepts birth data (date, time, timezone, lat/lng), runs the deterministic
 * compute engine (Swiss Ephemeris), computes the Vimshottari dasha tree,
 * and persists the result as a UnifiedChart with source="compute".
 *
 * Since all foundation data is computed deterministically, Wave 1 is
 * skipped when AI analysis is later triggered on this chart.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { createUnifiedChartFromBirthData } from '@/lib/unified-chart-create'

// ─── Input Validation ───────────────────────────────────────────────

const ComputeInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  existingChartId: z.string().uuid().optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format'),
  time: z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Time must be HH:MM or HH:MM:SS format'),
  timezone: z
    .number()
    .min(-12)
    .max(14)
    .describe('Timezone offset in hours (e.g., 5.5 for IST)'),
  latitude: z
    .number()
    .min(-90)
    .max(90),
  longitude: z
    .number()
    .min(-180)
    .max(180),
  sunriseMode: z
    .enum(['precise', 'jhora'])
    .optional()
    .default('precise'),
})

// ─── Route Handler ──────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Validate input
    const parsed = ComputeInputSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    // Shared Path A implementation — also used by the SavedChart migration.
    const result = await createUnifiedChartFromBirthData(parsed.data)

    if (result.status === 'duplicate') {
      return NextResponse.json(
        {
          id: result.id,
          name: result.name,
          message: `Chart already exists for "${result.name}"`,
          isDuplicate: true,
        },
        { status: 409 }
      )
    }

    if (result.status === 'updated') {
      return NextResponse.json(
        {
          id: result.id,
          name: result.name,
          source: 'compute',
          lagna: result.lagna,
          birthDatetime: result.birthDatetime,
          createdAt: result.createdAt,
          message: 'Chart updated successfully',
        },
        { status: 200 }
      )
    }

    return NextResponse.json(
      {
        id: result.id,
        name: result.name,
        source: 'compute',
        lagna: result.lagna,
        birthDatetime: result.birthDatetime,
        createdAt: result.createdAt,
        message: 'Chart computed and saved successfully',
      },
      { status: 201 }
    )
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2025'
    ) {
      return NextResponse.json(
        {
          error: 'Chart to update was not found — it may have been deleted. Save it as a new chart instead.',
        },
        { status: 404 }
      )
    }

    console.error('Compute unified chart error:', error)
    return NextResponse.json(
      {
        error: 'Chart computation failed',
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
