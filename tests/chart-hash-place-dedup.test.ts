import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({
  prisma: {
    unifiedChart: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}))

vi.mock('@/engine/compute', () => ({
  computeFullChart: vi.fn((input) => ({
    input,
    lagna: 'Aries',
    lagnaLongitude: 12.34,
    planets: [{ planet: 'Moon', longitude: 123.45 }],
    ayanamsa: 24.1,
    sunriseMode: input.sunriseMode,
  })),
}))

vi.mock('@/engine/computeVimshottari', () => ({
  computeVimshottari: vi.fn(() => ({ balance_years: 0, mahadashas: [] })),
}))

import { prisma } from '@/lib/db'
import { createUnifiedChartFromBirthData } from '@/lib/unified-chart-create'

const USER_ID = 'user-1'
const HAND_TYPED_INPUT = {
  name: 'Place deduplication test',
  date: '1990-01-01',
  time: '10:00',
  timezone: 5.5,
  latitude: 18.6772446,
  longitude: 73.8981129,
  sunriseMode: 'precise' as const,
  userId: USER_ID,
}

const PICKER_PLACE = {
  id: 'b1dd76ce-4a90-4a81-8f47-38d3913cbd5d',
  name: 'Alandi',
  kind: 'village',
  state: 'Maharashtra',
  district: 'Pune',
  county: 'Khed',
  label: 'Alandi, Khed, Maharashtra',
}

beforeEach(() => {
  vi.clearAllMocks()
  ;(prisma.unifiedChart.findUnique as any)
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce({ id: 'hand-typed-chart', name: HAND_TYPED_INPUT.name })
  ;(prisma.unifiedChart.create as any).mockResolvedValue({
    id: 'hand-typed-chart',
    name: HAND_TYPED_INPUT.name,
    lagna: 'Aries',
    birthDatetime: new Date('1990-01-01T04:30:00.000Z'),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  })
})

describe('picker and hand-typed coordinates — chart hash deduplication', () => {
  it('deduplicates a picker save against identical hand-typed birth coordinates for the same user', async () => {
    const handTyped = await createUnifiedChartFromBirthData(HAND_TYPED_INPUT)
    const pickerDerived = await createUnifiedChartFromBirthData({
      ...HAND_TYPED_INPUT,
      place: PICKER_PLACE,
    })

    expect(handTyped.status).toBe('created')
    expect(pickerDerived).toEqual({
      status: 'duplicate',
      id: 'hand-typed-chart',
      name: HAND_TYPED_INPUT.name,
    })
    expect(prisma.unifiedChart.create).toHaveBeenCalledTimes(1)

    const dedupLookups = (prisma.unifiedChart.findUnique as any).mock.calls
    expect(dedupLookups).toHaveLength(2)
    expect(dedupLookups[1][0].where.userId_chartHash).toEqual(
      dedupLookups[0][0].where.userId_chartHash
    )
    expect(dedupLookups[0][0].where.userId_chartHash).toEqual({
      userId: USER_ID,
      chartHash: expect.any(String),
    })
  })
})
