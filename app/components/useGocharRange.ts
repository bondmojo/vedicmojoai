/**
 * Shared client hook for deterministic date-ranged Gochar requests.
 *
 * The response types deliberately come from `lib/gocharRange`, not the compute
 * barrel: the latter reaches the native Swiss Ephemeris runtime and is not a
 * safe client import path.
 */
'use client'

import { useCallback, useRef, useState } from 'react'
import type { BirthInput } from '@/engine/compute/types'
import type { GocharApiResponse } from '@/lib/gocharRange'

export type GocharRequestSource =
  | { kind: 'saved'; unifiedChartId: string }
  | { kind: 'unsaved'; birthData: BirthInput }

export interface GocharRangeRequest {
  dateFrom: string
  dateTo: string
  includeMoon: boolean
}

export interface UseGocharRangeResult {
  result: GocharApiResponse | null
  error: string | null
  loading: boolean
  request: (input: GocharRangeRequest) => Promise<void>
  clear: () => void
}

type GocharErrorPayload = {
  error?: unknown
  details?: unknown
}

interface SourceScoped<T> {
  sourceKey: string
  value: T
}

/**
 * Returns one readable API failure message. Field validation errors use the
 * first declared field/message; joining every message would repeat range-cap
 * failures, which the route intentionally attaches to both date fields.
 */
export function gocharErrorMessage(payload: unknown): string {
  if (payload && typeof payload === 'object') {
    const { error, details } = payload as GocharErrorPayload
    if (details && typeof details === 'object' && !Array.isArray(details)) {
      for (const messages of Object.values(details as Record<string, unknown>)) {
        if (Array.isArray(messages) && typeof messages[0] === 'string' && messages[0].trim()) {
          return messages[0]
        }
      }
    }
    if (typeof error === 'string' && error.trim()) return error
  }
  return 'Gochar range request failed.'
}

function sourceCacheKey(source: GocharRequestSource): string {
  return source.kind === 'saved'
    ? `saved:${source.unifiedChartId}`
    : `unsaved:${JSON.stringify(source.birthData)}`
}

function requestCacheKey(source: GocharRequestSource, input: GocharRangeRequest): string {
  return `${sourceCacheKey(source)}:${input.dateFrom}:${input.dateTo}:${input.includeMoon}`
}

/**
 * Loads Gochar range data for one chart source. The cache and request sequence
 * are component-lifetime state: callers keep ownership of their form values,
 * so a failed request cannot erase a selected date or Moon preference.
 */
export function useGocharRange(source: GocharRequestSource): UseGocharRangeResult {
  // `source` is required by the public type. This defensive fallback keeps a
  // malformed parent prop from crashing if its UI action is nevertheless used.
  const sourceKey = source ? sourceCacheKey(source) : 'missing-source'
  const [resultState, setResultState] = useState<SourceScoped<GocharApiResponse> | null>(null)
  const [errorState, setErrorState] = useState<SourceScoped<string> | null>(null)
  const [loadingState, setLoadingState] = useState<SourceScoped<boolean> | null>(null)
  const requestSequence = useRef(0)
  const cache = useRef(new Map<string, GocharApiResponse>())

  // State from a prior natal context is never rendered for the current source.
  // This is derived at render time, so there is no stale-result frame when the
  // practitioner edits birth data.
  const result = resultState?.sourceKey === sourceKey ? resultState.value : null
  const error = errorState?.sourceKey === sourceKey ? errorState.value : null
  const loading = loadingState?.sourceKey === sourceKey ? loadingState.value : false

  const clear = useCallback(() => {
    requestSequence.current += 1
    setResultState(null)
    setErrorState(null)
    setLoadingState({ sourceKey, value: false })
  }, [sourceKey])

  const request = useCallback(async (input: GocharRangeRequest): Promise<void> => {
    const requestSourceKey = sourceKey
    if (!source) {
      requestSequence.current += 1
      setResultState(null)
      setErrorState({ sourceKey: requestSourceKey, value: 'Gochar chart context is unavailable.' })
      setLoadingState({ sourceKey: requestSourceKey, value: false })
      return
    }
    const key = requestCacheKey(source, input)
    const cached = cache.current.get(key)
    if (cached) {
      requestSequence.current += 1
      setResultState({ sourceKey: requestSourceKey, value: cached })
      setErrorState(null)
      // A cached request can supersede an in-flight network request. Clear that
      // older loading state without ever toggling loading on for the cache hit.
      setLoadingState({ sourceKey: requestSourceKey, value: false })
      return
    }

    const requestId = ++requestSequence.current
    setLoadingState({ sourceKey: requestSourceKey, value: true })
    setErrorState(null)

    const body = source.kind === 'saved'
      ? { ...input, unifiedChartId: source.unifiedChartId }
      : { ...input, birthData: source.birthData }

    try {
      const response = await fetch('/api/gochar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const payload: unknown = await response.json().catch(() => undefined)

      if (requestId !== requestSequence.current) return

      if (!response.ok) {
        setErrorState({ sourceKey: requestSourceKey, value: gocharErrorMessage(payload) })
        return
      }

      const range = payload as GocharApiResponse
      cache.current.set(key, range)
      setResultState({ sourceKey: requestSourceKey, value: range })
    } catch (caught) {
      if (requestId !== requestSequence.current) return
      setErrorState({
        sourceKey: requestSourceKey,
        value: caught instanceof Error && caught.message ? caught.message : 'Gochar range request failed.',
      })
    } finally {
      if (requestId === requestSequence.current) {
        setLoadingState({ sourceKey: requestSourceKey, value: false })
      }
    }
  }, [source, sourceKey])

  return { result, error, loading, request, clear }
}
