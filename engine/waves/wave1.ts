/**
 * engine/waves/wave1.ts — Wave 1 execution: Foundation layer.
 *
 * Agents 1A, 1B, 1C, 1D run in parallel.
 * Results are cached in Wave1Cache for reuse on subsequent runs.
 */

import { prisma } from '@/lib/db'
import type { AgentId, ChartInputV1, DashaTree, PreAnalysisAlert } from '@/lib/types'

/**
 * Checks if Wave 1 results are cached for the given chart hash.
 * If cached, returns the stored data; otherwise returns null.
 */
export async function getWave1Cache(chartHash: string) {
  return prisma.wave1Cache.findUnique({
    where: { chartHash },
  })
}

/**
 * Returns the Wave 1 agent IDs.
 */
export function getWave1Agents(): AgentId[] {
  return ['1A', '1B', '1C', '1D']
}

/**
 * Determines if Wave 1 should be skipped for this run.
 *
 * @param chartHash - SHA256 hash of the chart JSON.
 * @param forceRerun - Whether the practitioner requested a forced re-run.
 * @returns True if Wave 1 can be skipped (cache hit and no force).
 */
export async function shouldSkipWave1(
  chartHash: string,
  forceRerun: boolean
): Promise<boolean> {
  if (forceRerun) return false

  const cache = await getWave1Cache(chartHash)
  return cache !== null
}
