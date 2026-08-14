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

import TransitsView from './TransitsView'
import GocharRangeTable from './GocharRangeTable'

const REACT_INTERNALS = (React as unknown as {
  __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED: {
    ReactCurrentDispatcher: { current: unknown }
  }
}).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED

const SOURCE = {
  kind: 'unsaved' as const,
  birthData: { date: '1990-04-27', time: '12:00', timezone: 5.5, latitude: 28.6, longitude: 77.2 },
}

const DATA = {
  asOf: '2024-05-14T08:00:00.000Z',
  transits: [],
  sadeSati: { active: false, phase: null, saturnSignNumber: 1, natalMoonSignNumber: 1, description: '', allPeriods: [] },
  ashtamaShani: false,
  kantakaShani: false,
  currentMoonSign: 'Taurus',
  natalMoonSign: 'Aries',
  moonTransitSameAsNatal: false,
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
        useCallback: (callback: unknown) => callback,
      }
      try {
        return TransitsView({ data: DATA, gocharSource: SOURCE })
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

function findAll(root: ReactNode, predicate: (element: ReactElement) => boolean): ReactElement[] {
  const found: ReactElement[] = []
  walk(root, (element) => {
    if (predicate(element)) found.push(element)
  })
  return found
}

function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  return textOf((node as ReactElement).props.children)
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

describe('TransitsView — Gochar date range form', () => {
  it('defaults Moon off, labels both span tiers, and retains selected values after an error', () => {
    const harness = createComponentHarness()
    let tree = harness.render()
    const from = findOne(tree, (element) => element.props.id === 'gochar-date-from')
    const to = findOne(tree, (element) => element.props.id === 'gochar-date-to')
    const moon = findOne(tree, (element) => element.props.id === 'gochar-include-moon')

    expect(moon.props.checked).toBe(false)
    expect(textOf(tree)).toContain('1 year instead of 3 years')
    expect(from.props.value).toBe('2024-05-14')
    expect(to.props.value).toBe('2024-05-14')

    from.props.onChange({ target: { value: '2024-06-01' } })
    to.props.onChange({ target: { value: '2024-06-30' } })
    moon.props.onChange({ target: { checked: true } })
    gocharHook.value.error = 'Requested span exceeds the limit.'
    tree = harness.render()

    expect(findOne(tree, (element) => element.props.id === 'gochar-date-from').props.value).toBe('2024-06-01')
    expect(findOne(tree, (element) => element.props.id === 'gochar-date-to').props.value).toBe('2024-06-30')
    expect(findOne(tree, (element) => element.props.id === 'gochar-include-moon').props.checked).toBe(true)
    expect(textOf(tree)).toContain('Requested span exceeds the limit.')

    // A bare dateTo response is normalized by the API to the following UTC
    // midnight. The controlled calendar input must keep the date selected by
    // the practitioner rather than adopting that exclusive echo.
    gocharHook.value.result = {
      rangeStart: '2024-06-01T00:00:00.000Z',
      rangeEnd: '2024-07-01T00:00:00.000Z',
      dateFrom: '2024-06-01T00:00:00.000Z',
      dateTo: '2024-07-01T00:00:00.000Z',
      ayanamsa: 'Lahiri',
      includedGrahas: ['Sun'],
      moonIncluded: false,
      intervals: [],
    } as never
    tree = harness.render()
    expect(findOne(tree, (element) => element.props.id === 'gochar-date-to').props.value).toBe('2024-06-30')
  })

  it('disables submission while loading and forwards the currently selected calendar dates unchanged', () => {
    const harness = createComponentHarness()
    let tree = harness.render()
    const from = findOne(tree, (element) => element.props.id === 'gochar-date-from')
    const to = findOne(tree, (element) => element.props.id === 'gochar-date-to')
    from.props.onChange({ target: { value: '2024-07-01' } })
    to.props.onChange({ target: { value: '2024-07-31' } })
    tree = harness.render()

    const form = findOne(tree, (element) => element.type === 'form')
    form.props.onSubmit({ preventDefault: vi.fn() })
    expect(gocharHook.value.request).toHaveBeenCalledWith({ dateFrom: '2024-07-01', dateTo: '2024-07-31', includeMoon: false })

    gocharHook.value.loading = true
    tree = harness.render()
    const button = findOne(tree, (element) => element.type === 'button' && textOf(element) === 'Loading Gochar…')
    expect(button.props.disabled).toBe(true)
  })

  it('mounts the shared interval table with its narrow-viewport overflow wrapper', () => {
    gocharHook.value.result = {
      rangeStart: '2024-05-14T00:00:00.000Z',
      rangeEnd: '2024-05-15T00:00:00.000Z',
      dateFrom: '2024-05-14T00:00:00.000Z',
      dateTo: '2024-05-15T00:00:00.000Z',
      ayanamsa: 'Lahiri',
      includedGrahas: ['Sun'],
      moonIncluded: false,
      intervals: [],
    } as never
    const tree = createComponentHarness().render()
    const table = findOne(tree, (element) => element.type === GocharRangeTable)
    const tableTree = GocharRangeTable(table.props)

    expect(findAll(tableTree, (element) => element.type === 'div' && String(element.props.className).includes('overflow-x-auto'))).toHaveLength(1)
  })
})
