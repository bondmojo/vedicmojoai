/**
 * app/components/SadeSatiPanel.test.tsx
 * -----------------------------------
 * Unit tests for SadeSatiPanel's divergence line, the absent-`degreeBased` fallback, and the
 * birth-year exclusion filter applied to both groups (R6.19, R6.20, R6.21).
 *
 * The repo has no DOM environment or component-testing library installed (no `jsdom`, no
 * `@testing-library/react` — see design.md's Testing Strategy, "Runner and libraries actually in
 * the repo"), and adding one is explicitly out of scope for this feature. Following the same
 * pattern already established for `YogasView.test.tsx` (task 18.4) and `GrahasTable.test.tsx`
 * (task 15.3): `SadeSatiPanel` is a plain function component with no hooks, so it is called
 * directly as a function and the returned React element tree is inspected structurally — no
 * `render()`, no DOM, no new dependency.
 *
 * `vitest.config.ts` sets `esbuild.jsx: 'automatic'` so this call-as-function approach works for
 * component modules (like `SadeSatiPanel.tsx`) that rely on the automatic JSX runtime and never
 * `import React` themselves.
 *
 * _Design: Testing Strategy — "Divergence line", "Birth-year exclusion (R6.21)"_
 * _Requirements: 6.19, 6.20, 6.21_
 */

import { describe, expect, it } from 'vitest'
import type { ReactElement, ReactNode } from 'react'
import SadeSatiPanel from './SadeSatiPanel'
import { SectionUnavailable } from './SectionUnavailable'
import type {
  SadeSatiInfo,
  SadeSatiPeriod,
  DegreeSadeSatiInfo,
  DegreeSadeSatiPeriod,
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
 * An element whose `type` is a plain function component (e.g. `SadeSatiPanel`'s internal
 * `SignBasedRow`/`DegreeBasedRow`/`CurrentBadge`, or `SectionUnavailable`) is additionally
 * expanded by invoking it with its own props — mirroring `YogasView.test.tsx`'s and
 * `GrahasTable.test.tsx`'s approach of calling components directly as functions — so nested
 * native DOM elements are reachable. None of the function components reached this way carry
 * hooks, so calling them directly is safe.
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

/** True when a SectionUnavailable element for `section` appears anywhere in the tree. */
function hasSectionUnavailable(root: ReactNode, section: string): boolean {
  let found = false
  walk(root, (el) => {
    if (el.type === SectionUnavailable && el.props.section === section) found = true
  })
  return found
}

/**
 * Like `textOf`, but expands function-component nodes (e.g. `SignBasedRow`, `DegreeBasedRow`,
 * `CurrentBadge`) via `walk`'s same call-as-function approach, so text nested inside
 * `SadeSatiPanel`'s internal row components is reachable too.
 */
function deepTextOf(root: ReactNode): string {
  const parts: string[] = []
  walk(root, (el) => {
    const children = el.props?.children
    if (typeof children === 'string' || typeof children === 'number') {
      parts.push(String(children))
    } else if (Array.isArray(children)) {
      children.forEach((c) => {
        if (typeof c === 'string' || typeof c === 'number') parts.push(String(c))
      })
    }
  })
  return parts.join('')
}

/**
 * Returns the divergence line's text (the amber-bordered box rendered when the two readings
 * disagree on `active`), or `null` when it is absent.
 */
function findDivergenceText(root: ReactNode): string | null {
  let found: string | null = null
  walk(root, (el) => {
    if (
      el.type === 'div' &&
      typeof el.props?.className === 'string' &&
      el.props.className.includes('amber-700')
    ) {
      found = textOf(el)
    }
  })
  return found
}

// ─── Fixtures ──────────────────────────────────────────────────────────

function makeSignPeriod(overrides: Partial<SadeSatiPeriod> = {}): SadeSatiPeriod {
  return {
    phase: 'peak',
    phaseSign: 'Capricorn',
    startApprox: 'Jan 2020',
    endApprox: 'Jan 2023',
    isCurrent: false,
    ...overrides,
  }
}

function makeSignBased(overrides: Partial<SadeSatiInfo> = {}): SadeSatiInfo {
  return {
    active: true,
    phase: 'peak',
    saturnSignNumber: 10,
    natalMoonSignNumber: 11,
    description: 'test description',
    allPeriods: [makeSignPeriod()],
    ...overrides,
  }
}

function makeDegreePeriod(overrides: Partial<DegreeSadeSatiPeriod> = {}): DegreeSadeSatiPeriod {
  return {
    sequence: 1,
    start: '2020-01-01T00:00:00Z',
    end: '2023-01-01T00:00:00Z',
    startApprox: 'Jan 2020',
    endApprox: 'Jan 2023',
    durationDays: 1096,
    isCurrent: false,
    label: 'Saturn ±45° from natal Moon (10.00°) - 12th, 1st, 2nd houses',
    ...overrides,
  }
}

function makeDegreeBased(overrides: Partial<DegreeSadeSatiInfo> = {}): DegreeSadeSatiInfo {
  return {
    natalMoonLongitude: 10,
    orbDeg: 45,
    active: true,
    separationDeg: 5,
    scanFromYear: 1957,
    scanToYear: 2060,
    allPeriods: [makeDegreePeriod()],
    ...overrides,
  }
}

const ASOF = '2024-01-01T00:00:00Z'

// ─── Divergence line (R6.19) ────────────────────────────────────────────

describe('SadeSatiPanel — divergence line (R6.19)', () => {
  it('renders no divergence line when both readings agree the period is active', () => {
    const el = SadeSatiPanel({
      signBased: makeSignBased({ active: true, phase: 'peak' }),
      degreeBased: makeDegreeBased({ active: true }),
      asOf: ASOF,
    }) as ReactElement

    expect(findDivergenceText(el)).toBeNull()
  })

  it('renders no divergence line when both readings agree the period is inactive', () => {
    const el = SadeSatiPanel({
      signBased: makeSignBased({ active: false, phase: null }),
      degreeBased: makeDegreeBased({ active: false }),
      asOf: ASOF,
    }) as ReactElement

    expect(findDivergenceText(el)).toBeNull()
  })

  it('names the sign-based reading (and its phase) when sign-based is active but degree-based is not', () => {
    const el = SadeSatiPanel({
      signBased: makeSignBased({ active: true, phase: 'rising' }),
      degreeBased: makeDegreeBased({ active: false }),
      asOf: ASOF,
    }) as ReactElement

    expect(findDivergenceText(el)).toBe(
      'Readings disagree: the sign-based reading reports Sade Sati running (rising phase); the degree-based reading does not.'
    )
  })

  it('names the degree-based reading when degree-based is active but sign-based is not', () => {
    const el = SadeSatiPanel({
      signBased: makeSignBased({ active: false, phase: null }),
      degreeBased: makeDegreeBased({ active: true }),
      asOf: ASOF,
    }) as ReactElement

    expect(findDivergenceText(el)).toBe(
      'Readings disagree: the degree-based reading reports Sade Sati running; the sign-based reading does not.'
    )
  })
})

// ─── Absent degreeBased (R6.20) ─────────────────────────────────────────

describe('SadeSatiPanel — absent degreeBased (R6.20)', () => {
  it('renders SectionUnavailable for the degree-based group and leaves the sign-based group unaffected', () => {
    const el = SadeSatiPanel({
      signBased: makeSignBased({ allPeriods: [makeSignPeriod({ phaseSign: 'Capricorn' })] }),
      degreeBased: undefined,
      asOf: ASOF,
    }) as ReactElement

    expect(hasSectionUnavailable(el, 'Degree-based Sade Sati')).toBe(true)

    // Sign-based group renders unaffected — its row content is still present.
    expect(deepTextOf(el)).toContain('Capricorn')
  })
})

// ─── Birth-year exclusion (R6.21) ───────────────────────────────────────

describe('SadeSatiPanel — birth-year exclusion, sign-based group (R6.21)', () => {
  it('excludes a period ending in birthYear - 1, retains one ending in birthYear, and retains one spanning birth', () => {
    const periods: SadeSatiPeriod[] = [
      makeSignPeriod({ startApprox: 'Jan 1985', endApprox: 'Dec 1989', phaseSign: 'ExcludedSign' }),
      makeSignPeriod({ startApprox: 'Dec 1989', endApprox: 'Jan 1990', phaseSign: 'RetainedExactSign' }),
      makeSignPeriod({ startApprox: 'Jun 1985', endApprox: 'Jun 1995', phaseSign: 'SpanningSign' }),
    ]

    const el = SadeSatiPanel({
      signBased: makeSignBased({ allPeriods: periods }),
      degreeBased: undefined,
      asOf: ASOF,
      birthDate: '1990-06-15',
    }) as ReactElement

    const text = deepTextOf(el)
    expect(text).not.toContain('ExcludedSign')
    expect(text).toContain('RetainedExactSign')
    expect(text).toContain('SpanningSign')
  })
})

describe('SadeSatiPanel — birth-year exclusion, degree-based group (R6.21)', () => {
  it('excludes a period whose end falls in birthYear - 1, retains one ending at/after birthYear, and retains one spanning birth', () => {
    const periods: DegreeSadeSatiPeriod[] = [
      makeDegreePeriod({ sequence: 1, end: '1989-12-31T23:59:59Z', label: 'ExcludedLabel' }),
      makeDegreePeriod({ sequence: 2, end: '1990-01-01T00:00:00Z', label: 'RetainedExactLabel' }),
      makeDegreePeriod({
        sequence: 3,
        start: '1985-01-01T00:00:00Z',
        end: '1995-01-01T00:00:00Z',
        label: 'SpanningLabel',
      }),
    ]

    const el = SadeSatiPanel({
      signBased: makeSignBased(),
      degreeBased: makeDegreeBased({ allPeriods: periods }),
      asOf: ASOF,
      birthDate: '1990-06-15',
    }) as ReactElement

    const text = deepTextOf(el)
    expect(text).not.toContain('ExcludedLabel')
    expect(text).toContain('RetainedExactLabel')
    expect(text).toContain('SpanningLabel')
  })
})
