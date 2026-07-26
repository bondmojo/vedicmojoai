/**
 * engine/durationAnalysis/reaper.ts — stale-run reaper.
 *
 * The pipeline runs fire-and-forget inside the Next.js process. A restart,
 * crash, or serverless freeze leaves records stuck at status queued/running
 * forever. The reaper marks such runs failed ON READ — every read path
 * (GET [id], SSE poll, list route) calls it before returning state, so a
 * stalled run surfaces as a clear failure instead of an eternal spinner.
 *
 * Staleness heartbeat: the pipeline updates the DurationAnalysis row after
 * every DA-1 batch and every agent step, so updatedAt advances continuously
 * on a healthy run. No update for STALE_RUN_MS ⇒ the process is gone.
 */

import { prisma } from '@/lib/db'

export const STALE_RUN_MS = 10 * 60 * 1000 // 10 minutes without a heartbeat

export const STALE_RUN_MESSAGE =
  'Run stalled — no progress for 10 minutes (server restart or crash likely). Re-launch the analysis.'

const ACTIVE_STATUSES = ['queued', 'running']

/** Pure staleness check — exported for tests. */
export function isStale(
  status: string,
  updatedAt: Date,
  nowMs: number = Date.now()
): boolean {
  return ACTIVE_STATUSES.includes(status) && nowMs - updatedAt.getTime() > STALE_RUN_MS
}

/**
 * Marks stale queued/running analyses as failed. Scoped to one id when given,
 * otherwise sweeps the whole table (used by the list route). Returns the
 * number of runs reaped. The WHERE clause makes this a no-op on healthy runs,
 * so calling it on every read is cheap.
 */
export async function reapStaleAnalyses(id?: string): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_RUN_MS)
  const result = await prisma.durationAnalysis.updateMany({
    where: {
      ...(id ? { id } : {}),
      status: { in: ACTIVE_STATUSES },
      updatedAt: { lt: cutoff },
    },
    data: { status: 'failed', errorMessage: STALE_RUN_MESSAGE },
  })
  return result.count
}
