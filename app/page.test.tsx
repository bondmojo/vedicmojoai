/**
 * app/page.test.tsx
 * -------------------
 * Smoke test for tab-strip resilience (task 20.3).
 *
 * Claim under test: the tab-navigation block in `ComputePage` (`app/page.tsx`) is rendered
 * unconditionally from the static `TABS` array and the `activeTab` state — it never reads
 * `result.chart` or any pane-specific field (the one exception, `result.chart.transits?.sadeSati
 * ?.active` for the small warning glyph, is guarded by optional chaining and cannot throw). So all
 * ten tabs must render and stay selectable regardless of how malformed or absent the *pane* data
 * inside `result.chart` is (Design: Error Handling table — "Tab strip"; Requirement 8.5).
 *
 * Why this test looks the way it does
 * ------------------------------------
 * The repo has no DOM environment or component-testing library installed (no `jsdom`, no
 * `@testing-library/react` — design.md's Testing Strategy, "Runner and libraries actually in the
 * repo"), and adding one is out of scope for this feature. Every sibling test in this feature
 * (`YogasView.test.tsx`, `GrahasTable.test.tsx`, `SadeSatiPanel.test.tsx`, `KeyDignitiesPanel.
 * test.tsx`, `AshtakavargaView.test.tsx`) calls its component directly as a plain function and
 * inspects the returned React element tree structurally.
 *
 * `ComputePage` is far more stateful than any of those: 14 `useState` calls, one `useEffect`, one
 * `useCallback`, and `useRouter()` from `next/navigation`. Calling it directly requires:
 *   - A hook dispatcher stub (same mechanism `AshtakavargaView.test.tsx` already uses) that
 *     additionally covers `useEffect` (no-op — the effect body, and therefore the real
 *     `fetch('/api/unified-charts')` call inside `fetchSavedCharts`, is never invoked, exactly as
 *     happens when any component is called directly without a surrounding `render()`/commit) and
 *     `useCallback` (return the callback unchanged).
 *   - `next/navigation`'s `useRouter` mocked via `vi.mock`, since it has no meaning outside a real
 *     Next.js app router context.
 *   - No `fetch` mock is needed: `useEffect` never runs, so `fetchSavedCharts` is never called.
 *
 * Because JSX construction (`React.createElement`) does not execute a custom component's function
 * body — only `React.createElement('button', ...)` for native tags does anything eagerly — the
 * pane elements (`<GrahasTable .../>`, `<AshtakavargaView .../>`, etc.) are perfectly safe to
 * construct with garbage props: they are only ever *created* as element descriptors here, never
 * *invoked*. Each pane's own body is exercised by its own dedicated test file. This is what makes
 * the full-render approach both feasible and appropriately scoped for a tab-strip smoke test: we
 * exercise the real `ComputePage` function body and its real `TABS.map(...)` block, while the
 * malformed data flows into (but never executes) each pane.
 *
 * `activeTab` is stubbed via an index-based `useState` override (the 6th `useState` call in
 * source order) so every one of the ten tabs can be exercised as "active" in turn, each time
 * confirming: (a) the tab strip still renders exactly the same ten buttons in the same order with
 * working `onClick` handlers, and (b) constructing the whole page — including the JSX branch for
 * whichever pane is "active" — never throws, even though every pane-specific field on the malformed
 * chart is absent, wrongly typed, or empty.
 *
 * `vitest.config.ts` sets `esbuild.jsx: 'automatic'`, matching the existing sibling tests.
 *
 * _Design: Error Handling table — "Tab strip"_
 * _Requirements: 8.5_
 */

import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import type { ReactElement, ReactNode } from 'react'

// `useRouter` has no meaning outside a real Next.js app-router context; `ComputePage` only calls
// `router.push(...)` inside click handlers that are never invoked by this test, so a dummy no-op
// object is enough.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

import ComputePage from './page'
import PlacePicker, { type SelectedPlace } from './components/PlacePicker'
import DashaTimeline from './components/DashaTimeline'
import TransitsView from './components/TransitsView'

// ─── Hook dispatcher stub ────────────────────────────────────────────────
//
// Same mechanism as `AshtakavargaView.test.tsx`'s `callWithStubbedUseState`, extended to also
// cover the two additional hooks `ComputePage` calls: `useEffect` (no-op, so the real
// `fetch('/api/unified-charts')` call inside `fetchSavedCharts` never runs) and `useCallback`
// (returns the callback unchanged, matching a real first render).

const REACT_INTERNALS = (React as unknown as {
  __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED: {
    ReactCurrentDispatcher: { current: unknown }
  }
}).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED

/**
 * Runs `fn` with a minimal hook dispatcher installed. `useState` calls are matched by their
 * 0-based call order in `ComputePage`'s source (`form`=0, `loading`=1, `error`=2, `result`=3,
 * `resultBirthData`=4, `activeTab`=5, `manualCoordinatesOpen`=6, `selectedPlace`=7,
 * `saving`=8, `saveMessage`=9, `loadedChartId`=10, `analyzeSaving`=11,
 * `showCopyPanel`=12, `savedCharts`=13, `loadingCharts`=14, `loadingChart`=15);
 * `stateOverrides` substitutes a value for specific call indices (used here for `result` and `activeTab`) while
 * every other call returns its own initializer verbatim, exactly like a real first render.
 * `useEffect` is a no-op; `useCallback` returns its callback unchanged.
 */
function callWithStubbedHooks<T>(fn: () => T, stateOverrides: Record<number, unknown> = {}): T {
  const dispatcher = REACT_INTERNALS.ReactCurrentDispatcher
  const previous = dispatcher.current
  let callIndex = 0
  dispatcher.current = {
    useState: (initial: unknown) => {
      const idx = callIndex++
      const value =
        idx in stateOverrides ? stateOverrides[idx] : typeof initial === 'function' ? (initial as () => unknown)() : initial
      return [value, () => {}]
    },
    useEffect: () => {},
    useCallback: (cb: unknown) => cb,
  }
  try {
    return fn()
  } finally {
    dispatcher.current = previous
  }
}

// `result` is the 4th `useState` call (0-indexed 3); its paired birth snapshot is the 5th;
// `activeTab` is the 6th.
const RESULT_STATE_INDEX = 3
const RESULT_BIRTH_DATA_STATE_INDEX = 4
const ACTIVE_TAB_STATE_INDEX = 5

function callWithCapturedSetters<T>(
  fn: () => T,
  stateOverrides: Record<number, unknown> = {},
): { value: T; setterCalls: unknown[][] } {
  const dispatcher = REACT_INTERNALS.ReactCurrentDispatcher
  const previous = dispatcher.current
  const setterCalls: unknown[][] = []
  let callIndex = 0
  dispatcher.current = {
    useState: (initial: unknown) => {
      const idx = callIndex++
      const value =
        idx in stateOverrides ? stateOverrides[idx] : typeof initial === 'function' ? (initial as () => unknown)() : initial
      setterCalls[idx] = []
      return [value, (nextValue: unknown) => setterCalls[idx].push(nextValue)]
    },
    useEffect: () => {},
    useCallback: (cb: unknown) => cb,
  }
  try {
    return { value: fn(), setterCalls }
  } finally {
    dispatcher.current = previous
  }
}

// ─── Tree-walking helpers (mirrors the sibling component tests) ────────────

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
 * Deliberately does NOT expand custom (function or forwardRef) components — the whole point of
 * this smoke test is that pane components (`GrahasTable`, `AshtakavargaView`, `YogasView`, etc.)
 * are merely *constructed* as element descriptors here and never *invoked*, so their malformed
 * props can never throw during this test. Only native DOM tags (`'button'`, `'div'`, …) are
 * visited, which is all that is needed to find the tab-strip buttons.
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
    if (typeof el.type === 'string') visit(el)
    walk(el.props?.children, visit)
    return
  }
}

/** Collects every native element in the tree whose `type` matches `tag` (e.g. `'button'`). */
function findAll(root: ReactNode, tag: string): ReactElement[] {
  const found: ReactElement[] = []
  walk(root, (el) => {
    if (el.type === tag) found.push(el)
  })
  return found
}

function findComponent(root: ReactNode, component: unknown): ReactElement | undefined {
  if (root === null || root === undefined || typeof root === 'boolean' || typeof root === 'string' || typeof root === 'number') return undefined
  if (Array.isArray(root)) {
    for (const child of root) {
      const found = findComponent(child, component)
      if (found) return found
    }
    return undefined
  }
  const element = root as ReactElement
  if (element.type === component) return element
  return findComponent(element.props?.children, component)
}

function findElementByPlaceholder(root: ReactNode, placeholder: string): ReactElement | undefined {
  if (root === null || root === undefined || typeof root === 'boolean' || typeof root === 'string' || typeof root === 'number') return undefined
  if (Array.isArray(root)) {
    for (const child of root) {
      const found = findElementByPlaceholder(child, placeholder)
      if (found) return found
    }
    return undefined
  }
  const element = root as ReactElement
  if (element.props?.placeholder === placeholder) return element
  return findElementByPlaceholder(element.props?.children, placeholder)
}

function findElementByValue(root: ReactNode, value: string): ReactElement | undefined {
  if (root === null || root === undefined || typeof root === 'boolean' || typeof root === 'string' || typeof root === 'number') return undefined
  if (Array.isArray(root)) {
    for (const child of root) {
      const found = findElementByValue(child, value)
      if (found) return found
    }
    return undefined
  }
  const element = root as ReactElement
  if (element.props?.value === value) return element
  return findElementByValue(element.props?.children, value)
}

// ─── Fixture — a chart whose non-tab-strip pane data is malformed or absent ────────────────────

const EXPECTED_TABS: { key: string; label: string }[] = [
  { key: 'summary', label: 'Summary' },
  { key: 'grahas', label: 'Grahas' },
  { key: 'charts', label: 'Divisional Charts' },
  { key: 'ashtakavarga', label: 'Ashtakavarga' },
  { key: 'yogas', label: 'Yogas' },
  { key: 'dasha', label: 'Dasha (Vimshottari)' },
  { key: 'charadasha', label: 'Chara Dasha' },
  { key: 'transits', label: 'Transits' },
  { key: 'pinda', label: 'Pinda Strength' },
  { key: 'varshaphal', label: 'Varshaphal' },
]

/**
 * `result.chart` carries only the handful of fields the page itself reads directly (unconditionally,
 * outside any `activeTab === '…'` branch): `lagna`, `lagnaDegreeInSign`, `ayanamsa`, `sunriseMode`.
 * Every field a *pane* reads is deliberately absent, wrongly typed, or empty — `planets` is `null`,
 * `nakshatras` is a string, `charaKarakas` is a number, `ashtakavarga` is `null`, `yogas` is
 * `undefined`, `transits` is `undefined` (safe: the tab strip only reads it via `?.`). This is the
 * "malformed or absent" pane data the task requires; none of it is capable of reaching the tab
 * strip's own rendering logic.
 */
function buildMalformedResult() {
  return {
    chart: {
      lagna: 'Leo',
      lagnaDegreeInSign: 12.34,
      ayanamsa: 24.1,
      sunriseMode: 'precise',
      planets: null,
      nakshatras: 'not-an-array',
      divisionalCharts: undefined,
      charaKarakas: 42,
      upagrahas: undefined,
      specialLagnas: undefined,
      arudhaPadas: undefined,
      shadbala: undefined,
      relationships: undefined,
      ashtakavarga: null,
      yogas: undefined,
      transits: undefined,
      pindaStrength: undefined,
    },
    dashaTree: undefined,
    charaDasha: undefined,
  }
}

/** Renders `ComputePage` with the malformed result installed and `activeTab` forced to `tabKey`. */
function renderPageWithActiveTab(tabKey: string): ReactElement {
  return callWithStubbedHooks(() => ComputePage(), {
    [RESULT_STATE_INDEX]: buildMalformedResult(),
    [ACTIVE_TAB_STATE_INDEX]: tabKey,
  }) as ReactElement
}

// ─── Tests ───────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  name: '',
  date: '',
  time: '',
  timezone: '5.5',
  latitude: '',
  longitude: '',
  placeId: null,
  placeLabel: '',
  sunriseMode: 'precise' as const,
}

const SELECTED_PLACE: SelectedPlace = {
  id: '6f4f34a5-5f74-4a61-a6d8-8eb6a4dc6d35',
  name: 'Alandi',
  kind: 'village',
  state: 'Maharashtra',
  district: 'Pune',
  county: 'Khed',
  latitude: 18.6772446,
  longitude: 73.8981129,
  label: 'Alandi, Khed, Maharashtra',
}

describe('ComputePage — place and coordinate transitions (R5.2, R5.4, R5.5)', () => {
  it('sets the selected place, its coordinates, IST, and closes manual coordinate entry', () => {
    const { value: page, setterCalls } = callWithCapturedSetters(() => ComputePage())
    const picker = findComponent(page as ReactElement, PlacePicker)

    expect(picker).toBeDefined()
    picker!.props.onSelect(SELECTED_PLACE)

    expect(setterCalls[0]).toEqual([{
      ...EMPTY_FORM,
      latitude: '18.6772446',
      longitude: '73.8981129',
      placeId: SELECTED_PLACE.id,
      placeLabel: 'Alandi, Khed, Maharashtra',
      timezone: '5.5',
    }])
    expect(setterCalls[6]).toEqual([false])
    expect(setterCalls[7]).toEqual([SELECTED_PLACE])
  })

  it('only opens manual entry until a coordinate is changed', () => {
    const formWithPlace = {
      ...EMPTY_FORM,
      latitude: '18.6772446',
      longitude: '73.8981129',
      placeId: SELECTED_PLACE.id,
      placeLabel: SELECTED_PLACE.label,
    }
    const { value: page, setterCalls } = callWithCapturedSetters(
      () => ComputePage(),
      { 0: formWithPlace, 7: SELECTED_PLACE },
    )
    const picker = findComponent(page as ReactElement, PlacePicker)

    picker!.props.onManualEntry()

    expect(setterCalls[6]).toEqual([true])
    expect(setterCalls[0]).toEqual([])
    expect(setterCalls[7]).toEqual([])
  })

  it('clears the place identity when either manual coordinate changes', () => {
    const formWithPlace = {
      ...EMPTY_FORM,
      latitude: '18.6772446',
      longitude: '73.8981129',
      placeId: SELECTED_PLACE.id,
      placeLabel: SELECTED_PLACE.label,
    }
    const { value: page, setterCalls } = callWithCapturedSetters(
      () => ComputePage(),
      { 0: formWithPlace, 7: SELECTED_PLACE },
    )
    const latitudeInput = findElementByPlaceholder(page as ReactElement, '28.6139000')

    expect(latitudeInput).toBeDefined()
    latitudeInput!.props.onChange({ target: { value: '18.7000000' } })

    expect(setterCalls[0]).toEqual([{
      ...formWithPlace,
      latitude: '18.7000000',
      placeId: null,
      placeLabel: '',
    }])
    expect(setterCalls[7]).toEqual([null])
  })

  it('rejects an incomplete manual location before computing', async () => {
    const { value: page, setterCalls } = callWithCapturedSetters(() => ComputePage())
    const form = findAll(page as ReactElement, 'form')[0]

    await form.props.onSubmit({ preventDefault: vi.fn() })

    expect(setterCalls[2]).toEqual(['Select a place or enter both latitude and longitude.'])
    expect(setterCalls[1]).toEqual([])
  })

  it('rejects finite coordinates outside their valid ranges before computing', async () => {
    const { value: page, setterCalls } = callWithCapturedSetters(
      () => ComputePage(),
      { 0: { ...EMPTY_FORM, latitude: '90.0000001', longitude: '77.2090000' } },
    )
    const form = findAll(page as ReactElement, 'form')[0]

    await form.props.onSubmit({ preventDefault: vi.fn() })

    expect(setterCalls[2]).toEqual([
      'Latitude must be between -90 and 90, and longitude must be between -180 and 180.',
    ])
    expect(setterCalls[1]).toEqual([])
  })

  it('keeps chart computation available after the picker opens manual coordinates', async () => {
    const manualForm = {
      ...EMPTY_FORM,
      name: 'Manual coordinates',
      date: '1990-04-27',
      time: '12:00',
      latitude: '18.6772446',
      longitude: '73.8981129',
    }
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => buildMalformedResult(),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { value: page, setterCalls } = callWithCapturedSetters(
      () => ComputePage(),
      { 0: manualForm, 6: false, 7: null },
    )
    const picker = findComponent(page as ReactElement, PlacePicker)
    const form = findAll(page as ReactElement, 'form')[0]

    picker!.props.onManualEntry()
    await form.props.onSubmit({ preventDefault: vi.fn() })

    expect(setterCalls[6]).toEqual([true])
    expect(fetchMock).toHaveBeenCalledWith('/api/compute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Manual coordinates',
        date: '1990-04-27',
        time: '12:00',
        timezone: 5.5,
        latitude: 18.6772446,
        longitude: 73.8981129,
        sunriseMode: 'precise',
      }),
    })
    expect(setterCalls[3]).toEqual([buildMalformedResult()])
  })
})

interface SavedChartFixture {
  source: 'compute'
  name: string
  sunriseMode: 'precise' | 'jhora'
  birthInput: Record<string, unknown>
}

const LOADED_CHART_SUMMARY = {
  id: 'loaded-chart-id',
  name: 'Loaded chart',
  lagna: 'Leo',
  source: 'compute',
  birthDatetime: '1990-04-27T06:30:00.000Z',
  createdAt: '1990-04-27T06:30:00.000Z',
}

function loadedChartFixture(place?: unknown): SavedChartFixture {
  return {
    source: 'compute',
    name: 'Loaded chart',
    sunriseMode: 'precise',
    birthInput: {
      date: '1990-04-27',
      time: '12:00:00',
      timezone: 5.5,
      latitude: 18.6772446,
      longitude: 73.8981129,
      sunriseMode: 'precise',
      ...(place === undefined ? {} : { place }),
    },
  }
}

function restoredBirthForm(placeId: string | null, placeLabel: string) {
  return {
    name: 'Loaded chart',
    date: '1990-04-27',
    time: '12:00',
    timezone: '5.5',
    latitude: '18.6772446',
    longitude: '73.8981129',
    placeId,
    placeLabel,
    sunriseMode: 'precise' as const,
  }
}

async function loadChartThroughPicker(
  fixture: SavedChartFixture,
  stateOverrides: Record<number, unknown> = {},
) {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => fixture })
    .mockResolvedValueOnce({ ok: true, json: async () => buildMalformedResult() })
  vi.stubGlobal('fetch', fetchMock)

  const { value: page, setterCalls } = callWithCapturedSetters(
    () => ComputePage(),
    { 13: [LOADED_CHART_SUMMARY], ...stateOverrides },
  )
  const savedChart = findElementByValue(page as ReactElement, 'Loaded chart Leo')

  expect(savedChart).toBeDefined()
  await savedChart!.props.onSelect()

  return { fetchMock, setterCalls }
}

describe('ComputePage — paste chart compatibility (R9.2)', () => {
  it('rejects a paste-sourced chart before restoring place state or recomputing', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        source: 'paste',
        name: 'Pasted chart',
        birthInput: null,
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const formWithPlace = {
      ...EMPTY_FORM,
      latitude: '18.6772446',
      longitude: '73.8981129',
      placeId: SELECTED_PLACE.id,
      placeLabel: SELECTED_PLACE.label,
    }
    const { value: page, setterCalls } = callWithCapturedSetters(
      () => ComputePage(),
      {
        0: formWithPlace,
        6: true,
        7: SELECTED_PLACE,
        13: [{ ...LOADED_CHART_SUMMARY, source: 'paste' }],
      },
    )
    const savedChart = findElementByValue(page as ReactElement, 'Loaded chart Leo')

    expect(savedChart).toBeDefined()
    await savedChart!.props.onSelect()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/api/unified-charts/loaded-chart-id')
    expect(fetchMock.mock.calls.map(([url]) => url)).not.toContain('/api/compute')
    expect(setterCalls[2]).toEqual([
      'This chart was pasted as JSON — it has no birth data to load. View it on the Unified Charts page.',
    ])
    expect(setterCalls[0]).toEqual([])
    expect(setterCalls[6]).toEqual([])
    expect(setterCalls[7]).toEqual([])
  })
})

describe('ComputePage — saved place restoration (R7.5, R9.1)', () => {
  it('restores a complete persisted place with canonical birth coordinates and closes manual entry', async () => {
    const { fetchMock, setterCalls } = await loadChartThroughPicker(
      loadedChartFixture({
        id: SELECTED_PLACE.id,
        name: SELECTED_PLACE.name,
        kind: SELECTED_PLACE.kind,
        state: SELECTED_PLACE.state,
        district: SELECTED_PLACE.district,
        county: SELECTED_PLACE.county,
        label: SELECTED_PLACE.label,
      }),
      { 6: true, 7: { ...SELECTED_PLACE, name: 'Stale place' } },
    )

    expect(setterCalls[0]).toEqual([restoredBirthForm(SELECTED_PLACE.id, SELECTED_PLACE.label)])
    expect(setterCalls[7]).toEqual([SELECTED_PLACE])
    expect(setterCalls[6]).toEqual([false])
    expect(setterCalls[2]).toEqual([null])
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      name: 'Loaded chart',
      date: '1990-04-27',
      time: '12:00',
      timezone: 5.5,
      latitude: 18.6772446,
      longitude: 73.8981129,
      sunriseMode: 'precise',
    })
  })

  it.each([
    ['no place metadata', undefined],
    ['invalid place metadata', { id: SELECTED_PLACE.id, label: SELECTED_PLACE.label }],
  ])('keeps legacy coordinates manual when a saved chart has %s', async (_description, place) => {
    const stalePlace = { ...SELECTED_PLACE, name: 'Stale place' }
    const { fetchMock, setterCalls } = await loadChartThroughPicker(
      loadedChartFixture(place),
      { 0: { ...PERSISTENCE_FORM, placeId: SELECTED_PLACE.id, placeLabel: SELECTED_PLACE.label }, 6: false, 7: stalePlace },
    )

    expect(setterCalls[0]).toEqual([restoredBirthForm(null, '')])
    expect(setterCalls[7]).toEqual([null])
    expect(setterCalls[6]).toEqual([true])
    expect(setterCalls[2]).toEqual([null])
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      name: 'Loaded chart',
      date: '1990-04-27',
      time: '12:00',
      timezone: 5.5,
      latitude: 18.6772446,
      longitude: 73.8981129,
      sunriseMode: 'precise',
    })
  })

  it('reloads a place-less legacy compute chart, then re-saves it with coordinate-only input', async () => {
    const { setterCalls: loadSetterCalls } = await loadChartThroughPicker(
      loadedChartFixture(),
      { 0: { ...PERSISTENCE_FORM, placeId: SELECTED_PLACE.id, placeLabel: SELECTED_PLACE.label }, 6: false, 7: SELECTED_PLACE },
    )

    // The legacy chart has no `birthInput.place`: its populated coordinates are shown
    // through Manual Coordinates and no place UI state survives restoration.
    expect(loadSetterCalls[0]).toEqual([restoredBirthForm(null, '')])
    expect(loadSetterCalls[6]).toEqual([true])
    expect(loadSetterCalls[7]).toEqual([null])
    expect(loadSetterCalls[2]).toEqual([null])

    const saveFetchMock = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ id: 'loaded-chart-id' }),
    })
    vi.stubGlobal('fetch', saveFetchMock)

    const { value: page, setterCalls: saveSetterCalls } = callWithCapturedSetters(
      () => ComputePage(),
      {
        0: restoredBirthForm(null, ''),
        3: buildMalformedResult(),
        6: true,
        7: null,
        10: 'loaded-chart-id',
      },
    )
    const manualCoordinates = findAll(page as ReactElement, 'details')[0]
    const saveButton = findClickableElementByText(page as ReactElement, 'Save Chart')

    expect(manualCoordinates.props.open).toBe(true)
    expect(saveButton).toBeDefined()
    await saveButton!.props.onClick()

    expect(JSON.parse(saveFetchMock.mock.calls[0][1].body)).toEqual({
      name: 'Loaded chart',
      date: '1990-04-27',
      time: '12:00',
      timezone: 5.5,
      latitude: 18.6772446,
      longitude: 73.8981129,
      sunriseMode: 'precise',
      existingChartId: 'loaded-chart-id',
    })
    expect(saveSetterCalls[9]).toEqual([null, 'Chart updated'])
  })
})

describe('ComputePage — tab-strip resilience (R8.5)', () => {
  it('renders all ten tabs, in order, with the expected labels, when the active tab is Summary', () => {
    const el = renderPageWithActiveTab('summary')
    const buttons = findAll(el, 'button')

    expect(buttons).toHaveLength(EXPECTED_TABS.length)
    expect(buttons.map((b) => textOf(b).trim())).toEqual(EXPECTED_TABS.map((t) => t.label))
  })

  it('gives every tab button a working (function) onClick handler, so every tab stays selectable', () => {
    const el = renderPageWithActiveTab('summary')
    const buttons = findAll(el, 'button')

    expect(buttons).toHaveLength(10)
    for (const button of buttons) {
      expect(typeof button.props.onClick).toBe('function')
      // Invoking it must not throw — it only calls the (stubbed, no-op) `setActiveTab` setter.
      expect(() => button.props.onClick()).not.toThrow()
    }
  })

  it.each(EXPECTED_TABS.map((t) => t.key))(
    'renders all ten tabs unchanged, and does not throw, with malformed pane data while "%s" is the active tab',
    (activeKey) => {
      let el!: ReactElement
      expect(() => {
        el = renderPageWithActiveTab(activeKey)
      }).not.toThrow()

      const buttons = findAll(el, 'button')
      expect(buttons).toHaveLength(10)
      expect(buttons.map((b) => textOf(b).trim())).toEqual(EXPECTED_TABS.map((t) => t.label))
      expect(buttons.map((b) => textOf(b).trim())).toEqual(
        buttons.map((b) => textOf(b).trim())
      )
    }
  )

  it('renders identical tab-strip buttons regardless of which tab is active — the strip never reads chart data', () => {
    const perTabButtonTexts = EXPECTED_TABS.map((t) => {
      const el = renderPageWithActiveTab(t.key)
      return findAll(el, 'button').map((b) => textOf(b).trim())
    })

    const first = perTabButtonTexts[0]
    for (const texts of perTabButtonTexts) {
      expect(texts).toEqual(first)
    }
  })
})

describe('ComputePage — Gochar chart context', () => {
  const RESULT_BIRTH_SNAPSHOT = {
    name: 'Computed chart',
    date: '1990-04-27',
    time: '12:00',
    timezone: 5.5,
    latitude: 28.6139,
    longitude: 77.209,
    sunriseMode: 'precise' as const,
  }

  it.each([
    ['transits', TransitsView],
    ['dasha', DashaTimeline],
  ])('passes the birth snapshot that produced the visible chart to %s Gochar', (activeTab, component) => {
    const page = callWithStubbedHooks(() => ComputePage(), {
      [RESULT_STATE_INDEX]: buildMalformedResult(),
      [RESULT_BIRTH_DATA_STATE_INDEX]: RESULT_BIRTH_SNAPSHOT,
      [ACTIVE_TAB_STATE_INDEX]: activeTab,
    }) as ReactElement
    const child = findComponent(page, component)

    expect(child?.props.gocharSource).toEqual({ kind: 'unsaved', birthData: RESULT_BIRTH_SNAPSHOT })
  })

  it('passes the natal D1 belonging to the displayed chart to the Transits Gochar charts', () => {
    const result = buildMalformedResult()
    const d1 = {
      division: 1,
      name: 'Rāśi',
      shortName: 'D1',
      lagna: 'Leo',
      lagnaSignNumber: 5,
      planets: [],
    }
    ;(result.chart as { divisionalCharts?: unknown }).divisionalCharts = [d1]
    const page = callWithStubbedHooks(() => ComputePage(), {
      [RESULT_STATE_INDEX]: result,
      [RESULT_BIRTH_DATA_STATE_INDEX]: RESULT_BIRTH_SNAPSHOT,
      [ACTIVE_TAB_STATE_INDEX]: 'transits',
    }) as ReactElement

    expect(findComponent(page, TransitsView)?.props.natalD1).toBe(d1)
  })
})


function findClickableElementByText(root: ReactNode, text: string): ReactElement | undefined {
  if (root === null || root === undefined || typeof root === 'boolean' || typeof root === 'string' || typeof root === 'number') return undefined
  if (Array.isArray(root)) {
    for (const child of root) {
      const found = findClickableElementByText(child, text)
      if (found) return found
    }
    return undefined
  }

  const element = root as ReactElement
  if (textOf(element.props?.children).trim() === text && typeof element.props?.onClick === 'function') {
    return element
  }
  return findClickableElementByText(element.props?.children, text)
}

const PERSISTENCE_FORM = {
  name: 'Asha Sharma',
  date: '1990-04-27',
  time: '12:00',
  timezone: '5.5',
  latitude: '18.6772446',
  longitude: '73.8981129',
  placeId: SELECTED_PLACE.id,
  placeLabel: SELECTED_PLACE.label,
  sunriseMode: 'precise' as const,
}

function persistenceRequestBody(): Record<string, unknown> {
  return {
    name: PERSISTENCE_FORM.name,
    date: PERSISTENCE_FORM.date,
    time: PERSISTENCE_FORM.time,
    timezone: 5.5,
    latitude: 18.6772446,
    longitude: 73.8981129,
    sunriseMode: 'precise',
    existingChartId: undefined,
  }
}

describe('ComputePage — place persistence payloads (R7.1, R7.4)', () => {
  it('sends the strict selected-place metadata, without coordinates, when saving a chart', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 201,
      json: async () => ({ id: 'chart-id' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { value: page } = callWithCapturedSetters(
      () => ComputePage(),
      { 0: PERSISTENCE_FORM, 3: buildMalformedResult(), 7: SELECTED_PLACE },
    )
    const saveButton = findClickableElementByText(page as ReactElement, 'Save Chart')

    expect(saveButton).toBeDefined()
    await saveButton!.props.onClick()

    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/unified-charts/from-compute')
    expect(JSON.parse(options.body)).toEqual({
      ...persistenceRequestBody(),
      place: {
        id: SELECTED_PLACE.id,
        name: SELECTED_PLACE.name,
        kind: SELECTED_PLACE.kind,
        state: SELECTED_PLACE.state,
        district: SELECTED_PLACE.district,
        county: SELECTED_PLACE.county,
        label: SELECTED_PLACE.label,
      },
    })
  })

  it('sends the same strict selected-place metadata before running AI analysis', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 201,
      json: async () => ({ id: 'chart-id' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { value: page } = callWithCapturedSetters(
      () => ComputePage(),
      { 0: PERSISTENCE_FORM, 3: buildMalformedResult(), 7: SELECTED_PLACE },
    )
    const analyzeButton = findClickableElementByText(page as ReactElement, 'Run AI Analysis')

    expect(analyzeButton).toBeDefined()
    await analyzeButton!.props.onClick()

    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/unified-charts/from-compute')
    expect(JSON.parse(options.body)).toEqual({
      ...persistenceRequestBody(),
      place: {
        id: SELECTED_PLACE.id,
        name: SELECTED_PLACE.name,
        kind: SELECTED_PLACE.kind,
        state: SELECTED_PLACE.state,
        district: SELECTED_PLACE.district,
        county: SELECTED_PLACE.county,
        label: SELECTED_PLACE.label,
      },
    })
  })

  it('omits place metadata when a restored form has only a place id and label', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 409,
      json: async () => ({ id: 'chart-id', name: 'Asha Sharma' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { value: page } = callWithCapturedSetters(
      () => ComputePage(),
      { 0: PERSISTENCE_FORM, 3: buildMalformedResult(), 7: null },
    )
    const saveButton = findClickableElementByText(page as ReactElement, 'Save Chart')

    expect(saveButton).toBeDefined()
    await saveButton!.props.onClick()

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(persistenceRequestBody())
  })
})

/**
 * The silent-submit regression.
 *
 * The manual coordinate inputs live inside a `<details>` disclosure that is closed by default.
 * While they carried `required={!form.placeId}`, browser constraint validation failed on a
 * control it could not focus, which aborts submission *without dispatching the submit event* —
 * so `handleSubmit` never ran, its message never appeared, and Compute Chart appeared to do
 * nothing at all. Requirement 5.4 (either a place or both coordinates) is unchanged; it is now
 * enforced by `validateBirthLocation` in JS, which always yields a message the page renders and
 * announces, and the disclosure is opened so the field the message names is visible and
 * focusable.
 *
 * _Requirements: 5.4_
 */
describe('ComputePage — an incomplete location always produces a visible message (R5.4)', () => {
  it.each([
    ['latitude', '28.6139000'],
    ['longitude', '77.2090000'],
  ])(
    'leaves the disclosed %s input free of the native constraints that blocked submission unseen',
    (_coordinate, placeholder) => {
      const { value: page } = callWithCapturedSetters(() => ComputePage(), { 0: EMPTY_FORM })
      const input = findElementByPlaceholder(page as ReactElement, placeholder)

      expect(input).toBeDefined()
      expect(input!.props.required).toBeUndefined()
      expect(input!.props.min).toBeUndefined()
      expect(input!.props.max).toBeUndefined()
      // Belt-and-braces for any residual native check (a browser's number-field
      // `badInput`): reveal the field rather than fail out of sight.
      expect(typeof input!.props.onInvalid).toBe('function')
    },
  )

  it('keeps those inputs behind a disclosure that is still closed by default', () => {
    const { value: page } = callWithCapturedSetters(() => ComputePage(), { 0: EMPTY_FORM, 6: false })
    const disclosure = findAll(page as ReactElement, 'details')[0]

    expect(disclosure.props.open).toBe(false)
    expect(findElementByPlaceholder(disclosure, '28.6139000')).toBeDefined()
  })

  it.each([
    ['an empty location', EMPTY_FORM],
    ['only a latitude', { ...EMPTY_FORM, latitude: '18.6772446' }],
    ['an out-of-range latitude', { ...EMPTY_FORM, latitude: '90.0000001', longitude: '77.2090000' }],
  ])('opens the disclosure on submit so the field %s refers to is reachable', async (_d, formState) => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const { value: page, setterCalls } = callWithCapturedSetters(
      () => ComputePage(),
      { 0: formState, 6: false, 7: null },
    )
    const form = findAll(page as ReactElement, 'form')[0]

    await form.props.onSubmit({ preventDefault: vi.fn() })

    expect(setterCalls[6]).toEqual([true])
    // The message is the whole point — a blocked submit must never be inert.
    expect(setterCalls[2]).toHaveLength(1)
    expect(String(setterCalls[2][0]).trim().length).toBeGreaterThan(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('opens the disclosure from a coordinate input\u2019s onInvalid', () => {
    const { value: page, setterCalls } = callWithCapturedSetters(() => ComputePage(), { 6: false })
    const input = findElementByPlaceholder(page as ReactElement, '28.6139000')

    input!.props.onInvalid()

    expect(setterCalls[6]).toEqual([true])
  })

  it('announces the failure rather than conveying it by colour alone', () => {
    const message = 'Select a place or enter both latitude and longitude.'
    const { value: page } = callWithCapturedSetters(() => ComputePage(), { 0: EMPTY_FORM, 2: message })
    const alert = findAll(page as ReactElement, 'div').find((el) => el.props?.role === 'alert')

    expect(alert).toBeDefined()
    expect(textOf(alert).trim()).toBe(message)
  })

  it('does not open the disclosure when the location is usable', async () => {
    const usableForm = {
      ...EMPTY_FORM,
      date: '1990-04-27',
      time: '12:00',
      latitude: '18.6772446',
      longitude: '73.8981129',
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => buildMalformedResult() }))

    const { value: page, setterCalls } = callWithCapturedSetters(
      () => ComputePage(),
      { 0: usableForm, 6: false, 7: null },
    )
    const form = findAll(page as ReactElement, 'form')[0]

    await form.props.onSubmit({ preventDefault: vi.fn() })

    expect(setterCalls[6]).toEqual([])
    expect(setterCalls[2]).toEqual([null])
  })

  it.each([
    ['idle', false],
    ['computing', true],
  ])('disables the place picker while %s, matching the unified-charts form', (_state, loading) => {
    const { value: page } = callWithCapturedSetters(() => ComputePage(), { 1: loading })
    const picker = findComponent(page as ReactElement, PlacePicker)

    expect(picker!.props.disabled).toBe(loading)
  })
})
