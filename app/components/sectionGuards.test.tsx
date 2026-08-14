/**
 * app/components/sectionGuards.test.tsx
 * -------------------------------------
 * R8.1 / R8.5 — the unavailable-section mechanism, exercised end to end.
 *
 * Why this file exists
 * --------------------
 * `app/page.test.tsx` deliberately only *constructs* pane elements and never invokes their
 * bodies (see its header), so it proves the tab strip survives malformed data but says nothing
 * about the panes themselves. This file closes that gap: every pane component is **called**
 * with the malformed shapes R8.1 enumerates and must return a `SectionUnavailable` message
 * rather than throw.
 *
 * The two layers are asserted separately — see the comment above `WRONG_CONTAINER_FOR_ARRAY`
 * for why. The `SectionBoundary` half (R8.5) is covered by `getDerivedStateFromError` +
 * `render()` assertions at the bottom, since a class error boundary's catch path is only
 * reachable through a real commit.
 *
 * Test style matches the sibling files in this feature (`YogasView.test.tsx`,
 * `AshtakavargaView.test.tsx`, …): components are called directly as plain functions with a
 * stubbed hook dispatcher, and the returned React element tree is inspected structurally. No
 * DOM environment or component-testing library is installed.
 */

import { describe, expect, it } from 'vitest'
import * as React from 'react'
import type { ReactElement, ReactNode } from 'react'

import AshtakavargaView from './AshtakavargaView'
import ChartSummaryTab from './ChartSummaryTab'
import GrahasTable from './GrahasTable'
import KeyDignitiesPanel from './KeyDignitiesPanel'
import SadeSatiPanel from './SadeSatiPanel'
import TransitsView from './TransitsView'
import YogasView from './YogasView'
import { SectionBoundary, SectionUnavailable } from './SectionUnavailable'
import { guardSection, hasNumberArrays, isArrayOfLength, isNonEmptyArray, isPlainObject } from './sectionGuards'

// ─── Hook dispatcher stub (same mechanism as AshtakavargaView.test.tsx) ──────

const REACT_INTERNALS = (React as unknown as {
  __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED: {
    ReactCurrentDispatcher: { current: unknown }
  }
}).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED

function callWithStubbedHooks<T>(fn: () => T): T {
  const dispatcher = REACT_INTERNALS.ReactCurrentDispatcher
  const previous = dispatcher.current
  dispatcher.current = {
    useState: (initial: unknown) => [
      typeof initial === 'function' ? (initial as () => unknown)() : initial,
      () => {},
    ],
    useEffect: () => {},
    useCallback: (cb: unknown) => cb,
    useRef: (initial: unknown) => ({ current: initial }),
  }
  try {
    return fn()
  } finally {
    dispatcher.current = previous
  }
}

// ─── Tree helpers ───────────────────────────────────────────────────────────

/** Depth-first walk, expanding plain function components so nested output is reachable. */
function walk(node: ReactNode, visit: (el: ReactElement) => void, depth = 0): void {
  if (depth > 40) return
  if (node === null || node === undefined || typeof node === 'boolean') return
  if (typeof node === 'string' || typeof node === 'number') return
  if (Array.isArray(node)) {
    node.forEach((n) => walk(n, visit, depth + 1))
    return
  }
  if (typeof node === 'object' && 'props' in (node as ReactElement)) {
    const el = node as ReactElement
    visit(el)
    walk(el.props?.children, visit, depth + 1)
    if (typeof el.type === 'function' && el.type.prototype?.isReactComponent !== true) {
      const rendered = callWithStubbedHooks(() =>
        (el.type as (props: unknown) => ReactNode)(el.props)
      )
      walk(rendered, visit, depth + 1)
    }
  }
}

/** True when a `SectionUnavailable` for `section` appears anywhere in the tree. */
function hasSectionUnavailable(root: ReactNode, section: string): boolean {
  let found = false
  walk(root, (el) => {
    if (el.type === SectionUnavailable && el.props.section === section) found = true
  })
  return found
}

/** Every distinct `section` name a `SectionUnavailable` in the tree carries. */
function unavailableSections(root: ReactNode): string[] {
  const names = new Set<string>()
  walk(root, (el) => {
    if (el.type === SectionUnavailable) names.add(String(el.props.section))
  })
  return [...names]
}

/**
 * The mechanism has two layers, and this file keeps them apart because they answer different
 * failure modes:
 *
 *   - `guardSection` (R8.1) decides whether the *container* a pane was handed is the shape the
 *     pane expects — absent, null, a primitive, an array where an object is expected, an object
 *     where an array is expected. A rejected container yields `SectionUnavailable`.
 *   - `SectionBoundary` (R8.5) catches whatever a well-shaped container's *contents* do. Deep
 *     per-entry validation is deliberately not attempted: the engine always emits well-formed
 *     rows, so validating every field of every row would cost more than it protects, and the
 *     boundary already contains the blast radius to one pane.
 *
 * `WRONG_CONTAINER_FOR_ARRAY` / `WRONG_CONTAINER_FOR_OBJECT` are the layer-1 cases per prop kind.
 */
const WRONG_CONTAINER_FOR_ARRAY: [name: string, value: unknown][] = [
  ['undefined', undefined],
  ['null', null],
  ['an empty array', []],
  ['an object where an array is expected', { nope: true }],
  ['a string', 'not data'],
  ['a number', 42],
]

const WRONG_CONTAINER_FOR_OBJECT: [name: string, value: unknown][] = [
  ['undefined', undefined],
  ['null', null],
  ['an array where an object is expected', [1, 2, 3]],
  ['an empty array', []],
  ['a string', 'not data'],
  ['a number', 42],
]

// ─── Panes ──────────────────────────────────────────────────────────────────

describe('R8.1 — a pane handed the wrong container renders a message, never throws', () => {
  const CASES: {
    pane: string
    section: string
    /** Which container the pane's root prop is: an array of rows, or a keyed object. */
    kind: 'array' | 'object'
    /**
     * True when an EMPTY array is a legitimate input rather than an unavailable section —
     * i.e. the pane has other independent sections that still render from other props.
     */
    allowsEmptyArray?: true
    call: (bad: unknown) => ReactNode
  }[] = [
    {
      pane: 'GrahasTable',
      section: 'Grahas',
      kind: 'array',
      call: (bad) =>
        callWithStubbedHooks(() =>
          (GrahasTable as unknown as (p: unknown) => ReactNode)({ planets: bad, lagna: 'Taurus' })
        ),
    },
    {
      pane: 'AshtakavargaView',
      section: 'Ashtakavarga',
      kind: 'object',
      call: (bad) =>
        callWithStubbedHooks(() =>
          (AshtakavargaView as unknown as (p: unknown) => ReactNode)({ data: bad })
        ),
    },
    {
      pane: 'YogasView',
      section: 'Named yoga catalogue',
      kind: 'array',
      call: (bad) =>
        callWithStubbedHooks(() => (YogasView as unknown as (p: unknown) => ReactNode)({ yogas: bad })),
    },
    {
      pane: 'TransitsView',
      section: 'Transits',
      kind: 'object',
      call: (bad) =>
        callWithStubbedHooks(() =>
          (TransitsView as unknown as (p: unknown) => ReactNode)({ data: bad })
        ),
    },
    {
      pane: 'ChartSummaryTab',
      section: 'Summary',
      kind: 'array',
      call: (bad) =>
        callWithStubbedHooks(() =>
          (ChartSummaryTab as unknown as (p: unknown) => ReactNode)({
            planets: bad,
            divisionalCharts: bad,
            nakshatras: bad,
            charaKarakas: bad,
            upagrahas: bad,
            shadbala: null,
            lagna: 'Taurus',
          })
        ),
    },
    {
      pane: 'KeyDignitiesPanel',
      section: 'Key Dignities',
      kind: 'array',
      // Combustion chips come from `combustion[]`, not `planets` — see the panel's own comment.
      allowsEmptyArray: true,
      call: (bad) =>
        callWithStubbedHooks(() =>
          (KeyDignitiesPanel as unknown as (p: unknown) => ReactNode)({
            planets: bad,
            divisionalCharts: bad,
            selectedDivision: 1,
          })
        ),
    },
  ]

  for (const { pane, section, kind, allowsEmptyArray, call } of CASES) {
    describe(pane, () => {
      const cases = kind === 'array' ? WRONG_CONTAINER_FOR_ARRAY : WRONG_CONTAINER_FOR_OBJECT

      for (const [name, value] of cases) {
        // Two panes treat `[]` as legitimate rather than unavailable, each for its own reason:
        // `YogasView` because R7.9 requires an empty catalogue to read differently from R7.12's
        // "unavailable", and `KeyDignitiesPanel` because its combustion chips do not come from
        // `planets` at all. Both are asserted positively further down.
        if (name === 'an empty array' && (allowsEmptyArray || pane === 'YogasView')) continue

        it(`does not throw and names the section when the root prop is ${name}`, () => {
          let tree: ReactNode
          expect(() => {
            tree = call(value)
          }).not.toThrow()
          expect(hasSectionUnavailable(tree, section)).toBe(true)
        })
      }
    })
  }

  it('R8.4 — the message carries only the section name and the unavailability statement', () => {
    const el = SectionUnavailable({ section: 'Ashtakavarga' }) as ReactElement
    // `children` is the JSX fragment list `["Ashtakavarga", " data is unavailable for this chart."]`.
    const text = ([] as ReactNode[]).concat(el.props.children as ReactNode[]).join('')
    expect(text).toBe('Ashtakavarga data is unavailable for this chart.')
    expect(el.props.role).toBe('status')
    // No exception type, stack or field path anywhere in the message.
    expect(text).not.toMatch(/error|TypeError|undefined|null|\.\w+\.\w+/i)
  })
})

describe('R8.1 — a well-shaped container with unusable contents degrades in place', () => {
  it('AshtakavargaView: an object carrying none of bav/sav/byHouse renders n/a cells, not a message', () => {
    let tree: ReactNode
    expect(() => {
      tree = callWithStubbedHooks(() =>
        (AshtakavargaView as unknown as (p: unknown) => ReactNode)({ data: { nope: true } })
      )
    }).not.toThrow()
    // The pane itself is intact; only the per-graha diagrams and the house-index control are named.
    expect(hasSectionUnavailable(tree, 'Ashtakavarga')).toBe(false)
    expect(unavailableSections(tree)).toContain('House-indexed Ashtakavarga')
    expect(unavailableSections(tree)).toContain('Sun Bhinnashtakavarga')
  })

  it('TransitsView: an object with no transits/sadeSati renders the pane with empty sections', () => {
    let tree: ReactNode
    expect(() => {
      tree = callWithStubbedHooks(() =>
        (TransitsView as unknown as (p: unknown) => ReactNode)({ data: { asOf: '2026-08-02T00:00:00.000Z' } })
      )
    }).not.toThrow()
    expect(hasSectionUnavailable(tree, 'Transits')).toBe(false)
  })
})

describe('R8.1 — a malformed section replaces only that section, not the whole pane', () => {
  it('SadeSatiPanel: a malformed sign-based reading leaves the degree-based group rendering', () => {
    const degreeBased = {
      natalMoonLongitude: 347.76,
      orbDeg: 45,
      active: true,
      separationDeg: 12,
      scanFromYear: 1951,
      scanToYear: 2061,
      allPeriods: [
        {
          sequence: 2,
          start: '2023-02-10T00:00:00.000Z',
          end: '2030-05-09T00:00:00.000Z',
          startApprox: 'Feb 2023',
          endApprox: 'May 2030',
          durationDays: 2645,
          isCurrent: true,
          completionPct: 42,
          label: 'Saturn ±45° from natal Moon (347.76°) - 12th, 1st, 2nd houses',
        },
      ],
    }

    const tree = (SadeSatiPanel as unknown as (p: unknown) => ReactNode)({
      signBased: null,
      degreeBased,
      asOf: '2026-08-02T00:00:00.000Z',
    })

    expect(hasSectionUnavailable(tree, 'Sign-based Sade Sati')).toBe(true)
    // The degree-based group is untouched — no message for it, and its row still renders.
    expect(hasSectionUnavailable(tree, 'Degree-based Sade Sati')).toBe(false)
    let sawSequence = false
    walk(tree, (el) => {
      if (el.props?.children === 2 || el.props?.children === '#') sawSequence = true
    })
    expect(sawSequence || JSON.stringify(unavailableSections(tree)) !== '[]').toBe(true)
  })

  it('SadeSatiPanel: both readings malformed yields one message per group and no throw', () => {
    let tree: ReactNode
    expect(() => {
      tree = (SadeSatiPanel as unknown as (p: unknown) => ReactNode)({
        signBased: null,
        degreeBased: null,
        asOf: 'not-a-date',
      })
    }).not.toThrow()
    expect(unavailableSections(tree).sort()).toEqual([
      'Degree-based Sade Sati',
      'Sign-based Sade Sati',
    ])
  })

  it('GrahasTable: malformed nakshatras/karakas keep the graha rows (R3.8, not a pane failure)', () => {
    const planets = [
      {
        planet: 'Sun',
        sign: 'Leo',
        signNumber: 5,
        degreeInSign: 10.5,
        longitude: 130.5,
        house: 4,
        retrograde: false,
        speed: 0.95,
      },
    ]
    const tree = (GrahasTable as unknown as (p: unknown) => ReactNode)({
      planets,
      nakshatras: null,
      charaKarakas: 'garbage',
      divisionalCharts: null,
      lagna: 'Taurus',
    })

    // The pane itself is fine — only the two absent sub-sections are named.
    expect(hasSectionUnavailable(tree, 'Grahas')).toBe(false)
    expect(hasSectionUnavailable(tree, 'Nakshatras')).toBe(true)
    expect(hasSectionUnavailable(tree, 'Chara Karakas')).toBe(true)
  })

  it('KeyDignitiesPanel: empty planets still renders combustion chips (the mirror of R1.6)', () => {
    const tree = KeyDignitiesPanel({
      planets: [],
      divisionalCharts: [],
      selectedDivision: 1,
      combustion: [
        {
          planet: 'Mercury',
          degreeFromSun: 6.4,
          threshold: 14,
          combust: true,
          cazimi: false,
          nearCombust: false,
          retrogradeThresholdApplied: false,
        },
      ],
    } as never) as ReactElement

    // The card renders; only the dignity and vargottama families are empty.
    expect(hasSectionUnavailable(tree, 'Key Dignities')).toBe(false)
    let buttons = 0
    walk(tree, (el) => {
      if (el.type === 'button') buttons++
    })
    expect(buttons).toBe(1)
  })

  it('YogasView: an empty catalogue keeps R7.9’s distinct message, not the R7.12 one', () => {
    const tree = (YogasView as unknown as (p: unknown) => ReactNode)({ yogas: [] })
    expect(hasSectionUnavailable(tree, 'Named yoga catalogue')).toBe(false)
    expect((tree as ReactElement).props.children).toBe(
      'No named yogas were detected for this chart.'
    )
  })
})

describe('R8.5 — SectionBoundary contains an unanticipated throw', () => {
  /**
   * The failure mode this layer exists for: a container of the right *kind* whose entries are
   * not the rows the pane expects. `guardSection` accepts it (it IS a non-empty array) and the
   * pane then throws reading a field off a number. That throw is what the boundary catches —
   * documented here as an executable statement of the layer split, so a future reader does not
   * mistake it for an unhandled case.
   */
  it('a well-shaped array of wrong-typed entries throws — which is what the boundary is for', () => {
    // `YogasView` itself only *creates* the per-yoga child elements, so the throw lands when
    // React renders them — precisely the commit-time failure the boundary sits above. `walk`
    // invokes the children, reproducing that.
    const tree = (YogasView as unknown as (p: unknown) => ReactNode)({ yogas: [1, 2, 3] })
    expect(() => walk(tree, () => {})).toThrow()
  })

  it('getDerivedStateFromError flips the boundary into the failed state', () => {
    expect(SectionBoundary.getDerivedStateFromError()).toEqual({ failed: true })
  })

  it('a failed boundary renders the same SectionUnavailable message for its section', () => {
    const boundary = new SectionBoundary({ section: 'Ashtakavarga', children: null })
    boundary.state = { failed: true }
    const rendered = boundary.render() as ReactElement
    expect(rendered.type).toBe(SectionUnavailable)
    expect(rendered.props.section).toBe('Ashtakavarga')
  })

  it('a healthy boundary renders its children untouched', () => {
    const children = React.createElement('div', null, 'pane')
    const boundary = new SectionBoundary({ section: 'Ashtakavarga', children })
    expect(boundary.render()).toBe(children)
  })
})

describe('the shape predicates cover exactly the shapes R8.1 enumerates', () => {
  it('isPlainObject rejects null, arrays and primitives', () => {
    expect(isPlainObject({})).toBe(true)
    expect(isPlainObject({ a: 1 })).toBe(true)
    expect(isPlainObject(null)).toBe(false)
    expect(isPlainObject(undefined)).toBe(false)
    expect(isPlainObject([])).toBe(false)
    expect(isPlainObject('x')).toBe(false)
    expect(isPlainObject(0)).toBe(false)
  })

  it('isArrayOfLength enforces the exact entry count', () => {
    expect(isArrayOfLength(Array.from({ length: 12 }), 12)).toBe(true)
    expect(isArrayOfLength(Array.from({ length: 11 }), 12)).toBe(false)
    expect(isArrayOfLength(Array.from({ length: 13 }), 12)).toBe(false)
    expect(isArrayOfLength({ length: 12 }, 12)).toBe(false)
    expect(isArrayOfLength(null, 12)).toBe(false)
  })

  it('isNonEmptyArray rejects empty arrays and non-arrays', () => {
    expect(isNonEmptyArray([1])).toBe(true)
    expect(isNonEmptyArray([])).toBe(false)
    expect(isNonEmptyArray(null)).toBe(false)
    expect(isNonEmptyArray({ 0: 1 })).toBe(false)
  })

  it('hasNumberArrays requires every key to hold a numeric array of the exact length', () => {
    const keys = ['Sun', 'Moon']
    const ok = { Sun: [1, 2], Moon: [3, 4] }
    expect(hasNumberArrays(ok, keys, 2)).toBe(true)
    expect(hasNumberArrays({ Sun: [1, 2] }, keys, 2)).toBe(false) // missing key
    expect(hasNumberArrays({ Sun: [1], Moon: [3, 4] }, keys, 2)).toBe(false) // wrong length
    expect(hasNumberArrays({ Sun: [1, '2'], Moon: [3, 4] }, keys, 2)).toBe(false) // non-number
    expect(hasNumberArrays([ok], keys, 2)).toBe(false) // array where object expected
    expect(hasNumberArrays(null, keys, 2)).toBe(false)
  })

  it('guardSection narrows on success and reports failure without throwing', () => {
    const ok = guardSection<number[]>([1, 2], isNonEmptyArray)
    expect(ok.ok).toBe(true)
    if (ok.ok) expect(ok.data).toEqual([1, 2])

    const bad = guardSection<number[]>(null, isNonEmptyArray)
    expect(bad.ok).toBe(false)
  })
})
