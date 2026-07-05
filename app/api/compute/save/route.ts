/**
 * POST /api/compute/save — Save a computed chart to the database.
 *
 * Accepts the full computed chart result (chart + dashaTree) along with
 * the original birth input. Persists it as a SavedChart for later retrieval.
 * Uses an input hash for duplicate detection.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import crypto from 'crypto'

// ─── Input Validation ───────────────────────────────────────────────

const SaveChartSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  birthTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Time must be HH:MM or HH:MM:SS'),
  timezone: z.number().min(-12).max(14),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  sunriseMode: z.enum(['precise', 'jhora']).optional().default('precise'),
  chartData: z.record(z.any()),
  dashaTree: z.record(z.any()).optional(),
})

// ─── Route Handler ──────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const parsed = SaveChartSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const input = parsed.data

    // Generate a hash from birth input for duplicate detection
    const hashSource = JSON.stringify({
      date: input.birthDate,
      time: input.birthTime,
      timezone: input.timezone,
      latitude: input.latitude,
      longitude: input.longitude,
      sunriseMode: input.sunriseMode,
    })
    const inputHash = crypto.createHash('sha256').update(hashSource).digest('hex')

    // Check for existing chart with same birth data
    const existing = await prisma.savedChart.findUnique({
      where: { inputHash },
      select: { id: true, name: true },
    })

    if (existing) {
      // Update existing chart (re-save with potentially new name or recomputed data)
      const updated = await prisma.savedChart.update({
        where: { inputHash },
        data: {
          name: input.name,
          chartData: input.chartData as any,
          dashaTree: input.dashaTree as any ?? undefined,
          lagna: (input.chartData as any).lagna ?? '',
          lagnaLongitude: (input.chartData as any).lagnaLongitude ?? 0,
          moonLongitude: (input.chartData as any).planets?.find((p: any) => p.planet === 'Moon')?.longitude ?? 0,
          ayanamsa: (input.chartData as any).ayanamsa ?? 0,
        },
      })

      return NextResponse.json(
        {
          id: updated.id,
          name: updated.name,
          message: 'Chart updated (same birth data already existed)',
          isUpdate: true,
        },
        { status: 200 }
      )
    }

    // Extract key fields from chart data
    const lagna = (input.chartData as any).lagna ?? ''
    const lagnaLongitude = (input.chartData as any).lagnaLongitude ?? 0
    const moonLongitude = (input.chartData as any).planets?.find((p: any) => p.planet === 'Moon')?.longitude ?? 0
    const ayanamsa = (input.chartData as any).ayanamsa ?? 0

    // Create new saved chart
    const saved = await prisma.savedChart.create({
      data: {
        name: input.name,
        birthDate: input.birthDate,
        birthTime: input.birthTime,
        timezone: input.timezone,
        latitude: input.latitude,
        longitude: input.longitude,
        sunriseMode: input.sunriseMode,
        lagna,
        lagnaLongitude,
        moonLongitude,
        ayanamsa,
        chartData: input.chartData as any,
        dashaTree: input.dashaTree as any ?? undefined,
        inputHash,
      },
    })

    return NextResponse.json(
      {
        id: saved.id,
        name: saved.name,
        message: 'Chart saved successfully',
        isUpdate: false,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Save chart error:', error)
    return NextResponse.json(
      { error: 'Failed to save chart', message: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
