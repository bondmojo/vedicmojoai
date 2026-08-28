/**
 * PlacePicker structural tests (Requirement 10.3).
 *
 * Vitest runs this project in Node and no DOM/component-testing library is installed. Like the
 * sibling component tests, this file calls the component as a function with a minimal React hook
 * dispatcher, then inspects the resulting React-element tree. Effects are registered rather than
 * committed; the fetch tests explicitly execute those real registered effects with fake timers.
 * That verifies the request contract without jsdom or a browser renderer.
 *
 * NOT COVERED HERE, DELIBERATELY: keyboard navigation (arrow keys to move the highlight, Enter to
 * select, Escape to dismiss — Requirement 4.10). It comes entirely from cmdk's own key handling on
 * a rendered, focused DOM, so there is nothing in this element tree to assert against and a test
 * built on a hand-rolled fake would only be asserting the fake. It is verified manually in the
 * browser against both call sites instead.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import type { ReactElement, ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Command, CommandGroup, CommandInput, CommandItem } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import PlacePicker, {
  formatPlaceSubtext,
  type PlacePickerProps,
  type SelectedPlace,
} from './PlacePicker'

const REACT_INTERNALS = (React as unknown as {
  __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED: {
    ReactCurrentDispatcher: { current: unknown }
  }
}).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED

const PLACE: SelectedPlace = {
  id: 'place-alandi',
  name: 'Alandi',
  kind: 'village',
  county: 'Khed',
  district: 'Pune',
  state: 'Maharashtra',
  latitude: 18.6772446,
  longitude: 73.8981129,
  label: 'Alandi, Khed, Maharashtra',
}

const DEFAULT_PROPS: PlacePickerProps = {
  value: null,
  onSelect: vi.fn(),
  onManualEntry: vi.fn(),
}

const INCLUDE_HAMLETS_STORAGE_KEY = 'vedicmojoai.place-picker.include-hamlets'

/** Hook indices used by `stateOverrides`, so the tests read as state names rather than numbers. */
const STATE = {
  open: 0,
  query: 1,
  results: 2,
  loading: 3,
  error: 4,
  queryTooShort: 5,
  truncated: 6,
  hamletsExcluded: 7,
  includeHamlets: 8,
  skipDebounce: 9,
} as const

interface RenderOptions {
  stateOverrides?: Record<number, unknown>
}

interface StateWrite {
  index: number
  next: unknown
}

interface StructuralRender {
  tree: ReactElement
  effects: Array<() => void | (() => void)>
  /** Every setState call made after render, in order — see `STATE` for the indices. */
  stateWrites: StateWrite[]
}

/**
 * Runs PlacePicker with first-render hook values. Its state calls are ordered per `STATE`.
 * Effects are captured so request behavior can be exercised explicitly without committing a DOM
 * render, and setState calls are recorded so a click handler's intent is observable without one.
 */
function renderPicker(
  props: PlacePickerProps = DEFAULT_PROPS,
  { stateOverrides = {} }: RenderOptions = {},
): StructuralRender {
  const dispatcher = REACT_INTERNALS.ReactCurrentDispatcher
  const previous = dispatcher.current
  const effects: Array<() => void | (() => void)> = []
  const stateWrites: StateWrite[] = []
  let stateIndex = 0

  dispatcher.current = {
    useState: (initial: unknown) => {
      const index = stateIndex++
      const value =
        index in stateOverrides
          ? stateOverrides[index]
          : typeof initial === 'function'
            ? (initial as () => unknown)()
            : initial
      return [value, (next: unknown) => stateWrites.push({ index, next })]
    },
    useId: () => 'place-picker-list',
    useEffect: (effect: () => void | (() => void)) => {
      effects.push(effect)
    },
  }

  try {
    return { tree: PlacePicker(props) as ReactElement, effects, stateWrites }
  } finally {
    dispatcher.current = previous
  }
}

function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (typeof node === 'object' && 'props' in (node as ReactElement)) {
    return textOf((node as ReactElement).props?.children)
  }
  return ''
}

function walk(node: ReactNode, visit: (element: ReactElement) => void): void {
  if (node === null || node === undefined || typeof node === 'boolean') return
  if (typeof node === 'string' || typeof node === 'number') return
  if (Array.isArray(node)) {
    node.forEach((child) => walk(child, visit))
    return
  }
  if (typeof node === 'object' && 'props' in (node as ReactElement)) {
    const element = node as ReactElement
    visit(element)
    walk(element.props?.children, visit)
  }
}

function findAll(root: ReactNode, type: unknown): ReactElement[] {
  const elements: ReactElement[] = []
  walk(root, (element) => {
    if (element.type === type) elements.push(element)
  })
  return elements
}

function findOne(root: ReactNode, type: unknown): ReactElement {
  const [element] = findAll(root, type)
  expect(element).toBeDefined()
  return element
}

/** Run every registered effect and retain only cleanup functions (the search effect's cleanup). */
function runEffects(effects: StructuralRender['effects']): Array<() => void> {
  return effects
    .map((effect) => effect())
    .filter((cleanup): cleanup is () => void => typeof cleanup === 'function')
}

/** The dropdown footer stack — the only element carrying a top border. */
function footerOf(tree: ReactElement): ReactElement {
  const footer = findAll(tree, 'div').find(
    (element) =>
      typeof element.props.className === 'string' &&
      element.props.className.includes('border-t'),
  )
  expect(footer).toBeDefined()
  return footer as ReactElement
}

/**
 * The hamlet toggle. It is a raw `<button>` rather than the `Button` component the trigger uses,
 * and `aria-pressed` distinguishes it from anything else that might be added beside it.
 */
function hamletToggleOf(tree: ReactElement): ReactElement | undefined {
  return findAll(tree, 'button').find((element) => 'aria-pressed' in element.props)
}

/** Politely-announced rows: the loading spinner and the server-too-short message. */
function statusRowsOf(tree: ReactElement): ReactElement[] {
  return findAll(tree, 'div').filter((element) => element.props.role === 'status')
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('PlacePicker — structural presentation contracts', () => {
  it('composes the existing Popover and Command primitives without client-side filtering', () => {
    const { tree } = renderPicker()

    expect(findOne(tree, Popover).props).toMatchObject({ open: false, modal: false })
    expect(findAll(tree, PopoverTrigger)).toHaveLength(1)
    expect(findAll(tree, PopoverContent)).toHaveLength(1)
    expect(findOne(tree, Command).props.shouldFilter).toBe(false)
  })

  it('renders the below-threshold hint and accessible combobox trigger', () => {
    const { tree } = renderPicker()
    const trigger = findOne(tree, Button)
    const input = findOne(tree, CommandInput)

    expect(textOf(tree)).toContain('Type at least 3 letters to search.')
    expect(trigger.props).toMatchObject({
      type: 'button',
      role: 'combobox',
      'aria-expanded': false,
      'aria-haspopup': 'listbox',
      disabled: undefined,
    })
    expect(input.props).toMatchObject({
      'aria-label': 'Search Indian settlements',
      placeholder: 'City, town or village…',
    })
  })

  it('honours disabled state on the trigger while retaining a safe open-change handler', () => {
    const { tree } = renderPicker({ ...DEFAULT_PROPS, disabled: true })
    const trigger = findOne(tree, Button)
    const popover = findOne(tree, Popover)

    expect(trigger.props.disabled).toBe(true)
    expect(typeof popover.props.onOpenChange).toBe('function')
    expect(() => popover.props.onOpenChange(true)).not.toThrow()
  })

  it('renders one polite live loading row rather than stale empty-state content', () => {
    const { tree } = renderPicker(DEFAULT_PROPS, {
      stateOverrides: { [STATE.query]: 'Ala', [STATE.loading]: true },
    })
    const loadingRows = statusRowsOf(tree)

    expect(loadingRows).toHaveLength(1)
    expect(loadingRows[0].props).toMatchObject({
      'aria-live': 'polite',
      'aria-atomic': 'true',
    })
    expect(textOf(loadingRows[0])).toContain('Searching places…')
    expect(textOf(tree)).not.toContain('No place found.')
  })

  it('renders the no-results escape hatch for manual coordinate entry', () => {
    const onManualEntry = vi.fn()
    const { tree } = renderPicker(
      { ...DEFAULT_PROPS, onManualEntry },
      { stateOverrides: { [STATE.query]: 'Ala' } },
    )
    const [manualItem] = findAll(tree, CommandItem)
    const group = findOne(tree, CommandGroup)

    expect(group.props.heading).toBe('No place found.')
    expect(textOf(manualItem)).toBe('Enter coordinates manually')
    expect(manualItem.props.value).toBe('enter-coordinates-manually')
    expect(typeof manualItem.props.onSelect).toBe('function')
    expect(() => manualItem.props.onSelect()).not.toThrow()
    expect(onManualEntry).toHaveBeenCalledOnce()
  })

  it('renders each result as a keyed CommandItem with primary name, administrative subtext, and text badge', () => {
    const { tree } = renderPicker(DEFAULT_PROPS, {
      stateOverrides: { [STATE.query]: 'Ala', [STATE.results]: [PLACE] },
    })
    const item = findOne(tree, CommandItem)
    const badge = findOne(tree, Badge)

    expect(item.key).toBe(PLACE.id)
    expect(item.props.value).toBe(PLACE.id)
    expect(textOf(item)).toContain(PLACE.name)
    expect(textOf(item)).toContain('Khed · Pune · Maharashtra')
    expect(typeof item.props.onSelect).toBe('function')
    expect(badge.props.variant).toBe('outline')
    expect(textOf(badge)).toBe('village')
  })

  it('formats full and county-less administrative subtext without orphan separators', () => {
    expect(formatPlaceSubtext(PLACE)).toBe('Khed · Pune · Maharashtra')
    expect(formatPlaceSubtext({ ...PLACE, county: null })).toBe('Pune · Maharashtra')
  })
})

describe('PlacePicker — server search discipline', () => {
  it('does not search until the three-character threshold is met', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const { effects } = renderPicker(DEFAULT_PROPS, {
      stateOverrides: { [STATE.query]: 'Al' },
    })
    const cleanups = runEffects(effects)
    await vi.advanceTimersByTimeAsync(250)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(cleanups).toEqual([])
  })

  it('debounces the request, sends includeHamlets=true, and aborts it during cleanup', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [],
        truncated: false,
        hamletsExcluded: false,
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { effects } = renderPicker(DEFAULT_PROPS, {
      stateOverrides: { [STATE.query]: 'Alandi', [STATE.includeHamlets]: true },
    })
    const cleanups = runEffects(effects)

    expect(cleanups).toHaveLength(1)
    vi.advanceTimersByTime(249)
    expect(fetchMock).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/places?q=Alandi&includeHamlets=true',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )

    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal
    expect(signal.aborted).toBe(false)
    cleanups[0]()
    expect(signal.aborted).toBe(true)
  })

  it('skips the typing debounce when the search was triggered by the hamlet toggle', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [], truncated: false, hamletsExcluded: false }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { effects } = renderPicker(DEFAULT_PROPS, {
      stateOverrides: {
        [STATE.query]: 'Alandi',
        [STATE.includeHamlets]: true,
        [STATE.skipDebounce]: true,
      },
    })
    const cleanups = runEffects(effects)

    // The practitioner has stopped typing, so Requirement 6.4's "immediately" costs no
    // 250 ms pause — but it is still the same scheduled, abortable request.
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/places?q=Alandi&includeHamlets=true',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )

    expect(cleanups).toHaveLength(1)
    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal
    cleanups[0]()
    expect(signal.aborted).toBe(true)
  })
})

describe('PlacePicker — threshold messaging', () => {
  it('keeps the local hint for a query below three characters', () => {
    const { tree } = renderPicker(DEFAULT_PROPS, {
      stateOverrides: { [STATE.query]: 'Al' },
    })

    expect(textOf(tree)).toContain('Type at least 3 letters to search.')
    expect(textOf(tree)).not.toContain('Enter at least 3 letters or numbers')
  })

  it('reports the normalized-length rejection, not the local hint, when the server rejects a long-enough query', () => {
    // "r.," is three raw characters, so the local check passes it through — but the server
    // measures its threshold against the NORMALIZED query, where punctuation is gone and
    // only "r" remains. The local hint would be a lie about a query that already has three
    // characters, so the distinct message names the ones that actually count.
    const { tree } = renderPicker(DEFAULT_PROPS, {
      stateOverrides: { [STATE.query]: 'r.,', [STATE.queryTooShort]: true },
    })
    const statusRows = statusRowsOf(tree)

    expect(statusRows).toHaveLength(1)
    expect(statusRows[0].props).toMatchObject({ 'aria-live': 'polite', 'aria-atomic': 'true' })
    expect(textOf(statusRows[0])).toContain('Enter at least 3 letters or numbers')
    expect(textOf(tree)).not.toContain('Type at least 3 letters to search.')
    // Not a false empty state, and not an error either.
    expect(textOf(tree)).not.toContain('No place found.')
    expect(textOf(tree)).not.toContain('Search unavailable.')
    // Result-dependent footers stay hidden: there is no result set to narrow.
    expect(hamletToggleOf(tree)).toBeUndefined()
  })
})

describe('PlacePicker — footers', () => {
  it('shows the narrowing hint when the response is truncated', () => {
    const { tree } = renderPicker(DEFAULT_PROPS, {
      stateOverrides: {
        [STATE.query]: 'Alandi',
        [STATE.results]: [PLACE],
        [STATE.truncated]: true,
      },
    })

    expect(textOf(footerOf(tree))).toContain(
      'Showing top 1 — add a district or state to narrow.',
    )
  })

  it('omits the narrowing hint when the response is not truncated', () => {
    const { tree } = renderPicker(DEFAULT_PROPS, {
      stateOverrides: { [STATE.query]: 'Alandi', [STATE.results]: [PLACE] },
    })

    expect(textOf(footerOf(tree))).not.toContain('add a district or state to narrow')
  })

  it('attributes the OpenStreetMap dataset in every dropdown state, after the other footers', () => {
    // ODbL attribution for the Nominatim-derived dataset (design.md §Open Risks #1). It is not
    // conditional on a result set, so the below-threshold dropdown carries it too.
    const belowThreshold = renderPicker()
    expect(textOf(footerOf(belowThreshold.tree))).toBe(
      'Place data © OpenStreetMap contributors, ODbL',
    )

    const withFooters = renderPicker(DEFAULT_PROPS, {
      stateOverrides: {
        [STATE.query]: 'Alandi',
        [STATE.results]: [PLACE],
        [STATE.truncated]: true,
        [STATE.hamletsExcluded]: true,
      },
    })
    const footerText = textOf(footerOf(withFooters.tree))

    expect(footerText).toContain('Place data © OpenStreetMap contributors, ODbL')
    // Last, so it never displaces the hint or the toggle the practitioner is reaching for.
    expect(footerText.indexOf('OpenStreetMap')).toBeGreaterThan(
      footerText.indexOf('Include hamlets'),
    )
    expect(footerText.indexOf('OpenStreetMap')).toBeGreaterThan(
      footerText.indexOf('Showing top'),
    )
  })
})

describe('PlacePicker — error state', () => {
  it('offers manual coordinate entry when search is unavailable', () => {
    const onManualEntry = vi.fn()
    const { tree, stateWrites } = renderPicker(
      { ...DEFAULT_PROPS, onManualEntry },
      { stateOverrides: { [STATE.query]: 'Alandi', [STATE.error]: 'Search unavailable' } },
    )
    const group = findOne(tree, CommandGroup)
    const [manualItem] = findAll(tree, CommandItem)

    expect(group.props.heading).toBe('Search unavailable.')
    expect(textOf(manualItem)).toBe('Enter coordinates manually')
    expect(manualItem.props.value).toBe('enter-coordinates-manually')

    manualItem.props.onSelect()
    expect(onManualEntry).toHaveBeenCalledOnce()
    // Closes the popover so the revealed manual inputs are not left behind a dropdown.
    expect(stateWrites).toContainEqual({ index: STATE.open, next: false })

    // A failed search is not a result set: nothing to narrow, nothing to re-filter.
    expect(textOf(tree)).not.toContain('No place found.')
    expect(hamletToggleOf(tree)).toBeUndefined()
    expect(textOf(footerOf(tree))).toBe('Place data © OpenStreetMap contributors, ODbL')
  })
})

describe('PlacePicker — hamlet toggle', () => {
  const WITH_RESULTS = {
    [STATE.query]: 'Alandi',
    [STATE.results]: [PLACE],
    [STATE.hamletsExcluded]: true,
  }

  it('offers inclusion, unpressed, when the response reports hamlets were excluded', () => {
    const { tree } = renderPicker(DEFAULT_PROPS, { stateOverrides: WITH_RESULTS })
    const toggle = hamletToggleOf(tree)

    expect(toggle).toBeDefined()
    expect(toggle?.props).toMatchObject({ type: 'button', 'aria-pressed': false })
    expect(textOf(toggle)).toBe('Include hamlets')
  })

  it('stays visible as an un-toggle once hamlets are included', () => {
    const { tree } = renderPicker(DEFAULT_PROPS, {
      stateOverrides: {
        [STATE.query]: 'Alandi',
        [STATE.results]: [PLACE],
        // The response no longer reports an exclusion — the toggle must not vanish, or the
        // practitioner could not undo it.
        [STATE.hamletsExcluded]: false,
        [STATE.includeHamlets]: true,
      },
    })
    const toggle = hamletToggleOf(tree)

    expect(toggle?.props['aria-pressed']).toBe(true)
    expect(textOf(toggle)).toBe('Exclude hamlets')
  })

  it('flips the preference and marks the resulting search as immediate', () => {
    const { tree, stateWrites } = renderPicker(DEFAULT_PROPS, {
      stateOverrides: WITH_RESULTS,
    })
    stateWrites.length = 0

    hamletToggleOf(tree)?.props.onClick()

    // Both writes happen in one event, so React batches them into a single re-render and the
    // search effect runs once — with the debounce already waived.
    expect(stateWrites).toEqual([
      { index: STATE.skipDebounce, next: true },
      { index: STATE.includeHamlets, next: expect.any(Function) },
    ])
    expect((stateWrites[1].next as (current: boolean) => boolean)(false)).toBe(true)
    expect((stateWrites[1].next as (current: boolean) => boolean)(true)).toBe(false)
  })

  it('seeds the preference from the namespaced localStorage key', () => {
    const getItem = vi.fn(() => 'true')
    vi.stubGlobal('window', { localStorage: { getItem, setItem: vi.fn() } })

    const { tree } = renderPicker(DEFAULT_PROPS, {
      stateOverrides: { [STATE.query]: 'Alandi', [STATE.results]: [PLACE] },
    })

    expect(getItem).toHaveBeenCalledWith(INCLUDE_HAMLETS_STORAGE_KEY)
    expect(hamletToggleOf(tree)?.props['aria-pressed']).toBe(true)
  })

  it('persists the preference under the namespaced key', () => {
    const setItem = vi.fn()
    vi.stubGlobal('window', { localStorage: { getItem: () => null, setItem } })

    const excluded = renderPicker()
    runEffects(excluded.effects)
    expect(setItem).toHaveBeenLastCalledWith(INCLUDE_HAMLETS_STORAGE_KEY, 'false')

    const included = renderPicker(DEFAULT_PROPS, {
      stateOverrides: { [STATE.includeHamlets]: true },
    })
    runEffects(included.effects)
    expect(setItem).toHaveBeenLastCalledWith(INCLUDE_HAMLETS_STORAGE_KEY, 'true')
  })

  it('remains usable when localStorage throws on both read and write', () => {
    // Private-browsing storage restrictions throw rather than returning null. Search must not
    // depend on a preference store.
    const boom = vi.fn(() => {
      throw new Error('SecurityError: storage is not available')
    })
    vi.stubGlobal('window', { localStorage: { getItem: boom, setItem: boom } })

    const { tree, effects } = renderPicker(DEFAULT_PROPS, { stateOverrides: WITH_RESULTS })

    expect(hamletToggleOf(tree)?.props['aria-pressed']).toBe(false)
    expect(() => runEffects(effects)).not.toThrow()
    expect(boom).toHaveBeenCalled()
  })
})
