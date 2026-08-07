/**
 * tests/ownership-matchmaking.test.ts
 * Ownership-enforcement regression tests for the matchmaking routes
 * (task 7.7, NOT optional) — cross-account access to EITHER chart must
 * return 404, never 403, and never leak chart data. Also covers 401 (no
 * identity), the owner's happy path, and task 7.8's field-level 400 for a
 * missing bride/groom chart id.
 *
 * Mocks: @/lib/auth (resolveRequestUser), @/lib/db. Idiom mirrors
 * tests/ownership-unified-charts.test.ts.
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
    },
    compatibilityMatch: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
    },
  },
}))

import { POST as postMatch, GET as listMatches } from '../app/api/matchmaking/route'
import { POST as postPreview } from '../app/api/matchmaking/preview/route'
import { GET as getMatch, DELETE as deleteMatch } from '../app/api/matchmaking/[id]/route'
import { resolveRequestUser } from '@/lib/auth'
import { prisma } from '@/lib/db'

const OWNER_ID = 'owner-user-1'
const OTHER_USER_ID = 'other-user-2'

const BRIDE_CHART = {
  id: 'bride-chart-1',
  userId: OWNER_ID,
  name: 'Bride Chart — SECRET NAME',
  source: 'paste',
  moonLongitude: 15, // Ashwini, pada 2
  lagna: 'Aries',
  planets: null,
  relationships: null,
}

const GROOM_CHART = {
  id: 'groom-chart-1',
  userId: OWNER_ID,
  name: 'Groom Chart — SECRET NAME',
  source: 'paste',
  moonLongitude: 200, // some other nakshatra/pada
  lagna: 'Libra',
  planets: null,
  relationships: null,
}

/** A chart with the same shape, but owned by a different user. */
const OTHER_USERS_CHART = { ...BRIDE_CHART, id: 'other-users-chart-1', userId: OTHER_USER_ID, name: 'Other Users Chart — SECRET NAME' }

function findChartById(id: string) {
  if (id === BRIDE_CHART.id) return BRIDE_CHART
  if (id === GROOM_CHART.id) return GROOM_CHART
  if (id === OTHER_USERS_CHART.id) return OTHER_USERS_CHART
  return null
}

function makePostRequest(url: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest(`http://localhost:3000${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeGetRequest(): NextRequest {
  return new NextRequest('http://localhost:3000/api/matchmaking/match-1')
}

beforeEach(() => {
  vi.clearAllMocks()
  ;(prisma.unifiedChart.findUnique as any).mockImplementation(({ where }: { where: { id: string } }) =>
    Promise.resolve(findChartById(where.id))
  )
})

/** Asserts a 404 response body reveals no chart name / no chart data at all. */
async function expectNoLeak(res: Response) {
  expect(res.status).toBe(404)
  const body = await res.json()
  const raw = JSON.stringify(body)
  expect(raw).not.toContain('SECRET NAME')
  expect(raw).not.toContain('Bride Chart')
  expect(raw).not.toContain('Groom Chart')
  expect(raw).not.toContain('Other Users Chart')
}

describe('POST /api/matchmaking — ownership', () => {
  it('returns 401 when the caller has no identity at all', async () => {
    ;(resolveRequestUser as any).mockResolvedValue(null)
    const res = await postMatch(makePostRequest('/api/matchmaking', { brideChartId: BRIDE_CHART.id, groomChartId: GROOM_CHART.id }))
    expect(res.status).toBe(401)
  })

  it('returns 404 (never 403, no leaked data) when the BRIDE chart belongs to a different user', async () => {
    ;(resolveRequestUser as any).mockResolvedValue(OWNER_ID)
    const res = await postMatch(
      makePostRequest('/api/matchmaking', { brideChartId: OTHER_USERS_CHART.id, groomChartId: GROOM_CHART.id })
    )
    await expectNoLeak(res)
    expect(prisma.compatibilityMatch.create).not.toHaveBeenCalled()
  })

  it('returns 404 (never 403, no leaked data) when the GROOM chart belongs to a different user', async () => {
    ;(resolveRequestUser as any).mockResolvedValue(OWNER_ID)
    const res = await postMatch(
      makePostRequest('/api/matchmaking', { brideChartId: BRIDE_CHART.id, groomChartId: OTHER_USERS_CHART.id })
    )
    await expectNoLeak(res)
    expect(prisma.compatibilityMatch.create).not.toHaveBeenCalled()
  })

  it('returns 404 (never 403) when a chart id does not exist at all', async () => {
    ;(resolveRequestUser as any).mockResolvedValue(OWNER_ID)
    const res = await postMatch(makePostRequest('/api/matchmaking', { brideChartId: 'no-such-chart', groomChartId: GROOM_CHART.id }))
    expect(res.status).toBe(404)
  })

  it('returns 201 for the owner\'s happy path and persists the match', async () => {
    ;(resolveRequestUser as any).mockResolvedValue(OWNER_ID)
    ;(prisma.compatibilityMatch.create as any).mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({
        id: 'match-1',
        brideChartId: data.brideChartId,
        groomChartId: data.groomChartId,
        label: data.label ?? null,
        gunaScore: data.gunaScore,
        result: data.result,
        tablesVersion: data.tablesVersion,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      })
    )

    const res = await postMatch(makePostRequest('/api/matchmaking', { brideChartId: BRIDE_CHART.id, groomChartId: GROOM_CHART.id }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.id).toBe('match-1')
    expect(typeof body.gunaScore).toBe('number')
    expect(prisma.compatibilityMatch.create).toHaveBeenCalledTimes(1)
  })
})

describe('POST /api/matchmaking/preview — ownership', () => {
  it('returns 401 when the caller has no identity at all', async () => {
    ;(resolveRequestUser as any).mockResolvedValue(null)
    const res = await postPreview(
      makePostRequest('/api/matchmaking/preview', { brideChartId: BRIDE_CHART.id, groomChartId: GROOM_CHART.id })
    )
    expect(res.status).toBe(401)
  })

  it('returns 404 (never 403, no leaked data) when the BRIDE chart belongs to a different user', async () => {
    ;(resolveRequestUser as any).mockResolvedValue(OWNER_ID)
    const res = await postPreview(
      makePostRequest('/api/matchmaking/preview', { brideChartId: OTHER_USERS_CHART.id, groomChartId: GROOM_CHART.id })
    )
    await expectNoLeak(res)
  })

  it('returns 404 (never 403, no leaked data) when the GROOM chart belongs to a different user', async () => {
    ;(resolveRequestUser as any).mockResolvedValue(OWNER_ID)
    const res = await postPreview(
      makePostRequest('/api/matchmaking/preview', { brideChartId: BRIDE_CHART.id, groomChartId: OTHER_USERS_CHART.id })
    )
    await expectNoLeak(res)
  })

  it('returns 200 with a computed (never persisted) result for the owner\'s happy path', async () => {
    ;(resolveRequestUser as any).mockResolvedValue(OWNER_ID)
    const res = await postPreview(
      makePostRequest('/api/matchmaking/preview', { brideChartId: BRIDE_CHART.id, groomChartId: GROOM_CHART.id })
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.result?.ashtakoota?.kootas).toHaveLength(8)
    expect(body.tablesVersion).toBeTruthy()
    expect(prisma.compatibilityMatch.create).not.toHaveBeenCalled()
  })
})

describe('GET /api/matchmaking — list ownership', () => {
  const OWNERS_MATCH = {
    id: 'match-owner-1',
    label: null,
    gunaScore: 27.5,
    verdict: 'good',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    brideChart: { name: 'Owner Bride — SECRET NAME' },
    groomChart: { name: 'Owner Groom — SECRET NAME' },
  }

  const OTHER_USERS_MATCH = {
    id: 'match-other-1',
    label: null,
    gunaScore: 30,
    verdict: 'excellent',
    createdAt: new Date('2026-01-02T00:00:00Z'),
    brideChart: { name: 'Other Bride — SECRET NAME' },
    groomChart: { name: 'Other Groom — SECRET NAME' },
  }

  beforeEach(() => {
    // Mirrors the real query: WHERE userId = <resolved> — the mock only ever
    // returns the calling user's own row, exactly like Prisma would given
    // that filter, so this test's real assertion is that the route passes
    // `userId` into the `where` clause at all rather than listing everything.
    ;(prisma.compatibilityMatch.findMany as any).mockImplementation(({ where }: { where: { userId: string } }) =>
      Promise.resolve(where.userId === OWNER_ID ? [OWNERS_MATCH] : where.userId === OTHER_USER_ID ? [OTHER_USERS_MATCH] : [])
    )
  })

  it('returns 401 when the caller has no identity at all', async () => {
    ;(resolveRequestUser as any).mockResolvedValue(null)
    const res = await listMatches(new NextRequest('http://localhost:3000/api/matchmaking'))
    expect(res.status).toBe(401)
  })

  it("returns only the caller's own matches, never another user's", async () => {
    ;(resolveRequestUser as any).mockResolvedValue(OWNER_ID)
    const res = await listMatches(new NextRequest('http://localhost:3000/api/matchmaking'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(1)
    expect(body[0].id).toBe(OWNERS_MATCH.id)
    const raw = JSON.stringify(body)
    expect(raw).not.toContain('Other Bride')
    expect(raw).not.toContain('Other Groom')
    expect(prisma.compatibilityMatch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: OWNER_ID } })
    )
  })

  it('list rows carry the denormalized verdict, and the query never selects the full result blob', async () => {
    ;(resolveRequestUser as any).mockResolvedValue(OWNER_ID)
    const res = await listMatches(new NextRequest('http://localhost:3000/api/matchmaking'))
    const body = await res.json()
    expect(body[0].verdict).toBe('good')

    // The real guard: assert on the `select` shape passed to Prisma, not on
    // the response body — the mock's fixture never had a `result` field to
    // begin with, so `body[0].result` would be undefined even if the route
    // selected it and simply forgot to forward it to the JSON response.
    const call = (prisma.compatibilityMatch.findMany as any).mock.calls[0][0]
    expect(call.select).toBeTruthy()
    expect(call.select).not.toHaveProperty('result')
    expect(call.select.verdict).toBe(true)
  })
})

describe('GET /api/matchmaking/[id] — ownership', () => {
  const PERSISTED_MATCH = {
    id: 'match-1',
    userId: OWNER_ID,
    label: null,
    result: { ashtakoota: { gunaScore: 27.5 } },
    tablesVersion: 'matchmaking-tables-v1.1-nadi-bhanga-fix',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    brideChart: { name: 'Bride Chart — SECRET NAME' },
    groomChart: { name: 'Groom Chart — SECRET NAME' },
  }

  beforeEach(() => {
    ;(prisma.compatibilityMatch.findUnique as any).mockResolvedValue(PERSISTED_MATCH)
  })

  it('returns 401 when the caller has no identity at all', async () => {
    ;(resolveRequestUser as any).mockResolvedValue(null)
    const res = await getMatch(makeGetRequest(), { params: { id: 'match-1' } })
    expect(res.status).toBe(401)
  })

  it('returns 404 (never 403, no leaked chart names) when a DIFFERENT user requests the match', async () => {
    ;(resolveRequestUser as any).mockResolvedValue(OTHER_USER_ID)
    const res = await getMatch(makeGetRequest(), { params: { id: 'match-1' } })
    await expectNoLeak(res)
  })

  it('returns 200 with the persisted result for the OWNER', async () => {
    ;(resolveRequestUser as any).mockResolvedValue(OWNER_ID)
    const res = await getMatch(makeGetRequest(), { params: { id: 'match-1' } })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.result).toEqual(PERSISTED_MATCH.result)
  })
})

describe('DELETE /api/matchmaking/[id] — ownership', () => {
  beforeEach(() => {
    ;(prisma.compatibilityMatch.findUnique as any).mockResolvedValue({ id: 'match-1', userId: OWNER_ID })
  })

  it('returns 401 when the caller has no identity at all', async () => {
    ;(resolveRequestUser as any).mockResolvedValue(null)
    const res = await deleteMatch(makeGetRequest(), { params: { id: 'match-1' } })
    expect(res.status).toBe(401)
  })

  it('returns 404 (never 403) when a DIFFERENT user tries to delete the match', async () => {
    ;(resolveRequestUser as any).mockResolvedValue(OTHER_USER_ID)
    const res = await deleteMatch(makeGetRequest(), { params: { id: 'match-1' } })
    expect(res.status).toBe(404)
    expect(prisma.compatibilityMatch.delete).not.toHaveBeenCalled()
  })

  it('allows the owner to delete the match', async () => {
    ;(resolveRequestUser as any).mockResolvedValue(OWNER_ID)
    const res = await deleteMatch(makeGetRequest(), { params: { id: 'match-1' } })
    expect(res.status).toBe(200)
    expect(prisma.compatibilityMatch.delete).toHaveBeenCalledWith({ where: { id: 'match-1' } })
  })
})

// ─── Task 7.8 — role-field validation (missing brideChartId/groomChartId) ──

describe('POST /api/matchmaking — role-field validation (7.8)', () => {
  it('returns a field-level 400 naming "brideChartId" when it is missing', async () => {
    ;(resolveRequestUser as any).mockResolvedValue(OWNER_ID)
    const res = await postMatch(makePostRequest('/api/matchmaking', { groomChartId: GROOM_CHART.id }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.details).toHaveProperty('brideChartId')
    expect(prisma.compatibilityMatch.create).not.toHaveBeenCalled()
  })

  it('returns a field-level 400 naming "groomChartId" when it is missing', async () => {
    ;(resolveRequestUser as any).mockResolvedValue(OWNER_ID)
    const res = await postMatch(makePostRequest('/api/matchmaking', { brideChartId: BRIDE_CHART.id }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.details).toHaveProperty('groomChartId')
    expect(prisma.compatibilityMatch.create).not.toHaveBeenCalled()
  })

  it('never infers a role from argument order — a body with only two generic ids and no role field names is a 400, not a silent guess', async () => {
    ;(resolveRequestUser as any).mockResolvedValue(OWNER_ID)
    const res = await postMatch(
      makePostRequest('/api/matchmaking', { chartAId: BRIDE_CHART.id, chartBId: GROOM_CHART.id } as unknown as Record<string, unknown>)
    )
    expect(res.status).toBe(400)
    expect(prisma.compatibilityMatch.create).not.toHaveBeenCalled()
  })
})

// ─── _shared.buildMangalInput — the planets/lagna/relationships JSONB mapping ──
//
// Every other test in this file uses `source: 'paste'` charts, which
// deliberately skip the Mangal path. That leaves `_shared.ts`'s
// `buildMangalInput` — the one piece of genuinely NEW field-name mapping in
// task 8 — untested, and its failure mode is SILENT: a wrong key name, or a
// lagna string the RASHI_ATTRIBUTES lookup doesn't recognize, degrades every
// compute-source chart to `mangalDosha: 'unavailable'` with no error anywhere.
// These tests pin the mapping against the real `PlanetPosition` /
// `RelationshipGeometry` shapes from engine/compute/types.ts.

/** Synthetic PlanetPosition — only `planet`/`signNumber` are read, the rest satisfies the type. */
function planetAt(planet: string, signNumber: number) {
  return {
    planet,
    longitude: (signNumber - 1) * 30 + 15,
    latitude: 0,
    speed: 1,
    retrograde: false,
    sign: 'synthetic',
    signNumber,
    degreeInSign: 15,
    house: signNumber,
    }
}

/** Lagna Aries (rashi 1). Mars in Taurus (2) => house 2 from lagna — a trigger house, and NOT Mars's own/exalted sign, so no cancellation muddies the assertion. */
const MANGLIK_COMPUTE_CHART = {
  id: 'compute-bride-1',
  userId: OWNER_ID,
  name: 'Compute Bride',
  source: 'compute',
  moonLongitude: 15,
  lagna: 'Aries',
  planets: [planetAt('Mars', 2), planetAt('Moon', 6), planetAt('Venus', 4)],
  relationships: { aspects: [] },
}

/**
 * Same lagna; Mars in Gemini (3) => house 3 from lagna — not a trigger house.
 * Moon (Virgo/6) and Venus (Aries/1) are placed so Mars is 10th and 3rd from
 * them respectively — i.e. clean from ALL THREE reference points, not just
 * the lagna. (A Venus in Cancer/4 would have put Mars in the 12th from Venus
 * and made this chart Manglik after all — the detector is checking all three.)
 */
const CLEAN_COMPUTE_CHART = {
  id: 'compute-groom-1',
  userId: OWNER_ID,
  name: 'Compute Groom',
  source: 'compute',
  moonLongitude: 200,
  lagna: 'Aries',
  planets: [planetAt('Mars', 3), planetAt('Moon', 6), planetAt('Venus', 1)],
  relationships: { aspects: [] },
}

describe('POST /api/matchmaking/preview — Mangal input mapping from compute-source JSONB', () => {
  beforeEach(() => {
    ;(resolveRequestUser as any).mockResolvedValue(OWNER_ID)
    ;(prisma.unifiedChart.findUnique as any).mockImplementation(({ where }: { where: { id: string } }) => {
      if (where.id === MANGLIK_COMPUTE_CHART.id) return Promise.resolve(MANGLIK_COMPUTE_CHART)
      if (where.id === CLEAN_COMPUTE_CHART.id) return Promise.resolve(CLEAN_COMPUTE_CHART)
      return Promise.resolve(findChartById(where.id))
    })
  })

  it('maps planets/lagna/aspects so a compute-source chart is actually SCORED — never silently "unavailable"', async () => {
    const res = await postPreview(
      makePostRequest('/api/matchmaking/preview', {
        brideChartId: MANGLIK_COMPUTE_CHART.id,
        groomChartId: CLEAN_COMPUTE_CHART.id,
      })
    )
    expect(res.status).toBe(200)
    const { result } = await res.json()

    // The whole point: neither native degraded, so the field-name mapping in
    // _shared.buildMangalInput matches the real JSONB shapes.
    expect(result.mangalDosha.bride.status).not.toBe('unavailable')
    expect(result.mangalDosha.groom.status).not.toBe('unavailable')
    expect(result.mangalDosha.compatibility).not.toBe('unavailable')

    // And it mapped the RIGHT values: Mars in Taurus with an Aries lagna is
    // house 2 (a trigger house); Mars in Gemini is house 3 (not a trigger).
    expect(result.mangalDosha.bride.marsHouseFrom.lagna).toBe(2)
    expect(result.mangalDosha.bride.status).toBe('manglik')
    expect(result.mangalDosha.bride.triggeredFrom).toContain('lagna')
    expect(result.mangalDosha.groom.marsHouseFrom.lagna).toBe(3)
    expect(result.mangalDosha.groom.status).toBe('not_manglik')

    // One effectively Manglik, one not — the honest answer is 'mismatched',
    // never a reassuring 'matched'/'cancelled'.
    expect(result.mangalDosha.compatibility).toBe('mismatched')
  })

  it('degrades to "unavailable" — never to a scored all-clear — when a compute chart carries no planets JSONB', async () => {
    const res = await postPreview(
      makePostRequest('/api/matchmaking/preview', {
        brideChartId: MANGLIK_COMPUTE_CHART.id,
        groomChartId: GROOM_CHART.id, // paste-source: no planets
      })
    )
    expect(res.status).toBe(200)
    const { result } = await res.json()

    expect(result.mangalDosha.groom.status).toBe('unavailable')
    expect(result.mangalDosha.compatibility).toBe('unavailable')
    // Kootas are NEVER gated on source — a paste chart still scores all 8.
    expect(result.ashtakoota.kootas.every((k: { status: string }) => k.status === 'scored')).toBe(true)
  })

  it('degrades to "unavailable" when the lagna string does not resolve to a rashi number', async () => {
    const badLagna = { ...MANGLIK_COMPUTE_CHART, id: 'bad-lagna-1', lagna: 'Mesha' } // Sanskrit, not the stored English name
    ;(prisma.unifiedChart.findUnique as any).mockImplementation(({ where }: { where: { id: string } }) => {
      if (where.id === badLagna.id) return Promise.resolve(badLagna)
      if (where.id === CLEAN_COMPUTE_CHART.id) return Promise.resolve(CLEAN_COMPUTE_CHART)
      return Promise.resolve(null)
    })

    const res = await postPreview(
      makePostRequest('/api/matchmaking/preview', {
        brideChartId: badLagna.id,
        groomChartId: CLEAN_COMPUTE_CHART.id,
      })
    )
    expect(res.status).toBe(200)
    const { result } = await res.json()
    expect(result.mangalDosha.bride.status).toBe('unavailable')
    expect(result.mangalDosha.compatibility).toBe('unavailable')
  })
})
