/**
 * lib/chart-mapper.ts — Maps between ingestion formats and the UnifiedChart model.
 *
 * Two ingestion paths:
 *   Path A: ComputedChart + DashaTree → UnifiedChart columns (source="compute")
 *   Path B: ChartInputV1 JSON        → UnifiedChart columns (source="paste")
 *
 * Also provides a reverse mapper: UnifiedChart → ChartInputV1 (for AI pipeline input).
 */

import crypto from 'crypto'
import { Prisma } from '@prisma/client'
import type { ComputedChart, BirthInput, DivisionalChart as ComputeDivisionalChart } from '@/engine/compute/types'
import type { ChartInputV1, DashaTree, MahaDasha, AntarDasha, PratyanDasha } from '@/lib/types'

// ─── Types ──────────────────────────────────────────────────────────

/** Serialized dasha tree with ISO string dates (for JSON storage). */
export interface SerializedDashaTree {
  balance_years: number
  mahadashas: SerializedMahaDasha[]
}

interface SerializedMahaDasha {
  lord: string
  start: string
  end: string
  duration_days: number
  antardashas: SerializedAntarDasha[]
}

interface SerializedAntarDasha {
  lord: string
  start: string
  end: string
  duration_days: number
  pratyantardashas: SerializedPratyanDasha[]
}

interface SerializedPratyanDasha {
  lord: string
  start: string
  end: string
  duration_days: number
}

/** The Prisma create input shape for UnifiedChart (without id, timestamps). */
export type UnifiedChartCreateInput = Omit<
  Prisma.UnifiedChartCreateInput,
  'id' | 'createdAt' | 'updatedAt' | 'pipelineRuns'
>

// ─── Path A: ComputedChart → UnifiedChart ───────────────────────────

/**
 * Maps a ComputedChart (from the deterministic engine) + serialized DashaTree
 * into the column-per-domain shape for UnifiedChart persistence.
 *
 * source = "compute" — Wave 1 is skipped during AI analysis since
 * all foundation data is already deterministically computed.
 */
export function mapComputedToUnified(
  chart: ComputedChart,
  dashaTree: SerializedDashaTree,
  name: string
): UnifiedChartCreateInput {
  // Build birth datetime from input
  const birthDatetime = buildBirthDatetime(chart.input)

  // Compute hash from birth input for deduplication
  const chartHash = computeChartHash({
    source: 'compute',
    date: chart.input.date,
    time: chart.input.time,
    timezone: chart.input.timezone,
    latitude: chart.input.latitude,
    longitude: chart.input.longitude,
    sunriseMode: chart.input.sunriseMode ?? 'precise',
  })

  return {
    name,
    source: 'compute',
    birthInput: chart.input as unknown as Prisma.InputJsonValue,
    lagna: chart.lagna,
    lagnaLongitude: chart.lagnaLongitude,
    moonLongitude: chart.planets.find((p) => p.planet === 'Moon')!.longitude,
    ayanamsa: chart.ayanamsa,
    birthDatetime,
    sunriseMode: chart.sunriseMode,
    chartHash,

    // Domain JSONB columns
    planets: chart.planets as unknown as Prisma.InputJsonValue,
    nakshatras: chart.nakshatras as unknown as Prisma.InputJsonValue,
    divisionalCharts: chart.divisionalCharts as unknown as Prisma.InputJsonValue,
    karakas: chart.charaKarakas as unknown as Prisma.InputJsonValue,
    ashtakavarga: chart.ashtakavarga as unknown as Prisma.InputJsonValue,
    upagrahas: chart.upagrahas as unknown as Prisma.InputJsonValue,
    specialLagnas: chart.specialLagnas as unknown as Prisma.InputJsonValue,
    arudhaPadas: chart.arudhaPadas as unknown as Prisma.InputJsonValue,
    relationships: chart.relationships as unknown as Prisma.InputJsonValue,
    shadbala: chart.shadbala as unknown as Prisma.InputJsonValue,
    jaimini: chart.computedJaimini as unknown as Prisma.InputJsonValue,
    bhavaBala: chart.bhavaBala as unknown as Prisma.InputJsonValue,
    transits: chart.transits as unknown as Prisma.InputJsonValue,
    pindaStrength: chart.pindaStrength as unknown as Prisma.InputJsonValue,
    dashaTree: dashaTree as unknown as Prisma.InputJsonValue,
    yogas: chart.yogas as unknown as Prisma.InputJsonValue,

    // chartInputV1 is null for compute path initially —
    // generated on-demand when AI analysis is triggered
    chartInputV1: Prisma.JsonNull,
  }
}

// ─── Path B: ChartInputV1 → UnifiedChart ────────────────────────────

/**
 * Maps a validated ChartInputV1 (pasted JSON) into the UnifiedChart shape.
 *
 * source = "paste" — full Wave 1–4 pipeline runs during AI analysis
 * since we only have the practitioner's manually prepared data.
 *
 * Domain JSONB columns are left null (they aren't computed yet).
 * The chartInputV1 column stores the full pasted input.
 */
export function mapPastedToUnified(
  chartInput: ChartInputV1
): UnifiedChartCreateInput {
  // Extract scalar fields from meta
  const meta = chartInput.meta

  // Build birth datetime from meta
  const birthDatetime = new Date(meta.birth_datetime)

  // Extract moon longitude from natal_nakshatras
  const moonEntry = chartInput.natal_nakshatras.find((p) => p.body === 'Moon')!
  const moonLongitude = ((moonEntry.sign_no - 1) * 30) + moonEntry.degree_decimal

  // Extract lagna longitude
  const lagnaLongitude = meta.lagna_degree_decimal

  // Compute hash from the full chart input for deduplication
  const chartHash = computeChartHash({
    source: 'paste',
    chartJson: JSON.stringify(chartInput),
  })

  return {
    name: meta.client_name,
    source: 'paste',
    birthInput: meta as unknown as Prisma.InputJsonValue,
    lagna: meta.lagna_sign,
    lagnaLongitude,
    moonLongitude,
    ayanamsa: 0, // Not available in pasted input; will be filled by Wave 1 if needed
    birthDatetime,
    sunriseMode: 'precise',
    chartHash,

    // Domain JSONB columns — not populated for paste path
    // These remain null until AI analysis or a compute re-run fills them
    planets: Prisma.JsonNull,
    nakshatras: Prisma.JsonNull,
    divisionalCharts: Prisma.JsonNull,
    karakas: Prisma.JsonNull,
    ashtakavarga: Prisma.JsonNull,
    upagrahas: Prisma.JsonNull,
    specialLagnas: Prisma.JsonNull,
    arudhaPadas: Prisma.JsonNull,
    relationships: Prisma.JsonNull,
    shadbala: Prisma.JsonNull,
    jaimini: Prisma.JsonNull,
    bhavaBala: Prisma.JsonNull,
    transits: Prisma.JsonNull,
    pindaStrength: Prisma.JsonNull,
    dashaTree: Prisma.JsonNull,
    yogas: Prisma.JsonNull,

    // Store the full pasted input for AI pipeline consumption
    chartInputV1: chartInput as unknown as Prisma.InputJsonValue,
  }
}

// ─── Reverse Mapper: UnifiedChart → ChartInputV1 ────────────────────

/**
 * Builds a ChartInputV1 from a UnifiedChart's stored domain columns.
 * Used when triggering AI analysis on a compute-path chart.
 *
 * For source="paste" charts, the chartInputV1 column is already populated.
 * For source="compute" charts, we synthesize a ChartInputV1 from domain JSONB.
 */
export function buildChartInputV1FromUnified(chart: {
  source: string
  chartInputV1: unknown
  planets: unknown
  nakshatras: unknown
  divisionalCharts: unknown
  karakas: unknown
  ashtakavarga: unknown
  upagrahas: unknown
  specialLagnas: unknown
  shadbala: unknown
  birthInput: unknown
  lagna: string
  lagnaLongitude: number | { toNumber?: () => number }
  moonLongitude: number | { toNumber?: () => number }
  ayanamsa: number | { toNumber?: () => number }
  birthDatetime: Date
  name: string
}): ChartInputV1 | null {
  // For paste-path charts, return stored chartInputV1 directly
  if (chart.source === 'paste' && chart.chartInputV1) {
    return chart.chartInputV1 as unknown as ChartInputV1
  }

  // For compute-path charts, synthesize from domain columns
  if (chart.source === 'compute') {
    const planets = chart.planets as any[]
    const nakshatras = chart.nakshatras as any[]
    const divisionalCharts = chart.divisionalCharts as any[]
    const karakas = chart.karakas as any[]
    const ashtakavargaData = chart.ashtakavarga as any
    const shadbalaData = chart.shadbala as any
    const upagrahasData = chart.upagrahas as any[]
    const specialLagnasData = chart.specialLagnas as any[]
    const birthInput = chart.birthInput as any

    if (!planets || !nakshatras || !divisionalCharts) {
      return null
    }

    const lagnaLong = typeof chart.lagnaLongitude === 'number'
      ? chart.lagnaLongitude
      : chart.lagnaLongitude.toNumber?.() ?? 0
    const moonLong = typeof chart.moonLongitude === 'number'
      ? chart.moonLongitude
      : chart.moonLongitude.toNumber?.() ?? 0

    // Find lagna nakshatra from nakshatras data (Ascendant entry if present)
    const lagnaNakEntry = nakshatras?.find((n: any) => n.planet === 'Ascendant')

    // Map nakshatras to NatalPlanet format
    const natalNakshatras = planets.map((p: any) => {
      const nk = nakshatras?.find((n: any) => n.planet === p.planet)
      return {
        body: p.planet,
        sign: p.sign,
        sign_no: p.signNumber,
        house: p.house,
        degree: `${Math.floor(p.degreeInSign)}°${Math.round((p.degreeInSign % 1) * 60)}'`,
        degree_decimal: p.degreeInSign,
        nakshatra: nk?.nakshatra ?? '',
        pada: nk?.pada ?? 1,
        notes: p.retrograde ? 'R' : undefined,
      }
    })

    // Map divisional charts to ChartInputV1 format
    const divChartMap: Record<string, any> = {}
    for (const dc of divisionalCharts) {
      const key = mapDivisionalName(dc.shortName || dc.name, dc.division)
      if (key) {
        divChartMap[key] = {
          name: dc.name,
          lagna: dc.lagna,
          lagna_sign_no: dc.lagnaSignNumber,
          houses: dc.planets.reduce((acc: any[], planet: any) => {
            let house = acc.find((h: any) => h.house === planet.house)
            if (!house) {
              house = { house: planet.house, sign: planet.sign, occupants: [] }
              acc.push(house)
            }
            house.occupants.push(planet.planet)
            return acc
          }, [] as any[]),
        }
      }
    }

    // Map shadbala to ChartInputV1 format
    const shadbalaEntries = shadbalaData?.planets?.map((sp: any) => ({
      planet: sp.planet,
      total_shadbala_virupas: sp.totalVirupas,
      required_virupas: sp.requiredRupas * 60, // rupas to virupas
      grade: sp.grade,
      six_balas: sp.components,
      ishta: sp.ishtaPhala,
      kashta: sp.kashtaPhala,
    })) ?? []

    // Map ashtakavarga
    const ashtakavargaV1: any = {}
    if (ashtakavargaData) {
      ashtakavargaV1.sarvashtakavarga = {
        total: ashtakavargaData.savTotal,
        by_sign: ashtakavargaData.sav.map((points: number, idx: number) => ({
          sign_no: idx + 1,
          sign: signNameFromNumber(idx + 1),
          points,
        })),
      }
    }

    // Compute lagna degree in sign
    const lagnaSignNumber = Math.floor(lagnaLong / 30) + 1
    const lagnaDegreeInSign = lagnaLong - (lagnaSignNumber - 1) * 30

    const chartInputV1: ChartInputV1 = {
      meta: {
        client_name: chart.name,
        birth_datetime: chart.birthDatetime.toISOString(),
        birth_place: birthInput?.name ?? undefined,
        system: 'Vedic (Jyotish) — Lahiri Ayanamsha',
        lagna_sign: chart.lagna as any,
        lagna_degree_decimal: lagnaDegreeInSign,
        lagna_nakshatra: lagnaNakEntry?.nakshatra,
        lagna_pada: lagnaNakEntry?.pada,
        source: 'VedicMojoAI Compute Engine',
      },
      natal_nakshatras: natalNakshatras as any,
      divisional_charts: {
        D1_Rasi: divChartMap['D1_Rasi'] ?? buildEmptyDivisional('D1 Rasi'),
        D4_Chaturthamsa: divChartMap['D4_Chaturthamsa'] ?? buildEmptyDivisional('D4 Chaturthamsa'),
        D9_Navamsa: divChartMap['D9_Navamsa'] ?? buildEmptyDivisional('D9 Navamsa'),
        D10_Dasamsa: divChartMap['D10_Dasamsa'] ?? buildEmptyDivisional('D10 Dasamsa'),
        D30_Trimshamsa: divChartMap['D30_Trimshamsa'] ?? buildEmptyDivisional('D30 Trimshamsa'),
        D7_Saptamsa: divChartMap['D7_Saptamsa'],
      },
      shadbala: shadbalaEntries,
      ashtakavarga: ashtakavargaV1,
      special_lagnas: specialLagnasData?.map((sl: any) => ({
        name: sl.name,
        sign: sl.sign,
        sign_no: sl.signNumber,
        house: sl.house,
        degree_decimal: sl.degreeInSign,
      })),
      karakas: karakas?.map((k: any) => ({
        role: k.karaka,
        planet: k.planet,
        degree_decimal: k.degreeInSign,
      })),
      upagrahas: upagrahasData?.map((u: any) => ({
        name: u.name,
        sign: signNameFromNumber(u.signNumber) as any,
        sign_no: u.signNumber,
        degree_decimal: u.degreeInSign,
        house: u.house,
      })),
    }

    return chartInputV1
  }

  return null
}

// ─── Dasha Serialization ────────────────────────────────────────────

/** Serializes a DashaTree (with Date objects) to ISO string format for JSON storage. */
export function serializeDashaTree(tree: DashaTree): SerializedDashaTree {
  return {
    balance_years: tree.balance_years,
    mahadashas: tree.mahadashas.map((md) => ({
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
}

// ─── Helpers ────────────────────────────────────────────────────────

/** Builds a UTC Date from BirthInput fields. */
function buildBirthDatetime(input: BirthInput): Date {
  const [year, month, day] = input.date.split('-').map(Number)
  const timeParts = input.time.split(':').map(Number)
  const hours = timeParts[0]
  const minutes = timeParts[1]
  const seconds = timeParts[2] ?? 0

  const utcMillis =
    Date.UTC(year, month - 1, day, hours, minutes, seconds) -
    input.timezone * 3600 * 1000

  return new Date(utcMillis)
}

/** Computes a SHA-256 hash for chart deduplication. */
function computeChartHash(input: Record<string, unknown>): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(input))
    .digest('hex')
}

/** Maps divisional chart shortName/division to the ChartInputV1 key format. */
function mapDivisionalName(shortName: string, division: number): string | null {
  const map: Record<number, string> = {
    1: 'D1_Rasi',
    4: 'D4_Chaturthamsa',
    7: 'D7_Saptamsa',
    9: 'D9_Navamsa',
    10: 'D10_Dasamsa',
    30: 'D30_Trimshamsa',
  }
  return map[division] ?? null
}

/** Returns zodiac sign name from 1-based sign number. */
function signNameFromNumber(signNumber: number): string {
  const signs = [
    'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
    'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
  ]
  return signs[(signNumber - 1) % 12] ?? 'Aries'
}

/** Builds an empty divisional chart placeholder. */
function buildEmptyDivisional(name: string) {
  return {
    name,
    houses: Array.from({ length: 12 }, (_, i) => ({
      house: i + 1,
      sign: signNameFromNumber(i + 1) as any,
      occupants: [],
    })),
  }
}
