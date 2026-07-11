/**
 * engine/durationAnalysis/transitOverlay.ts
 *
 * buildTransitOverlay — pure function, uses Swiss Ephemeris via existing computeTransits().
 *
 * For each unique AD start date within the sliced period table, calls
 * computeTransits(natalMoonSignNumber, natalLagnaSignNumber, birthYear, adStartDate)
 * and extracts a compact transit snapshot for Saturn, Jupiter, and Rahu/Ketu.
 *
 * Also reads sadeSati.allPeriods from the stored UnifiedChart.transits JSONB
 * to determine Sade Sati phase without recomputing the full Sade Sati scan.
 *
 * Called synchronously after sliceDashaTree() — no LLM, no DB writes at this stage.
 */

import type { DashaSlice, TransitOverlay } from '@/lib/durationTypes'
import { computeTransits } from '@/engine/compute/transits'

// ─── Stored JSONB Shape ──────────────────────────────────────────────

interface StoredSadeSatiPeriod {
  phase: string
  startApprox: string   // "MMM YYYY" e.g. "Jan 2023"
  endApprox: string     // "MMM YYYY" e.g. "Dec 2025"
  isCurrent: boolean
}

interface StoredTransits {
  sadeSati?: {
    allPeriods?: StoredSadeSatiPeriod[]
  }
}

interface StoredAshtakavarga {
  bav?: Record<string, number[]>
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Parse an "MMM YYYY" string (e.g. "Jan 2023") into a Date.
 * Returns null if parsing fails or input is empty.
 */
function parseMonthYear(s: string): Date | null {
  if (!s) return null
  try {
    const d = new Date(s)
    if (isNaN(d.getTime())) return null
    return d
  } catch {
    return null
  }
}

/**
 * Determine the Sade Sati phase for a given date by scanning the stored
 * allPeriods array from UnifiedChart.transits JSONB.
 *
 * Returns { active: true, phase } if the date falls within a stored period,
 * or { active: false, phase: null } otherwise.
 *
 * Best-effort: any parsing failure defaults to inactive.
 */
function getSadeSatiPhaseFromStored(
  adDate: Date,
  storedTransits: unknown
): { sadeSatiActive: boolean; sadeSatiPhase: 'rising' | 'peak' | 'setting' | null } {
  try {
    const st = storedTransits as StoredTransits
    const periods = st?.sadeSati?.allPeriods
    if (!Array.isArray(periods) || periods.length === 0) {
      return { sadeSatiActive: false, sadeSatiPhase: null }
    }

    const adTime = adDate.getTime()

    for (const period of periods) {
      const start = parseMonthYear(period.startApprox)
      const end = parseMonthYear(period.endApprox)

      if (!start || !end) continue

      // endApprox is the start of the given month — extend to end of that month
      // so the period is inclusive through the last day of the end month.
      const endInclusive = new Date(end)
      endInclusive.setUTCMonth(endInclusive.getUTCMonth() + 1)

      if (adTime >= start.getTime() && adTime < endInclusive.getTime()) {
        const rawPhase = period.phase
        const phase: 'rising' | 'peak' | 'setting' | null =
          rawPhase === 'rising' || rawPhase === 'peak' || rawPhase === 'setting'
            ? rawPhase
            : null
        return { sadeSatiActive: true, sadeSatiPhase: phase }
      }
    }

    return { sadeSatiActive: false, sadeSatiPhase: null }
  } catch {
    // Best-effort: on any unexpected shape, default to inactive
    return { sadeSatiActive: false, sadeSatiPhase: null }
  }
}

/**
 * Look up a BAV bindhu score for a planet in a given sign.
 * Returns -1 if the ashtakavarga data is unavailable or malformed.
 */
function getBavScore(
  storedAshtakavarga: unknown,
  planetName: string,
  signNumber: number
): number {
  try {
    const av = storedAshtakavarga as StoredAshtakavarga
    const arr = av?.bav?.[planetName]
    if (!Array.isArray(arr)) return -1
    const idx = signNumber - 1
    if (idx < 0 || idx >= arr.length) return -1
    const score = arr[idx]
    return typeof score === 'number' ? score : -1
  } catch {
    return -1
  }
}

// ─── Main Export ─────────────────────────────────────────────────────

/**
 * Build a transit overlay for each unique AD start date in the period slice.
 *
 * Deduplicates AD start dates so computeTransits() is called at most once per
 * AD boundary (multiple PDs share the same AD).
 *
 * @param periodSlice      - Output of sliceDashaTree()
 * @param natalMoonSignNumber  - Natal Moon sign (1–12, Lahiri sidereal)
 * @param natalLagnaSignNumber - Natal Lagna sign (1–12, Lahiri sidereal)
 * @param birthYear        - Birth year (used by computeSadeSatiPeriods internally)
 * @param storedTransits   - UnifiedChart.transits JSONB — for Sade Sati allPeriods
 * @param storedAshtakavarga - UnifiedChart.ashtakavarga JSONB — for BAV scores
 * @returns TransitOverlay[] sorted by adStart ascending
 */
export function buildTransitOverlay(
  periodSlice: DashaSlice[],
  natalMoonSignNumber: number,
  natalLagnaSignNumber: number,
  birthYear: number,
  storedTransits: unknown,
  storedAshtakavarga: unknown
): TransitOverlay[] {
  // 1. Collect unique AD boundaries: { adStart (ISO string) → adLord }
  //    Multiple PDs share the same AD — deduplicate before computing.
  const adMap = new Map<string, string>() // adStart ISO → adLord

  for (const slice of periodSlice) {
    const adStart = slice.ad.start
    if (!adMap.has(adStart)) {
      adMap.set(adStart, slice.ad.lord)
    }
  }

  // 2. Compute transit overlay for each unique AD start date
  const results: TransitOverlay[] = []

  for (const [adStart, adLord] of adMap) {
    try {
      const adDate = new Date(adStart)
      const transitAnalysis = computeTransits(
        natalMoonSignNumber,
        natalLagnaSignNumber,
        birthYear,
        adDate
      )

      // 3. Extract the four key planets from the transits array
      const saturnT = transitAnalysis.transits.find(t => t.planet === 'Saturn')
      const jupiterT = transitAnalysis.transits.find(t => t.planet === 'Jupiter')
      const rahuT = transitAnalysis.transits.find(t => t.planet === 'Rahu')
      const ketuT = transitAnalysis.transits.find(t => t.planet === 'Ketu')

      if (!saturnT || !jupiterT || !rahuT || !ketuT) {
        console.warn(
          `[buildTransitOverlay] Missing planet data for AD start ${adStart} — skipping`
        )
        continue
      }

      // 4. Sade Sati phase from storedTransits JSONB (best-effort, no re-scan)
      const { sadeSatiActive, sadeSatiPhase } = getSadeSatiPhaseFromStored(
        adDate,
        storedTransits
      )

      // 5. ashtamaShani and kantakaShani come from the computeTransits() result
      const { ashtamaShani, kantakaShani } = transitAnalysis

      // 6. BAV scores from storedAshtakavarga JSONB
      const saturnBavScore = getBavScore(storedAshtakavarga, 'Saturn', saturnT.signNumber)
      const jupiterBavScore = getBavScore(storedAshtakavarga, 'Jupiter', jupiterT.signNumber)

      results.push({
        adStart,
        adLord,
        saturn: {
          sign: saturnT.sign,
          signNumber: saturnT.signNumber,
          houseFromLagna: saturnT.houseFromLagna,
          houseFromMoon: saturnT.houseFromMoon,
          retrograde: saturnT.retrograde,
        },
        jupiter: {
          sign: jupiterT.sign,
          signNumber: jupiterT.signNumber,
          houseFromLagna: jupiterT.houseFromLagna,
          houseFromMoon: jupiterT.houseFromMoon,
          retrograde: jupiterT.retrograde,
        },
        rahu: {
          sign: rahuT.sign,
          signNumber: rahuT.signNumber,
          houseFromLagna: rahuT.houseFromLagna,
        },
        ketu: {
          sign: ketuT.sign,
          signNumber: ketuT.signNumber,
          houseFromLagna: ketuT.houseFromLagna,
        },
        sadeSatiActive,
        sadeSatiPhase,
        ashtamaShani,
        kantakaShani,
        saturnBavScore,
        jupiterBavScore,
      })
    } catch (err) {
      // Per spec: log a warning and skip the failing AD entry rather than
      // failing the entire overlay computation.
      console.warn(
        `[buildTransitOverlay] computeTransits() failed for AD start ${adStart} (lord: ${adLord}):`,
        err instanceof Error ? err.message : err
      )
    }
  }

  // 7. Sort by adStart ascending
  results.sort((a, b) => a.adStart.localeCompare(b.adStart))

  return results
}
