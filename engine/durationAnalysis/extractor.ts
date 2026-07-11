/**
 * engine/durationAnalysis/extractor.ts
 *
 * extractCategoryData — pure function, no LLM, no DB.
 *
 * Given the relevant JSONB columns from a UnifiedChart record and a life-domain
 * category, returns only the data the category's domain agent needs. The
 * category → data mapping lives in DOMAIN_AGENT_REGISTRY (registry.ts), not here.
 *
 *   ALL categories → planets, nakshatras, relationships, ashtakavarga, dashaTree
 *   per category   → + extraColumns (shadbala/jaimini) + divisionalCharts
 *                      (spec.divisions, e.g. career = D9 + D10)
 *
 * Divisional chart filtering: divisionalCharts is a JSON array of objects each
 * having a numeric `division` field. Entries matching spec.divisions are
 * returned in spec order; missing divisions are silently omitted.
 */

import type { DurationCategory, CategoryChartData } from '@/lib/durationTypes'
import { getDomainAgentSpec } from './registry'

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
  },
  category: DurationCategory
): CategoryChartData {
  const spec = getDomainAgentSpec(category)

  // Base columns — always included for every category
  const data: CategoryChartData = {
    category,
    planets:       chart.planets,
    nakshatras:    chart.nakshatras,
    relationships: chart.relationships,
    ashtakavarga:  chart.ashtakavarga,
    dashaTree:     chart.dashaTree,
  }

  const divisionalCharts = filterDivisionalCharts(chart.divisionalCharts, spec.divisions)
  if (divisionalCharts) {
    data.divisionalCharts = divisionalCharts
  }

  for (const column of spec.extraColumns) {
    data[column] = chart[column]
  }

  return data
}
