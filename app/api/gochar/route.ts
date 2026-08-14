/**
 * POST /api/gochar — deterministic date-ranged Lahiri Gochar.
 *
 * Accepts either a saved UnifiedChart reference or unsaved birth data, then
 * returns UTC whole-sign occupancy intervals. This route is intentionally
 * synchronous and read-only: it does not persist charts or start an analysis.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  computeGocharRange,
  resolveNatalGocharContext,
} from '@/engine/compute'
import { prisma } from '@/lib/db'
import { GocharValidationError } from '@/lib/errors'
import { resolveRequestUser } from '@/lib/auth'
import {
  parseGocharBounds,
  validateGocharSpan,
  type GocharApiResponse,
} from '@/lib/gocharRange'

export type { GocharApiResponse } from '@/lib/gocharRange'

// ─── Input validation ─────────────────────────────────────────────────────

const BirthDataSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format'),
  time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Time must be HH:MM or HH:MM:SS format'),
  timezone: z.number().min(-12).max(14),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  name: z.string().optional(),
  sunriseMode: z.enum(['precise', 'jhora']).optional(),
})

const GocharRequestSchema = z
  .object({
    dateFrom: z.string(),
    dateTo: z.string(),
    includeMoon: z.boolean().optional().default(false),
    unifiedChartId: z.string().uuid().optional(),
    birthData: BirthDataSchema.optional(),
  })
  .refine(
    ({ unifiedChartId, birthData }) =>
      (unifiedChartId !== undefined) !== (birthData !== undefined),
    {
      message: 'Provide exactly one of unifiedChartId or birthData.',
      path: ['unifiedChartId'],
    }
  )

function validationResponse(message: string, field?: string): NextResponse {
  return NextResponse.json(
    {
      error: 'Invalid input',
      details: field ? { [field]: [message] } : { dateFrom: [message], dateTo: [message] },
    },
    { status: 400 }
  )
}

// ─── Route handler ────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  const userId = await resolveRequestUser(request)
  if (!userId) {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Sign in required.' },
      { status: 401 }
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = GocharRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const { dateFrom, dateTo, includeMoon, unifiedChartId, birthData } = parsed.data

  let bounds: ReturnType<typeof parseGocharBounds>
  try {
    bounds = parseGocharBounds(dateFrom, dateTo)
    validateGocharSpan(bounds, includeMoon)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid Gochar range'
    const field = message.startsWith('dateFrom') ? 'dateFrom' : message.startsWith('dateTo') ? 'dateTo' : undefined
    return validationResponse(message, field)
  }

  let natalMoonSignNumber: number
  let natalLagnaSignNumber: number

  if (unifiedChartId) {
    try {
      const chart = await prisma.unifiedChart.findUnique({
        where: { id: unifiedChartId },
        select: {
          moonLongitude: true,
          lagnaLongitude: true,
          userId: true,
        },
      })

      if (!chart || chart.userId !== userId) {
        return NextResponse.json({ error: 'Chart not found' }, { status: 404 })
      }

      natalMoonSignNumber = Math.floor(Number(chart.moonLongitude) / 30) + 1
      natalLagnaSignNumber = Math.floor(Number(chart.lagnaLongitude) / 30) + 1
    } catch (error) {
      console.error('Gochar chart lookup failed:', error)
      return NextResponse.json({ error: 'Failed to load chart' }, { status: 500 })
    }
  } else {
    // The schema refinement guarantees this branch has birth data. Keep the
    // guard so TypeScript (which cannot narrow from a Zod refinement) and any
    // future schema edit retain the same 400 source-selection behaviour.
    if (!birthData) {
      return validationResponse('Provide exactly one of unifiedChartId or birthData.', 'unifiedChartId')
    }

    try {
      const context = resolveNatalGocharContext(birthData)
      natalMoonSignNumber = context.natalMoonSignNumber
      natalLagnaSignNumber = context.natalLagnaSignNumber
    } catch {
      return validationResponse('birthData could not be used to derive natal Gochar context.', 'birthData')
    }
  }

  try {
    const result = computeGocharRange({
      natalMoonSignNumber,
      natalLagnaSignNumber,
      start: bounds.start,
      end: bounds.end,
      includeMoon,
    })

    const response: GocharApiResponse = {
      ...result,
      dateFrom: bounds.dateFrom,
      dateTo: bounds.dateTo,
      ayanamsa: 'Lahiri',
    }

    return NextResponse.json(response)
  } catch (error) {
    if (error instanceof GocharValidationError) {
      return validationResponse(error.message)
    }

    console.error('Gochar computation failed:', error)
    return NextResponse.json({ error: 'Gochar computation failed' }, { status: 500 })
  }
}
