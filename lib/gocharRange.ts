/**
 * lib/gocharRange.ts — Date-bound parsing and span policy for the Gochar
 * feature's `POST /api/gochar` route and its UI consumers.
 *
 * Rules:
 *   • A bare `YYYY-MM-DD` dateFrom  → that UTC midnight (inclusive start)
 *   • A bare `YYYY-MM-DD` dateTo    → the *following* UTC midnight (exclusive end)
 *   • A full ISO-8601 instant MUST carry `Z`; used verbatim
 *   • Mixed bare/full across the two fields is fully supported
 *   • No timezone offset is ever applied
 *
 * ── Import constraint (do not relax) ──────────────────────────────────────
 *
 * This module is a PURE string/date parser with no astronomical logic, and it
 * MUST stay free of the Swiss-Ephemeris import chain. It therefore imports
 * `GocharValidationError` from `@/lib/errors` (a zero-import leaf) and MUST NOT
 * import from `@/engine/compute/gochar`, which pulls in the native
 * `swisseph-v2` binary.
 *
 * This is the same reasoning that keeps the Gochar types out of
 * `engine/compute/types.ts` (spec Task 1.1), but it bites harder here: the
 * client-side `useGocharRange` hook (Task 8.2) and the Transits-tab
 * `includeMoon` label (Task 9.1, which must state BOTH span tiers) read
 * `MAX_SPAN_WITH_MOON_MS` / `MAX_SPAN_WITHOUT_MOON_MS` from this file. A
 * transitive native dependency would fail the client bundle.
 *
 * Enforced by `lib/gocharRange.test.ts` — "import hygiene".
 *
 * Spec: .kiro/specs/gochar-feature/ — Task 5
 * Requirements: R2.1, R2.2, R2.3, R2.4, R2.10, R2.11, R8.1
 */

import { GocharValidationError } from '@/lib/errors'

export { GocharValidationError }

// ─── Public types ──────────────────────────────────────────────────────────

export interface ParsedGocharBounds {
  /** Normalized echo string for the start bound (what the caller supplied, or the
   *  resolved bare-date form with 'Z' suffix). */
  dateFrom: string
  /** Normalized echo string for the end bound. */
  dateTo: string
  /** Inclusive start instant. */
  start: Date
  /** Exclusive end instant. */
  end: Date
}

// ─── Constants ─────────────────────────────────────────────────────────────

/** Regex for a bare calendar date: exactly `YYYY-MM-DD` with no time component. */
const BARE_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Regex for a full ISO-8601 instant that MUST end in `Z`.
 * Accepts the subset `YYYY-MM-DDTHH:mm:ssZ`, `YYYY-MM-DDTHH:mm:ss.sssZ`, and
 * `YYYY-MM-DDTHH:mmZ` — i.e. any form that `new Date(str)` correctly parses
 * as UTC, with the explicit `Z` suffix required.
 */
const FULL_INSTANT_Z_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z$/

/** 1 ms, used for boundary-tests. */
const MS = 1

/**
 * Maximum allowed span in milliseconds when `includeMoon: true`.
 * 366 days — a full calendar year including leap-day headroom.
 */
export const MAX_SPAN_WITH_MOON_MS = 366 * 24 * 60 * 60 * 1000

/**
 * Maximum allowed span in milliseconds when `includeMoon: false`.
 * 1096 days ≈ 3 years.
 */
export const MAX_SPAN_WITHOUT_MOON_MS = 1096 * 24 * 60 * 60 * 1000

// ─── Parsing ───────────────────────────────────────────────────────────────

/**
 * Parses one date/time string according to the two-format rule:
 *
 *   - Bare `YYYY-MM-DD`  → interpreted as UTC midnight on that date
 *   - Full ISO instant   → must carry an explicit `Z`; used as-is
 *   - Anything else      → throws `GocharValidationError`
 *
 * The `isEndBound` flag controls whether a bare date maps to the date's OWN
 * midnight (false → `dateFrom`) or the FOLLOWING midnight (true → `dateTo`),
 * since the end bound is exclusive.
 */
function parseOneBound(raw: string, field: 'dateFrom' | 'dateTo'): Date {
  const isEndBound = field === 'dateTo'

  if (BARE_DATE_RE.test(raw)) {
    // Interpret as UTC date. Adding a day for the end-bound gives us the
    // exclusive upper limit without any timezone arithmetic.
    const utcMidnight = new Date(`${raw}T00:00:00.000Z`)
    if (!Number.isFinite(utcMidnight.getTime())) {
      throw new GocharValidationError(`${field} "${raw}" is not a valid calendar date`)
    }
    if (isEndBound) {
      // dateTo is inclusive as a calendar date, so the exclusive end is the
      // next UTC midnight.
      return new Date(utcMidnight.getTime() + 24 * 60 * 60 * 1000)
    }
    return utcMidnight
  }

  if (FULL_INSTANT_Z_RE.test(raw)) {
    const d = new Date(raw)
    if (!Number.isFinite(d.getTime())) {
      throw new GocharValidationError(`${field} "${raw}" is not a valid ISO-8601 instant`)
    }
    return d
  }

  // Neither format matched — could be a non-Z offset, a malformed string, etc.
  throw new GocharValidationError(
    `${field} "${raw}" must be either a bare YYYY-MM-DD date or a full ISO-8601 instant ending in Z`
  )
}

/**
 * Normalizes a parsed `Date` back to the canonical echo string:
 *   - Bare dates are echoed as the resolved ISO UTC instant (with `Z`)
 *   - Full instants are returned unchanged
 *
 * The echo string is purely informational for callers; the `Date` objects are
 * the authoritative bounds.
 */
function echoString(raw: string, resolved: Date): string {
  if (BARE_DATE_RE.test(raw)) {
    return resolved.toISOString()
  }
  return raw
}

/**
 * Parses `dateFrom` and `dateTo` into a `ParsedGocharBounds` object.
 *
 * Throws `GocharValidationError` when:
 *   - Either string is malformed or uses a non-Z timezone offset
 *   - `start >= end` (reversed or identical bounds)
 *
 * Requirements: R2.1, R2.2, R2.3, R2.4, R2.11, R8.1
 */
export function parseGocharBounds(dateFrom: string, dateTo: string): ParsedGocharBounds {
  const start = parseOneBound(dateFrom, 'dateFrom')
  const end = parseOneBound(dateTo, 'dateTo')

  if (start.getTime() >= end.getTime()) {
    throw new GocharValidationError(
      `dateFrom must be strictly before dateTo (got "${dateFrom}" → "${dateTo}")`
    )
  }

  return {
    dateFrom: echoString(dateFrom, start),
    dateTo: echoString(dateTo, end),
    start,
    end,
  }
}

// ─── Span validation ───────────────────────────────────────────────────────

/**
 * Validates that the resolved span does not exceed the per-Moon-tier limit.
 *
 * The limits are applied to the **resolved duration** in milliseconds — not
 * to calendar-year labels or month counts — so a request spanning from
 * 2024-02-29 (leap day) to 2025-03-01 is tested as exactly its millisecond
 * difference, not as "1 year".
 *
 * Throws `GocharValidationError` when the span is too long.
 * Returns void on success.
 *
 * Requirements: R2.10
 */
export function validateGocharSpan(bounds: ParsedGocharBounds, includeMoon: boolean): void {
  const spanMs = bounds.end.getTime() - bounds.start.getTime()
  const maxMs = includeMoon ? MAX_SPAN_WITH_MOON_MS : MAX_SPAN_WITHOUT_MOON_MS
  const maxLabel = includeMoon ? '366 days' : '1096 days'

  if (spanMs > maxMs) {
    throw new GocharValidationError(
      `Requested span (${(spanMs / (24 * 60 * 60 * 1000)).toFixed(2)} days) exceeds the ${maxLabel} limit for includeMoon=${includeMoon}`
    )
  }
}
