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
import { prisma } from '@/lib/db'
import { computeFullChart } from '@/engine/compute'
import { computeVimshottari } from '@/engine/computeVimshottari'
import { mapComputedToUnified, serializeDashaTree } from '@/lib/chart-mapper'

// ─── Input Validation ───────────────────────────────────────────────

const ComputeInputSchema = z.object({
  name: z.string().min(1, 'Name is required'),
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

    const input = parsed.data

    // Normalize time to HH:MM:SS
    const time = input.time.length === 5 ? `${input.time}:00` : input.time

    // Compute the full chart via Swiss Ephemeris
    const chart = computeFullChart({
      date: input.date,
      time,
      timezone: input.timezone,
      latitude: input.latitude,
      longitude: input.longitude,
      name: input.name,
      sunriseMode: input.sunriseMode,
    })

    // Compute Vimshottari Dasha from Moon longitude
    const moonPlanet = chart.planets.find((p) => p.planet === 'Moon')
    if (!moonPlanet) {
      return NextResponse.json(
        { error: 'Moon position could not be computed' },
        { status: 500 }
      )
    }

    // Build birth datetime (UTC) for dasha computation
    const [year, month, day] = input.date.split('-').map(Number)
    const [hours, minutes, seconds] = time.split(':').map(Number)
    const birthUtcMillis =
      Date.UTC(year, month - 1, day, hours, minutes, seconds || 0) -
      input.timezone * 3600 * 1000
    const birthDate = new Date(birthUtcMillis)

    const dashaTree = computeVimshottari(moonPlanet.longitude, birthDate)
    const serializedDasha = serializeDashaTree(dashaTree)

    // Map to UnifiedChart create input
    const createInput = mapComputedToUnified(chart, serializedDasha, input.name)

    // Check for duplicate (same birth data hash)
    const existing = await prisma.unifiedChart.findUnique({
      where: { chartHash: createInput.chartHash },
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
      data: createInput,
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
        message: 'Chart computed and saved successfully',
      },
      { status: 201 }
    )
  } catch (error) {
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
