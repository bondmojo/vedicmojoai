import { afterEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { gocharErrorMessage, useGocharRange } from './useGocharRange'
import type { GocharApiResponse } from '@/lib/gocharRange'

const REACT_INTERNALS = (React as unknown as {
  __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED: {
    ReactCurrentDispatcher: { current: unknown }
  }
}).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED

const SOURCE = {
  kind: 'unsaved' as const,
  birthData: { date: '1990-04-27', time: '12:00', timezone: 5.5, latitude: 28.6, longitude: 77.2 },
}

const RESPONSE: GocharApiResponse = {
  rangeStart: '2024-01-01T00:00:00.000Z',
  rangeEnd: '2024-01-02T00:00:00.000Z',
  dateFrom: '2024-01-01T00:00:00.000Z',
  dateTo: '2024-01-02T00:00:00.000Z',
  ayanamsa: 'Lahiri',
  includedGrahas: ['Sun'],
  moonIncluded: false,
  intervals: [],
}

function response(ok: boolean, payload: unknown): Response {
  return { ok, json: vi.fn().mockResolvedValue(payload) } as unknown as Response
}

/** Minimal persistent React hook dispatcher for the repo's no-DOM test setup. */
function createHookHarness<T>(render: () => T) {
  const states: unknown[] = []
  const refs: Array<{ current: unknown }> = []

  function run(): T {
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
      return render()
    } finally {
      dispatcher.current = previous
    }
  }

  return { run }
}

afterEach(() => vi.unstubAllGlobals())

describe('gocharErrorMessage', () => {
  it('uses one field message rather than repeating a span error attached to both dates', () => {
    expect(gocharErrorMessage({
      error: 'Invalid input',
      details: { dateFrom: ['Span too long'], dateTo: ['Span too long'] },
    })).toBe('Span too long')
  })

  it('falls back to error and then a generic message', () => {
    expect(gocharErrorMessage({ error: 'Unauthorized' })).toBe('Unauthorized')
    expect(gocharErrorMessage({ details: {} })).toBe('Gochar range request failed.')
  })
})

describe('useGocharRange', () => {
  it('forwards Moon-excluded input by default and caches a successful response without loading', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(true, RESPONSE))
    vi.stubGlobal('fetch', fetchMock)
    const harness = createHookHarness(() => useGocharRange(SOURCE))
    let hook = harness.run()
    const input = { dateFrom: '2024-01-01', dateTo: '2024-01-01', includeMoon: false }

    await hook.request(input)
    hook = harness.run()
    expect(hook.result).toEqual(RESPONSE)
    expect(hook.loading).toBe(false)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ ...input, birthData: SOURCE.birthData })

    const cached = hook.request(input)
    hook = harness.run()
    expect(hook.loading).toBe(false)
    await cached
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('maps a saved source to unifiedChartId without forwarding birthData', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(true, RESPONSE))
    vi.stubGlobal('fetch', fetchMock)
    const savedSource = { kind: 'saved' as const, unifiedChartId: 'b1dd76ce-4a90-4a81-8f47-38d3913cbd5d' }
    const harness = createHookHarness(() => useGocharRange(savedSource))
    const hook = harness.run()

    await hook.request({ dateFrom: '2024-01-01', dateTo: '2024-01-01', includeMoon: false })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.unifiedChartId).toBe(savedSource.unifiedChartId)
    expect(body.birthData).toBeUndefined()
  })

  it('returns a readable error instead of throwing when a malformed parent omits its source', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const harness = createHookHarness(() => useGocharRange(undefined as never))
    let hook = harness.run()

    await expect(hook.request({ dateFrom: '2024-01-01', dateTo: '2024-01-01', includeMoon: false })).resolves.toBeUndefined()
    hook = harness.run()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(hook.error).toBe('Gochar chart context is unavailable.')
    expect(hook.loading).toBe(false)
  })

  it('discards a superseded in-flight response', async () => {
    let resolveFirst!: (value: Response) => void
    let resolveSecond!: (value: Response) => void
    const first = new Promise<Response>((resolve) => { resolveFirst = resolve })
    const second = new Promise<Response>((resolve) => { resolveSecond = resolve })
    const fetchMock = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second)
    vi.stubGlobal('fetch', fetchMock)
    const harness = createHookHarness(() => useGocharRange(SOURCE))
    let hook = harness.run()

    const firstRequest = hook.request({ dateFrom: '2024-01-01', dateTo: '2024-01-01', includeMoon: false })
    hook = harness.run()
    const secondRequest = hook.request({ dateFrom: '2024-02-01', dateTo: '2024-02-01', includeMoon: false })
    resolveSecond(response(true, { ...RESPONSE, dateFrom: '2024-02-01T00:00:00.000Z' }))
    await secondRequest
    hook = harness.run()
    expect(hook.result?.dateFrom).toBe('2024-02-01T00:00:00.000Z')

    resolveFirst(response(true, RESPONSE))
    await firstRequest
    hook = harness.run()
    expect(hook.result?.dateFrom).toBe('2024-02-01T00:00:00.000Z')
    expect(hook.loading).toBe(false)
  })

  it('keeps the last result while surfacing one readable failed-request error', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(true, RESPONSE))
      .mockResolvedValueOnce(response(false, { error: 'Invalid input', details: { dateFrom: ['Span too long'], dateTo: ['Span too long'] } }))
    vi.stubGlobal('fetch', fetchMock)
    const harness = createHookHarness(() => useGocharRange(SOURCE))
    let hook = harness.run()

    await hook.request({ dateFrom: '2024-01-01', dateTo: '2024-01-01', includeMoon: false })
    hook = harness.run()
    await hook.request({ dateFrom: '2020-01-01', dateTo: '2024-01-01', includeMoon: false })
    hook = harness.run()

    expect(hook.result).toEqual(RESPONSE)
    expect(hook.error).toBe('Span too long')
  })

  it('immediately hides data and loading state belonging to a prior natal source', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(true, RESPONSE))
    vi.stubGlobal('fetch', fetchMock)
    let source = SOURCE
    const harness = createHookHarness(() => useGocharRange(source))
    let hook = harness.run()

    await hook.request({ dateFrom: '2024-01-01', dateTo: '2024-01-01', includeMoon: false })
    hook = harness.run()
    expect(hook.result).toEqual(RESPONSE)

    source = {
      ...SOURCE,
      birthData: { ...SOURCE.birthData, date: '1991-04-27' },
    }
    hook = harness.run()

    expect(hook.result).toBeNull()
    expect(hook.error).toBeNull()
    expect(hook.loading).toBe(false)
  })

  it('does not surface a prior source response that completes after birth data changes', async () => {
    let resolve!: (value: Response) => void
    const pending = new Promise<Response>((done) => { resolve = done })
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(pending))
    let source = SOURCE
    const harness = createHookHarness(() => useGocharRange(source))
    let hook = harness.run()

    const request = hook.request({ dateFrom: '2024-01-01', dateTo: '2024-01-01', includeMoon: false })
    hook = harness.run()
    expect(hook.loading).toBe(true)

    source = { ...SOURCE, birthData: { ...SOURCE.birthData, latitude: 19.1 } }
    hook = harness.run()
    expect(hook.loading).toBe(false)
    expect(hook.result).toBeNull()

    resolve(response(true, RESPONSE))
    await request
    hook = harness.run()
    expect(hook.result).toBeNull()
    expect(hook.loading).toBe(false)
  })
})
