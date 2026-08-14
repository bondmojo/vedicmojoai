/**
 * POST /api/gochar — route contract tests.
 *
 * The ephemeris engine has its own exhaustive unit tests. These tests mock it
 * so they can focus on authentication, input/ownership handling, normalization,
 * and the route's read-only boundary.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { MAX_SPAN_WITH_MOON_MS, MAX_SPAN_WITHOUT_MOON_MS } from '@/lib/gocharRange'
import { GocharValidationError } from '@/lib/errors'
import type { GocharRangeInput, NatalGocharContext } from '@/engine/compute'
import type { GocharRangeResult } from '@/lib/gocharRange'

vi.mock('@/lib/auth', () => ({
  resolveRequestUser: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  prisma: {
    unifiedChart: {
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    pipelineRun: {
      create: vi.fn(),
    },
  },
}))

vi.mock('@/engine/compute', () => ({
  computeGocharRange: vi.fn(),
  resolveNatalGocharContext: vi.fn(),
}))

import { POST } from '../app/api/gochar/route'
import { resolveRequestUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { computeGocharRange, resolveNatalGocharContext } from '@/engine/compute'

const CHART_ID = 'b1dd76ce-4a90-4a81-8f47-38d3913cbd5d'

const BIRTH_DATA = {
  date: '1990-04-27',
  time: '12:00:00',
  timezone: 5.5,
  latitude: 28.6139,
  longitude: 77.209,
  sunriseMode: 'precise' as const,
}

const DEFAULT_GRAHAS = [
  'Sun', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu',
] as const

function makeRangeResult(input: GocharRangeInput): GocharRangeResult {
  const includedGrahas = input.includeMoon
    ? ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'] as const
    : DEFAULT_GRAHAS

  return {
    rangeStart: input.start.toISOString(),
    rangeEnd: input.end.toISOString(),
    includedGrahas: [...includedGrahas],
    moonIncluded: input.includeMoon,
    intervals: [
      {
        planet: 'Sun',
        sign: 'Capricorn',
        signNumber: 10,
        houseFromMoon: 1,
        houseFromLagna: 1,
        start: input.start.toISOString(),
        end: input.end.toISOString(),
      },
    ],
  }
}

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/gochar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function instantAt(start: string, offsetMs: number): string {
  return new Date(new Date(start).getTime() + offsetMs).toISOString()
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(resolveRequestUser).mockResolvedValue('user-1')
  vi.mocked(prisma.unifiedChart.findUnique).mockResolvedValue({
    moonLongitude: 273.4,
    lagnaLongitude: 93.2,
    userId: 'user-1',
  } as never)
  vi.mocked(resolveNatalGocharContext).mockReturnValue({
    natalMoonSignNumber: 10,
    natalLagnaSignNumber: 4,
  } satisfies NatalGocharContext)
  vi.mocked(computeGocharRange).mockImplementation(makeRangeResult)
})

describe('POST /api/gochar', () => {
  it('requires authentication', async () => {
    vi.mocked(resolveRequestUser).mockResolvedValue(null)

    const response = await POST(makeRequest({}))

    expect(response.status).toBe(401)
    expect(prisma.unifiedChart.findUnique).not.toHaveBeenCalled()
    expect(computeGocharRange).not.toHaveBeenCalled()
  })

  it('rejects malformed JSON', async () => {
    const request = new NextRequest('http://localhost:3000/api/gochar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not json',
    })

    const response = await POST(request)

    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe('Invalid JSON body')
  })

  it.each([
    ['neither source', { dateFrom: '2024-01-01', dateTo: '2024-01-01' }],
    ['both sources', { dateFrom: '2024-01-01', dateTo: '2024-01-01', unifiedChartId: CHART_ID, birthData: BIRTH_DATA }],
  ])('rejects %s', async (_label, body) => {
    const response = await POST(makeRequest(body))

    expect(response.status).toBe(400)
    expect((await response.json()).details.unifiedChartId).toBeDefined()
    expect(computeGocharRange).not.toHaveBeenCalled()
  })

  it.each([null, { moonLongitude: 273.4, lagnaLongitude: 93.2, userId: 'another-user' }])(
    'returns 404 for an absent or unowned saved chart',
    async (chart) => {
      vi.mocked(prisma.unifiedChart.findUnique).mockResolvedValue(chart as never)

      const response = await POST(makeRequest({
        dateFrom: '2024-01-01',
        dateTo: '2024-01-01',
        unifiedChartId: CHART_ID,
      }))

      expect(response.status).toBe(404)
      expect(computeGocharRange).not.toHaveBeenCalled()
    }
  )

  it.each([
    ['reversed dates', { dateFrom: '2024-01-02', dateTo: '2024-01-01' }],
    ['malformed date', { dateFrom: 'not-a-date', dateTo: '2024-01-01' }],
  ])('returns 400 for %s', async (_label, dates) => {
    const response = await POST(makeRequest({ ...dates, unifiedChartId: CHART_ID }))

    expect(response.status).toBe(400)
    expect(computeGocharRange).not.toHaveBeenCalled()
  })

  it('accepts a same-day request, normalizes UTC bounds, and defaults Moon off', async () => {
    const response = await POST(makeRequest({
      dateFrom: '2024-01-01',
      dateTo: '2024-01-01',
      unifiedChartId: CHART_ID,
    }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.dateFrom).toBe('2024-01-01T00:00:00.000Z')
    expect(body.dateTo).toBe('2024-01-02T00:00:00.000Z')
    expect(body.rangeStart).toBe(body.dateFrom)
    expect(body.rangeEnd).toBe(body.dateTo)
    expect(body.ayanamsa).toBe('Lahiri')
    expect(body.includedGrahas).toEqual(DEFAULT_GRAHAS)
    expect(body.moonIncluded).toBe(false)
    expect(computeGocharRange).toHaveBeenCalledWith({
      natalMoonSignNumber: 10,
      natalLagnaSignNumber: 4,
      start: new Date('2024-01-01T00:00:00.000Z'),
      end: new Date('2024-01-02T00:00:00.000Z'),
      includeMoon: false,
    })
    expect(prisma.unifiedChart.findUnique).toHaveBeenCalledWith({
      where: { id: CHART_ID },
      select: {
        moonLongitude: true,
        lagnaLongitude: true,
        userId: true,
      },
    })
  })

  it('derives context in memory for unsaved birth data', async () => {
    const response = await POST(makeRequest({
      dateFrom: '2024-01-01T06:00:00Z',
      dateTo: '2024-01-02T06:00:00Z',
      birthData: BIRTH_DATA,
      includeMoon: true,
    }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(resolveNatalGocharContext).toHaveBeenCalledWith(BIRTH_DATA)
    expect(prisma.unifiedChart.findUnique).not.toHaveBeenCalled()
    expect(body.moonIncluded).toBe(true)
    expect(body.includedGrahas).toContain('Moon')
  })

  it('returns 400 when valid-shaped birth data cannot produce natal context', async () => {
    vi.mocked(resolveNatalGocharContext).mockImplementation(() => {
      throw new Error('Moon position could not be computed')
    })

    const response = await POST(makeRequest({
      dateFrom: '2024-01-01',
      dateTo: '2024-01-01',
      birthData: BIRTH_DATA,
    }))

    expect(response.status).toBe(400)
    expect((await response.json()).details.birthData).toBeDefined()
  })

  it.each([
    ['without Moon', false, MAX_SPAN_WITHOUT_MOON_MS],
    ['with Moon', true, MAX_SPAN_WITH_MOON_MS],
  ])('enforces the span cap %s at the exact millisecond boundary', async (_label, includeMoon, maximumMs) => {
    const start = '2024-01-01T00:00:00.000Z'
    const withinLimit = instantAt(start, maximumMs)
    const beyondLimit = instantAt(start, maximumMs + 1)

    const accepted = await POST(makeRequest({
      dateFrom: start,
      dateTo: withinLimit,
      includeMoon,
      unifiedChartId: CHART_ID,
    }))
    const rejected = await POST(makeRequest({
      dateFrom: start,
      dateTo: beyondLimit,
      includeMoon,
      unifiedChartId: CHART_ID,
    }))

    expect(accepted.status).toBe(200)
    expect(rejected.status).toBe(400)
  })

  it('maps typed engine validation failures to 400', async () => {
    vi.mocked(computeGocharRange).mockImplementation(() => {
      throw new GocharValidationError('natalMoonSignNumber must be an integer in 1..12')
    })

    const response = await POST(makeRequest({
      dateFrom: '2024-01-01',
      dateTo: '2024-01-01',
      unifiedChartId: CHART_ID,
    }))

    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe('Invalid input')
  })

  it('does not expose an unexpected ephemeris failure', async () => {
    vi.mocked(computeGocharRange).mockImplementation(() => {
      throw new Error('Swiss Ephemeris unavailable')
    })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const response = await POST(makeRequest({
      dateFrom: '2024-01-01',
      dateTo: '2024-01-01',
      unifiedChartId: CHART_ID,
    }))

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Gochar computation failed' })
    errorSpy.mockRestore()
  })

  it('never writes a UnifiedChart or creates an analysis as part of Gochar computation', async () => {
    await POST(makeRequest({
      dateFrom: '2024-01-01',
      dateTo: '2024-01-01',
      unifiedChartId: CHART_ID,
    }))
    await POST(makeRequest({ dateFrom: 'bad', dateTo: '2024-01-01', unifiedChartId: CHART_ID }))

    expect(prisma.unifiedChart.update).not.toHaveBeenCalled()
    expect(prisma.unifiedChart.create).not.toHaveBeenCalled()
    expect(prisma.pipelineRun.create).not.toHaveBeenCalled()
  })
})
