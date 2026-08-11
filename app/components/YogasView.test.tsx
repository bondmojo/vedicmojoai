/**
 * app/components/YogasView.test.tsx
 * -----------------------------------
 * Unit test for the two distinct yoga messages (R7.9 vs R7.12).
 *
 * The repo has no DOM environment or component-testing library installed (no `jsdom`, no
 * `@testing-library/react` — see design.md's Testing Strategy, "Runner and libraries actually in
 * the repo"), and adding one is explicitly out of scope for this feature. `YogasView` and
 * `SectionUnavailable` are both plain function components with no hooks on the paths exercised
 * here, so they are called directly as functions and the returned React element tree is inspected
 * structurally — no `render()`, no DOM, no new dependency.
 *
 * _Design: Components and Interfaces — "R7 — `YogasView`" (message table)_
 * _Requirements: 7.9, 7.12_
 */

import { describe, expect, it } from 'vitest'
import type { ReactElement, ReactNode } from 'react'
import YogasView from './YogasView'
import { SectionUnavailable } from './SectionUnavailable'

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

describe('YogasView — the two distinct yoga messages (R7.9, R7.12)', () => {
  it('renders the absent-catalogue SectionUnavailable message when yogas is undefined', () => {
    const element = YogasView({ yogas: undefined }) as ReactElement

    // R7.12: absent -> <SectionUnavailable section="Named yoga catalogue" />
    expect(element.type).toBe(SectionUnavailable)
    expect(element.props.section).toBe('Named yoga catalogue')

    // Render SectionUnavailable itself (also a plain function component, no hooks) to reach the
    // actual text it produces: "{section} data is unavailable for this chart." (role="status").
    const inner = (element.type as (props: typeof element.props) => ReactElement)(element.props)
    expect(inner.props.role).toBe('status')

    const text = textOf(inner)
    expect(text).toContain('Named yoga catalogue')
    expect(text).toContain('data is unavailable for this chart.')
    expect(text).toBe('Named yoga catalogue data is unavailable for this chart.')
  })

  it('renders the empty-catalogue message when yogas is an empty array', () => {
    const element = YogasView({ yogas: [] }) as ReactElement

    // R7.9: present and empty -> plain text "No named yogas were detected for this chart."
    expect(element.type).toBe('p')
    const text = textOf(element)
    expect(text).toBe('No named yogas were detected for this chart.')
  })

  it('renders two textually distinct messages for the absent vs empty conditions', () => {
    const absentElement = YogasView({ yogas: undefined }) as ReactElement
    const absentInner = (absentElement.type as (props: typeof absentElement.props) => ReactElement)(
      absentElement.props
    )
    const absentText = textOf(absentInner)

    const emptyElement = YogasView({ yogas: [] }) as ReactElement
    const emptyText = textOf(emptyElement)

    expect(absentText).not.toBe(emptyText)
    expect(absentText).toBe('Named yoga catalogue data is unavailable for this chart.')
    expect(emptyText).toBe('No named yogas were detected for this chart.')
  })
})
