/**
 * POST /api/compute — Compute a full Vedic chart from birth data.
 *
 * Accepts DOB, time, timezone, latitude, longitude.
 * Returns complete chart with planets, divisional charts, nakshatras,
 * karakas, ashtakavarga, and Vimshottari dasha tree.
 *
 * This is a stateless computation endpoint — no database writes.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  CalculationProfileUnavailableError,
  CalculationProfileValidationError,
  computeFullChart,
  computeCharaDasha,
} from '@/engine/compute'
import { computeVimshottari } from '@/engine/computeVimshottari'
import { resolveRequestUser } from '@/lib/auth'
import { birthInputToUtcDate, normalizeBirthTime } from '@/engine/compute/time'

// ─── Input Validation ───────────────────────────────────────────────

const ComputeInputSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format'),
  time: z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2}(?:\.\d{1,6})?)?$/, 'Time must be HH:MM, HH:MM:SS, or HH:MM:SS.s format'),
  timezone: z
    .number()
    .min(-12)
    .max(14)
    .describe('Timezone offset in hours (e.g., 5.5 for IST)'),
  latitude: z
    .number()
    .min(-90)
    .max(90)
    .describe('Geographic latitude'),
  longitude: z
    .number()
    .min(-180)
    .max(180)
    .describe('Geographic longitude'),
  name: z.string().optional(),
  sunriseMode: z
    .enum(['precise', 'jhora'])
    .optional()
    .describe('Sunrise convention for time-based lagnas (default: precise)'),
  calculationProfile: z
    .enum(['drik_lahiri_v1', 'surya_siddhanta_makaranda_v1'])
    .optional()
    .describe('Calculation profile (default: drik_lahiri_v1)'),
})

// ─── Route Handler ──────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const userId = await resolveRequestUser(request)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized', message: 'Sign in required.' }, { status: 401 })
    }

    const body = await request.json()

    // Validate input
    const parsed = ComputeInputSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Invalid input',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      )
    }

    const input = parsed.data

    const time = normalizeBirthTime(input.time)

    // Compute the full chart
    const chart = computeFullChart({
      date: input.date,
      time,
      timezone: input.timezone,
      latitude: input.latitude,
      longitude: input.longitude,
      name: input.name,
      sunriseMode: input.sunriseMode ?? 'precise',
      calculationProfile: input.calculationProfile,
    })

    // Compute Vimshottari Dasha from Moon longitude
    const moonPlanet = chart.planets.find((p) => p.planet === 'Moon')
    if (!moonPlanet) {
      return NextResponse.json(
        { error: 'Moon position could not be computed' },
        { status: 500 }
      )
    }

    // Parse birth datetime for dasha computation.
    // Build the birth instant as a fixed UTC moment (local time minus the
    // birth timezone offset). This mirrors birthInputToJulianDay and makes the
    // dasha tree deterministic regardless of the server's local timezone.
    const birthDate = birthInputToUtcDate({
      date: input.date,
      time,
      timezone: input.timezone,
    })

    const dashaTree = computeVimshottari(moonPlanet.longitude, birthDate)

    // Chara Dasha (Jaimini rasi dasha) — deterministic from D1 sign positions +
    // birth instant. Returned as a sibling of `chart`, like the Vimshottari tree.
    const charaDasha = computeCharaDasha(
      chart.planets,
      chart.lagnaSignNumber,
      birthDate
    )

    // Serialize dasha tree (convert Dates to ISO strings)
    const serializedDasha = {
      balance_years: dashaTree.balance_years,
      mahadashas: dashaTree.mahadashas.map((md) => ({
        lord: md.lord,
        start: md.start.toISOString(),
        end: md.end.toISOString(),
        duration_days: md.duration_days,
        antardashas: md.antardashas.map((ad) => ({
          lord: ad.lord,
          start: ad.start.toISOString(),
          end: ad.end.toISOString(),
          duration_days: ad.duration_days,
          pratyantardashas: ad.pratyantardashas.map((pd) => ({
            lord: pd.lord,
            start: pd.start.toISOString(),
            end: pd.end.toISOString(),
            duration_days: pd.duration_days,
          })),
        })),
      })),
    }

    return NextResponse.json({
      success: true,
      chart,
      dashaTree: serializedDasha,
      charaDasha,
    })
  } catch (error) {
    if (error instanceof CalculationProfileValidationError) {
      return NextResponse.json(
        {
          error: 'Invalid input',
          message: error.message,
          code: error.code,
          calculationProfile: error.calculationProfile,
        },
        { status: 400 }
      )
    }
    if (error instanceof CalculationProfileUnavailableError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          calculationProfile: error.calculationProfile,
        },
        { status: 422 }
      )
    }
    console.error('Chart computation error:', error)
    return NextResponse.json(
      {
        error: 'Chart computation failed',
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}

// ─── GET — API info ─────────────────────────────────────────────────

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/compute',
    method: 'POST',
    description: 'Compute a full Vedic chart from birth data',
    input: {
      date: 'string (YYYY-MM-DD)',
      time: 'string (HH:MM, HH:MM:SS, or HH:MM:SS.s, 24h format)',
      timezone: 'number (offset in hours, e.g., 5.5 for IST)',
      latitude: 'number (-90 to 90)',
      longitude: 'number (-180 to 180)',
      name: 'string (optional)',
      calculationProfile: "'drik_lahiri_v1' | 'surya_siddhanta_makaranda_v1' (optional; SSS provider pending)",
    },
    output: {
      chart: 'Full computed chart (planets, divisional charts, nakshatras, karakas, ashtakavarga)',
      dashaTree: 'Vimshottari dasha tree (mahadashas, antardashas, pratyantardashas)',
    },
  })
}
