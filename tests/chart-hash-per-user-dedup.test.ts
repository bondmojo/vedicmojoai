/**
 * tests/chart-hash-per-user-dedup.test.ts
 * Regression coverage for a gap found during a requirements.md re-audit:
 * UnifiedChart.chartHash used to be globally @unique, so two practitioners
 * could never independently save a chart for the same birth data — the
 * second save would either 409 or (via update) leak the first user's chart
 * id/name in the response. Requirement 5.8 now requires the dedup
 * constraint (and every lookup against it) be scoped to `userId`.
 *
 * Mocks: @/lib/db, engine/compute, engine/computeVimshottari, lib/chart-mapper
 * (lib/unified-chart-create.ts) and @/lib/auth + @/lib/db (from-paste route).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

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
  computeFullChart: vi.fn().mockReturnValue({
    planets: [{ planet: 'Moon', longitude: 42 }],
  }),
}))

vi.mock('@/engine/computeVimshottari', () => ({
  computeVimshottari: vi.fn().mockReturnValue({ periods: [] }),
}))

vi.mock('@/lib/chart-mapper', () => ({
  mapComputedToUnified: vi.fn().mockReturnValue({ chartHash: 'hash-abc', name: 'Test' }),
  mapPastedToUnified: vi.fn().mockReturnValue({ chartHash: 'hash-abc', name: 'Test' }),
  serializeDashaTree: vi.fn().mockReturnValue({}),
}))

vi.mock('@/lib/auth', () => ({
  resolveRequestUser: vi.fn(),
}))

vi.mock('@/lib/validation', () => ({
  validateChartInput: vi.fn().mockReturnValue({}),
}))

import { createUnifiedChartFromBirthData } from '../lib/unified-chart-create'
import { POST as fromCompute } from '../app/api/unified-charts/from-compute/route'
import { POST as fromPaste } from '../app/api/unified-charts/from-paste/route'
import { computeFullChart } from '@/engine/compute'
import { resolveRequestUser } from '@/lib/auth'
import { prisma } from '@/lib/db'

const USER_A = 'user-a'
const USER_B = 'user-b'

const BIRTH_INPUT = {
  name: 'Test',
  date: '1990-01-01',
  time: '10:00',
  timezone: 5.5,
  latitude: 12.9,
  longitude: 77.6,
  sunriseMode: 'precise' as const,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('createUnifiedChartFromBirthData — per-user chartHash dedup', () => {
  it('scopes the dedup lookup by userId, not chartHash alone', async () => {
    ;(prisma.unifiedChart.findUnique as any).mockResolvedValue(null)
    ;(prisma.unifiedChart.create as any).mockResolvedValue({
      id: 'chart-1', name: 'Test', lagna: 'Aries', birthDatetime: new Date(), createdAt: new Date(),
    })

    await createUnifiedChartFromBirthData({ ...BIRTH_INPUT, userId: USER_A })

    expect(prisma.unifiedChart.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_chartHash: { userId: USER_A, chartHash: 'hash-abc' } },
      })
    )
  })

  it('does not report a duplicate when a DIFFERENT user owns the same chartHash', async () => {
    // findUnique is scoped by userId, so a different user's identical chart
    // never surfaces here — simulating that by resolving null (no row for
    // this user+hash pair) even though the hash exists globally for USER_A.
    ;(prisma.unifiedChart.findUnique as any).mockResolvedValue(null)
    ;(prisma.unifiedChart.create as any).mockResolvedValue({
      id: 'chart-2', name: 'Test', lagna: 'Aries', birthDatetime: new Date(), createdAt: new Date(),
    })

    const result = await createUnifiedChartFromBirthData({ ...BIRTH_INPUT, userId: USER_B })

    expect(result.status).toBe('created')
  })

  it('still reports duplicate for the SAME user re-submitting the same birth data', async () => {
    ;(prisma.unifiedChart.findUnique as any).mockResolvedValue({ id: 'chart-1', name: 'Test' })

    const result = await createUnifiedChartFromBirthData({ ...BIRTH_INPUT, userId: USER_A })

    expect(result.status).toBe('duplicate')
    expect(result.id).toBe('chart-1')
  })
  it('blocks SSS persistence before compute, mapping, or legacy Drik dedup can run', async () => {
    await expect(createUnifiedChartFromBirthData({
      ...BIRTH_INPUT,
      userId: USER_A,
      calculationProfile: 'surya_siddhanta_makaranda_v1',
    })).rejects.toMatchObject({
      code: 'CALCULATION_PROFILE_PERSISTENCE_UNAVAILABLE',
      calculationProfile: 'surya_siddhanta_makaranda_v1',
    })

    expect(computeFullChart).not.toHaveBeenCalled()
    expect(prisma.unifiedChart.findUnique).not.toHaveBeenCalled()
    expect(prisma.unifiedChart.create).not.toHaveBeenCalled()
  })
})

describe('POST /api/unified-charts/from-compute — profile safety', () => {
  function makeComputeRequest(body: Record<string, unknown>): NextRequest {
    return new NextRequest('http://localhost:3000/api/unified-charts/from-compute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  it('returns 422 with the temporary persistence code for an SSS create request', async () => {
    ;(resolveRequestUser as any).mockResolvedValue(USER_A)

    const response = await fromCompute(makeComputeRequest({
      ...BIRTH_INPUT,
      calculationProfile: 'surya_siddhanta_makaranda_v1',
    }))

    expect(response.status).toBe(422)
    await expect(response.json()).resolves.toMatchObject({
      code: 'CALCULATION_PROFILE_PERSISTENCE_UNAVAILABLE',
      calculationProfile: 'surya_siddhanta_makaranda_v1',
    })
  })

  it('retains strict API profile validation as HTTP 400', async () => {
    ;(resolveRequestUser as any).mockResolvedValue(USER_A)

    const response = await fromCompute(makeComputeRequest({
      ...BIRTH_INPUT,
      calculationProfile: 'not-a-profile',
    }))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ error: 'Invalid input' })
  })
})

describe('POST /api/unified-charts/from-paste — per-user chartHash dedup', () => {
  function makeRequest(): NextRequest {
    return new NextRequest('http://localhost:3000/api/unified-charts/from-paste', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
  }

  it('scopes the duplicate check by userId, not chartHash alone', async () => {
    ;(resolveRequestUser as any).mockResolvedValue(USER_A)
    ;(prisma.unifiedChart.findUnique as any).mockResolvedValue(null)
    ;(prisma.unifiedChart.create as any).mockResolvedValue({
      id: 'chart-1', name: 'Test', source: 'paste', lagna: 'Aries', birthDatetime: new Date(), createdAt: new Date(),
    })

    await fromPaste(makeRequest())

    expect(prisma.unifiedChart.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_chartHash: { userId: USER_A, chartHash: 'hash-abc' } },
      })
    )
  })
})
