/**
 * engine/durationAnalysis/extractor.ts
 *
 * extractCategoryData — pure function, no LLM, no DB.
 *
 * Given the relevant JSONB columns from a UnifiedChart record and a life-domain
 * category, returns the data the category's domain agent needs. The category →
 * data mapping lives in DOMAIN_AGENT_REGISTRY (registry.ts), not here.
 *
 *   ALL categories → planets, nakshatras, relationships, ashtakavarga, dashaTree,
 *                    nakshatraRelationships (computed on-demand), bhavaBala, upagrahas,
 *                    ishtaKashta (from shadbala), declared domain special points
 *   per category   → + extraColumns (shadbala/jaimini) + divisionalCharts
 *                      (spec.divisions, e.g. career = D9 + D10)
 *
 * Divisional chart filtering: divisionalCharts is a JSON array of objects each
 * having a numeric `division` field. Entries matching spec.divisions are
 * returned in spec order; missing divisions are silently omitted.
 *
 * toScoringChartData — thin scoring-focused view of the extended chart data,
 * assembled for the pure Scoring Engine (scoring.ts).
 */

import type {
  DurationCategory,
  CategoryChartData,
  ScoringChartData,
  DomainSpecialPoints,
  ResolvedSpecialPoint,
} from '@/lib/durationTypes'
import type {
  ShadbalResult,
  BhavaBalaResult,
  CharaKaraka,
  AshtakavargaResult,
  PlanetPosition,
  NakshatraInfo,
  JaiminiGeometry,
  DivisionalChart,
  RelationshipGeometry,
} from '@/engine/compute/types'
import { getDomainAgentSpec } from './registry'
import { DOMAIN_SCORING_WEIGHTS } from './scoringWeights'
import { computeNakshatraRelationships } from '@/engine/compute/nakshatraRelationships'

// ─── Extended CategoryChartData ──────────────────────────────────────
// The base interface is declared in lib/durationTypes.ts; we extend it here
// for the additional scoring-layer columns.

export interface ExtendedCategoryChartData extends CategoryChartData {
  /** Computed on-demand from stored nakshatras. Absent when nakshatras column is empty. */
  nakshatraRelationships?: unknown
  /** Bhava Bala per house — null/empty signals the column was absent. */
  bhavaBala?: unknown
  /** Per-domain special points, each explicitly marked omitted:true when unavailable. */
  specialPoints?: DomainSpecialPoints
}

// ─── Helpers ─────────────────────────────────────────────────────────

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : []
}

/**
 * Collect the divisional-chart entries whose `division` matches one of the
 * requested numbers, preserving the requested order. Returns undefined when
 * nothing matches (or the stored column is not an array) so the key is
 * omitted from the prompt payload entirely.
 */
function filterDivisionalCharts(
  divisionalCharts: unknown,
  divisions: number[]
): unknown[] | undefined {
  if (!Array.isArray(divisionalCharts) || divisions.length === 0) return undefined

  const found = divisions
    .map((division) =>
      divisionalCharts.find(
        (entry: unknown) =>
          typeof entry === 'object' &&
          entry !== null &&
          (entry as Record<string, unknown>)['division'] === division
      )
    )
    .filter((entry) => entry !== undefined)

  return found.length > 0 ? found : undefined
}

/**
 * Derive the sub-lord of the Lagna/Ascendant from the stored nakshatras column.
 * Returns undefined when the ascendant entry is absent (passed to
 * computeNakshatraRelationships as an optional second arg).
 */
function deriveLagnaSubLord(nakshatras: unknown): string | undefined {
  const arr = asArray<{ planet: string; subLord: string }>(nakshatras)
  const lagna = arr.find(
    (n) => n.planet === 'Lagna' || n.planet === 'Ascendant' || n.planet === 'ASC'
  )
  return lagna?.subLord
}

// ─── Special-point resolution ─────────────────────────────────────────

interface ChartColumns {
  arudhaPadas?: unknown
  specialLagnas?: unknown
  karakas?: unknown
  upagrahas?: unknown
}

type SpecialPointSource = 'arudhaPadas' | 'specialLagnas' | 'karakas' | 'upagrahas'

/**
 * Look up an entry from a stored column by its abbreviation/selector.
 * Returns the entry object when found, or undefined when the column is absent
 * or the selector isn't in it.
 */
function lookupSpecialPoint(
  columns: ChartColumns,
  source: SpecialPointSource,
  selector: string
): unknown | undefined {
  const column = columns[source]
  if (!Array.isArray(column)) return undefined

  return (column as Array<Record<string, unknown>>).find((entry) => {
    // Arudha padas and special lagnas use 'abbr'; karakas use 'karakaAbbr'
    if (source === 'karakas') return entry['karakaAbbr'] === selector
    return entry['abbr'] === selector
  })
}

/**
 * Resolve all special points declared by DOMAIN_SCORING_WEIGHTS for a category.
 * Every declared point is represented in the result — never silently dropped.
 * Points that are unavailable carry omitted:true (Requirement 7.4).
 */
function resolveSpecialPoints(
  category: DurationCategory,
  columns: ChartColumns
): DomainSpecialPoints {
  const domainWeights = DOMAIN_SCORING_WEIGHTS[category]
  if (!domainWeights) return {}

  const result: DomainSpecialPoints = {}

  for (const spec of domainWeights.specialPoints) {
    const value = lookupSpecialPoint(columns, spec.source, spec.selector)
    const resolved: ResolvedSpecialPoint = {
      key: spec.key,
      omitted: value === undefined,
      ...(value !== undefined ? { value } : {}),
    }
    result[spec.key] = resolved
  }

  return result
}

// ─── Main extractor ───────────────────────────────────────────────────

export function extractCategoryData(
  chart: {
    planets: unknown
    nakshatras: unknown
    relationships: unknown
    shadbala: unknown
    divisionalCharts: unknown
    jaimini: unknown
    ashtakavarga: unknown
    dashaTree: unknown
    bhavaBala?: unknown
    arudhaPadas?: unknown
    specialLagnas?: unknown
    karakas?: unknown
    upagrahas?: unknown
  },
  category: DurationCategory
): ExtendedCategoryChartData {
  const spec = getDomainAgentSpec(category)

  // ── Compute nakshatraRelationships on-demand ─────────────────────
  // Not stored — derived from the nakshatras column each time.
  let nakshatraRelationships: unknown | undefined
  const nakshatrasArr = asArray<NakshatraInfo>(chart.nakshatras)
  if (nakshatrasArr.length > 0) {
    try {
      const lagnaSubLord = deriveLagnaSubLord(chart.nakshatras)
      nakshatraRelationships = computeNakshatraRelationships(
        nakshatrasArr,
        lagnaSubLord
      )
    } catch {
      // On any compute failure, omit the key rather than emitting a partial result
      nakshatraRelationships = undefined
    }
  }

  // ── Resolve domain special points ────────────────────────────────
  const columns: ChartColumns = {
    arudhaPadas:  chart.arudhaPadas,
    specialLagnas: chart.specialLagnas,
    karakas:      chart.karakas,
    upagrahas:    chart.upagrahas,
  }
  const specialPoints = resolveSpecialPoints(category, columns)

  // ── Base columns — always included for every category ────────────
  const data: ExtendedCategoryChartData = {
    category,
    planets:       chart.planets,
    nakshatras:    chart.nakshatras,
    relationships: chart.relationships,
    ashtakavarga:  chart.ashtakavarga,
    dashaTree:     chart.dashaTree,
    // null/empty bhavaBala/upagrahas indicates the column was attempted but absent
    bhavaBala:     chart.bhavaBala ?? null,
    upagrahas:     chart.upagrahas ?? null,
    specialPoints,
  }

  // Inject nakshatraRelationships only when the column was non-empty
  if (nakshatraRelationships !== undefined) {
    data.nakshatraRelationships = nakshatraRelationships
  }

  // ── Divisional charts ────────────────────────────────────────────
  const divisionalCharts = filterDivisionalCharts(chart.divisionalCharts, spec.divisions)
  if (divisionalCharts) {
    data.divisionalCharts = divisionalCharts
  }

  // ── Extra columns (shadbala, jaimini) ────────────────────────────
  for (const column of spec.extraColumns) {
    data[column] = chart[column as keyof typeof chart]
  }

  return data
}

// ─── toScoringChartData ───────────────────────────────────────────────

/**
 * Assemble the thin ScoringChartData view from the extended category data
 * and the raw chart columns (the scoring engine needs typed access, not raw
 * unknown payloads).
 *
 * Called in the pipeline after extractCategoryData — Step 0d.
 */
/** The raw chart columns the scoring engine reads (typed access, not the prompt payload). */
export interface ScoringRawChart {
  shadbala?: unknown
  bhavaBala?: unknown
  karakas?: unknown
  ashtakavarga?: unknown
  planets?: unknown
  jaimini?: unknown
}

/**
 * Pick the exact column subset the scorer needs from a UnifiedChart row.
 *
 * Use this at EVERY toScoringChartData call site (pipeline + /api/timeline) so the
 * two paths cannot silently diverge — a new scoring input added here reaches both
 * the LLM pipeline and the deterministic MCP path in one edit.
 */
export function pickScoringRawChart(chart: ScoringRawChart): ScoringRawChart {
  return {
    shadbala:     chart.shadbala,
    bhavaBala:    chart.bhavaBala,
    karakas:      chart.karakas,
    ashtakavarga: chart.ashtakavarga,
    planets:      chart.planets,
    jaimini:      chart.jaimini,
  }
}

export function toScoringChartData(
  categoryData: ExtendedCategoryChartData,
  rawChart: ScoringRawChart
): ScoringChartData {
  return {
    category: categoryData.category,
    shadbala:    (rawChart.shadbala as ShadbalResult | null | undefined) ?? null,
    bhavaBala:   (rawChart.bhavaBala as BhavaBalaResult | null | undefined) ?? null,
    karakas:     (rawChart.karakas as CharaKaraka[] | null | undefined) ?? null,
    ashtakavarga: (rawChart.ashtakavarga as AshtakavargaResult | null | undefined) ?? null,
    planets:     (rawChart.planets as PlanetPosition[] | null | undefined) ?? null,
    jaimini:     (rawChart.jaimini as JaiminiGeometry | null | undefined) ?? null,
    // Already domain-filtered / always-present base columns on categoryData — sourced from
    // extractCategoryData, which both call sites (pipeline + /api/timeline) already run before
    // toScoringChartData, so no new rawChart plumbing or dual-call-site risk here.
    divisionalCharts: (categoryData.divisionalCharts as DivisionalChart[] | null | undefined) ?? null,
    relationships:    (categoryData.relationships as RelationshipGeometry | null | undefined) ?? null,
    specialPoints: categoryData.specialPoints,
  }
}
