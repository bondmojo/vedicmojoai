import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import type { ReactElement, ReactNode } from 'react'

const gocharHook = vi.hoisted(() => ({
  value: {
    result: null,
    error: null as string | null,
    loading: false,
    request: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn(),
  },
}))

vi.mock('./useGocharRange', () => ({
  useGocharRange: () => gocharHook.value,
}))

import DashaTimeline from './DashaTimeline'

const REACT_INTERNALS = (React as unknown as {
  __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED: {
    ReactCurrentDispatcher: { current: unknown }
  }
}).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED

const SOURCE = {
  kind: 'unsaved' as const,
  birthData: { date: '1990-04-27', time: '12:00', timezone: 5.5, latitude: 28.6, longitude: 77.2 },
}

const FIRST_PD = {
  lord: 'Sun',
  start: '2024-01-01T12:34:56.000Z',
  end: '2024-02-02T03:04:05.000Z',
  duration_days: 31.6,
}
const SECOND_PD = {
  lord: 'Moon',
  start: '2024-02-02T03:04:05.000Z',
  end: '2024-03-01T23:59:59.000Z',
  duration_days: 28.9,
}

const DASHA_TREE = {
  balance_years: 12.5,
  mahadashas: [{
    lord: 'Saturn',
    start: '2024-01-01T00:00:00.000Z',
    end: '2024-12-31T00:00:00.000Z',
    duration_days: 365,
    antardashas: [{
      lord: 'Mercury',
      start: '2024-01-01T00:00:00.000Z',
      end: '2024-12-31T00:00:00.000Z',
      duration_days: 365,
      pratyantardashas: [FIRST_PD, SECOND_PD],
    }],
  }],
}

function createComponentHarness() {
  const states: unknown[] = []
  const refs: Array<{ current: unknown }> = []
  return {
    render(): ReactElement {
      const dispatcher = REACT_INTERNALS.ReactCurrentDispatcher
      const previous = dispatcher.current
      let stateIndex = 0
      let refIndex = 0
      dispatcher.current = {
        useState: (initial: unknown) => {
          const index = stateIndex++
          if (!(index in states)) states[index] = typeof initial === 'function' ? (initial as () => unknown)() : initial
          return [states[index], (next: unknown) => {
            states[index] = typeof next === 'function' ? (next as (previous: unknown) => unknown)(states[index]) : next
          }]
        },
        useRef: (initial: unknown) => {
          const index = refIndex++
          if (!refs[index]) refs[index] = { current: initial }
          return refs[index]
        },
        useEffect: () => {},
        useCallback: (callback: unknown) => callback,
      }
      try {
        return DashaTimeline({ dashaTree: DASHA_TREE, gocharSource: SOURCE })
      } finally {
        dispatcher.current = previous
      }
    },
  }
}

function walk(node: ReactNode, visit: (element: ReactElement) => void): void {
  if (node === null || node === undefined || typeof node === 'boolean' || typeof node === 'string' || typeof node === 'number') return
  if (Array.isArray(node)) return node.forEach((child) => walk(child, visit))
  const element = node as ReactElement
  visit(element)
  walk(element.props.children, visit)
}

function findOne(root: ReactNode, predicate: (element: ReactElement) => boolean): ReactElement {
  let found: ReactElement | undefined
  walk(root, (element) => {
    if (!found && predicate(element)) found = element
  })
  if (!found) throw new Error('Expected element not found')
  return found
}

function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  return textOf((node as ReactElement).props.children)
}

function renderExpandedPDs(harness: ReturnType<typeof createComponentHarness>): ReactElement {
  let tree = harness.render()
  findOne(tree, (element) => element.type === 'button' && textOf(element).includes('Saturn Mahadasha')).props.onClick()
  tree = harness.render()
  findOne(tree, (element) => element.type === 'button' && textOf(element).includes('Saturn-Mercury')).props.onClick()
  return harness.render()
}

beforeEach(() => {
  gocharHook.value = {
    result: null,
    error: null,
    loading: false,
    request: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn(),
  }
})

describe('DashaTimeline — PD Gochar', () => {
  it('uses a focusable action and forwards the PD exact ISO UTC bounds with Moon off', () => {
    const harness = createComponentHarness()
    let tree = renderExpandedPDs(harness)
    const action = findOne(tree, (element) => element.type === 'button' && element.props['aria-label'] === 'View Gochar for Saturn-Mercury-Sun')

    expect(action.props.type).toBe('button')
    expect(action.props['aria-expanded']).toBe(false)
    action.props.onClick()

    expect(gocharHook.value.request).toHaveBeenCalledWith({
      dateFrom: FIRST_PD.start,
      dateTo: FIRST_PD.end,
      includeMoon: false,
    })

    tree = harness.render()
    expect(findOne(tree, (element) => element.props['aria-label'] === 'Gochar for Saturn-Mercury-Sun').props.children).toBeTruthy()
    expect(textOf(tree)).toContain(FIRST_PD.start)
    expect(textOf(tree)).toContain(FIRST_PD.end)
    expect(findOne(tree, (element) => element.props.id === 'pd-gochar-moon-0-0-0').props.checked).toBe(false)
  })

  it('keeps one PD expansion, resets its local Moon choice, and allows a failed request to retry', () => {
    const harness = createComponentHarness()
    let tree = renderExpandedPDs(harness)
    const first = findOne(tree, (element) => element.props['aria-label'] === 'View Gochar for Saturn-Mercury-Sun')
    first.props.onClick()
    tree = harness.render()

    const firstMoon = findOne(tree, (element) => element.props.id === 'pd-gochar-moon-0-0-0')
    firstMoon.props.onChange({ target: { checked: true } })
    expect(gocharHook.value.request).toHaveBeenLastCalledWith({
      dateFrom: FIRST_PD.start,
      dateTo: FIRST_PD.end,
      includeMoon: true,
    })

    tree = harness.render()
    const second = findOne(tree, (element) => element.props['aria-label'] === 'View Gochar for Saturn-Mercury-Moon')
    second.props.onClick()
    tree = harness.render()

    expect(findOne(tree, (element) => element.props['aria-label'] === 'View Gochar for Saturn-Mercury-Sun').props['aria-expanded']).toBe(false)
    expect(findOne(tree, (element) => element.props['aria-label'] === 'View Gochar for Saturn-Mercury-Moon').props['aria-expanded']).toBe(true)
    expect(findOne(tree, (element) => element.props.id === 'pd-gochar-moon-0-0-1').props.checked).toBe(false)
    expect(gocharHook.value.request).toHaveBeenLastCalledWith({
      dateFrom: SECOND_PD.start,
      dateTo: SECOND_PD.end,
      includeMoon: false,
    })

    gocharHook.value.error = 'Gochar range could not be loaded.'
    tree = harness.render()
    const retry = findOne(tree, (element) => element.type === 'button' && element.props.children === 'Retry Gochar')
    retry.props.onClick()

    expect(findOne(tree, (element) => element.props['aria-label'] === 'View Gochar for Saturn-Mercury-Moon').props['aria-expanded']).toBe(true)
    expect(gocharHook.value.request).toHaveBeenLastCalledWith({
      dateFrom: SECOND_PD.start,
      dateTo: SECOND_PD.end,
      includeMoon: false,
    })
  })
})
