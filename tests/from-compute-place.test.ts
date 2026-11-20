import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/auth', () => ({
  resolveRequestUser: vi.fn(),
}))

vi.mock('@/lib/unified-chart-create', () => ({
  createUnifiedChartFromBirthData: vi.fn(),
}))

import { POST } from '@/app/api/unified-charts/from-compute/route'
import { resolveRequestUser } from '@/lib/auth'
import { createUnifiedChartFromBirthData } from '@/lib/unified-chart-create'

const VALID_INPUT = {
  name: 'Place persistence test',
  date: '1990-01-01',
  time: '10:00',
  timezone: 5.5,
  latitude: 18.6772446,
  longitude: 73.8981129,
}

const PLACE = {
  id: 'b1dd76ce-4a90-4a81-8f47-38d3913cbd5d',
  name: 'Alandi',
  kind: 'village',
  state: 'Maharashtra',
  district: 'Pune',
  county: 'Khed',
  label: 'Alandi, Khed, Maharashtra',
}

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/unified-charts/from-compute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(resolveRequestUser).mockResolvedValue('user-1')
  vi.mocked(createUnifiedChartFromBirthData).mockResolvedValue({
    status: 'created',
    id: 'chart-1',
    name: VALID_INPUT.name,
    lagna: 'Aries',
    birthDatetime: new Date('1990-01-01T04:30:00.000Z'),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  })
})

describe('POST /api/unified-charts/from-compute — place persistence', () => {
  it('accepts complete place metadata and forwards only the persisted place shape', async () => {
    const response = await POST(makeRequest({ ...VALID_INPUT, place: PLACE }))

    expect(response.status).toBe(201)
    expect(createUnifiedChartFromBirthData).toHaveBeenCalledWith({
      ...VALID_INPUT,
      place: PLACE,
      sunriseMode: 'precise',
      userId: 'user-1',
    })

    const [input] = vi.mocked(createUnifiedChartFromBirthData).mock.calls[0]
    expect(Object.keys(input.place ?? {}).sort()).toEqual([
      'county',
      'district',
      'id',
      'kind',
      'label',
      'name',
      'state',
    ])
  })

  it('remains backward compatible when place metadata is absent', async () => {
    const response = await POST(makeRequest(VALID_INPUT))

    expect(response.status).toBe(201)
    const [input] = vi.mocked(createUnifiedChartFromBirthData).mock.calls[0]
    expect(input).not.toHaveProperty('place')
  })

  it.each([
    ['an unsupported settlement kind', { ...PLACE, kind: 'suburb' }],
    ['coordinates duplicated inside the strict metadata object', { ...PLACE, latitude: 18.6772446 }],
    ['a non-UUID place identity', { ...PLACE, id: 'osm-node-123' }],
    ['an empty required administrative label', { ...PLACE, district: ' ' }],
  ])('rejects %s', async (_label, place) => {
    const response = await POST(makeRequest({ ...VALID_INPUT, place }))

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toBe('Invalid input')
    expect(body.details.place).toBeDefined()
    expect(createUnifiedChartFromBirthData).not.toHaveBeenCalled()
  })
})
