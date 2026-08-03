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
