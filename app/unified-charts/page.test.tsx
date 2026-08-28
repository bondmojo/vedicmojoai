/**
 * app/unified-charts/page.test.tsx
 * --------------------------------
 * Structural coverage for the `ComputeForm` on `/unified-charts` — the second
 * birth-data call site, which had none.
 *
 * Two defects are pinned here, both of which shipped:
 *
 *   1. **The form selected a place and then threw it away.** It POSTed to
 *      `/api/unified-charts/from-compute` with no `place`, so charts created here
 *      got no `birthInput.place` and no `chartInputV1.meta.birth_place`. The fix
 *      forwards the selection — but only after stripping it, because the route's
 *      `place` schema is `.strict()` and a `SelectedPlace` carries
 *      `latitude`/`longitude`, which would 400 the entire save rather than merely
 *      lose the label. Both halves are asserted.
 *   2. **An empty location silently killed the submit.** The manual coordinate
 *      inputs carried `required={!selectedPlace}` inside a `<details>` closed by
 *      default. A control the browser cannot focus still participates in
 *      constraint validation, so submission was aborted *before* the submit event
 *      — no handler ran, no message appeared, and "Compute & Save Chart" looked
 *      broken. The inputs must therefore carry no native constraints, and
 *      `handleSubmit` must produce a visible, announced message instead.
 *
 * Convention, matching every sibling `app/components/*.test.tsx` and
 * `app/page.test.tsx`: no jsdom, no component-testing library. `ComputeForm` is
 * called as a plain function with a minimal hook dispatcher installed, and the
 * returned element tree is inspected structurally. `PlacePicker` is only ever
 * *constructed* as an element descriptor, never invoked, so its own search state
 * and effects never run here — it has its own test file.
 *
 * `useState` calls are matched by their 0-based order in `ComputeForm`'s source:
 * `form`=0, `submitting`=1, `error`=2, `success`=3, `selectedPlace`=4,
 * `manualCoordinatesOpen`=5.
 *
 * _Requirements: 5.4, 7.1, 7.4, 8.1_
 */

import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import type { ReactElement, ReactNode } from 'react'

// `useRouter` has no meaning outside a real Next.js app-router context. The page
// module calls it at the top of `UnifiedChartsPage`, which this file never
// renders, but the import must still resolve.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

import { ComputeForm } from './page'
import PlacePicker, { type SelectedPlace } from '../components/PlacePicker'
import { BIRTH_LOCATION_MESSAGES } from '@/lib/place-form'

// ─── Hook dispatcher stub ────────────────────────────────────────────────

const REACT_INTERNALS = (React as unknown as {
  __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED: {
    ReactCurrentDispatcher: { current: unknown }
  }
}).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED

const FORM_STATE = 0
const SUBMITTING_STATE = 1
const ERROR_STATE = 2
const SUCCESS_STATE = 3
const SELECTED_PLACE_STATE = 4
const MANUAL_COORDINATES_OPEN_STATE = 5

/**
 * Calls `fn` with a `useState`-only dispatcher: each call returns its own
 * initializer verbatim (exactly like a real first render) unless `stateOverrides`
 * substitutes a value for that call index, and records every setter invocation so
 * a handler's effect on state can be asserted without a commit phase.
 */
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
        idx in stateOverrides
          ? stateOverrides[idx]
          : typeof initial === 'function'
            ? (initial as () => unknown)()
            : initial
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

// ─── Tree-walking helpers (mirrors app/page.test.tsx) ────────────────────

function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (typeof node === 'object' && 'props' in (node as ReactElement)) {
    return textOf((node as ReactElement).props?.children)
  }
  return ''
}

function isWalkable(node: ReactNode): node is ReactElement {
  return (
    node !== null &&
    node !== undefined &&
    typeof node === 'object' &&
    'props' in (node as ReactElement)
  )
}

/** Depth-first search over the element tree, custom components included. */
function findElement(
  root: ReactNode,
  predicate: (el: ReactElement) => boolean,
): ReactElement | undefined {
  if (Array.isArray(root)) {
    for (const child of root) {
      const found = findElement(child, predicate)
      if (found) return found
    }
    return undefined
  }
  if (!isWalkable(root)) return undefined
  if (predicate(root)) return root
  return findElement(root.props?.children, predicate)
}

function findAllElements(
  root: ReactNode,
  predicate: (el: ReactElement) => boolean,
): ReactElement[] {
  const found: ReactElement[] = []
  const visit = (node: ReactNode): void => {
    if (Array.isArray(node)) {
      node.forEach(visit)
      return
    }
    if (!isWalkable(node)) return
    if (predicate(node)) found.push(node)
    visit(node.props?.children)
  }
  visit(root)
  return found
}

function findByPlaceholder(root: ReactNode, placeholder: string): ReactElement | undefined {
  return findElement(root, (el) => el.props?.placeholder === placeholder)
}

const LATITUDE_PLACEHOLDER = '28.6139000'
const LONGITUDE_PLACEHOLDER = '77.2090000'

// ─── Fixtures ────────────────────────────────────────────────────────────

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

const PERSISTED_PLACE = {
  id: SELECTED_PLACE.id,
  name: SELECTED_PLACE.name,
  kind: SELECTED_PLACE.kind,
  state: SELECTED_PLACE.state,
  district: SELECTED_PLACE.district,
  county: SELECTED_PLACE.county,
  label: SELECTED_PLACE.label,
}

const EMPTY_FORM = {
  name: '',
  date: '',
  time: '',
  timezone: '5.5',
  latitude: '',
  longitude: '',
  sunriseMode: 'precise' as const,
}

const READY_FORM = {
  ...EMPTY_FORM,
  name: 'Asha Sharma',
  date: '1990-04-27',
  time: '12:00',
  latitude: '18.6772446',
  longitude: '73.8981129',
}

function renderForm(stateOverrides: Record<number, unknown> = {}) {
  const onSuccess = vi.fn()
  const { value, setterCalls } = callWithCapturedSetters(
    () => ComputeForm({ onSuccess }),
    stateOverrides,
  )
  return { tree: value as ReactElement, setterCalls, onSuccess }
}

function stubFetch(response: { status: number; body: unknown }) {
  const fetchMock = vi.fn().mockResolvedValue({
    status: response.status,
    json: async () => response.body,
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

// ─── Place forwarding (R7.1, R7.4, R8.1) ─────────────────────────────────

describe('unified-charts ComputeForm — place forwarding', () => {
  it('forwards the selected place, stripped to the persisted display fields', async () => {
    const fetchMock = stubFetch({ status: 201, body: { name: 'Asha Sharma', lagna: 'Leo' } })
    const { tree, onSuccess } = renderForm({
      [FORM_STATE]: READY_FORM,
      [SELECTED_PLACE_STATE]: SELECTED_PLACE,
    })
    const form = findElement(tree, (el) => el.type === 'form')

    expect(form).toBeDefined()
    await form!.props.onSubmit({ preventDefault: vi.fn() })

    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/unified-charts/from-compute')
    expect(JSON.parse(options.body)).toEqual({
      name: 'Asha Sharma',
      date: '1990-04-27',
      time: '12:00',
      timezone: 5.5,
      latitude: 18.6772446,
      longitude: 73.8981129,
      sunriseMode: 'precise',
      place: PERSISTED_PLACE,
    })
    expect(onSuccess).toHaveBeenCalledTimes(1)
  })

  it('never sends coordinates inside place — the route\u2019s place schema is .strict()', async () => {
    const fetchMock = stubFetch({ status: 201, body: { name: 'Asha Sharma', lagna: 'Leo' } })
    const { tree } = renderForm({
      [FORM_STATE]: READY_FORM,
      [SELECTED_PLACE_STATE]: SELECTED_PLACE,
    })
    const form = findElement(tree, (el) => el.type === 'form')

    await form!.props.onSubmit({ preventDefault: vi.fn() })

    const place = JSON.parse(fetchMock.mock.calls[0][1].body).place
    expect(Object.keys(place).sort()).toEqual(
      ['county', 'district', 'id', 'kind', 'label', 'name', 'state'].sort(),
    )
    expect(place).not.toHaveProperty('latitude')
    expect(place).not.toHaveProperty('longitude')
  })

  it('omits place entirely for hand-typed coordinates', async () => {
    const fetchMock = stubFetch({ status: 201, body: { name: 'Asha Sharma', lagna: 'Leo' } })
    const { tree } = renderForm({
      [FORM_STATE]: READY_FORM,
      [SELECTED_PLACE_STATE]: null,
    })
    const form = findElement(tree, (el) => el.type === 'form')

    await form!.props.onSubmit({ preventDefault: vi.fn() })

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).not.toHaveProperty('place')
  })
})

// ─── Location validation (R5.4) ──────────────────────────────────────────

describe('unified-charts ComputeForm — location validation', () => {
  it.each([
    ['both coordinates missing', { latitude: '', longitude: '' }],
    ['only latitude', { latitude: '18.6772446', longitude: '' }],
    ['only longitude', { latitude: '', longitude: '73.8981129' }],
  ])('blocks submission with a visible message when %s', async (_description, coordinates) => {
    const fetchMock = stubFetch({ status: 201, body: {} })
    const { tree, setterCalls } = renderForm({
      [FORM_STATE]: { ...READY_FORM, ...coordinates },
      [SELECTED_PLACE_STATE]: null,
    })
    const form = findElement(tree, (el) => el.type === 'form')

    await form!.props.onSubmit({ preventDefault: vi.fn() })

    expect(setterCalls[ERROR_STATE]).toEqual([null, BIRTH_LOCATION_MESSAGES.location_required])
    // Never started: no request, and the button never entered its pending label.
    expect(fetchMock).not.toHaveBeenCalled()
    expect(setterCalls[SUBMITTING_STATE]).toEqual([])
  })

  it('reveals the manual coordinate disclosure so the offending field is focusable', async () => {
    stubFetch({ status: 201, body: {} })
    const { tree, setterCalls } = renderForm({
      [FORM_STATE]: { ...READY_FORM, latitude: '', longitude: '' },
      [SELECTED_PLACE_STATE]: null,
      [MANUAL_COORDINATES_OPEN_STATE]: false,
    })
    const form = findElement(tree, (el) => el.type === 'form')

    await form!.props.onSubmit({ preventDefault: vi.fn() })

    expect(setterCalls[MANUAL_COORDINATES_OPEN_STATE]).toEqual([true])
  })

  it('rejects coordinates outside their valid ranges', async () => {
    const fetchMock = stubFetch({ status: 201, body: {} })
    const { tree, setterCalls } = renderForm({
      [FORM_STATE]: { ...READY_FORM, latitude: '90.0000001' },
      [SELECTED_PLACE_STATE]: null,
    })
    const form = findElement(tree, (el) => el.type === 'form')

    await form!.props.onSubmit({ preventDefault: vi.fn() })

    expect(setterCalls[ERROR_STATE]).toEqual([
      null,
      BIRTH_LOCATION_MESSAGES.coordinate_out_of_range,
    ])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('names the place, not the empty form, when a selection carries no coordinates', async () => {
    stubFetch({ status: 201, body: {} })
    const { tree, setterCalls } = renderForm({
      [FORM_STATE]: { ...READY_FORM, latitude: '', longitude: '' },
      [SELECTED_PLACE_STATE]: SELECTED_PLACE,
    })
    const form = findElement(tree, (el) => el.type === 'form')

    await form!.props.onSubmit({ preventDefault: vi.fn() })

    expect(setterCalls[ERROR_STATE]).toEqual([
      null,
      BIRTH_LOCATION_MESSAGES.place_missing_coordinates,
    ])
  })
})

// ─── The silent-submit regression itself ─────────────────────────────────

describe('unified-charts ComputeForm — no native constraint can abort submission unseen', () => {
  it.each([
    ['latitude', LATITUDE_PLACEHOLDER],
    ['longitude', LONGITUDE_PLACEHOLDER],
  ])(
    'leaves the disclosed %s input free of required/min/max, which the browser would enforce on an unfocusable control',
    (_coordinate, placeholder) => {
      const { tree } = renderForm({ [SELECTED_PLACE_STATE]: null })
      const input = findByPlaceholder(tree, placeholder)

      expect(input).toBeDefined()
      expect(input!.props.required).toBeUndefined()
      expect(input!.props.min).toBeUndefined()
      expect(input!.props.max).toBeUndefined()
      // Belt-and-braces: any residual native constraint reveals the field.
      expect(typeof input!.props.onInvalid).toBe('function')
    },
  )

  it('keeps the coordinate inputs inside a disclosure that is closed by default', () => {
    const { tree } = renderForm()
    const disclosure = findElement(tree, (el) => el.type === 'details')

    expect(disclosure).toBeDefined()
    expect(disclosure!.props.open).toBe(false)
    expect(findByPlaceholder(disclosure, LATITUDE_PLACEHOLDER)).toBeDefined()
  })

  it('opens the disclosure from a coordinate input\u2019s onInvalid', () => {
    const { tree, setterCalls } = renderForm()
    const input = findByPlaceholder(tree, LATITUDE_PLACEHOLDER)

    input!.props.onInvalid()

    expect(setterCalls[MANUAL_COORDINATES_OPEN_STATE]).toEqual([true])
  })

  it('announces a blocked submission rather than conveying it by colour alone', () => {
    const { tree } = renderForm({ [ERROR_STATE]: BIRTH_LOCATION_MESSAGES.location_required })
    const alert = findElement(tree, (el) => el.props?.role === 'alert')

    expect(alert).toBeDefined()
    expect(textOf(alert)).toContain(BIRTH_LOCATION_MESSAGES.location_required)
  })
})

// ─── Picker wiring (R8.1) ────────────────────────────────────────────────

describe('unified-charts ComputeForm — picker wiring', () => {
  it('sets the coordinates, IST, and closes manual entry on selection', () => {
    const { tree, setterCalls } = renderForm({ [FORM_STATE]: EMPTY_FORM })
    const picker = findElement(tree, (el) => el.type === PlacePicker)

    expect(picker).toBeDefined()
    picker!.props.onSelect(SELECTED_PLACE)

    expect(setterCalls[FORM_STATE]).toEqual([{
      ...EMPTY_FORM,
      latitude: '18.6772446',
      longitude: '73.8981129',
      timezone: '5.5',
    }])
    expect(setterCalls[SELECTED_PLACE_STATE]).toEqual([SELECTED_PLACE])
    expect(setterCalls[MANUAL_COORDINATES_OPEN_STATE]).toEqual([false])
  })

  it('drops the place identity when a coordinate is hand-edited, so no stale label is persisted', () => {
    const { tree, setterCalls } = renderForm({
      [FORM_STATE]: READY_FORM,
      [SELECTED_PLACE_STATE]: SELECTED_PLACE,
    })
    const latitude = findByPlaceholder(tree, LATITUDE_PLACEHOLDER)

    latitude!.props.onChange({ target: { value: '18.7000000' } })

    expect(setterCalls[SELECTED_PLACE_STATE]).toEqual([null])
    expect(setterCalls[FORM_STATE]).toEqual([{ ...READY_FORM, latitude: '18.7000000' }])
  })

  it('reveals manual coordinates from the picker\u2019s escape hatch', () => {
    const { tree, setterCalls } = renderForm()
    const picker = findElement(tree, (el) => el.type === PlacePicker)

    picker!.props.onManualEntry()

    expect(setterCalls[MANUAL_COORDINATES_OPEN_STATE]).toEqual([true])
  })

  it.each([
    ['idle', false],
    ['submitting', true],
  ])('disables the picker while %s, matching the Chart Computation form', (_state, submitting) => {
    const { tree } = renderForm({ [SUBMITTING_STATE]: submitting })
    const picker = findElement(tree, (el) => el.type === PlacePicker)

    expect(picker!.props.disabled).toBe(submitting)
  })
})

// ─── Success feedback ────────────────────────────────────────────────────

describe('unified-charts ComputeForm — feedback regions', () => {
  it('gives the success message a status role', () => {
    const { tree } = renderForm({ [SUCCESS_STATE]: 'Chart "Asha Sharma" created (Leo Lagna)' })
    const status = findElement(tree, (el) => el.props?.role === 'status')

    expect(status).toBeDefined()
    expect(textOf(status)).toContain('Chart "Asha Sharma" created')
  })

  it('renders exactly one submit button, whose label reflects the pending state', () => {
    const idle = findAllElements(renderForm().tree, (el) => el.props?.type === 'submit')
    const pending = findAllElements(
      renderForm({ [SUBMITTING_STATE]: true }).tree,
      (el) => el.props?.type === 'submit',
    )

    expect(idle).toHaveLength(1)
    expect(textOf(idle[0]).trim()).toBe('Compute & Save Chart')
    expect(textOf(pending[0]).trim()).toBe('Computing...')
  })
})
