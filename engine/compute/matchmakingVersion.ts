/**
 * engine/compute/matchmakingVersion.ts — Version stamps for Marriage Matchmaking results.
 *
 * Kept apart from matchmaking.ts, and importing only the dependency-free
 * tables module, so a route that only reads a saved match (GET
 * /api/matchmaking/[id]) does not load the Swiss Ephemeris native addon that
 * matchmaking.ts pulls in through relationships.ts → planets.ts.
 *
 * Spec: .kiro/specs/matchmaking-result-versioning/
 */

import type { MatchVersionInfo } from './types'
import { MATCHMAKING_TABLES_VERSION } from './matchmakingTables'

/**
 * Versions this engine's LOGIC, the way `MATCHMAKING_TABLES_VERSION` versions
 * the static tables in `matchmakingTables.ts`. `computeMatch` stamps it onto
 * every `MatchResult` as `engineVersion`; it is persisted inside the
 * `CompatibilityMatch.result` JSONB (there is no column for it).
 *
 * Bump it when a change outside `matchmakingTables.ts` can change a score,
 * status, verdict, cancellation, boundary-risk flag, or Mangal Dosha status
 * for the same stored chart data:
 *   - the longitude → (nakshatra, pada, rashi) derivation, INCLUDING the
 *     `nakshatras.ts` helpers `longitudeToNakshatraPadaRashi` calls;
 *   - a koota scorer, a cancellation detector, `deriveVerdict`, boundary-risk
 *     arithmetic or its threshold;
 *   - Mangal Dosha rules, or how `computeMatch` composes the result.
 * A table change bumps `MATCHMAKING_TABLES_VERSION` instead; a change that
 * does both bumps both. Rewording evidence notes or `limitations` alone
 * needs neither.
 *
 * History:
 *   - (absent) — results saved before this stamp existed. They predate the
 *     nakshatra-boundary fix: a Moon stored exactly at 30, 60, 80, 90, 150,
 *     180, 200, 210, 270, 300, 320 or 330.0000° was scored in the
 *     neighbouring rashi (e.g. 80° as Punarvasu pada 4, Cancer), and a Moon
 *     stored exactly 1° from a nakshatra boundary (39, 79, 119, 159, 199,
 *     239, 279, 319 or 359.0000°) was not flagged at boundary risk.
 *   - `v1-pada-boundary-fix` — `getNakshatraIndex`/`getPada` locate a
 *     longitude exactly on a pada boundary in the pada that starts there
 *     (80° is Punarvasu pada 1, Gemini), and `computeBoundaryRisk` measures
 *     the distance from the located nakshatra's exact edges
 *     (`distanceToNakshatraBoundary`), so 1° from a boundary is at risk.
 */
export const MATCHMAKING_ENGINE_VERSION = 'matchmaking-engine-v1-pada-boundary-fix'

function readVersionStamp(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

/**
 * Reads the version stamps off a persisted or freshly computed match and
 * says whether the running build would stamp the same ones.
 *
 * Built for persisted JSON, so it accepts anything: a missing, non-string,
 * or empty stamp reads as `null` — which is what every `CompatibilityMatch`
 * saved before `MATCHMAKING_ENGINE_VERSION` existed returns for
 * `engineVersion`. `stale` is true when either stamp is `null` or differs
 * from the current constant; it means a fresh computation of the same pair
 * MIGHT differ, not that the saved score is wrong. Pure; never throws.
 */
export function describeMatchVersion(
  stamps: { tablesVersion?: unknown; engineVersion?: unknown } | null | undefined
): MatchVersionInfo {
  const tablesVersion = readVersionStamp(stamps?.tablesVersion)
  const engineVersion = readVersionStamp(stamps?.engineVersion)
  const stale = tablesVersion !== MATCHMAKING_TABLES_VERSION || engineVersion !== MATCHMAKING_ENGINE_VERSION
  return { tablesVersion, engineVersion, stale }
}
