/**
 * app/components/GrahasTable.test.tsx
 * -------------------------------------
 * Unit tests for GrahasTable's section-level guards and table semantics
 * (R3.4, R3.8, R3.9).
 *
 * The repo has no DOM environment or component-testing library installed (no `jsdom`, no
 * `@testing-library/react` — see design.md's Testing Strategy, "Runner and libraries actually in
 * the repo"), and adding one is explicitly out of scope for this feature. Following the same
 * pattern already established for `YogasView.test.tsx` (task 18.4): `GrahasTable` is a plain
 * function component with no hooks, so it is called directly as a function and the returned React
 * element tree is inspected structurally — no `render()`, no DOM, no new dependency.
 *
 * `vitest.config.ts` sets `esbuild.jsx: 'automatic'` so this call-as-function approach works for
 * component modules (like `GrahasTable.tsx`) that rely on the automatic JSX runtime and never
 * `import React` themselves.
 *
 * _Design: Testing Strategy — Example-based unit tests_
 * _Requirements: 3.4, 3.8, 3.9_
 */

import { describe, expect, it } from 'vitest'
import type { ReactElement, ReactNode } from 'react'
import GrahasTable from './GrahasTable'
import { SectionUnavailable } from './SectionUnavailable'
import type {
  PlanetPosition,
  NakshatraInfo,
  CharaKaraka,
  DivisionalChart,
} from '@/engine/compute/types'

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
 * Depth-first walk of a rendered element tree, invoking `visit` on every element node found.
 * An element whose `type` is a plain function component (e.g. `GrahasTable`'s internal
 * `KarakaCell`, or `SectionUnavailable`) is additionally expanded by invoking it with its own
 * props — mirroring `YogasView.test.tsx`'s approach of calling components directly as functions
 * — so native DOM elements it renders (like the karaka `<td>`) are reachable by tag lookups.
 * None of the function components reached this way carry hooks, so calling them directly is safe.
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

/** Collects every element in the tree whose `type` matches `tag` (e.g. 'th', 'tr', 'table'). */
function findAll(root: ReactNode, tag: string): ReactElement[] {
  const found: ReactElement[] = []
  walk(root, (el) => {
    if (el.type === tag) found.push(el)
  })
  return found
}

/** Body data rows only — a `<tr>` containing a `<th scope="row">` (the graha row header). Excludes
 * the header row, which carries `<th scope="col">` elements instead. */
function findBodyRows(root: ReactNode): ReactElement[] {
  return findAll(root, 'tr').filter((tr) =>
    findAll(tr, 'th').some((th) => th.props.scope === 'row')
  )
}

/** True when a SectionUnavailable element for `section` appears anywhere in the tree. */
function hasSectionUnavailable(root: ReactNode, section: string): boolean {
  let found = false
  walk(root, (el) => {
    if (el.type === SectionUnavailable && el.props.section === section) found = true
  })
  return found
}

// ─── Fixtures ──────────────────────────────────────────────────────────

const PLANETS: PlanetPosition[] = [
  {
    planet: 'Sun',
    longitude: 125.4,
    latitude: 0,
    speed: 1.01,
    retrograde: false,
    sign: 'Leo',
    signNumber: 5,
    degreeInSign: 5.4,
    house: 1,
  },
  {
    planet: 'Moon',
    longitude: 40.2,
    latitude: 0,
    speed: 13.2,
    retrograde: false,
    sign: 'Taurus',
    signNumber: 2,
    degreeInSign: 10.2,
    house: 10,
  },
  {
    planet: 'Rahu',
    longitude: 200.0,
    latitude: 0,
    speed: -0.05,
    retrograde: true,
    sign: 'Libra',
    signNumber: 7,
    degreeInSign: 20.0,
    house: 7,
  },
]

const D1: DivisionalChart = {
  division: 1,
  name: 'Rasi',
  shortName: 'D1',
  lagna: 'Leo',
  lagnaSignNumber: 5,
  lagnaDegreee: 0,
  planets: [
    { planet: 'Sun', sign: 'Leo', signNumber: 5, house: 1, dignity: 'own' },
    { planet: 'Moon', sign: 'Taurus', signNumber: 2, house: 10, dignity: 'exalted' },
    // Rahu deliberately carries no dignity entry (matches Rahu/Ketu carrying no
    // classical dignity label — R3.4's "no D1 dignity" case).
  ],
}

const NAKSHATRAS: NakshatraInfo[] = [
  {
    planet: 'Sun',
    nakshatra: 'Magha',
    nakshatraIndex: 9,
    pada: 2,
    nakshatraLord: 'Ketu',
    degreeInNakshatra: 5.4,
    subLord: 'Venus',
  },
  {
    planet: 'Moon',
    nakshatra: 'Krittika',
    nakshatraIndex: 2,
    pada: 4,
    nakshatraLord: 'Sun',
    degreeInNakshatra: 10.2,
    subLord: 'Mars',
  },
  // No entry for Rahu.
]

const KARAKAS: CharaKaraka[] = [
  { planet: 'Sun', karaka: 'Atmakaraka', karakaAbbr: 'AK', degreeInSign: 5.4 },
  // No entry for Moon or Rahu.
]

const REQUIRED_COLUMN_HEADERS = [
  'Graha',
  'Sign',
  'Degree',
  'House',
  'R',
  'Dignity (D1)',
  'Nakshatra',
  'Pada',
  'Nak Lord',
  'Sub Lord',
  'Deg in Nak',
  'Karaka',
  'Speed',
  'Longitude',
]

// ─── Tests ─────────────────────────────────────────────────────────────

describe('GrahasTable — section-level guards (R3.8)', () => {
  it('renders one row per planets entry and the Nakshatras message when nakshatras is absent', () => {
    const el = GrahasTable({
      planets: PLANETS,
      nakshatras: undefined,
      charaKarakas: KARAKAS,
      divisionalCharts: [D1],
      lagna: 'Leo',
    }) as ReactElement

    // Section-level message shown (R3.8).
    expect(hasSectionUnavailable(el, 'Nakshatras')).toBe(true)
    // Chara Karakas section IS available here (Sun matches), so no message for it.
    expect(hasSectionUnavailable(el, 'Chara Karakas')).toBe(false)

    // Still one row per planets entry (R3.8: "still render that graha's row").
    const rows = findBodyRows(el)
    expect(rows).toHaveLength(PLANETS.length)

    // Every nakshatra-sourced cell is empty for every row, since nakshatras is absent entirely.
    rows.forEach((row) => {
      const cells = findAll(row, 'td')
      // Sign(0) Degree(1) House(2) R(3) Dignity(4) Nakshatra(5) Pada(6) NakLord(7) SubLord(8) DegInNak(9) Karaka(10) Speed(11) Longitude(12)
      expect(textOf(cells[5])).toBe('') // Nakshatra
      expect(textOf(cells[7])).toBe('') // Nak Lord
      expect(textOf(cells[8])).toBe('') // Sub Lord
      expect(textOf(cells[9])).toBe('') // Deg in Nak
    })
  })

  it('renders one row per planets entry and the Nakshatras message when nakshatras is empty', () => {
    const el = GrahasTable({
      planets: PLANETS,
      nakshatras: [],
      charaKarakas: KARAKAS,
      divisionalCharts: [D1],
      lagna: 'Leo',
    }) as ReactElement

    expect(hasSectionUnavailable(el, 'Nakshatras')).toBe(true)

    const rows = findBodyRows(el)
    expect(rows).toHaveLength(PLANETS.length)
  })

  it('renders one row per planets entry and the Nakshatras message when nakshatras matches no planet', () => {
    const nonMatching: NakshatraInfo[] = [
      {
        planet: 'Ketu',
        nakshatra: 'Ashwini',
        nakshatraIndex: 0,
        pada: 1,
        nakshatraLord: 'Ketu',
        degreeInNakshatra: 1.0,
        subLord: 'Ketu',
      },
    ]
    const el = GrahasTable({
      planets: PLANETS,
      nakshatras: nonMatching,
      charaKarakas: KARAKAS,
      divisionalCharts: [D1],
      lagna: 'Leo',
    }) as ReactElement

    // None of `nonMatching`'s entries match a planet in `PLANETS`, so the section is unavailable
    // (R3.8's "contains no entry matching a graha in chart.planets").
    expect(hasSectionUnavailable(el, 'Nakshatras')).toBe(true)

    const rows = findBodyRows(el)
    expect(rows).toHaveLength(PLANETS.length)
  })

  it('renders one row per planets entry and the Chara Karakas message when charaKarakas is absent, empty or unmatched', () => {
    const absent = GrahasTable({
      planets: PLANETS,
      nakshatras: NAKSHATRAS,
      charaKarakas: undefined,
      divisionalCharts: [D1],
      lagna: 'Leo',
    }) as ReactElement
    expect(hasSectionUnavailable(absent, 'Chara Karakas')).toBe(true)
    expect(hasSectionUnavailable(absent, 'Nakshatras')).toBe(false)
    expect(findBodyRows(absent)).toHaveLength(
      PLANETS.length
    )

    const empty = GrahasTable({
      planets: PLANETS,
      nakshatras: NAKSHATRAS,
      charaKarakas: [],
      divisionalCharts: [D1],
      lagna: 'Leo',
    }) as ReactElement
    expect(hasSectionUnavailable(empty, 'Chara Karakas')).toBe(true)

    const unmatched = GrahasTable({
      planets: PLANETS,
      nakshatras: NAKSHATRAS,
      charaKarakas: [{ planet: 'Ketu', karaka: 'Gnatikaraka', karakaAbbr: 'GK', degreeInSign: 1 }],
      divisionalCharts: [D1],
      lagna: 'Leo',
    }) as ReactElement
    expect(hasSectionUnavailable(unmatched, 'Chara Karakas')).toBe(true)

    // All karaka-sourced cells empty across every row when the section is unavailable.
    const rows = findBodyRows(absent)
    rows.forEach((row) => {
      const cells = findAll(row, 'td')
      expect(textOf(cells[10])).toBe('') // Karaka cell
    })
  })

  it('renders both messages when both nakshatras and charaKarakas are absent, still one row per planet', () => {
    const el = GrahasTable({
      planets: PLANETS,
      nakshatras: undefined,
      charaKarakas: undefined,
      divisionalCharts: [D1],
      lagna: 'Leo',
    }) as ReactElement

    expect(hasSectionUnavailable(el, 'Nakshatras')).toBe(true)
    expect(hasSectionUnavailable(el, 'Chara Karakas')).toBe(true)

    const rows = findBodyRows(el)
    expect(rows).toHaveLength(PLANETS.length)

    // Rows are sourced from planets + D1: graha name and D1 dignity are still populated.
    const sunRow = rows[0]
    const sunGraha = findAll(sunRow, 'th')[0]
    expect(textOf(sunGraha)).toBe('Sun')
    const sunCells = findAll(sunRow, 'td')
    expect(textOf(sunCells[4])).toBe('own') // Dignity (D1)
  })

  it('does NOT render either message when both sections are available and matched', () => {
    const el = GrahasTable({
      planets: PLANETS,
      nakshatras: NAKSHATRAS,
      charaKarakas: KARAKAS,
      divisionalCharts: [D1],
      lagna: 'Leo',
    }) as ReactElement

    expect(hasSectionUnavailable(el, 'Nakshatras')).toBe(false)
    expect(hasSectionUnavailable(el, 'Chara Karakas')).toBe(false)
  })
})

describe('GrahasTable — individual-entry-level empty cells, not section messages (R3.4)', () => {
  it('gives Rahu (no karaka assignment, no D1 dignity, no nakshatra match) empty cells without triggering section messages', () => {
    const el = GrahasTable({
      planets: PLANETS,
      nakshatras: NAKSHATRAS,
      charaKarakas: KARAKAS,
      divisionalCharts: [D1],
      lagna: 'Leo',
    }) as ReactElement

    // Both sections ARE available (Sun matches in both), so no section-level message fires
    // even though Rahu individually lacks a karaka, dignity and nakshatra match.
    expect(hasSectionUnavailable(el, 'Nakshatras')).toBe(false)
    expect(hasSectionUnavailable(el, 'Chara Karakas')).toBe(false)

    const rows = findBodyRows(el)
    const rahuRow = rows.find((r) => textOf(findAll(r, 'th')[0]) === 'Rahu')
    expect(rahuRow).toBeDefined()

    const cells = findAll(rahuRow!, 'td')
    expect(textOf(cells[4])).toBe('') // Dignity (D1) — no D1 entry for Rahu
    expect(textOf(cells[5])).toBe('') // Nakshatra — no match for Rahu
    expect(textOf(cells[10])).toBe('') // Karaka — no assignment for Rahu

    // Meanwhile Sun, which DOES have entries in every section, keeps its populated cells.
    const sunRow = rows.find((r) => textOf(findAll(r, 'th')[0]) === 'Sun')!
    const sunCells = findAll(sunRow, 'td')
    expect(textOf(sunCells[4])).toBe('own')
    expect(textOf(sunCells[5])).toBe('Magha')
  })

  it('gives Moon (matched in nakshatras and D1, but no karaka entry) an empty karaka cell only', () => {
    const el = GrahasTable({
      planets: PLANETS,
      nakshatras: NAKSHATRAS,
      charaKarakas: KARAKAS, // only Sun has a karaka entry
      divisionalCharts: [D1],
      lagna: 'Leo',
    }) as ReactElement

    // Chara Karakas section is available (Sun matches), so no section-level message.
    expect(hasSectionUnavailable(el, 'Chara Karakas')).toBe(false)

    const rows = findBodyRows(el)
    const moonRow = rows.find((r) => textOf(findAll(r, 'th')[0]) === 'Moon')!
    const cells = findAll(moonRow, 'td')

    expect(textOf(cells[4])).toBe('exalted') // Dignity (D1) — Moon has a D1 entry
    expect(textOf(cells[5])).toBe('Krittika') // Nakshatra — Moon has a match
    expect(textOf(cells[10])).toBe('') // Karaka — no entry for Moon specifically
  })
})

describe('GrahasTable — table semantic structure (R3.9)', () => {
  const el = GrahasTable({
    planets: PLANETS,
    nakshatras: NAKSHATRAS,
    charaKarakas: KARAKAS,
    divisionalCharts: [D1],
    lagna: 'Leo',
  }) as ReactElement

  it('carries a <caption> with sr-only styling', () => {
    const captions = findAll(el, 'caption')
    expect(captions).toHaveLength(1)
    expect(captions[0].props.className).toContain('sr-only')
    expect(textOf(captions[0]).length).toBeGreaterThan(0)
  })

  it('carries all 14 <th scope="col"> column headers with the required text', () => {
    const colHeaders = findAll(el, 'th').filter((th) => th.props.scope === 'col')
    expect(colHeaders).toHaveLength(14)
    expect(colHeaders.map((th) => textOf(th))).toEqual(REQUIRED_COLUMN_HEADERS)
  })

  it('gives every row header a <th scope="row"> carrying the graha name', () => {
    const rowHeaders = findAll(el, 'th').filter((th) => th.props.scope === 'row')
    expect(rowHeaders).toHaveLength(PLANETS.length)
    expect(rowHeaders.map((th) => textOf(th))).toEqual(PLANETS.map((p) => p.planet))
  })

  it('has exactly one <table> with a <thead> and <tbody>', () => {
    const tables = findAll(el, 'table')
    expect(tables).toHaveLength(1)
    expect(findAll(el, 'thead')).toHaveLength(1)
    expect(findAll(el, 'tbody')).toHaveLength(1)
  })
})
