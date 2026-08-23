/**
 * POST /api/compute/varshaphal — Compute a Tajika Varshaphal (annual
 * solar-return chart) from birth data + a requested civil year.
 *
 * Returns the Varsha Pravesh instant, the full annual chart (planets, Varsha
 * Lagna, divisional charts, Shadbala), the Muntha, Panchavargeeya Bala, the
 * five year-lord candidates, and the selected Varshesha.
 *
 * Stateless — no database writes.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { computeVarshaphal } from '@/engine/compute/varshaphal'
import { resolveRequestUser } from '@/lib/auth'
import { resolveAstronomyProvider } from '@/engine/compute/astronomy'
import { CalculationProfileUnavailableError, resolveCalculationProfile } from '@/engine/compute/profiles'
import { normalizeBirthTime } from '@/engine/compute/time'

const VarshaphalInputSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format'),
  time: z.string().regex(/^\d{2}:\d{2}(:\d{2}(?:\.\d{1,6})?)?$/, 'Time must be HH:MM, HH:MM:SS, or HH:MM:SS.s format'),
  timezone: z.number().min(-12).max(14),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  name: z.string().optional(),
  sunriseMode: z.enum(['precise', 'jhora']).optional(),
  calculationProfile: z.enum(['drik_lahiri_v1', 'surya_siddhanta_makaranda_v1']).optional(),
  varshaYear: z
    .number()
    .int()
    .min(1800)
    .max(2399)
    .describe('Civil year for the annual chart (Swiss Ephemeris covers 1800–2399)'),
})

export async function POST(request: NextRequest) {
  try {
    const userId = await resolveRequestUser(request)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized', message: 'Sign in required.' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = VarshaphalInputSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const input = parsed.data
    const time = normalizeBirthTime(input.time)
    // Task 4 owns the independent SSS Varshaphal convention. Resolve here so
    // an SSS request cannot accidentally use the legacy Drik calculation.
    resolveAstronomyProvider(resolveCalculationProfile(input.calculationProfile))

    const [birthYear] = input.date.split('-').map(Number)
    if (input.varshaYear < birthYear) {
      return NextResponse.json(
        { error: 'varshaYear must be on or after the birth year' },
        { status: 400 }
      )
    }

    const varshaphal = computeVarshaphal({
      date: input.date,
      time,
      timezone: input.timezone,
      latitude: input.latitude,
      longitude: input.longitude,
      name: input.name,
      sunriseMode: input.sunriseMode ?? 'precise',
      varshaYear: input.varshaYear,
    })

    return NextResponse.json({ success: true, varshaphal })
  } catch (error) {
    if (error instanceof CalculationProfileUnavailableError) {
      return NextResponse.json(
        { error: error.message, code: error.code, calculationProfile: error.calculationProfile },
        { status: 422 }
      )
    }
    console.error('Varshaphal computation error:', error)
    return NextResponse.json(
      {
        error: 'Varshaphal computation failed',
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/compute/varshaphal',
    method: 'POST',
    description: 'Compute a Tajika Varshaphal (annual solar-return chart) for a given year',
    input: {
      date: 'string (YYYY-MM-DD)',
      time: 'string (HH:MM, HH:MM:SS, or HH:MM:SS.s, 24h)',
      timezone: 'number (offset hours, e.g. 5.5 for IST)',
      latitude: 'number (-90..90)',
      longitude: 'number (-180..180)',
      varshaYear: 'number (civil year, 1800..2399)',
      name: 'string (optional)',
      sunriseMode: "'precise' | 'jhora' (optional)",
      calculationProfile: "'drik_lahiri_v1' | 'surya_siddhanta_makaranda_v1' (optional; SSS provider pending)",
    },
    output: {
      varshaphal:
        'VarshaPravesh instant, annualChart (planets/lagna/vargas/shadbala), muntha, panchavargeeyaBala, candidates, varshesha',
    },
  })
}
