/**
 * tests/ownership-run-da-subroutes.test.ts
 * Regression coverage for a gap found during a requirements.md audit: the
 * cancel/override/events/chat sub-routes under /api/runs/[id]/* and
 * /api/duration-analysis/[id]/* had no authentication at all (Requirement
 * 2.5 covers them transitively via UnifiedChart ownership, but they were
 * missed when Requirement 8.3's MCP-route enumeration was used as the wiring
 * checklist instead). Confirms each now 401s with no identity and 404s
 * (never 403) for a non-owner, matching every other ownership check in the
 * app (Decision 5).
 *
 * Mocks: @/lib/auth (resolveRequestUser), @/lib/db, and the engine modules
 * each override route fires-and-forgets into (resumeFromHalt /
 * resumeDurationPipeline) so the module graph loads without hitting real
 * pipeline code.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/auth', () => ({
  resolveRequestUser: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  prisma: {
    pipelineRun: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    durationAnalysis: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}))

vi.mock('@/engine/orchestrator', () => ({
  resumeFromHalt: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/engine/durationAnalysis', () => ({
  resumeDurationPipeline: vi.fn().mockResolvedValue(undefined),
}))

import { POST as runsCancel } from '../app/api/runs/[id]/cancel/route'
import { POST as runsOverride } from '../app/api/runs/[id]/override/route'
import { GET as runsEvents } from '../app/api/runs/[id]/events/route'
import { POST as daCancel } from '../app/api/duration-analysis/[id]/cancel/route'
import { POST as daOverride } from '../app/api/duration-analysis/[id]/override/route'
import { GET as daEvents } from '../app/api/duration-analysis/[id]/events/route'
import { resolveRequestUser } from '@/lib/auth'
import { prisma } from '@/lib/db'

const OWNER_ID = 'owner-user-1'
const OTHER_USER_ID = 'other-user-2'

function makeRequest(path: string, method: 'GET' | 'POST' = 'POST'): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, { method })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/runs/[id]/cancel — ownership', () => {
  const RUN = { id: 'run-1', status: 'running', unifiedChart: { userId: OWNER_ID } }

  it('401s with no identity', async () => {
    ;(resolveRequestUser as any).mockResolvedValue(null)
    const res = await runsCancel(makeRequest('/api/runs/run-1/cancel'), { params: { id: 'run-1' } })
    expect(res.status).toBe(401)
  })

  it('404s (never 403) for a non-owner', async () => {
    ;(resolveRequestUser as any).mockResolvedValue(OTHER_USER_ID)
    ;(prisma.pipelineRun.findUnique as any).mockResolvedValue(RUN)
    const res = await runsCancel(makeRequest('/api/runs/run-1/cancel'), { params: { id: 'run-1' } })
    expect(res.status).toBe(404)
  })

  it('succeeds for the owner', async () => {
    ;(resolveRequestUser as any).mockResolvedValue(OWNER_ID)
    ;(prisma.pipelineRun.findUnique as any).mockResolvedValue(RUN)
    ;(prisma.pipelineRun.update as any).mockResolvedValue({ ...RUN, status: 'failed' })
    const res = await runsCancel(makeRequest('/api/runs/run-1/cancel'), { params: { id: 'run-1' } })
    expect(res.status).toBe(200)
  })
})

describe('POST /api/runs/[id]/override — ownership', () => {
  const HALTED_RUN = { id: 'run-1', status: 'halted_for_review', unifiedChart: { userId: OWNER_ID } }

  it('401s with no identity', async () => {
    ;(resolveRequestUser as any).mockResolvedValue(null)
    const res = await runsOverride(makeRequest('/api/runs/run-1/override'), { params: { id: 'run-1' } })
    expect(res.status).toBe(401)
  })

  it('404s (never 403) for a non-owner', async () => {
    ;(resolveRequestUser as any).mockResolvedValue(OTHER_USER_ID)
    ;(prisma.pipelineRun.findUnique as any).mockResolvedValue(HALTED_RUN)
    const res = await runsOverride(makeRequest('/api/runs/run-1/override'), { params: { id: 'run-1' } })
    expect(res.status).toBe(404)
  })

  it('succeeds for the owner', async () => {
    ;(resolveRequestUser as any).mockResolvedValue(OWNER_ID)
    ;(prisma.pipelineRun.findUnique as any).mockResolvedValue(HALTED_RUN)
    const res = await runsOverride(makeRequest('/api/runs/run-1/override'), { params: { id: 'run-1' } })
    expect(res.status).toBe(202)
  })
})

describe('GET /api/runs/[id]/events — ownership', () => {
  const RUN = { id: 'run-1', status: 'running', unifiedChart: { userId: OWNER_ID } }

  it('401s with no identity', async () => {
    ;(resolveRequestUser as any).mockResolvedValue(null)
    const res = await runsEvents(makeRequest('/api/runs/run-1/events', 'GET'), { params: { id: 'run-1' } })
    expect(res.status).toBe(401)
  })

  it('404s (never 403) for a non-owner', async () => {
    ;(resolveRequestUser as any).mockResolvedValue(OTHER_USER_ID)
    ;(prisma.pipelineRun.findUnique as any).mockResolvedValue(RUN)
    const res = await runsEvents(makeRequest('/api/runs/run-1/events', 'GET'), { params: { id: 'run-1' } })
    expect(res.status).toBe(404)
  })
})

describe('POST /api/duration-analysis/[id]/cancel — ownership', () => {
  const ANALYSIS = { status: 'running', unifiedChart: { userId: OWNER_ID } }

  it('401s with no identity', async () => {
    ;(resolveRequestUser as any).mockResolvedValue(null)
    const res = await daCancel(makeRequest('/api/duration-analysis/da-1/cancel'), { params: { id: 'da-1' } })
    expect(res.status).toBe(401)
  })

  it('404s (never 403) for a non-owner', async () => {
    ;(resolveRequestUser as any).mockResolvedValue(OTHER_USER_ID)
    ;(prisma.durationAnalysis.findUnique as any).mockResolvedValue(ANALYSIS)
    const res = await daCancel(makeRequest('/api/duration-analysis/da-1/cancel'), { params: { id: 'da-1' } })
    expect(res.status).toBe(404)
  })

  it('succeeds for the owner', async () => {
    ;(resolveRequestUser as any).mockResolvedValue(OWNER_ID)
    ;(prisma.durationAnalysis.findUnique as any).mockResolvedValue(ANALYSIS)
    ;(prisma.durationAnalysis.updateMany as any).mockResolvedValue({ count: 1 })
    const res = await daCancel(makeRequest('/api/duration-analysis/da-1/cancel'), { params: { id: 'da-1' } })
    expect(res.status).toBe(200)
  })
})

describe('POST /api/duration-analysis/[id]/override — ownership', () => {
  const GATED_ANALYSIS = { status: 'symptom_unmatched', unifiedChart: { userId: OWNER_ID } }

  it('401s with no identity', async () => {
    ;(resolveRequestUser as any).mockResolvedValue(null)
    const res = await daOverride(makeRequest('/api/duration-analysis/da-1/override'), { params: { id: 'da-1' } })
    expect(res.status).toBe(401)
  })

  it('404s (never 403) for a non-owner', async () => {
    ;(resolveRequestUser as any).mockResolvedValue(OTHER_USER_ID)
    ;(prisma.durationAnalysis.findUnique as any).mockResolvedValue(GATED_ANALYSIS)
    const res = await daOverride(makeRequest('/api/duration-analysis/da-1/override'), { params: { id: 'da-1' } })
    expect(res.status).toBe(404)
  })

  it('succeeds for the owner', async () => {
    ;(resolveRequestUser as any).mockResolvedValue(OWNER_ID)
    ;(prisma.durationAnalysis.findUnique as any).mockResolvedValue(GATED_ANALYSIS)
    const res = await daOverride(makeRequest('/api/duration-analysis/da-1/override'), { params: { id: 'da-1' } })
    expect(res.status).toBe(202)
  })
})

describe('GET /api/duration-analysis/[id]/events — ownership', () => {
  const ANALYSIS = { id: 'da-1', status: 'running', unifiedChart: { userId: OWNER_ID } }

  it('401s with no identity', async () => {
    ;(resolveRequestUser as any).mockResolvedValue(null)
    const res = await daEvents(makeRequest('/api/duration-analysis/da-1/events', 'GET'), { params: { id: 'da-1' } })
    expect(res.status).toBe(401)
  })

  it('404s (never 403) for a non-owner', async () => {
    ;(resolveRequestUser as any).mockResolvedValue(OTHER_USER_ID)
    ;(prisma.durationAnalysis.findUnique as any).mockResolvedValue(ANALYSIS)
    const res = await daEvents(makeRequest('/api/duration-analysis/da-1/events', 'GET'), { params: { id: 'da-1' } })
    expect(res.status).toBe(404)
  })
})
