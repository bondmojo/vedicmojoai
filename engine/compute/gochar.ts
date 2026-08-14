/**
 * engine/compute/gochar.ts — Deterministic date-ranged Gochar (transit)
 * occupancy intervals.
 *
 * Engine-only inputs and helpers live here because this module imports the
 * Swiss-Ephemeris-bearing runtime. The Gochar response contracts themselves
 * live in `lib/gocharRange.ts`, a client-safe leaf, so UI code never needs to
 * reach this native import chain merely to describe API data.
 *
 * Spec: .kiro/specs/gochar-feature/
 */

import swisseph from 'swisseph-v2'
import path from 'path'
import { getSignName, birthInputToJulianDay, computeAscendant, computePlanetPositions } from './planets'
import type { BirthInput } from './types'
import { GocharValidationError } from '@/lib/errors'
import type {
  GocharGraha,
  GocharOccupancyInterval,
  GocharRangeResult,
} from '@/lib/gocharRange'

export type {
  GocharGraha,
  GocharOccupancyInterval,
  GocharRangeResult,
} from '@/lib/gocharRange'

/**
 * Re-exported so this module's public surface is unchanged. The class itself is
 * defined in `lib/errors.ts` — a zero-import leaf — because `lib/gocharRange.ts`
 * (the pure date parser) also throws it and must not transitively import the
 * native `swisseph-v2` binary this module pulls in. See the class's own doc
 * comment in `lib/errors.ts` for the full rationale.
 */
export { GocharValidationError }

// ─── Public contracts ──────────────────────────────────────────────────

export interface GocharRangeInput {
  natalMoonSignNumber: number
  natalLagnaSignNumber: number
  start: Date                 // inclusive UTC instant
  end: Date                   // exclusive UTC instant
  includeMoon: boolean
}

/**
 * Minimal natal context required by `computeGocharRange()` — just the two
 * sign numbers, never a full `ComputedChart`. See
 * `resolveNatalGocharContext()` (Task 4), which builds this from
 * `BirthInput` without calling `computeFullChart()`.
 */
export interface NatalGocharContext {
  natalMoonSignNumber: number   // 1..12
  natalLagnaSignNumber: number  // 1..12
}

// ─── Minimal natal-context helper ──────────────────────────────────────────

/**
 * Resolves the two natal sign numbers required by `computeGocharRange()` from
 * a `BirthInput`, using only the minimal ephemeris path:
 *   `birthInputToJulianDay()` → `computeAscendant()` → `computePlanetPositions()`
 *
 * This deliberately does NOT call `computeFullChart()`, which additionally
 * computes 13 divisional charts, shadbala, ashtakavarga, yogas, jaimini,
 * bhava bala, arudhas, upagrahas, special lagnas, and the Sade Sati scans —
 * disproportionate cost for two sign numbers. The sign numbers produced here
 * are bit-for-bit identical to those `computeFullChart()` would produce, as
 * verified by `gochar.natalContext.test.ts`.
 *
 * Design: API Design — "Minimal natal context (do not call computeFullChart())"
 * Requirements: R1.6, R5.3
 */
export function resolveNatalGocharContext(input: BirthInput): NatalGocharContext {
  const jd = birthInputToJulianDay(input)
  const asc = computeAscendant(jd, input.latitude, input.longitude)
  const moon = computePlanetPositions(jd, asc.signNumber).find((p) => p.planet === 'Moon')
  if (!moon) throw new Error('Moon position could not be computed')
  return {
    natalMoonSignNumber: moon.signNumber,
    natalLagnaSignNumber: asc.signNumber,
  }
}

// ─── Graha selection ───────────────────────────────────────────────────

/**
 * Default Gochar grahas (8) — the Moon is excluded. This is the stable
 * output order used for sorting `GocharOccupancyInterval[]` (see Task 3).
 */
export const DEFAULT_GOCHAR_GRAHAS = [
  'Sun', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu',
] as const

/**
 * All Gochar grahas (9) — used when `includeMoon: true`. Same stable order
 * as `DEFAULT_GOCHAR_GRAHAS` with `'Moon'` inserted after `'Sun'`.
 */
export const ALL_GOCHAR_GRAHAS = [
  'Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu',
] as const

// ─── Ephemeris body-id boundary ────────────────────────────────────────

/**
 * The single place where a loose engine planet name (as used elsewhere in
 * the engine, e.g. `PlanetPosition.planet: string`) becomes the stricter
 * `GocharGraha` union.
 *
 * Mirrors `PLANET_IDS` in `engine/compute/transits.ts`. Callers (the range
 * scanner, Task 3) MUST iterate this constant rather than reading
 * `PLANET_IDS` and casting — that keeps `GocharGraha` from silently
 * inheriting a new body if one is ever added to `transits.ts`, since
 * `GocharGraha` is part of the public API/MCP contract and any widening of
 * it should be a deliberate change here, not an accidental side effect of
 * a `transits.ts` edit.
 *
 * Ketu is deliberately absent: it is always derived as Rahu + 180° and
 * shares Rahu's boundary instants, so it is never scanned/listed
 * separately.
 */
export const GOCHAR_BODY_IDS: ReadonlyArray<{ graha: GocharGraha; id: number }> = [
  { graha: 'Sun',     id: 0  },
  { graha: 'Moon',    id: 1  },
  { graha: 'Mercury', id: 2  },
  { graha: 'Venus',   id: 3  },
  { graha: 'Mars',    id: 4  },
  { graha: 'Jupiter', id: 5  },
  { graha: 'Saturn',  id: 6  },
  { graha: 'Rahu',    id: 11 },
]

// ─── Ephemeris setup ────────────────────────────────────────────────────

/**
 * Guarded ephemeris path setup, replicated from `transits.ts`'s private
 * `ensureEph()` rather than imported from it. `transits.ts` does not export
 * it, and per this module's own header comment (it owns its public surface
 * independently of `transits.ts`), replicating this small guarded helper
 * keeps the module self-contained — the same choice
 * `transits.degreeSadeSati.test.ts` already makes for its own independent
 * ephemeris access.
 */
let ephePathSet = false
function ensureEph(): void {
  if (ephePathSet) return
  try {
    const pkg = require.resolve('swisseph-v2/package.json')
    swisseph.swe_set_ephe_path(path.join(path.dirname(pkg), 'ephe'))
  } catch { /* fallback to swisseph's built-in Moshier ephemeris */ }
  ephePathSet = true
}

/** Normalizes a longitude in degrees to [0, 360). */
function normLong(lon: number): number {
  return ((lon % 360) + 360) % 360
}

/** Converts a JS `Date` (UTC) to a Julian Day (UT), matching `transits.ts`'s `toJD()`. */
function toJD(date: Date): number {
  ensureEph()
  return swisseph.swe_julday(
    date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(),
    date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600,
    swisseph.SE_GREG_CAL
  )
}

/**
 * Converts a Julian Day (UT) back to a JS `Date`, preserving **milliseconds**.
 *
 * Deliberately NOT a copy of `transits.ts`'s `jdToDate()`, which does
 * `sec = Math.round((minFloat - min) * 60)` and so truncates every instant to a
 * whole second. That is harmless for Sade Sati (whose boundaries are reported as
 * calendar dates) but wrong here: `computeGocharRange()` emits bisection-refined
 * ingress instants, and second-rounding would move an interval boundary by up to
 * 500 ms — enough to push the first interval *outside* the requested range
 * (violating R1.7's clipping guarantee) and leave the last one short of
 * `rangeEnd` (violating R2.9's coverage guarantee).
 *
 * Milliseconds are comfortably representable: near JD 2460000 one millisecond is
 * ~1.2e-8 days, while float64 gives ~2e-10 days of absolute resolution there —
 * roughly two orders of magnitude of headroom.
 *
 * The seconds/milliseconds split is computed explicitly (rather than letting a
 * single `Math.round` produce 1000 ms and relying on `Date.UTC` to roll it over)
 * so the carry is visible in the code rather than an implicit side effect.
 *
 * Guarded by `gochar.range.test.ts` — "millisecond-precision bounds".
 */
function jdToDate(jd: number): Date {
  const r = swisseph.swe_revjul(jd, swisseph.SE_GREG_CAL) as any
  const hourFloat = r.hour ?? 0
  const hour = Math.floor(hourFloat)
  const minFloat = (hourFloat - hour) * 60
  const min = Math.floor(minFloat)
  const secFloat = (minFloat - min) * 60
  let sec = Math.floor(secFloat)
  let ms = Math.round((secFloat - sec) * 1000)
  // Explicit carry: rounding 999.6 ms up yields 1000, which belongs to the next
  // second. `Date.UTC` would normalize this anyway; doing it here keeps the
  // intent legible and the arguments in their documented ranges.
  if (ms >= 1000) {
    ms -= 1000
    sec += 1
  }
  return new Date(Date.UTC(r.year, r.month - 1, r.day, hour, min, sec, ms))
}

/** One ephemeris sample: normalized sidereal longitude plus its instantaneous speed. */
export interface GocharLongitudeSample {
  longitude: number       // normalized [0, 360)
  longitudeSpeed: number  // degrees/day, from the same swe_calc_ut call
}

/**
 * Reads a body's Lahiri sidereal longitude AND its instantaneous
 * `longitudeSpeed` from the same `swe_calc_ut` call.
 *
 * This performs the same three-step setup every `transits.ts` entry point
 * performs (`ensureEph()` → `swe_set_sid_mode(SE_SIDM_LAHIRI, ...)` →
 * `SEFLG_SWIEPH | SEFLG_SIDEREAL | SEFLG_SPEED`), so the module cannot
 * silently read tropical longitudes (wrong by ~24° undetected by any
 * structural test) or a zero `longitudeSpeed` (which would defeat
 * `stepIsSafe()` below and disable the adaptive refinement without a
 * failing test). See `gochar.sidereal.test.ts`.
 *
 * `longitudeSpeed` is never discarded — it is required by `stepIsSafe()`
 * (Task 2.3) to detect a station near a cusp.
 */
export function getSiderealLongitude(jd: number, bodyId: number): GocharLongitudeSample {
  ensureEph()
  swisseph.swe_set_sid_mode(swisseph.SE_SIDM_LAHIRI, 0, 0)
  const flags = swisseph.SEFLG_SWIEPH | swisseph.SEFLG_SIDEREAL | swisseph.SEFLG_SPEED
  const r = swisseph.swe_calc_ut(jd, bodyId, flags) as any
  return {
    longitude: normLong(r.longitude ?? 0),
    longitudeSpeed: r.longitudeSpeed ?? 0,
  }
}

// ─── Cusp-proximity refinement ──────────────────────────────────────────

/**
 * Distance in degrees from `lon` to the nearest 30° sign cusp, in `[0, 15]`.
 *
 * Design: Compute Engine — "Cusp-proximity refinement (required for
 * correctness)".
 */
export function degreesToNearestCusp(lon: number): number {
  const within = ((lon % 30) + 30) % 30
  return Math.min(within, 30 - within)
}

/** 1-hour floor — the smallest step the adaptive scanner will subdivide down to. */
export const MIN_STEP_DAYS = 1 / 24

/** Safety margin over the theoretical excursion a station could make within one step. */
export const CUSP_SAFETY_FACTOR = 2

/**
 * Returns `false` when a cross-and-return around the nearest 30° cusp could
 * complete within `stepDays` at the body's current instantaneous speed —
 * i.e. when the coarse step is not safe to trust as "no state change" and
 * must be subdivided.
 *
 * `speedDegPerDay` MUST be the body's instantaneous `longitudeSpeed` from
 * the same `swe_calc_ut` call that produced `lon` (see
 * `getSiderealLongitude()`), never a hardcoded mean motion — a station is
 * detected from the ephemeris itself, not assumed.
 *
 * Design: Compute Engine — "Cusp-proximity refinement (required for
 * correctness)".
 */
export function stepIsSafe(lon: number, speedDegPerDay: number, stepDays: number): boolean {
  const reach = Math.abs(speedDegPerDay) * stepDays * CUSP_SAFETY_FACTOR
  return degreesToNearestCusp(lon) > reach
}

// ─── End-bounded, adaptive-step state-change scanner ────────────────────

/** A single ephemeris sample used by the adaptive scanner: state + lon/speed. */
interface GocharStateSample<S> {
  state: S
  longitude: number
  longitudeSpeed: number
}

/**
 * TEST-ONLY hook. When set, `stepIsSafe()` calls are routed through this
 * function instead of the real `stepIsSafe()` above, so tests can construct
 * a deliberately naive fixed-step baseline (always "safe", i.e. never
 * subdivides) to differentially compare against the real adaptive scanner
 * over the identical window. Mirrors the "TEST-ONLY" convention
 * `transits.ts` uses for `computeDegreeSadeSatiWithTestHorizon`.
 *
 * Not part of the module's public API contract from design.md — it exists
 * solely to make `scanGocharStateChange()`'s internal safety check
 * observable/overridable from `gochar.cuspProximity.test.ts` without
 * exposing `stepIsSafe` injection on every call site.
 */
let stepIsSafeOverride: ((lon: number, speedDegPerDay: number, stepDays: number) => boolean) | null = null

/** TEST-ONLY. Installs (or clears, via `null`) the `stepIsSafe()` override described above. */
export function __setStepIsSafeOverrideForTests(
  fn: ((lon: number, speedDegPerDay: number, stepDays: number) => boolean) | null
): void {
  stepIsSafeOverride = fn
}

function effectiveStepIsSafe(lon: number, speedDegPerDay: number, stepDays: number): boolean {
  return stepIsSafeOverride ? stepIsSafeOverride(lon, speedDegPerDay, stepDays) : stepIsSafe(lon, speedDegPerDay, stepDays)
}

/**
 * TEST-ONLY counter, incremented once per `stateAt()`-equivalent ephemeris
 * sample taken by `scanGocharStateChange()`. Used by the cost-guard test to
 * compare sample counts between the adaptive scanner and a naive baseline
 * over a calm (no near-cusp station) window.
 */
let sampleCounter = 0

/** TEST-ONLY. Resets the sample counter described above to zero. */
export function __resetGocharSampleCounterForTests(): void {
  sampleCounter = 0
}

/** TEST-ONLY. Reads the current value of the sample counter described above. */
export function __getGocharSampleCounterForTests(): number {
  return sampleCounter
}

/**
 * End-bounded, adaptive-step state-change scanner.
 *
 * Distinct from `transits.ts`'s `nextStateChange()`: that helper scans
 * forward unbounded (guarded only at 5000 iterations) and can return a JD
 * past a caller-supplied end, so it is not reusable as-is for a range that
 * must never search past `end` (Requirement 2.9's coverage guarantee, and
 * Task 2.4's requirement that the scanner return `end` when no state change
 * exists within the requested range).
 *
 * This scanner also folds in the cusp-proximity safety check (`stepIsSafe`,
 * Task 2.3): before accepting "no state change" at a coarse step, it checks
 * whether a cross-and-return around the nearest 30° cusp could have
 * completed within that step at the sampled instantaneous speed. If so, it
 * halves the step (down to `MIN_STEP_DAYS`) and retries with a smaller
 * candidate, rather than silently skipping over a same-step round trip the
 * way a plain "advance and compare" scan would.
 *
 * @param startJd        Instant to scan from (inclusive).
 * @param endJd           Upper bound; the scanner SHALL NOT search past this.
 * @param coarseStepDays  Base per-body coarse step (Task 2.4's table).
 * @param sampleAt        Reads the body's state (e.g. sign number) plus its
 *                         longitude/speed at a JD — one ephemeris call.
 * @returns The bisection-refined JD of the next state change, or `endJd` if
 *          no state change is found anywhere in `[startJd, endJd)`.
 */
export function scanGocharStateChange<S>(
  startJd: number,
  endJd: number,
  coarseStepDays: number,
  sampleAt: (jd: number) => GocharStateSample<S>
): number {
  const sample = (jd: number): GocharStateSample<S> => {
    sampleCounter++
    return sampleAt(jd)
  }

  const startSample = sample(startJd)
  const startState = startSample.state

  let lo = startJd
  let loSample = startSample

  // Effective step for the current attempt; shrinks near a cusp, resets to
  // the base coarse step once safely past one.
  let step = coarseStepDays

  while (lo < endJd) {
    let hi = Math.min(lo + step, endJd)
    const clampedToEnd = hi >= endJd
    if (clampedToEnd) hi = endJd

    const hiSample = sample(hi)

    if (hiSample.state !== startState) {
      // Bracketed — refine with the unmodified 42-iteration bisection
      // convention `nextStateChange()` uses.
      let bisectLo = lo
      let bisectHi = hi
      for (let i = 0; i < 42; i++) {
        const mid = (bisectLo + bisectHi) / 2
        if (sample(mid).state === startState) bisectLo = mid
        else bisectHi = mid
      }
      return bisectHi
    }

    if (clampedToEnd) {
      // No state change anywhere in [startJd, endJd).
      return endJd
    }

    // No change seen at this step's endpoints — but is that trustworthy?
    // Check safety using the sample at `lo` (the point being tested for
    // safety), per design.md's convention.
    if (!effectiveStepIsSafe(loSample.longitude, loSample.longitudeSpeed, step)) {
      if (step <= MIN_STEP_DAYS) {
        // Subdivision reached the floor and is still "unsafe" — per
        // design.md's Error Handling table, accept the floor and continue
        // rather than throwing. A sub-hour round trip is below the
        // feature's stated resolution.
        lo = hi
        loSample = hiSample
        step = coarseStepDays
        continue
      }
      step = Math.max(step / 2, MIN_STEP_DAYS)
      continue
    }

    // Safe to advance by the full step.
    lo = hi
    loSample = hiSample
    step = coarseStepDays
  }

  return endJd
}

// ─── Public entry point ────────────────────────────────────────────────────

/**
 * Base coarse scan steps, in days, per body group.
 * Moon matches the existing lunar transit scan; slow planets use 5 days for
 * efficiency while remaining safely below a full sign traversal.
 */
const COARSE_STEPS: Record<string, number> = {
  Moon:    0.25,
  Sun:     1,
  Mars:    1,
  Mercury: 1,
  Venus:   1,
  Jupiter: 5,
  Saturn:  5,
  Rahu:    5,
}

/**
 * Computes date-ranged Gochar occupancy intervals for all selected grahas.
 *
 * Each contiguous stay in a sign — including sub-day retrograde stays — is
 * returned as a separate `GocharOccupancyInterval`. No merging or minimum-
 * duration filter is applied. All times are UTC ISO-8601 strings ending in
 * `'Z'`.
 *
 * **Outer bounds are exact.** Each graha's first interval starts at exactly
 * `start.toISOString()` and its last ends at exactly `end.toISOString()` — the
 * caller's own instants, not a Julian-Day round-trip of them. Interior
 * boundaries are the bisection-refined ingress instants, carried to millisecond
 * precision. See `emitIntervals()` below and `jdToDate()` above.
 *
 * **Ketu is never scanned.** Its intervals are derived exactly from Rahu by
 * adding 6 to the sign number (mod 12), copying Rahu's boundary instants.
 *
 * Design: Compute Engine — "Range scan algorithm".
 * Requirements: R1.1, R1.2, R1.3, R1.4, R1.6, R1.7, R2.5, R2.6, R2.9, R8.1.
 */
export function computeGocharRange(input: GocharRangeInput): GocharRangeResult {
  const { natalMoonSignNumber, natalLagnaSignNumber, start, end, includeMoon } = input

  // ── Validation ──────────────────────────────────────────────────────────
  if (
    !Number.isFinite(natalMoonSignNumber) ||
    !Number.isInteger(natalMoonSignNumber) ||
    natalMoonSignNumber < 1 || natalMoonSignNumber > 12
  ) {
    throw new GocharValidationError(
      `natalMoonSignNumber must be an integer in 1..12, got ${natalMoonSignNumber}`
    )
  }
  if (
    !Number.isFinite(natalLagnaSignNumber) ||
    !Number.isInteger(natalLagnaSignNumber) ||
    natalLagnaSignNumber < 1 || natalLagnaSignNumber > 12
  ) {
    throw new GocharValidationError(
      `natalLagnaSignNumber must be an integer in 1..12, got ${natalLagnaSignNumber}`
    )
  }
  if (!(start instanceof Date) || !Number.isFinite(start.getTime())) {
    throw new GocharValidationError('start must be a finite Date')
  }
  if (!(end instanceof Date) || !Number.isFinite(end.getTime())) {
    throw new GocharValidationError('end must be a finite Date')
  }
  if (start.getTime() >= end.getTime()) {
    throw new GocharValidationError('start must be before end')
  }

  // ── Graha selection ────────────────────────────────────────────────────
  const selectedGrahas = (includeMoon ? ALL_GOCHAR_GRAHAS : DEFAULT_GOCHAR_GRAHAS) as readonly GocharGraha[]

  // ── Julian day bounds ──────────────────────────────────────────────────
  const startJd = toJD(start)
  const endJd   = toJD(end)

  // ── House formula (whole-sign, identical to transits.ts) ───────────────
  const houseFrom = (signNumber: number, natalSign: number): number =>
    ((signNumber - natalSign + 12) % 12) + 1

  // ── Exact outer bounds ─────────────────────────────────────────────────
  // The caller's own instants, serialized once. The first emitted interval's
  // `start` and the last one's `end` are these strings VERBATIM — never a JD
  // round-trip of them. `toJD()`/`jdToDate()` is a float conversion, so
  // round-tripping the outer bounds could shift them by a sub-millisecond
  // epsilon and (before this was fixed) by up to 500 ms. Clamping guarantees
  // R1.7's "clipped, never backtracked" and R2.9's complete coverage exactly,
  // independent of any float behaviour in the conversion.
  const startIso = start.toISOString()
  const endIso   = end.toISOString()

  // ── Per-graha intervals, keyed by graha index in selectedGrahas ─────────
  // We collect into a flat array then sort at the end.
  const intervals: GocharOccupancyInterval[] = []

  /**
   * Turns one graha's JD segments into emitted `GocharOccupancyInterval`s.
   *
   * Boundaries are materialized as a single shared array of ISO strings, so
   * consecutive intervals literally read the same string on both sides — that
   * is what makes interior contiguity (`intervals[i].end === intervals[i+1].start`)
   * exact rather than incidentally equal. Index 0 and index n are the clamped
   * caller bounds; every interior index is the bisection-refined ingress.
   *
   * A segment whose two boundaries serialize to the SAME millisecond is dropped.
   * A half-open `[t, t)` interval is the empty set: it represents no elapsed
   * time, carries no information, and would break both the `start < end` and the
   * strict-chronological-ordering contracts.
   *
   * **This branch is reachable and load-bearing, not defence-in-depth.** It
   * fires whenever the caller's `start` lands within a millisecond of a real
   * ingress — which happens systematically when a caller chains ranges using a
   * boundary instant read out of a previous Gochar response (e.g. `[A, B)` then
   * `[B, C)`). Measured over a year of nine-graha data, aligning `start` to a
   * harvested ingress produced a degenerate leading segment on every one of 211
   * boundaries tested. Without this guard each of those emits an interval with
   * `start === end`. Covered by `gochar.range.test.ts` — "no degenerate
   * intervals".
   *
   * Dropping an empty segment is NOT a minimum-duration filter and merges
   * nothing — every interval with any positive duration is preserved, including
   * the sub-day retrograde slivers R2.8 requires. Contiguity survives because
   * the dropped segment's neighbours share the identical boundary string, and
   * the clamped outer bounds survive because index 0 / index n are still the
   * strings emitted at the surviving ends.
   */
  const emitIntervals = (
    planet: GocharGraha,
    segments: ReadonlyArray<{ jdStart: number; jdEnd: number; signNumber: number }>,
    signOf: (segmentSignNumber: number) => number
  ): void => {
    if (segments.length === 0) return

    const bounds: string[] = new Array(segments.length + 1)
    bounds[0] = startIso
    for (let i = 1; i < segments.length; i++) {
      bounds[i] = jdToDate(segments[i].jdStart).toISOString()
    }
    bounds[segments.length] = endIso

    for (let i = 0; i < segments.length; i++) {
      if (bounds[i] === bounds[i + 1]) continue // degenerate: zero elapsed time
      const signNumber = signOf(segments[i].signNumber)
      intervals.push({
        planet,
        sign: getSignName(signNumber),
        signNumber,
        houseFromMoon:  houseFrom(signNumber, natalMoonSignNumber),
        houseFromLagna: houseFrom(signNumber, natalLagnaSignNumber),
        start: bounds[i],
        end:   bounds[i + 1],
      })
    }
  }

  // Scan Rahu first so Ketu can derive from its intervals.
  // Physical bodies: every graha in GOCHAR_BODY_IDS (Ketu is absent — derived).
  // We iterate GOCHAR_BODY_IDS for the ephemeris bodies; for Ketu we derive
  // from the Rahu intervals afterward.

  const rahuIntervals: Array<{ jdStart: number; jdEnd: number; signNumber: number }> = []

  for (const { graha, id } of GOCHAR_BODY_IDS) {
    // Skip Moon when not requested.
    if (graha === 'Moon' && !includeMoon) continue

    const coarseStep = COARSE_STEPS[graha] ?? 1

    const sampleAt = (jd: number) => {
      const s = getSiderealLongitude(jd, id)
      const signNum = Math.floor(s.longitude / 30) + 1
      return { state: signNum, longitude: s.longitude, longitudeSpeed: s.longitudeSpeed }
    }

    // Seed with the sign at `start` (clip — never backtrack).
    let currentJd = startJd
    let currentSign = sampleAt(currentJd).state

    const grahaIntervals: Array<{ jdStart: number; jdEnd: number; signNumber: number }> = []

    while (currentJd < endJd) {
      const nextJd = scanGocharStateChange(currentJd, endJd, coarseStep, sampleAt)
      grahaIntervals.push({ jdStart: currentJd, jdEnd: nextJd, signNumber: currentSign })

      if (nextJd >= endJd) break

      // Move past the boundary and read the new sign.
      currentJd = nextJd
      currentSign = sampleAt(currentJd).state
    }

    if (graha === 'Rahu') {
      rahuIntervals.push(...grahaIntervals)
    }

    // Emit intervals for this graha (Ketu is not in GOCHAR_BODY_IDS — it is
    // derived from Rahu below).
    emitIntervals(graha, grahaIntervals, (s) => s)
  }

  // ── Ketu derivation (if Ketu is in selectedGrahas) ─────────────────────
  if (selectedGrahas.includes('Ketu')) {
    // Ketu sign = (rahuSign - 1 + 6) % 12 + 1  (i.e. opposite sign = +6 signs).
    // Ketu shares Rahu's boundary instants exactly, so it reuses Rahu's
    // segments — including the same clamped outer bounds.
    emitIntervals('Ketu', rahuIntervals, (s) => ((s - 1 + 6) % 12) + 1)
  }

  // ── Stable sort: graha order then start instant ─────────────────────────
  // `selectedGrahas` is the authoritative order (DEFAULT or ALL).
  const grahaIndex = new Map<GocharGraha, number>()
  selectedGrahas.forEach((g, i) => grahaIndex.set(g, i))

  intervals.sort((a, b) => {
    const gi = (grahaIndex.get(a.planet) ?? 99) - (grahaIndex.get(b.planet) ?? 99)
    if (gi !== 0) return gi
    return a.start < b.start ? -1 : a.start > b.start ? 1 : 0
  })

  return {
    rangeStart: start.toISOString(),
    rangeEnd:   end.toISOString(),
    includedGrahas: selectedGrahas as GocharGraha[],
    moonIncluded: includeMoon,
    intervals,
  }
}
