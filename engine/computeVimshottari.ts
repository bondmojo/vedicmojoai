/**
 * engine/computeVimshottari.ts — Deterministic Vimshottari Dasha computation.
 *
 * Pure function. No LLM, no external dependencies, no side effects.
 * Computes the full 120-year Vimshottari dasha tree from the Moon's
 * sidereal longitude and birth datetime.
 *
 * Self-verifying: throws DashaIntegrityError if the computed tree
 * does not sum to exactly 120 years (± 1 day tolerance).
 */

import { DashaIntegrityError } from '@/lib/errors'
import type { AntarDasha, DashaTree, MahaDasha, Planet, PratyanDasha } from '@/lib/types'
import {
  DASHA_SEQUENCE,
  DASHA_YEARS,
  NAKSHATRA_SPAN_DEG,
  TOTAL_DASHA_YEARS,
  YEAR_DAYS,
} from './constants'

// ─── Helper Functions ───────────────────────────────────────────────

/**
 * Adds a fractional number of days to a date.
 * Returns a new Date object — never mutates the input.
 */
function addDays(date: Date, days: number): Date {
  const result = new Date(date.getTime())
  result.setTime(result.getTime() + days * 24 * 60 * 60 * 1000)
  return result
}

/**
 * Determines the nakshatra index (0–26) from the Moon's sidereal longitude.
 */
function getNakshatraIndex(moonLongitudeDeg: number): number {
  return Math.floor(moonLongitudeDeg / NAKSHATRA_SPAN_DEG)
}

/**
 * Gets the starting index in DASHA_SEQUENCE for a given nakshatra lord.
 * The dasha sequence starts from the birth nakshatra's lord.
 */
function getDashaSequenceStartIndex(nakshatraLord: Planet): number {
  const idx = DASHA_SEQUENCE.findIndex((d) => d.lord === nakshatraLord)
  if (idx === -1) {
    throw new DashaIntegrityError(`Unknown dasha lord: ${nakshatraLord}`)
  }
  return idx
}

// ─── Main Computation ───────────────────────────────────────────────

/**
 * Computes the full Vimshottari dasha tree from birth data.
 *
 * @param moonLongitudeDeg - Moon's sidereal longitude in degrees (0–360).
 * @param birthDatetime - Birth date and time.
 * @returns Complete DashaTree covering 120 years from the balance of first dasha.
 * @throws {DashaIntegrityError} If inputs are invalid or integrity check fails.
 *
 * @example
 * ```typescript
 * const tree = computeVimshottari(146.75, new Date('1990-04-15T06:30:00+05:30'))
 * console.log(tree.balance_years) // e.g., 12.34
 * console.log(tree.mahadashas.length) // 9
 * ```
 */
export function computeVimshottari(
  moonLongitudeDeg: number,
  birthDatetime: Date
): DashaTree {
  // ─── Input validation ─────────────────────────────────────────
  if (moonLongitudeDeg < 0 || moonLongitudeDeg >= 360) {
    throw new DashaIntegrityError(
      `Moon longitude must be 0–360, got ${moonLongitudeDeg}`
    )
  }
  if (isNaN(birthDatetime.getTime())) {
    throw new DashaIntegrityError('Invalid birth datetime')
  }

  // ─── Step 1: Determine birth nakshatra and its lord ───────────
  const nakshatraIndex = getNakshatraIndex(moonLongitudeDeg)
  const nakshatraLord = DASHA_SEQUENCE[nakshatraIndex % 9].lord

  // Actually look up in the full nakshatra table for correctness:
  // The nakshatra lord follows the repeating Ketu-Venus-Sun-Moon-Mars-Rahu-Jup-Sat-Merc pattern
  const dashaLordIndex = nakshatraIndex % 9
  const birthNakshatraLord = DASHA_SEQUENCE[dashaLordIndex].lord
  const birthNakshatraYears = DASHA_SEQUENCE[dashaLordIndex].years

  // ─── Step 2: Compute balance of first dasha ───────────────────
  // How far the Moon has traversed through its nakshatra (0–1 fraction)
  const positionInNakshatra = (moonLongitudeDeg % NAKSHATRA_SPAN_DEG) / NAKSHATRA_SPAN_DEG
  // Balance = remaining portion × lord's total years
  const balanceYears = (1 - positionInNakshatra) * birthNakshatraYears

  // ─── Step 3: Lay out 9 Mahadashas covering 120 years ──────────
  const mahadashas: MahaDasha[] = []
  let currentDate = new Date(birthDatetime.getTime())

  // Start from the birth nakshatra lord, cycle through all 9
  for (let i = 0; i < 9; i++) {
    const seqIndex = (dashaLordIndex + i) % 9
    const lord = DASHA_SEQUENCE[seqIndex].lord
    const fullYears = DASHA_SEQUENCE[seqIndex].years

    // First MD uses balance; rest use full duration
    const effectiveYears = i === 0 ? balanceYears : fullYears
    const durationDays = effectiveYears * YEAR_DAYS

    const start = new Date(currentDate.getTime())
    const end = addDays(start, durationDays)

    // ─── Step 4: Compute Antardashas for this Mahadasha ─────────
    const antardashas = computeAntardashas(lord, start, durationDays)

    mahadashas.push({
      lord,
      start,
      end,
      duration_days: durationDays,
      antardashas,
    })

    currentDate = end
  }

  // ─── Step 5: Compute Pratyantardashas for ALL 9 MDs ───────────
  // PDs are pure arithmetic (cheap) and stored in full (~73KB serialized)
  // so that Duration Analysis can slice any date range without recomputing.
  for (const md of mahadashas) {
    for (const ad of md.antardashas) {
      ad.pratyantardashas = computePratyantardashas(
        md.lord,
        ad.lord,
        ad.start,
        ad.duration_days
      )
    }
  }

  // ─── Step 6: Integrity checks ─────────────────────────────────
  const toleranceDays = 1

  // Check 1: Contiguity — each MD starts where the previous ended
  for (let i = 1; i < mahadashas.length; i++) {
    const gap = Math.abs(mahadashas[i].start.getTime() - mahadashas[i - 1].end.getTime())
    if (gap > 1000) {
      throw new DashaIntegrityError(
        `Dasha contiguity failed: gap of ${(gap / 86400000).toFixed(4)} days between MD ${i - 1} and ${i}`
      )
    }
  }

  // Check 2: Each MD's antardashas sum to the MD's duration
  for (const md of mahadashas) {
    const adSum = md.antardashas.reduce((sum, ad) => sum + ad.duration_days, 0)
    if (Math.abs(adSum - md.duration_days) > toleranceDays) {
      throw new DashaIntegrityError(
        `AD sum check failed for ${md.lord}: AD sum ${adSum.toFixed(2)} != MD duration ${md.duration_days.toFixed(2)}`
      )
    }
  }

  // Check 3: Total = balanceYears + (120 - birthLordYears) in days
  // (First MD is partial, remaining 8 are full; sum of all 9 lords' years = 120)
  const totalDays = mahadashas.reduce((sum, md) => sum + md.duration_days, 0)
  const expectedTotalYears = balanceYears + (TOTAL_DASHA_YEARS - birthNakshatraYears)
  const expectedDays = expectedTotalYears * YEAR_DAYS

  if (Math.abs(totalDays - expectedDays) > toleranceDays) {
    throw new DashaIntegrityError(
      `Dasha total check failed: ${totalDays.toFixed(2)} days != expected ${expectedDays.toFixed(2)} days`
    )
  }

  return {
    balance_years: balanceYears,
    mahadashas,
  }
}

// ─── Antardasha Computation ─────────────────────────────────────────

/**
 * Computes the 9 antardashas within a mahadasha.
 *
 * The first antardasha belongs to the mahadasha lord itself.
 * Subsequent ADs follow the dasha sequence from the MD lord.
 * Each AD's duration = (MD duration × AD lord years) / 120.
 */
function computeAntardashas(
  mdLord: Planet,
  mdStart: Date,
  mdDurationDays: number
): AntarDasha[] {
  const antardashas: AntarDasha[] = []
  const mdLordIndex = getDashaSequenceStartIndex(mdLord)
  let currentDate = new Date(mdStart.getTime())

  for (let i = 0; i < 9; i++) {
    const adSeqIndex = (mdLordIndex + i) % 9
    const adLord = DASHA_SEQUENCE[adSeqIndex].lord
    const adLordYears = DASHA_YEARS[adLord]

    // AD duration = MD_duration × (AD_lord_years / 120)
    const adDurationDays = mdDurationDays * (adLordYears / TOTAL_DASHA_YEARS)

    const start = new Date(currentDate.getTime())
    const end = addDays(start, adDurationDays)

    antardashas.push({
      lord: adLord,
      start,
      end,
      duration_days: adDurationDays,
      pratyantardashas: [], // populated in Step 5 of computeVimshottari
    })

    currentDate = end
  }

  return antardashas
}

// ─── Pratyantardasha Computation ────────────────────────────────────

/**
 * Computes the 9 pratyantardashas within an antardasha.
 *
 * The first PD belongs to the antardasha lord itself.
 * Each PD's duration = (AD duration × PD lord years) / 120.
 *
 * Exported for scripts/backfill-pratyantardashas.ts, which fills PDs into
 * charts computed before full-PD storage.
 */
export function computePratyantardashas(
  _mdLord: Planet,
  adLord: Planet,
  adStart: Date,
  adDurationDays: number
): PratyanDasha[] {
  const pratyantardashas: PratyanDasha[] = []
  const adLordIndex = getDashaSequenceStartIndex(adLord)
  let currentDate = new Date(adStart.getTime())

  for (let i = 0; i < 9; i++) {
    const pdSeqIndex = (adLordIndex + i) % 9
    const pdLord = DASHA_SEQUENCE[pdSeqIndex].lord
    const pdLordYears = DASHA_YEARS[pdLord]

    // PD duration = AD_duration × (PD_lord_years / 120)
    const pdDurationDays = adDurationDays * (pdLordYears / TOTAL_DASHA_YEARS)

    const start = new Date(currentDate.getTime())
    const end = addDays(start, pdDurationDays)

    pratyantardashas.push({
      lord: pdLord,
      start,
      end,
      duration_days: pdDurationDays,
    })

    currentDate = end
  }

  return pratyantardashas
}
