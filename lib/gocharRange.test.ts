/**
 * lib/gocharRange.test.ts — Unit tests for parseGocharBounds() and
 * validateGocharSpan().
 *
 * Spec: .kiro/specs/gochar-feature/ — Tasks 5.3, 5.4
 * Requirements: R2.1, R2.2, R2.3, R2.4, R2.10, R2.11, R4.8, R7.3, R7.4, R8.1
 *
 * IMPORTANT: assertions against date values use `.getTime()` (milliseconds) or
 * `.toISOString()` — never `Date.prototype.toString()`, which is
 * locale/timezone-dependent in Node.
 */

import { describe, it, expect } from 'vitest'
import {
  parseGocharBounds,
  validateGocharSpan,
  GocharValidationError,
  MAX_SPAN_WITH_MOON_MS,
  MAX_SPAN_WITHOUT_MOON_MS,
  type ParsedGocharBounds,
} from './gocharRange'

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Build a ParsedGocharBounds directly from two Date objects (bypasses parsing). */
function makeBounds(start: Date, end: Date): ParsedGocharBounds {
  return {
    dateFrom: start.toISOString(),
    dateTo: end.toISOString(),
    start,
    end,
  }
}

/** Offset a Date by `ms` milliseconds (positive or negative). */
function offsetMs(d: Date, ms: number): Date {
  return new Date(d.getTime() + ms)
}

/** Add `days` whole days to a Date (in UTC-millisecond arithmetic). */
function addDays(d: Date, days: number): Date {
  return offsetMs(d, days * 24 * 60 * 60 * 1000)
}

// ─── parseGocharBounds ───────────────────────────────────────────────────────

describe('parseGocharBounds', () => {
  // 5.3 / R2.1 — bare dateFrom → same-day UTC midnight
  it('resolves a bare dateFrom to 00:00:00.000Z of that date', () => {
    const result = parseGocharBounds('2024-03-15', '2024-03-16')
    const expected = new Date('2024-03-15T00:00:00.000Z')
    expect(result.start.getTime()).toBe(expected.getTime())
  })

  // 5.3 / R2.2 — bare dateTo → FOLLOWING UTC midnight (exclusive end)
  it('resolves a bare dateTo to the following UTC midnight', () => {
    const result = parseGocharBounds('2024-03-15', '2024-03-16')
    const expected = new Date('2024-03-17T00:00:00.000Z') // day AFTER 2024-03-16
    expect(result.end.getTime()).toBe(expected.getTime())
  })

  // Same-day bare dates: dateFrom='2024-01-01' → start=2024-01-01T00:00Z,
  // dateTo='2024-01-01' → end=2024-01-02T00:00Z → start < end → valid (1 full day).
  it('accepts same-day bare dateFrom and dateTo (start < end because dateTo is next midnight)', () => {
    const result = parseGocharBounds('2024-01-01', '2024-01-01')
    expect(result.start.toISOString()).toBe('2024-01-01T00:00:00.000Z')
    expect(result.end.toISOString()).toBe('2024-01-02T00:00:00.000Z')
  })

  // 5.3 / R2.3 — full ISO instant with Z is used verbatim as dateFrom
  it('uses a full Z-suffixed ISO instant verbatim for dateFrom', () => {
    const instant = '2024-06-10T14:30:00Z'
    const result = parseGocharBounds(instant, '2024-12-31')
    const expected = new Date('2024-06-10T14:30:00Z')
    expect(result.start.getTime()).toBe(expected.getTime())
  })

  // 5.3 / R2.4 — full ISO instant with Z is used verbatim as dateTo
  it('uses a full Z-suffixed ISO instant verbatim for dateTo', () => {
    const instant = '2025-01-01T00:00:00.000Z'
    const result = parseGocharBounds('2024-01-01', instant)
    const expected = new Date('2025-01-01T00:00:00.000Z')
    expect(result.end.getTime()).toBe(expected.getTime())
  })

  // 5.3 — mixed: bare dateFrom + full-ISO dateTo
  it('supports mixed bare dateFrom + full-ISO dateTo', () => {
    const result = parseGocharBounds('2024-05-01', '2024-07-15T12:00:00Z')
    expect(result.start.toISOString()).toBe('2024-05-01T00:00:00.000Z')
    expect(result.end.toISOString()).toBe('2024-07-15T12:00:00.000Z')
  })

  // 5.3 — mixed: full-ISO dateFrom + bare dateTo
  it('supports mixed full-ISO dateFrom + bare dateTo', () => {
    const result = parseGocharBounds('2024-03-20T06:00:00Z', '2024-06-01')
    expect(result.start.toISOString()).toBe('2024-03-20T06:00:00.000Z')
    expect(result.end.toISOString()).toBe('2024-06-02T00:00:00.000Z') // day after 2024-06-01
  })

  // 5.3 / R8.1 — no timezone offset: assert UTC millis directly
  it('resolves bare date strictly to UTC millis with no local-timezone offset', () => {
    const result = parseGocharBounds('2024-03-15', '2024-03-16')
    // This is the correct UTC midnight in milliseconds regardless of process TZ.
    const utcMidnightMs = Date.UTC(2024, 2, 15, 0, 0, 0, 0) // month is 0-indexed
    expect(result.start.getTime()).toBe(utcMidnightMs)
  })

  // 5.3 — normalized echo strings are ISO UTC strings with Z
  it('returns normalized echo strings ending in Z for bare inputs', () => {
    const result = parseGocharBounds('2024-03-15', '2024-03-16')
    expect(result.dateFrom).toMatch(/Z$/)
    expect(result.dateTo).toMatch(/Z$/)
  })

  it('returns the original string as the echo for full-ISO inputs', () => {
    const from = '2024-06-10T14:30:00Z'
    const to = '2025-01-01T00:00:00.000Z'
    const result = parseGocharBounds(from, to)
    expect(result.dateFrom).toBe(from)
    expect(result.dateTo).toBe(to)
  })

  // 5.3 — reversed bounds → throws
  it('throws GocharValidationError when dateFrom is after dateTo', () => {
    expect(() => parseGocharBounds('2024-01-02', '2024-01-01')).toThrow(GocharValidationError)
  })

  // 5.3 — equal full ISO instants → throws (start >= end)
  it('throws GocharValidationError when dateFrom and dateTo are identical ISO instants', () => {
    expect(() =>
      parseGocharBounds('2024-06-01T00:00:00Z', '2024-06-01T00:00:00Z')
    ).toThrow(GocharValidationError)
  })

  // 5.3 — malformed dateFrom
  it('throws GocharValidationError for a malformed dateFrom', () => {
    expect(() => parseGocharBounds('not-a-date', '2024-12-31')).toThrow(GocharValidationError)
  })

  // 5.3 — malformed dateTo
  it('throws GocharValidationError for a malformed dateTo', () => {
    expect(() => parseGocharBounds('2024-01-01', 'foobar')).toThrow(GocharValidationError)
  })

  // 5.3 — full ISO without Z (e.g. with +05:30) → throws
  it('throws GocharValidationError for a full ISO instant with +05:30 offset (not Z)', () => {
    expect(() =>
      parseGocharBounds('2024-01-01T00:00:00+05:30', '2024-12-31')
    ).toThrow(GocharValidationError)
  })

  // Full ISO without Z using -00:00
  it('throws GocharValidationError for a full ISO instant with -00:00 offset', () => {
    expect(() =>
      parseGocharBounds('2024-01-01', '2024-12-31T23:59:59-00:00')
    ).toThrow(GocharValidationError)
  })

  // ISO with T separator but no Z — should also throw
  it('throws GocharValidationError for a datetime string without a timezone suffix', () => {
    expect(() =>
      parseGocharBounds('2024-06-01T12:00:00', '2024-12-31')
    ).toThrow(GocharValidationError)
  })

  // ISO with milliseconds and Z is valid
  it('accepts a full ISO instant with milliseconds and Z', () => {
    const from = '2024-01-15T08:30:45.123Z'
    const result = parseGocharBounds(from, '2025-01-01')
    expect(result.start.getTime()).toBe(new Date('2024-01-15T08:30:45.123Z').getTime())
  })
})

// ─── validateGocharSpan ───────────────────────────────────────────────────────

describe('validateGocharSpan', () => {
  // 5.3 — Moon included: exactly 366 days → passes
  it('passes when span is exactly 366 days and includeMoon is true', () => {
    const start = new Date('2024-01-01T00:00:00.000Z')
    const end = addDays(start, 366)
    const bounds = makeBounds(start, end)
    expect(() => validateGocharSpan(bounds, true)).not.toThrow()
  })

  // 5.3 — Moon included: 366 days + 1 ms → throws
  it('throws when span is 366 days + 1 ms and includeMoon is true', () => {
    const start = new Date('2024-01-01T00:00:00.000Z')
    const end = new Date(start.getTime() + MAX_SPAN_WITH_MOON_MS + 1)
    const bounds = makeBounds(start, end)
    expect(() => validateGocharSpan(bounds, true)).toThrow(GocharValidationError)
  })

  // 5.3 — Moon excluded: exactly 1096 days → passes
  it('passes when span is exactly 1096 days and includeMoon is false', () => {
    const start = new Date('2024-01-01T00:00:00.000Z')
    const end = addDays(start, 1096)
    const bounds = makeBounds(start, end)
    expect(() => validateGocharSpan(bounds, false)).not.toThrow()
  })

  // 5.3 — Moon excluded: 1096 days + 1 ms → throws
  it('throws when span is 1096 days + 1 ms and includeMoon is false', () => {
    const start = new Date('2024-01-01T00:00:00.000Z')
    const end = new Date(start.getTime() + MAX_SPAN_WITHOUT_MOON_MS + 1)
    const bounds = makeBounds(start, end)
    expect(() => validateGocharSpan(bounds, false)).toThrow(GocharValidationError)
  })

  // Short span well within both limits → passes for both tiers
  it('passes a 30-day span for both Moon tiers', () => {
    const start = new Date('2024-06-01T00:00:00.000Z')
    const bounds = makeBounds(start, addDays(start, 30))
    expect(() => validateGocharSpan(bounds, true)).not.toThrow()
    expect(() => validateGocharSpan(bounds, false)).not.toThrow()
  })

  // 366-day span passes Moon-excluded tier (1096 limit)
  it('passes a 366-day span for includeMoon false', () => {
    const start = new Date('2024-01-01T00:00:00.000Z')
    const bounds = makeBounds(start, addDays(start, 366))
    expect(() => validateGocharSpan(bounds, false)).not.toThrow()
  })

  // Thrown error is an instance of GocharValidationError (not a generic Error)
  it('the thrown error is a GocharValidationError instance', () => {
    const start = new Date('2024-01-01T00:00:00.000Z')
    const end = new Date(start.getTime() + MAX_SPAN_WITH_MOON_MS + 1)
    const bounds = makeBounds(start, end)
    let caught: unknown
    try {
      validateGocharSpan(bounds, true)
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(GocharValidationError)
    expect((caught as GocharValidationError).name).toBe('GocharValidationError')
  })
})

// ─── Task 5.4 — "span cap never blocks a PD" invariant ─────────────────────
//
// The longest possible Vimshottari PD is Venus–Venus–Venus:
//   20 * (20/120) * (20/120) years = 8000/14400 years ≈ 202.78 days
// We round up to 203 days to be conservative.
//
// Requirements: R4.8

describe('span cap never blocks a PD (R4.8)', () => {
  const PD_MAX_DAYS = 203 // Venus–Venus–Venus, ceiling of ~202.78 days

  it('a 203-day span passes validateGocharSpan with includeMoon true', () => {
    const start = new Date('2024-01-01T00:00:00.000Z')
    const bounds = makeBounds(start, addDays(start, PD_MAX_DAYS))
    expect(() => validateGocharSpan(bounds, true)).not.toThrow()
  })

  it('a 203-day span passes validateGocharSpan with includeMoon false', () => {
    const start = new Date('2024-01-01T00:00:00.000Z')
    const bounds = makeBounds(start, addDays(start, PD_MAX_DAYS))
    expect(() => validateGocharSpan(bounds, false)).not.toThrow()
  })

  // Belt-and-suspenders: confirm 203 < 366 and 203 < 1096
  it('203 days is strictly below both span caps', () => {
    const spanMs = PD_MAX_DAYS * 24 * 60 * 60 * 1000
    expect(spanMs).toBeLessThan(MAX_SPAN_WITH_MOON_MS)
    expect(spanMs).toBeLessThan(MAX_SPAN_WITHOUT_MOON_MS)
  })
})

// ─── Import hygiene (GAP 2) ─────────────────────────────────────────────────
//
// `lib/gocharRange.ts` is a pure string/date parser. It MUST NOT reach the
// Swiss-Ephemeris import chain.
//
// It previously imported `GocharValidationError` from `@/engine/compute/gochar`,
// which imports the native `swisseph-v2` binary — so importing the date parser
// transitively pulled the whole ephemeris in. That contradicts the same principle
// the spec applies to `engine/compute/types.ts` (Task 1.1: it "must stay free of
// the Swiss-Ephemeris-bearing import chain"), and it is a latent client-bundle
// breaker: the client-side `useGocharRange` hook (Task 8.2) and the Transits-tab
// `includeMoon` label (Task 9.1, which must state BOTH span tiers) read
// `MAX_SPAN_WITH_MOON_MS` / `MAX_SPAN_WITHOUT_MOON_MS` from this module. Bundling
// a `.node` binary into a client component fails the build.
//
// The error class now lives in `lib/errors.ts` — a zero-import leaf — so both the
// engine and the parser depend on one definition and `instanceof` works across
// both (asserted below).
//
// The assertion is a static source scan rather than a runtime module-graph walk:
// Vitest resolves the native module happily in Node, so a runtime check would
// pass even with the bad import present. The scan is transitive over first-party
// (`@/`-aliased and relative) imports, which is where the risk actually lives.

import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { GocharValidationError as EngineError } from '@/engine/compute/gochar'

const REPO_ROOT = resolve(__dirname, '..')

/** Extracts every `from '<specifier>'` target in a TS source file. */
function importSpecifiers(source: string): string[] {
  const out: string[] = []
  const re = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s+['"]([^'"]+)['"]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(source)) !== null) out.push(m[1])
  // Bare side-effect imports, e.g. `import 'foo'`.
  const bare = /(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g
  while ((m = bare.exec(source)) !== null) out.push(m[1])
  return out
}

/** Resolves a first-party specifier to a file on disk, or null if third-party. */
function resolveFirstParty(specifier: string, fromFile: string): string | null {
  let base: string
  if (specifier.startsWith('@/')) base = resolve(REPO_ROOT, specifier.slice(2))
  else if (specifier.startsWith('.')) base = resolve(dirname(fromFile), specifier)
  else return null // node builtin or node_modules package
  for (const candidate of [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, base]) {
    if (existsSync(candidate) && candidate.endsWith('.ts')) return candidate
  }
  return null
}

/**
 * Walks the transitive first-party import graph from `entry`, returning every
 * reachable file plus every third-party specifier encountered.
 */
function walkImports(entry: string): { files: Set<string>; external: Set<string> } {
  const files = new Set<string>()
  const external = new Set<string>()
  const queue = [entry]
  while (queue.length > 0) {
    const file = queue.pop()!
    if (files.has(file)) continue
    files.add(file)
    const source = readFileSync(file, 'utf8')
    for (const spec of importSpecifiers(source)) {
      const resolved = resolveFirstParty(spec, file)
      if (resolved) queue.push(resolved)
      else external.add(spec)
    }
  }
  return { files, external }
}

describe('lib/gocharRange.ts import hygiene', () => {
  const ENTRY = resolve(REPO_ROOT, 'lib/gocharRange.ts')

  it('the scanner itself works — it finds swisseph from the engine module (control)', () => {
    // Negative control. Without this, a broken scanner that returns nothing
    // would make every assertion below vacuously pass.
    const { external } = walkImports(resolve(REPO_ROOT, 'engine/compute/gochar.ts'))
    expect([...external]).toContain('swisseph-v2')
  })

  it('does not import from engine/compute/gochar', () => {
    const source = readFileSync(ENTRY, 'utf8')
    expect(source).not.toMatch(/from\s+['"]@\/engine\/compute\/gochar['"]/)
    expect(source).not.toMatch(/from\s+['"]\.\.\/engine\/compute\/gochar['"]/)
  })

  it('reaches no swisseph / native module anywhere in its transitive import graph', () => {
    const { external } = walkImports(ENTRY)
    const offenders = [...external].filter(
      (s) => /swisseph/i.test(s) || s.endsWith('.node')
    )
    expect(offenders).toEqual([])
  })

  it('reaches no module under engine/compute at all', () => {
    const { files } = walkImports(ENTRY)
    const offenders = [...files].filter((f) => f.includes('/engine/compute/'))
    expect(offenders).toEqual([])
  })

  it('sources GocharValidationError from the zero-import lib/errors leaf', () => {
    const source = readFileSync(ENTRY, 'utf8')
    expect(source).toMatch(/import\s*\{\s*GocharValidationError\s*\}\s*from\s+['"]@\/lib\/errors['"]/)
    // lib/errors.ts must itself stay import-free, or the indirection buys nothing.
    const { external, files } = walkImports(resolve(REPO_ROOT, 'lib/errors.ts'))
    expect([...external]).toEqual([])
    expect(files.size).toBe(1)
  })

  it('exports the SAME class the engine throws — one definition, so instanceof is uniform', () => {
    // The whole point of the move: a duplicate class would make
    // `err instanceof GocharValidationError` false across the module boundary
    // and silently turn a 400 into a 500 in the API route.
    expect(GocharValidationError).toBe(EngineError)
    let caught: unknown
    try {
      parseGocharBounds('2024-01-02', '2024-01-01')
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(EngineError)
    expect(caught).toBeInstanceOf(GocharValidationError)
  })
})
