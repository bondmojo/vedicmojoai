/**
 * app/api/matchmaking/_shared.ts — Shared resolve + validate + build-inputs +
 * compute pipeline for the matchmaking routes (POST /api/matchmaking and
 * POST /api/matchmaking/preview), factored out so the persisting route and
 * the preview route cannot drift (task 8.2 of
 * .kiro/specs/marriage-matchmaking/tasks.md).
 *
 * Deliberately contains NO database write — only reads (`findUnique`) — so
 * the preview route stays a pure read + compute even though it imports this
 * module.
 */

import { z } from 'zod'
import { prisma } from '@/lib/db'
import {
  computeMatch,
  longitudeToNakshatraPadaRashi,
  type MatchNative,
  type MatchNativeInput,
  type MangalNativeInput,
} from '@/engine/compute/matchmaking'
import { RASHI_ATTRIBUTES } from '@/engine/compute/matchmakingTables'
import type { MatchResult, PlanetPosition, AspectEdge } from '@/engine/compute/types'

// ─── Request shape ──────────────────────────────────────────────────────
//
// Field names ARE the role encoding (brideChartId / groomChartId) — there is
// no separate `roles` object, per the brief's supersession of
// requirements.md 7.1's `{chartAId, chartBId, roles}` shape. A missing role
// field is just Zod's ordinary required-field 400.

export const MatchRequestSchema = z.object({
  brideChartId: z.string().trim().min(1, 'brideChartId is required'),
  groomChartId: z.string().trim().min(1, 'groomChartId is required'),
  label: z.string().trim().min(1).max(200).optional(),
})

export type MatchRequestInput = z.infer<typeof MatchRequestSchema>

// ─── Chart fetch ────────────────────────────────────────────────────────

const CHART_SELECT = {
  id: true,
  userId: true,
  name: true,
  source: true,
  moonLongitude: true,
  lagna: true,
  planets: true,
  relationships: true,
} as const

/** The narrow shape both routes need — never the full UnifiedChart row. */
export interface ChartForMatch {
  id: string
  userId: string
  name: string
  source: string
  moonLongitude: unknown // Prisma Decimal — read only via Number()
  lagna: string
  planets: unknown // Json — PlanetPosition[] on compute-source charts
  relationships: unknown // Json — RelationshipGeometry on compute-source charts
}

export interface ResolvedMatchCharts {
  bride: ChartForMatch
  groom: ChartForMatch
}

/**
 * Fetches both charts and enforces ownership. Returns `null` — never a
 * distinguishing error — when EITHER chart does not exist OR belongs to a
 * different user, so the caller can respond with a single, undifferentiated
 * 404 (never a 403, never a body that reveals which side failed).
 */
export async function resolveChartsForMatch(
  userId: string,
  brideChartId: string,
  groomChartId: string
): Promise<ResolvedMatchCharts | null> {
  const [bride, groom] = await Promise.all([
    prisma.unifiedChart.findUnique({ where: { id: brideChartId }, select: CHART_SELECT }),
    prisma.unifiedChart.findUnique({ where: { id: groomChartId }, select: CHART_SELECT }),
  ])

  if (!bride || bride.userId !== userId) return null
  if (!groom || groom.userId !== userId) return null

  return { bride, groom }
}

// ─── Native input construction ─────────────────────────────────────────

/**
 * Maps a chart's `lagna` (an English rashi name, e.g. "Taurus" — see
 * `engine/compute/index.ts`'s `lagna: ascendant.sign`) to its 1..12 rashi
 * number via `matchmakingTables.RASHI_ATTRIBUTES`'s own `name` field, rather
 * than duplicating a second name→number table. Returns `null` (never
 * throws) on an unrecognized/missing name.
 */
function resolveLagnaSignNumber(lagnaName: string | null | undefined): number | null {
  if (!lagnaName) return null
  const entry = Object.values(RASHI_ATTRIBUTES).find((r) => r.name === lagnaName)
  return entry ? entry.rashiNumber : null
}

/**
 * Builds `MangalNativeInput` from a chart's `planets`/`relationships` JSONB
 * — ONLY for `source === 'compute'` charts that actually carry the needed
 * data. Omits the whole `mangal` input (never fabricates a partial one) when
 * any required piece is missing, so `computeMangalDosha` degrades cleanly to
 * `status: 'unavailable'` rather than being handed guessed data.
 */
function buildMangalInput(chart: ChartForMatch): MangalNativeInput | undefined {
  if (chart.source !== 'compute') return undefined
  if (!Array.isArray(chart.planets) || chart.planets.length === 0) return undefined

  const planets = chart.planets as unknown as PlanetPosition[]
  const hasMars = planets.some((p) => p && p.planet === 'Mars' && typeof p.signNumber === 'number')
  if (!hasMars) return undefined

  const lagnaSignNumber = resolveLagnaSignNumber(chart.lagna)
  if (lagnaSignNumber === null) return undefined

  const relationships = chart.relationships as unknown as { aspects?: AspectEdge[] } | null
  const aspects = relationships && Array.isArray(relationships.aspects) ? relationships.aspects : []

  return { planets, lagnaSignNumber, aspects }
}

/**
 * Builds one native's `MatchNative` (koota + optional mangal) from a fetched
 * chart plus its structural role. `moonLongitude` is a required scalar on
 * BOTH ingestion paths, so koota scoring is NEVER gated on
 * `source === 'compute'` — only Mangal Dosha is.
 */
export function buildMatchNative(chart: ChartForMatch, role: 'bride' | 'groom'): MatchNative {
  const moonLongitude = Number(chart.moonLongitude)
  const { nakshatraNumber, padaNumber } = longitudeToNakshatraPadaRashi(moonLongitude)
  const koota: MatchNativeInput = { role, nakshatraNumber, padaNumber, moonLongitude }
  const mangal = buildMangalInput(chart)
  return mangal ? { koota, mangal } : { koota }
}

/** Composes both natives and runs `computeMatch` — the one place both routes call into the engine. */
export function computeMatchResult(bride: ChartForMatch, groom: ChartForMatch): MatchResult {
  const brideNative = buildMatchNative(bride, 'bride')
  const groomNative = buildMatchNative(groom, 'groom')
  return computeMatch(brideNative, groomNative)
}
