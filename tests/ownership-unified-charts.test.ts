/**
 * tests/ownership-unified-charts.test.ts
 * Ownership-enforcement regression tests for GET/PATCH/DELETE
 * /api/unified-charts/[id] (Requirement 5) — cross-account access must
 * return 404, never 403 (Decision 5); the owner must still succeed.
 *
 * Mocks: @/lib/auth (resolveRequestUser), @/lib/db.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/auth', () => ({
  resolveRequestUser: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  prisma: {
    unifiedChart: {
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    durationMessage: { deleteMany: vi.fn() },
    durationAnalysis: { deleteMany: vi.fn() },
    pipelineRun: { deleteMany: vi.fn() },
    compatibilityMatch: { deleteMany: vi.fn() },
    $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  },
}))

import { GET, PATCH, DELETE } from '../app/api/unified-charts/[id]/route'
import { resolveRequestUser } from '@/lib/auth'
import { prisma } from '@/lib/db'

const OWNER_ID = 'owner-user-1'
const OTHER_USER_ID = 'other-user-2'
const CHART = {
  id: 'chart-1',
  userId: OWNER_ID,
  name: 'Test Chart',
  pipelineRuns: [],
}

function makeGetRequest(): NextRequest {
  return new NextRequest('http://localhost:3000/api/unified-charts/chart-1')
}

function makePatchRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/unified-charts/chart-1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  ;(prisma.unifiedChart.findUnique as any).mockResolvedValue(CHART)
})

describe('GET /api/unified-charts/[id] — ownership', () => {
  it('returns 401 when the caller has no identity at all', async () => {
    ;(resolveRequestUser as any).mockResolvedValue(null)
    const res = await GET(makeGetRequest(), { params: { id: 'chart-1' } })
    expect(res.status).toBe(401)
  })

  it('returns 404 (never 403) when a DIFFERENT user requests the chart', async () => {
    ;(resolveRequestUser as any).mockResolvedValue(OTHER_USER_ID)
    const res = await GET(makeGetRequest(), { params: { id: 'chart-1' } })
    expect(res.status).toBe(404)
  })

  it('returns 200 when the OWNER requests the chart', async () => {
    ;(resolveRequestUser as any).mockResolvedValue(OWNER_ID)
    const res = await GET(makeGetRequest(), { params: { id: 'chart-1' } })
    expect(res.status).toBe(200)
  })
})

describe('PATCH /api/unified-charts/[id] — ownership', () => {
  it('returns 404 when a different user tries to rename the chart', async () => {
    ;(resolveRequestUser as any).mockResolvedValue(OTHER_USER_ID)
    const res = await PATCH(makePatchRequest({ name: 'Hijacked Name' }), { params: { id: 'chart-1' } })
    expect(res.status).toBe(404)
    expect(prisma.unifiedChart.update).not.toHaveBeenCalled()
  })

  it('allows the owner to rename the chart', async () => {
    ;(resolveRequestUser as any).mockResolvedValue(OWNER_ID)
    ;(prisma.unifiedChart.update as any).mockResolvedValue({ id: 'chart-1', name: 'New Name', updatedAt: new Date() })

    const res = await PATCH(makePatchRequest({ name: 'New Name' }), { params: { id: 'chart-1' } })
    expect(res.status).toBe(200)
    expect(prisma.unifiedChart.update).toHaveBeenCalled()
  })
})

describe('DELETE /api/unified-charts/[id] — ownership', () => {
  it('returns 404 when a different user tries to delete the chart', async () => {
    ;(resolveRequestUser as any).mockResolvedValue(OTHER_USER_ID)
    const res = await DELETE(makeGetRequest(), { params: { id: 'chart-1' } })
    expect(res.status).toBe(404)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('allows the owner to delete the chart', async () => {
    ;(resolveRequestUser as any).mockResolvedValue(OWNER_ID)
    const res = await DELETE(makeGetRequest(), { params: { id: 'chart-1' } })
    expect(res.status).toBe(200)
    expect(prisma.$transaction).toHaveBeenCalled()
  })
})

// ─── CompatibilityMatch delete-cascade (task 7.6, NOT optional) ───────────
//
// The route only *mocks* compatibilityMatch.deleteMany above — these tests
// assert the cascade actually fires, on the correct FK, in the correct
// position relative to the chart delete.

describe('DELETE /api/unified-charts/[id] — CompatibilityMatch cascade', () => {
  it('deleting a chart that participates in a CompatibilityMatch succeeds (not 500)', async () => {
    ;(resolveRequestUser as any).mockResolvedValue(OWNER_ID)
    const res = await DELETE(makeGetRequest(), { params: { id: 'chart-1' } })
    expect(res.status).toBe(200)
  })

  it('calls compatibilityMatch.deleteMany with an OR covering both the bride-side and groom-side FK', async () => {
    ;(resolveRequestUser as any).mockResolvedValue(OWNER_ID)
    await DELETE(makeGetRequest(), { params: { id: 'chart-1' } })

    expect(prisma.compatibilityMatch.deleteMany).toHaveBeenCalledTimes(1)
    const call = (prisma.compatibilityMatch.deleteMany as any).mock.calls[0][0]
    expect(call.where.OR).toContainEqual({ brideChartId: 'chart-1' })
    expect(call.where.OR).toContainEqual({ groomChartId: 'chart-1' })
  })

  it('fires compatibilityMatch.deleteMany as one of the 5 ops passed to $transaction, before unifiedChart.delete in FK order', async () => {
    ;(resolveRequestUser as any).mockResolvedValue(OWNER_ID)
    await DELETE(makeGetRequest(), { params: { id: 'chart-1' } })

    // The op array is built by calling each mocked prisma method as an
    // array-literal element — so every element (durationMessage,
    // durationAnalysis, pipelineRun, compatibilityMatch, unifiedChart) is
    // itself a call that already happened by the time $transaction runs.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    const ops = (prisma.$transaction as any).mock.calls[0][0]
    expect(ops).toHaveLength(5)

    const deleteManyOrder = (prisma.compatibilityMatch.deleteMany as any).mock.invocationCallOrder[0]
    const chartDeleteOrder = (prisma.unifiedChart.delete as any).mock.invocationCallOrder[0]
    expect(deleteManyOrder).toBeLessThan(chartDeleteOrder)
  })
})
