/**
 * app/components/KeyDignitiesPanel.test.tsx
 * -------------------------------------------
 * Unit tests for combustion chip label assembly — the six distinguishable
 * combustion entry states, cazimi's favourable-styling precedence over
 * ordinary combust styling, and the Moon's `moonStrictCombust` marker
 * (R1.1, R1.2, R1.3, R1.5, R1.9).
 *
 * Same "call the component directly, inspect the returned element tree"
 * pattern established by `YogasView.test.tsx` and `GrahasTable.test.tsx` for
 * this spec: no DOM, no `@testing-library/react`, no `jsdom` (none
 * installed — design.md's Testing Strategy, "Runner and libraries actually
 * in the repo"). `combustionChipParts`/`combustionChipClass` are
 * module-private, so they are exercised indirectly through
 * `KeyDignitiesPanel`'s rendered chip tree (approach (a) from the task),
 * which is also the black-box style the sibling test files use.
 *
 * `roundHalfAwayFromZero1` (task 14.4) and chip ordering with equal
 * separations (task 14.5) are deliberately NOT covered here — they are
 * separate tasks in the same file, dispatched independently.
 *
 * _Design: Testing Strategy — Example-based unit tests_
 * _Requirements: 1.1, 1.2, 1.3, 1.5, 1.9_
 */

import { describe, expect, it } from 'vitest'
import type { ReactElement, ReactNode } from 'react'
import KeyDignitiesPanel from './KeyDignitiesPanel'
import type { CombustionResult, PlanetPosition, DivisionalChart } from '@/engine/compute/types'

/** Flattens a React node (string, number, element/fragment, or nested array) to its visible text. */
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
 * A function-typed element (e.g. `KeyDignitiesPanel`'s internal, non-exported `Chip`) is
 * additionally expanded by invoking it with its own props, mirroring the approach
 * `GrahasTable.test.tsx` uses for that module's internal `KarakaCell`. None of the function
 * components reached this way carry hooks, so calling them directly is safe.
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

/** Collects every element in the tree whose `type` matches `tag` (e.g. 'button', 'span'). */
function findAll(root: ReactNode, tag: string): ReactElement[] {
  const found: ReactElement[] = []
  walk(root, (el) => {
    if (el.type === tag) found.push(el)
  })
  return found
}

const BASE_PROPS: { planets: PlanetPosition[]; divisionalCharts: DivisionalChart[]; selectedDivision: number } = {
  planets: [],
  divisionalCharts: [],
  selectedDivision: 1,
}

/**
 * Renders `KeyDignitiesPanel` with a single combustion entry and returns its rendered
 * `<button>` chips. `planets`/`divisionalCharts` are deliberately empty: with no D1 planet
 * rows and no D1 divisional chart, `dignityChips` and `vargottamaChips` both resolve to
 * empty arrays, so any `<button>` found in the tree can only be the combustion chip under
 * test — isolating combustion assembly from the dignity/vargottama chip families.
 */
function chipButtonsFor(entry: CombustionResult): ReactElement[] {
  const el = KeyDignitiesPanel({ ...BASE_PROPS, combustion: [entry] }) as ReactElement
  return findAll(el, 'button')
}

// ─── Fixtures — the six distinguishable entry states from design.md's label-assembly table ──

const ORDINARY_COMBUST: CombustionResult = {
  planet: 'Mercury',
  degreeFromSun: 5.4,
  combust: true,
  cazimi: false,
  nearCombust: false,
  threshold: 8,
  retrogradeThresholdApplied: false,
}

const COMBUST_AND_CAZIMI: CombustionResult = {
  planet: 'Venus',
  degreeFromSun: 2.1,
  combust: true,
  cazimi: true,
  nearCombust: false,
  threshold: 8,
  retrogradeThresholdApplied: false,
}

const NEAR_COMBUST_ONLY: CombustionResult = {
  planet: 'Mars',
  degreeFromSun: 10.0,
  combust: false,
  cazimi: false,
  nearCombust: true,
  threshold: 8,
  retrogradeThresholdApplied: false,
}

const MOON_STRICT_WITH_COMBUST: CombustionResult = {
  planet: 'Moon',
  degreeFromSun: 6.0,
  combust: true,
  cazimi: false,
  nearCombust: false,
  threshold: 12,
  retrogradeThresholdApplied: false,
  moonStrictCombust: true,
}

const NO_FLAGS_NO_CHIP: CombustionResult = {
  planet: 'Jupiter',
  degreeFromSun: 20.0,
  combust: false,
  cazimi: false,
  nearCombust: false,
  threshold: 8,
  retrogradeThresholdApplied: false,
}

/**
 * Sixth distinguishable state: the three base flags are all false, but `moonStrictCombust`
 * alone is true — the Moon's strict-threshold marker firing with no other trigger. Per
 * design.md, this marker is "emitted under no other condition than moonStrictCombust ===
 * true", i.e. additive regardless of the other three flags.
 */
const MOON_STRICT_ALONE: CombustionResult = {
  planet: 'Moon',
  degreeFromSun: 6.0,
  combust: false,
  cazimi: false,
  nearCombust: false,
  threshold: 12,
  retrogradeThresholdApplied: false,
  moonStrictCombust: true,
}

describe('KeyDignitiesPanel — combustion chip label assembly (R1.1, R1.9)', () => {
  it('renders "Combust" for an ordinary combust entry, without "Cazimi" or "Near combust"', () => {
    const buttons = chipButtonsFor(ORDINARY_COMBUST)
    expect(buttons).toHaveLength(1)
    const text = textOf(buttons[0])
    expect(text).toContain('Combust')
    expect(text).not.toContain('Cazimi')
    expect(text).not.toContain('Near combust')
    expect(text).not.toContain('8° strict')
  })

  it('renders no chip at all when combust, cazimi and nearCombust are all false and moonStrictCombust is absent (R1.9)', () => {
    const buttons = chipButtonsFor(NO_FLAGS_NO_CHIP)
    expect(buttons).toHaveLength(0)
  })
})

describe('KeyDignitiesPanel — cazimi precedence over ordinary combust styling (R1.2)', () => {
  it('renders "Combust · Cazimi" and styles the chip with the favourable token family', () => {
    const buttons = chipButtonsFor(COMBUST_AND_CAZIMI)
    expect(buttons).toHaveLength(1)
    const [button] = buttons
    expect(textOf(button)).toContain('Combust · Cazimi')

    const className = button.props.className as string
    expect(className).toContain('favorable')
    expect(className).not.toContain('unfavorable')
  })

  it('styles an ordinary (non-cazimi) combust chip with the unfavourable token family, not favourable', () => {
    const buttons = chipButtonsFor(ORDINARY_COMBUST)
    const className = buttons[0].props.className as string
    expect(className).toContain('unfavorable')
  })
})

describe('KeyDignitiesPanel — near-combust never reads "Combust" alone (R1.3)', () => {
  it('renders "Near combust" and never the standalone capitalised word "Combust"', () => {
    const buttons = chipButtonsFor(NEAR_COMBUST_ONLY)
    expect(buttons).toHaveLength(1)
    const text = textOf(buttons[0])
    expect(text).toContain('Near combust')
    // "Near combust" itself contains the lowercase substring "combust" — assert the
    // standalone, capitalised "Combust" label never appears (case-sensitive check).
    expect(text).not.toMatch(/\bCombust\b/)
  })
})

describe("KeyDignitiesPanel — the Moon's moonStrictCombust marker (R1.5)", () => {
  it('adds "Combust (8° strict)" alongside the base Combust text when combined with an ordinary combust entry', () => {
    const buttons = chipButtonsFor(MOON_STRICT_WITH_COMBUST)
    expect(buttons).toHaveLength(1)
    const text = textOf(buttons[0])
    expect(text).toContain('Combust (8° strict)')
    expect(text).toContain('Combust') // the base state's text is still present
  })

  it('is the only condition that emits "Combust (8° strict)" — absent for an ordinary combust entry with no moonStrictCombust flag', () => {
    const buttons = chipButtonsFor(ORDINARY_COMBUST)
    expect(textOf(buttons[0])).not.toContain('8° strict')
  })

  it('still emits a chip (additive) when moonStrictCombust is true but combust, cazimi and nearCombust are all false', () => {
    // Per the implementation, combustionChipParts() pushes the "Combust (8° strict)"
    // fragment unconditionally whenever moonStrictCombust === true, regardless of whether
    // the if/else-if chain above it (combust&&cazimi / combust / nearCombust) matched
    // anything. So the parts array is non-empty here even though the three base flags are
    // all false, and R1.9's "no chip" rule — which requires moonStrictCombust to ALSO be
    // absent/false — does not apply. This is the additive behaviour design.md describes,
    // not a bug: the chip renders with ONLY the strict-threshold text, no "Combust" or
    // "Near combust" prefix.
    const buttons = chipButtonsFor(MOON_STRICT_ALONE)
    expect(buttons).toHaveLength(1)
    const text = textOf(buttons[0])
    expect(text).toContain('Combust (8° strict)')
    expect(text).not.toContain('Near combust')

    // Styling still follows the ordinary/unfavourable branch, since moonStrictCombust
    // also participates in combustionChipClass's `combust || moonStrictCombust` check.
    const className = buttons[0].props.className as string
    expect(className).toContain('unfavorable')
  })
})

// ─── Task 14.4 — roundHalfAwayFromZero1 (R1.4) ─────────────────────────
//
// `roundHalfAwayFromZero1` is module-private, exercised indirectly through
// `combustionSeparationText`'s `"{deg}° of {threshold}°"` assembly, the same
// black-box approach the rest of this file uses. Each fixture below carries
// `combust: true` so `combustionChipParts` yields at least one part and a
// chip actually renders (R1.9) — otherwise `combustionSeparationText`'s
// output would never reach the rendered tree. `threshold` is fixed at 8 for
// all four so the assertions are plain substring checks.

function combustFixture(degreeFromSun: number): CombustionResult {
  return {
    planet: 'Mercury',
    degreeFromSun,
    combust: true,
    cazimi: false,
    nearCombust: false,
    threshold: 8,
    retrogradeThresholdApplied: false,
  }
}

describe('KeyDignitiesPanel — roundHalfAwayFromZero1 via combustion separation text (R1.4)', () => {
  it('rounds 0 to "0.0"', () => {
    const buttons = chipButtonsFor(combustFixture(0))
    expect(buttons).toHaveLength(1)
    expect(textOf(buttons[0])).toContain('0.0° of 8°')
  })

  it('rounds 0.05 to "0.1"', () => {
    const buttons = chipButtonsFor(combustFixture(0.05))
    expect(buttons).toHaveLength(1)
    expect(textOf(buttons[0])).toContain('0.1° of 8°')
  })

  it('rounds 1.25 to "1.3" (half away from zero)', () => {
    const buttons = chipButtonsFor(combustFixture(1.25))
    expect(buttons).toHaveLength(1)
    expect(textOf(buttons[0])).toContain('1.3° of 8°')
  })

  it('rounds -1.25 to "-1.3" (half away from zero, negative)', () => {
    const buttons = chipButtonsFor(combustFixture(-1.25))
    expect(buttons).toHaveLength(1)
    expect(textOf(buttons[0])).toContain('-1.3° of 8°')
  })
})

// ─── Task 14.5 — chip ordering with equal degreeFromSun (R1.8) ─────────
//
// `combustionChips` sorts by ascending `degreeFromSun` using `Array.prototype.sort`,
// which is spec-guaranteed stable (ES2019+): entries that compare equal keep their
// original relative position from the input array. Both fixtures below share the
// same `degreeFromSun` (5.0) and both carry `combust: true` so each renders exactly
// one chip (R1.9) — isolating the ordering question from the "does it render at all"
// question already covered above.

const VENUS_EQUAL: CombustionResult = {
  planet: 'Venus',
  degreeFromSun: 5.0,
  combust: true,
  cazimi: false,
  nearCombust: false,
  threshold: 8,
  retrogradeThresholdApplied: false,
}

const MERCURY_EQUAL: CombustionResult = {
  planet: 'Mercury',
  degreeFromSun: 5.0,
  combust: true,
  cazimi: false,
  nearCombust: false,
  threshold: 8,
  retrogradeThresholdApplied: false,
}

/** Renders `KeyDignitiesPanel` with the given `combustion` array and returns its `<button>` chips. */
function chipButtonsForAll(combustion: CombustionResult[]): ReactElement[] {
  const el = KeyDignitiesPanel({ ...BASE_PROPS, combustion }) as ReactElement
  return findAll(el, 'button')
}

describe('KeyDignitiesPanel — chip ordering with equal degreeFromSun (R1.8)', () => {
  it('keeps source order (Venus before Mercury) when both share the same degreeFromSun', () => {
    const buttons = chipButtonsForAll([VENUS_EQUAL, MERCURY_EQUAL])
    expect(buttons).toHaveLength(2)
    expect(textOf(buttons[0])).toContain('Venus')
    expect(textOf(buttons[1])).toContain('Mercury')
  })

  it('flips to Mercury before Venus when the input order is reversed, proving order tracks input rather than an unrelated tiebreak', () => {
    const buttons = chipButtonsForAll([MERCURY_EQUAL, VENUS_EQUAL])
    expect(buttons).toHaveLength(2)
    expect(textOf(buttons[0])).toContain('Mercury')
    expect(textOf(buttons[1])).toContain('Venus')
  })
})
