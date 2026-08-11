/**
 * app/components/AshtakavargaView.test.tsx
 * -----------------------------------------
 * Unit test for embedded-consumer parity (R8.2) and legend identity wherever rendered (R4.8).
 *
 * `AshtakavargaView`'s props are unchanged by task 16.3 — still exactly `{ data: AshtakavargaResult }`
 * — so `DurationComputationResults`' call site (`<AshtakavargaView data={categoryData.ashtakavarga} />`)
 * keeps working verbatim. This test renders `AshtakavargaView` twice with the exact same single
 * `data` prop DurationComputationResults passes (mirroring how `app/page.tsx`'s own Ashtakavarga tab
 * calls the same component with the same shape of prop) and asserts the two renders produce
 * IDENTICAL legend entries, band ranges and Non_Colour_Signal marker glyphs.
 *
 * The repo has no DOM environment or component-testing library installed (no `jsdom`, no
 * `@testing-library/react` — see design.md's Testing Strategy, "Runner and libraries actually in
 * the repo"), and adding one is explicitly out of scope for this feature. Following the same
 * pattern already established for `YogasView.test.tsx`, `GrahasTable.test.tsx` and
 * `SadeSatiPanel.test.tsx`: components are called directly as plain functions and the returned
 * React element tree is inspected structurally — no `render()`, no DOM, no new dependency.
 *
 * `AshtakavargaView` (unlike its siblings above) DOES call a hook (`useState`, twice, for
 * `indexMode` and `diagramStyle`). Calling it directly as a function without a surrounding
 * `render()` leaves `react`'s internal hook dispatcher unset, so a real `useState` call throws
 * ("Invalid hook call") rather than silently returning the initial value. `callWithStubbedUseState`
 * below installs a minimal dispatcher — supporting only the one hook this component uses — for the
 * duration of the call, then restores whatever dispatcher (or lack of one) was there before. This
 * is enough to observe the component's initial-render output, which is all a plain function call
 * can ever produce.
 *
 * `vitest.config.ts` sets `esbuild.jsx: 'automatic'` so this call-as-function approach works for
 * component modules (like `AshtakavargaView.tsx`) that rely on the automatic JSX runtime and never
 * `import React` themselves.
 *
 * _Design: Testing Strategy — Manual / review verification_
 * _Requirements: 4.8, 8.2_
 */

import { describe, expect, it } from 'vitest'
import * as React from 'react'
import type { ReactElement, ReactNode } from 'react'
import AshtakavargaView from './AshtakavargaView'
import { bandsFor, BAV_PLANETS } from '@/lib/ashtakavargaBands'
import type { AshtakavargaResult, AshtakavargaHouseEntry } from '@/engine/compute/types'

// ─── Hook dispatcher stub ────────────────────────────────────────────────

const REACT_INTERNALS = (React as unknown as {
  __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED: {
    ReactCurrentDispatcher: { current: unknown }
  }
}).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED

/**
 * Runs `fn` with a minimal hook dispatcher installed that supports exactly the one hook
 * `AshtakavargaView` calls (`useState`, twice) — returning each initializer's value verbatim and a
 * no-op setter, matching a real first render. Restores the previous dispatcher afterward
 * regardless of outcome.
 */
function callWithStubbedUseState<T>(fn: () => T): T {
  const dispatcher = REACT_INTERNALS.ReactCurrentDispatcher
  const previous = dispatcher.current
  dispatcher.current = {
    useState: (initial: unknown) => [
      typeof initial === 'function' ? (initial as () => unknown)() : initial,
      () => {},
    ],
  }
  try {
    return fn()
  } finally {
    dispatcher.current = previous
  }
}

// ─── Tree-walking helpers (mirrors YogasView.test.tsx / SadeSatiPanel.test.tsx) ─────────────────

/** Flattens a React node (string, number, element, or nested array of these) to its visible text. */
function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (typeof node === 'object' && 'props' in (node as ReactElement)) {
    return textOf((node as ReactElement).props?.children)
  }
  return ''
}

/**
 * Depth-first walk of a rendered element tree, invoking `visit` on every element node found. An
 * element whose `type` is a plain function component (`BinduChart`, `BinduLegend`,
 * `SectionUnavailable` — none of which carry hooks) is additionally expanded by invoking it with
 * its own props, mirroring the sibling tests' approach, so nested native elements are reachable.
 */
function walk(node: ReactNode, visit: (el: ReactElement) => void): void {
  if (node === null || node === undefined || typeof node === 'boolean') return
  if (typeof node === 'string' || typeof node === 'number') return
  if (Array.isArray(node)) {
    node.forEach((n) => walk(n, visit))
    return
  }
  if (typeof node === 'object' && 'props' in (node as ReactElement)) {
    const el = node as ReactElement
    visit(el)
    walk(el.props?.children, visit)
    if (typeof el.type === 'function') {
      const rendered = (el.type as (props: unknown) => ReactNode)(el.props)
      walk(rendered, visit)
    }
    return
  }
}

/** Collects every element in the tree whose `type` matches `tag` (e.g. 'li', 'text', 'g'). */
function findAll(root: ReactNode, tag: string): ReactElement[] {
  const found: ReactElement[] = []
  walk(root, (el) => {
    if (el.type === tag) found.push(el)
  })
  return found
}

// ─── Fixture ─────────────────────────────────────────────────────────────

/**
 * Realistic `AshtakavargaResult`. Every planet's 12-slot BAV array is
 * `[8,7,6,5,4,3,2,1,0,4,5,6]` — deliberately spanning all four BAV bands (favorable 8/7/6/5,
 * moderate 4, cautionary 3, unfavorable 2/1/0) inside a single array, so every marker glyph is
 * exercised. `sav`/`savTotal`/`byHouse` are DERIVED from the BAV arrays below (never hand-computed)
 * so the fixture is internally consistent by construction.
 */
function buildFixture(): AshtakavargaResult {
  const perPlanetSlots = [8, 7, 6, 5, 4, 3, 2, 1, 0, 4, 5, 6]
  const bav: Record<string, number[]> = {}
  for (const planet of BAV_PLANETS) {
    bav[planet] = [...perPlanetSlots]
  }

  const sav = Array.from({ length: 12 }, (_, i) =>
    BAV_PLANETS.reduce((sum, planet) => sum + bav[planet][i], 0)
  )
  const savTotal = sav.reduce((sum, v) => sum + v, 0)

  const lagnaSignNumber = 5 // Leo
  const SIGN_NAMES = [
    'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
    'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
  ]
  const byHouse: AshtakavargaHouseEntry[] = Array.from({ length: 12 }, (_, idx) => {
    const house = idx + 1
    const signNumber = ((lagnaSignNumber - 1 + idx) % 12) + 1
    const signIndex = signNumber - 1
    const houseBav: Record<string, number> = {}
    for (const planet of BAV_PLANETS) houseBav[planet] = bav[planet][signIndex]
    return {
      house,
      signNumber,
      sign: SIGN_NAMES[signIndex],
      sav: sav[signIndex],
      bav: houseBav,
    }
  })

  return { bav, sav, savTotal, lagnaSignNumber, byHouse }
}

// ─── Extraction helpers ────────────────────────────────────────────────────

interface LegendEntry {
  marker: string
  range: string
  label: string
}

/** Every `<li>` rendered by either `BinduLegend` instance, as {marker, range, label} triples. */
function extractLegendEntries(root: ReactNode): LegendEntry[] {
  const entries: LegendEntry[] = []
  for (const li of findAll(root, 'li')) {
    const children = li.props?.children
    const kids: ReactNode[] = Array.isArray(children) ? children : [children]
    entries.push({
      marker: textOf(kids[1]),
      range: textOf(kids[2]),
      label: textOf(kids[3]),
    })
  }
  return entries
}

/** Every distinct Non_Colour_Signal marker glyph rendered inside a diagram cell's numeral text. */
function extractDiagramMarkers(root: ReactNode): string[] {
  const markers = new Set<string>()
  for (const textEl of findAll(root, 'text')) {
    if (textEl.props?.fontWeight !== '600') continue
    const content = textOf(textEl).trim()
    // Content is either "n/a" or "<count> <marker>" — pull the marker half when present.
    const parts = content.split(' ')
    if (parts.length === 2) markers.add(parts[1])
  }
  return [...markers].sort()
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('AshtakavargaView — embedded-consumer parity (R8.2, R4.8)', () => {
  const fixture = buildFixture()

  // Two independent invocations with the EXACT single `data` prop
  // `DurationComputationResults` passes (`<AshtakavargaView data={categoryData.ashtakavarga} />`),
  // mirroring `app/page.tsx`'s own Ashtakavarga-tab call site (`<AshtakavargaView data={result.chart.ashtakavarga} />`).
  // Both call sites pass the same single prop with no other configuration.
  const standaloneEl = callWithStubbedUseState(() => AshtakavargaView({ data: fixture })) as ReactElement
  const embeddedEl = callWithStubbedUseState(() => AshtakavargaView({ data: fixture })) as ReactElement

  it('renders the same legend entries (marker, range, label) in both invocations', () => {
    const standaloneEntries = extractLegendEntries(standaloneEl)
    const embeddedEntries = extractLegendEntries(embeddedEl)

    expect(embeddedEntries).toEqual(standaloneEntries)

    // Exactly one entry per band the pane renders — 3 SAV bands + 4 BAV bands, no more, no fewer.
    expect(standaloneEntries).toHaveLength(bandsFor('sav').length + bandsFor('bav').length)
    expect(standaloneEntries).toHaveLength(7)
  })

  it('renders legend entries matching the canonical band descriptors exactly', () => {
    const entries = extractLegendEntries(standaloneEl)
    const expected = [...bandsFor('sav'), ...bandsFor('bav')].map((d) => ({
      marker: d.marker,
      range: d.range,
      label: d.label,
    }))
    expect(entries).toEqual(expected)
  })

  it('renders the same band ranges in both invocations', () => {
    const standaloneRanges = extractLegendEntries(standaloneEl).map((e) => e.range)
    const embeddedRanges = extractLegendEntries(embeddedEl).map((e) => e.range)
    expect(embeddedRanges).toEqual(standaloneRanges)
  })

  it('renders the same set of Non_Colour_Signal marker glyphs in both invocations', () => {
    const standaloneMarkers = extractDiagramMarkers(standaloneEl)
    const embeddedMarkers = extractDiagramMarkers(embeddedEl)

    expect(embeddedMarkers).toEqual(standaloneMarkers)
    // The fixture was built to span every band, so every marker glyph (▲ = ▽ ▼) is exercised.
    // Sorted by code point, which is what `extractDiagramMarkers`'s `.sort()` produces.
    expect(standaloneMarkers).toEqual(['=', '▲', '▼', '▽'])
  })

  it('renders identical overall output for both invocations of the same single `data` prop', () => {
    // Full structural parity: same legend entries, same diagram markers, same visible text.
    expect(textOf(embeddedEl)).toBe(textOf(standaloneEl))
    expect(extractLegendEntries(embeddedEl)).toEqual(extractLegendEntries(standaloneEl))
    expect(extractDiagramMarkers(embeddedEl)).toEqual(extractDiagramMarkers(standaloneEl))
  })
})

// ─── Missing / malformed `byHouse` (task 16.5, R5.6) ────────────────────────
//
// `AshtakavargaView` computes `hasByHouse = !!data.byHouse && data.byHouse.length === 12`.
// When false, the Index_Mode (sign/house) toggle is omitted and replaced with
// `<SectionUnavailable section="House-indexed Ashtakavarga" />`, `indexMode` defaults to
// `'sign'`, and the diagrams/tables still render via the sign-indexed fallback in
// `deriveBinduSlots` (Aries-first labels). These tests cover: `byHouse` absent, `byHouse`
// present but the wrong length (5 and 13 entries), and — as a contrast/sanity check — `byHouse`
// present with exactly 12 entries, where the guard must NOT fire.

/**
 * Same fixture `buildFixture()` produces, but with `byHouse` overridden — omitted entirely, or
 * forced to a length other than 12 — for exercising the R5.6 house-indexed-unavailable guard.
 * `bav`/`sav`/`savTotal` stay exactly as `buildFixture()` produces them either way, so any
 * rendering difference is attributable only to `byHouse`.
 */
function buildFixtureWithByHouse(byHouse: AshtakavargaHouseEntry[] | undefined): AshtakavargaResult {
  return { ...buildFixture(), byHouse }
}

/** Visible text of every `<button>` in the tree, trimmed. */
function extractButtonTexts(root: ReactNode): string[] {
  return findAll(root, 'button').map((btn) => textOf(btn.props?.children).trim())
}

/** Visible text of every `role="status"` paragraph in the tree — the `SectionUnavailable` message. */
function extractStatusMessages(root: ReactNode): string[] {
  return findAll(root, 'p')
    .filter((p) => p.props?.role === 'status')
    .map((p) => textOf(p.props?.children).trim())
}

/** Visible text of every `<th>` in the tree, trimmed. */
function extractThTexts(root: ReactNode): string[] {
  return findAll(root, 'th').map((th) => textOf(th.props?.children).trim())
}

/** Visible text of every `<td>` in the tree, trimmed. */
function extractTdTexts(root: ReactNode): string[] {
  return findAll(root, 'td').map((td) => textOf(td.props?.children).trim())
}

describe('AshtakavargaView — missing/malformed byHouse omits the Index_Mode control (R5.6)', () => {
  const HOUSE_UNAVAILABLE_MESSAGE = 'House-indexed Ashtakavarga data is unavailable for this chart.'
  // Fixture's sav array is [56,49,42,35,28,21,14,7,0,28,35,42] (7x the shared per-planet slots),
  // so savTotal is always 357 regardless of index mode — a distinct value no individual bindu
  // count (0–8) or per-sign SAV value (0–56) can coincide with.
  const EXPECTED_SAV_TOTAL = '357'

  it('byHouse absent (undefined) — toggle omitted, unavailable message shown, sign-indexed fallback renders', () => {
    const fixture = buildFixtureWithByHouse(undefined)
    const el = callWithStubbedUseState(() => AshtakavargaView({ data: fixture })) as ReactElement

    const buttonTexts = extractButtonTexts(el)
    expect(buttonTexts).not.toContain('Sign')
    expect(buttonTexts).not.toContain('House (from Lagna)')

    expect(extractStatusMessages(el)).toContain(HOUSE_UNAVAILABLE_MESSAGE)

    // Sign-indexed fallback: Aries-first labels present, no house labels ("H1".."H12") anywhere.
    const thTexts = extractThTexts(el)
    expect(thTexts).toContain('Ari')
    expect(thTexts).toContain('Pis')
    expect(thTexts.some((t) => /^H\d+$/.test(t))).toBe(false)

    // Diagrams/tables still render real data derived from the fixture's sign-indexed arrays.
    expect(extractTdTexts(el)).toContain(EXPECTED_SAV_TOTAL)
  })

  it.each([
    ['5 entries', 5],
    ['13 entries', 13],
  ])('byHouse present but NOT exactly 12 entries (%s) — same guard fires', (_label, length) => {
    const full = buildFixture().byHouse!
    const malformed =
      length < full.length ? full.slice(0, length) : [...full, ...full.slice(0, length - full.length)]
    expect(malformed).toHaveLength(length)

    const fixture = buildFixtureWithByHouse(malformed)
    const el = callWithStubbedUseState(() => AshtakavargaView({ data: fixture })) as ReactElement

    const buttonTexts = extractButtonTexts(el)
    expect(buttonTexts).not.toContain('Sign')
    expect(buttonTexts).not.toContain('House (from Lagna)')

    expect(extractStatusMessages(el)).toContain(HOUSE_UNAVAILABLE_MESSAGE)

    const thTexts = extractThTexts(el)
    expect(thTexts).toContain('Ari')
    expect(thTexts).toContain('Pis')
    expect(thTexts.some((t) => /^H\d+$/.test(t))).toBe(false)

    expect(extractTdTexts(el)).toContain(EXPECTED_SAV_TOTAL)
  })

  it('byHouse present with EXACTLY 12 entries — toggle appears, unavailable message does not (contrast case)', () => {
    const fixture = buildFixture() // byHouse has exactly 12 entries
    const el = callWithStubbedUseState(() => AshtakavargaView({ data: fixture })) as ReactElement

    const buttonTexts = extractButtonTexts(el)
    expect(buttonTexts).toContain('Sign')
    expect(buttonTexts).toContain('House (from Lagna)')

    expect(extractStatusMessages(el)).not.toContain(HOUSE_UNAVAILABLE_MESSAGE)
  })
})

// ─── Missing / short graha `bav` entry (task 16.6, R5.9, R8.1) ──────────────
//
// `AshtakavargaView` checks `hasUsableBav(data.bav?.[planet])` — at least 12 usable (integer,
// 0–8) entries in the RAW sign-indexed `data.bav[planet]` array, independent of `byHouse` — for
// each of the 7 BAV_PLANETS before rendering that planet's `BinduChart`. When false, the
// `BinduChart` is replaced with `<SectionUnavailable section="{planet} Bhinnashtakavarga" />`;
// the other 6 BAV diagrams, the SAV diagram, both legends, and the numeric tables (which iterate
// BAV_PLANETS unconditionally, showing `n/a` per unusable cell rather than omitting the row) are
// all unaffected. `byHouse` is left exactly as `buildFixture()` produces it in both cases below,
// since `hasUsableBav` never reads it.

/** Visible text of every `<h4>` in the tree, trimmed — covers both BinduChart titles and BinduLegend headers. */
function extractH4Texts(root: ReactNode): string[] {
  return findAll(root, 'h4').map((h) => textOf(h.props?.children).trim())
}

const OTHER_SIX_PLANETS = BAV_PLANETS.filter((p) => p !== 'Mars')

describe('AshtakavargaView — missing/short graha bav entry omits only that diagram (R5.9, R8.1)', () => {
  it("Mars's bav entry entirely MISSING — Mars diagram omitted, everything else unaffected", () => {
    const fixture = buildFixture()
    delete (fixture.bav as Record<string, number[]>).Mars
    const el = callWithStubbedUseState(() => AshtakavargaView({ data: fixture })) as ReactElement

    // Mars's diagram is replaced with the naming message.
    expect(extractStatusMessages(el)).toContain('Mars Bhinnashtakavarga data is unavailable for this chart.')

    // The other 6 BAV diagram titles are still present.
    const h4Texts = extractH4Texts(el)
    for (const planet of OTHER_SIX_PLANETS) {
      expect(h4Texts).toContain(planet)
    }
    // Mars's own diagram title does NOT appear (only its unavailable message does).
    expect(h4Texts).not.toContain('Mars')

    // The SAV diagram is still present.
    expect(h4Texts).toContain('SAV')

    // Both legends still render.
    expect(h4Texts).toContain('SAV bands')
    expect(h4Texts).toContain('BAV bands')

    // The numeric tables still render ALL rows, including Mars's — the table iterates
    // BAV_PLANETS unconditionally and never checks hasUsableBav; only the diagram is omitted.
    const tdTexts = extractTdTexts(el)
    expect(tdTexts).toContain('Mars')
    for (const planet of OTHER_SIX_PLANETS) {
      expect(tdTexts).toContain(planet)
    }
  })

  it("Mars's bav entry present but SHORT (5 of 12 entries) — same omission, everything else unaffected", () => {
    const fixture = buildFixture()
    fixture.bav.Mars = fixture.bav.Mars.slice(0, 5)
    const el = callWithStubbedUseState(() => AshtakavargaView({ data: fixture })) as ReactElement

    expect(extractStatusMessages(el)).toContain('Mars Bhinnashtakavarga data is unavailable for this chart.')

    const h4Texts = extractH4Texts(el)
    for (const planet of OTHER_SIX_PLANETS) {
      expect(h4Texts).toContain(planet)
    }
    expect(h4Texts).not.toContain('Mars')
    expect(h4Texts).toContain('SAV')
    expect(h4Texts).toContain('SAV bands')
    expect(h4Texts).toContain('BAV bands')

    const tdTexts = extractTdTexts(el)
    expect(tdTexts).toContain('Mars')
    for (const planet of OTHER_SIX_PLANETS) {
      expect(tdTexts).toContain(planet)
    }
  })

  it('contrast/sanity check — full buildFixture() (all 7 planets complete) renders NO Bhinnashtakavarga unavailable message', () => {
    const fixture = buildFixture()
    const el = callWithStubbedUseState(() => AshtakavargaView({ data: fixture })) as ReactElement

    const bhinnashtakavargaMessages = extractStatusMessages(el).filter((msg) =>
      msg.includes('Bhinnashtakavarga')
    )
    expect(bhinnashtakavargaMessages).toEqual([])

    // Sanity: all 7 diagram titles are present.
    const h4Texts = extractH4Texts(el)
    for (const planet of BAV_PLANETS) {
      expect(h4Texts).toContain(planet)
    }
  })
})
