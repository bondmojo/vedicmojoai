/**
 * tests/matchmaking-result-versioning.test.ts
 *
 * .kiro/specs/matchmaking-result-versioning/ — task 5.
 *
 * 1. Koota-level checks for the nakshatra-boundary fix, driven through the
 *    same input builder the matchmaking routes use (`computeMatchResult` /
 *    `buildMatchNative` in app/api/matchmaking/_shared.ts), with each Moon
 *    supplied as the Prisma Decimal that `UnifiedChart.moonLongitude`
 *    (Decimal(8,4)) arrives as. A Moon stored at 80.0000° must be scored in
 *    Gemini, not Cancer; 30.0000° in Taurus, not Aries; an ordinary longitude
 *    must score exactly as it did before the fix.
 * 2. The `engineVersion` stamp: present on every new result, persisted inside
 *    `CompatibilityMatch.result`, and read defensively from rows saved before
 *    it existed.
 *
 * Mocks: @/lib/auth (resolveRequestUser), @/lib/db — same idiom as
 * tests/ownership-matchmaking.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Prisma } from '@prisma/client'
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
    },
  },
}))

import { buildMatchNative, computeMatchResult, type ChartForMatch } from '../app/api/matchmaking/_shared'
import { POST as postMatch } from '../app/api/matchmaking/route'
import { POST as postPreview } from '../app/api/matchmaking/preview/route'
import { GET as getMatch } from '../app/api/matchmaking/[id]/route'
import {
  computeMatch,
  describeMatchVersion,
  longitudeToNakshatraPadaRashi,
  MATCHMAKING_ENGINE_VERSION,
} from '../engine/compute/matchmaking'
import { MATCHMAKING_TABLES_VERSION, NAKSHATRA_ATTRIBUTES, RASHI_ATTRIBUTES } from '../engine/compute/matchmakingTables'
import type { KootaKey, KootaScore, MatchResult, MatchRole } from '../engine/compute/types'
import { resolveRequestUser } from '@/lib/auth'
import { prisma } from '@/lib/db'

// ─── Fixtures ─────────────────────────────────────────────────────────────

const OWNER_ID = 'owner-user-1'

/** Ordinary partner Moon: Mula pada 3, Sagittarius — nowhere near a boundary. */
const PARTNER_MOON = '247.1234'

/** A chart row as `resolveChartsForMatch` selects it; the Moon is a Decimal, as stored. */
function chart(id: string, storedMoonLongitude: string): ChartForMatch {
  return {
    id,
    userId: OWNER_ID,
    name: `Chart ${id}`,
    source: 'paste',
    moonLongitude: new Prisma.Decimal(storedMoonLongitude),
    lagna: 'Aries',
    planets: null,
    relationships: null,
  }
}

/** Scores `subjectMoon` in `role`, with the ordinary partner in the other role. */
function matchWithSubject(role: MatchRole, subjectMoon: string): MatchResult {
  const subject = chart('subject', subjectMoon)
  const partner = chart('partner', PARTNER_MOON)
  return role === 'bride' ? computeMatchResult(subject, partner) : computeMatchResult(partner, subject)
}

function koota(result: MatchResult, key: KootaKey): KootaScore {
  const found = result.ashtakoota.kootas.find((k) => k.key === key)
  if (!found) throw new Error(`test setup: koota ${key} missing`)
  return found
}

/** The four kootas that read the Moon's rashi rather than its nakshatra. */
const RASHI_KOOTAS: KootaKey[] = ['varna', 'vashya', 'grahaMaitri', 'bhakoot']

/**
 * The derivation as it stood before the nakshatra-boundary fix: index from
 * `lon / span`, position from `lon % span`. At an exact boundary the two
 * disagree, because 360/27 rounds up. Kept here only to show which stored
 * values the fix moves and which it leaves alone.
 */
function preFixDerivation(longitude: number) {
  const span = 360 / 27
  const normalized = ((longitude % 360) + 360) % 360
  const nakshatraNumber = Math.floor(normalized / span) + 1
  const padaNumber = Math.floor((normalized % span) / (span / 4)) + 1
  const rashiNumber = Math.floor(((nakshatraNumber - 1) * 4 + (padaNumber - 1)) / 9) + 1
  return { nakshatraNumber, padaNumber, rashiNumber }
}

/** `computeMatch` over koota inputs from the given derivation — what the routes would have produced. */
function matchFromDerivation(
  derive: (lon: number) => { nakshatraNumber: number; padaNumber: number },
  brideMoon: number,
  groomMoon: number
): MatchResult {
  const bride = derive(brideMoon)
  const groom = derive(groomMoon)
  return computeMatch(
    { koota: { role: 'bride', nakshatraNumber: bride.nakshatraNumber, padaNumber: bride.padaNumber, moonLongitude: brideMoon } },
    { koota: { role: 'groom', nakshatraNumber: groom.nakshatraNumber, padaNumber: groom.padaNumber, moonLongitude: groomMoon } }
  )
}

function stripEngineStamp(result: MatchResult): Omit<MatchResult, 'engineVersion'> {
  const { engineVersion: _engineVersion, ...rest } = result
  return rest
}

// ─── 5.1 / 5.2 Boundary Moons through the route input builder ────────────

describe('a Moon stored exactly on a pada boundary is scored in its true rashi', () => {
  it.each<MatchRole>(['bride', 'groom'])('80.0000° as the %s is Punarvasu pada 1 in Gemini, not Cancer', (role) => {
    const native = buildMatchNative(chart('subject', '80.0000'), role)
    expect(native.koota).toEqual({ role, nakshatraNumber: 7, padaNumber: 1, moonLongitude: 80 })
    expect(NAKSHATRA_ATTRIBUTES[7].name).toBe('Punarvasu')

    const result = matchWithSubject(role, '80.0000')
    for (const key of RASHI_KOOTAS) {
      const score = koota(result, key)
      expect(score.status).toBe('scored')
      expect(score.evidence[role].rashiNumber).toBe(3)
    }
    expect(RASHI_ATTRIBUTES[3].name).toBe('Gemini')
    expect(koota(result, 'varna').evidence[role].varna).toBe(RASHI_ATTRIBUTES[3].varna)
    expect(koota(result, 'vashya').evidence[role].vashya).toBe(RASHI_ATTRIBUTES[3].vashya)
    expect(koota(result, 'grahaMaitri').evidence[role].lord).toBe('Mercury')

    // The persisted result records the stored Moon, which is how a saved
    // legacy row can later be checked for exposure to this fix (design.md).
    expect(result.ashtakoota.boundaryRisk.find((b) => b.role === role)?.moonLongitude).toBe(80)
  })

  it.each<MatchRole>(['bride', 'groom'])('30.0000° as the %s is Krittika pada 2 in Taurus, not Aries', (role) => {
    const native = buildMatchNative(chart('subject', '30.0000'), role)
    expect(native.koota).toEqual({ role, nakshatraNumber: 3, padaNumber: 2, moonLongitude: 30 })
    expect(NAKSHATRA_ATTRIBUTES[3].name).toBe('Krittika')

    const result = matchWithSubject(role, '30.0000')
    for (const key of RASHI_KOOTAS) {
      expect(koota(result, key).evidence[role].rashiNumber).toBe(2)
    }
    expect(RASHI_ATTRIBUTES[2].name).toBe('Taurus')
    expect(koota(result, 'grahaMaitri').evidence[role].lord).toBe('Venus')
  })
})

// ─── 5.3 Ordinary longitudes do not move; boundary ones do ───────────────

describe('the boundary fix changes only boundary longitudes', () => {
  it('an ordinary Moon (123.4567°, Magha pada 2, Leo) derives the same before and after the fix', () => {
    const stored = Number(new Prisma.Decimal('123.4567'))
    const expected = { nakshatraNumber: 10, padaNumber: 2, rashiNumber: 5 }
    expect(longitudeToNakshatraPadaRashi(stored)).toEqual(expected)
    expect(preFixDerivation(stored)).toEqual(expected)
  })

  // Isolates the longitude → (nakshatra, pada, rashi) derivation: both sides run
  // the current scorers and boundary-risk code, so this does not model the
  // pre-fix boundary-risk arithmetic (that change only affects 39, 79, … 359°).
  it('an ordinary pair scores identically with the pre-fix and post-fix derivation swapped in', () => {
    const brideMoon = Number(new Prisma.Decimal('123.4567'))
    const groomMoon = Number(new Prisma.Decimal(PARTNER_MOON))
    const before = matchFromDerivation(preFixDerivation, brideMoon, groomMoon)
    const after = matchFromDerivation(longitudeToNakshatraPadaRashi, brideMoon, groomMoon)
    expect(stripEngineStamp(after)).toEqual(stripEngineStamp(before))

    // And the route path scores the same pair the same way.
    const viaRoute = computeMatchResult(chart('b', '123.4567'), chart('g', PARTNER_MOON))
    expect(viaRoute).toEqual(after)
  })

  it('at 80.0000° the two derivations disagree — Cancer before the fix, Gemini after', () => {
    expect(preFixDerivation(80)).toEqual({ nakshatraNumber: 7, padaNumber: 4, rashiNumber: 4 })
    expect(longitudeToNakshatraPadaRashi(80)).toEqual({ nakshatraNumber: 7, padaNumber: 1, rashiNumber: 3 })

    const groomMoon = Number(new Prisma.Decimal(PARTNER_MOON))
    const before = matchFromDerivation(preFixDerivation, 80, groomMoon)
    const after = matchFromDerivation(longitudeToNakshatraPadaRashi, 80, groomMoon)
    for (const key of RASHI_KOOTAS) {
      expect(koota(before, key).evidence.bride.rashiNumber).toBe(4)
      expect(koota(after, key).evidence.bride.rashiNumber).toBe(3)
    }
    // Nakshatra-only kootas cannot move: the nakshatra did not change.
    for (const key of ['tara', 'yoni', 'gana', 'nadi'] as KootaKey[]) {
      expect(koota(after, key)).toEqual(koota(before, key))
    }
  })
})

// ─── 5.4 Version stamps ───────────────────────────────────────────────────

describe('engineVersion stamp', () => {
  it('every new result carries both stamps, and they are distinct', () => {
    const result = computeMatchResult(chart('b', '80.0000'), chart('g', PARTNER_MOON))
    expect(result.engineVersion).toBe(MATCHMAKING_ENGINE_VERSION)
    expect(result.tablesVersion).toBe(MATCHMAKING_TABLES_VERSION)
    expect(MATCHMAKING_ENGINE_VERSION).toMatch(/^matchmaking-engine-/)
    expect(MATCHMAKING_ENGINE_VERSION).not.toBe(MATCHMAKING_TABLES_VERSION)

    const roundTripped = JSON.parse(JSON.stringify(result))
    expect(roundTripped.engineVersion).toBe(MATCHMAKING_ENGINE_VERSION)
  })

  it('is stamped even when the pairing is unscorable', () => {
    const bride = buildMatchNative(chart('b', '80.0000'), 'bride')
    const result = computeMatch(bride, bride)
    expect(result.ashtakoota.verdict).toBe('incomplete')
    expect(result.engineVersion).toBe(MATCHMAKING_ENGINE_VERSION)
  })
})

describe('describeMatchVersion', () => {
  it('a result from this build is current', () => {
    const result = computeMatchResult(chart('b', '123.4567'), chart('g', PARTNER_MOON))
    expect(describeMatchVersion(result)).toEqual({
      tablesVersion: MATCHMAKING_TABLES_VERSION,
      engineVersion: MATCHMAKING_ENGINE_VERSION,
      stale: false,
    })
  })

  it('a legacy result with no engine stamp reads as null and stale', () => {
    expect(describeMatchVersion({ tablesVersion: MATCHMAKING_TABLES_VERSION })).toEqual({
      tablesVersion: MATCHMAKING_TABLES_VERSION,
      engineVersion: null,
      stale: true,
    })
  })

  it('an older tables stamp is stale even with the current engine stamp', () => {
    expect(
      describeMatchVersion({ tablesVersion: 'matchmaking-tables-v1-oracle-verified', engineVersion: MATCHMAKING_ENGINE_VERSION })
    ).toEqual({ tablesVersion: 'matchmaking-tables-v1-oracle-verified', engineVersion: MATCHMAKING_ENGINE_VERSION, stale: true })
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['non-string stamps', { tablesVersion: 7, engineVersion: { v: 1 } }],
    ['empty stamps', { tablesVersion: '', engineVersion: '' }],
  ])('%s read as null and stale, without throwing', (_label, stamps) => {
    expect(describeMatchVersion(stamps as Parameters<typeof describeMatchVersion>[0])).toEqual({
      tablesVersion: null,
      engineVersion: null,
      stale: true,
    })
  })
})

// ─── 5.5 Routes ───────────────────────────────────────────────────────────

function postRequest(url: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest(`http://localhost:3000${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const BRIDE_AT_BOUNDARY = chart('bride-chart', '80.0000')
const GROOM_ORDINARY = chart('groom-chart', PARTNER_MOON)

describe('routes carry the engine stamp', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(resolveRequestUser as any).mockResolvedValue(OWNER_ID)
    ;(prisma.unifiedChart.findUnique as any).mockImplementation(({ where }: { where: { id: string } }) => {
      if (where.id === BRIDE_AT_BOUNDARY.id) return Promise.resolve(BRIDE_AT_BOUNDARY)
      if (where.id === GROOM_ORDINARY.id) return Promise.resolve(GROOM_ORDINARY)
      return Promise.resolve(null)
    })
  })

  it('POST /api/matchmaking persists the stamp inside result and returns it', async () => {
    ;(prisma.compatibilityMatch.create as any).mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({
        id: 'match-1',
        brideChartId: data.brideChartId,
        groomChartId: data.groomChartId,
        label: null,
        gunaScore: new Prisma.Decimal(data.gunaScore as number),
        result: data.result,
        tablesVersion: data.tablesVersion,
        createdAt: new Date('2026-10-28T00:00:00Z'),
      })
    )

    const res = await postMatch(
      postRequest('/api/matchmaking', { brideChartId: BRIDE_AT_BOUNDARY.id, groomChartId: GROOM_ORDINARY.id })
    )
    expect(res.status).toBe(201)

    const data = (prisma.compatibilityMatch.create as any).mock.calls[0][0].data
    expect(data.tablesVersion).toBe(MATCHMAKING_TABLES_VERSION)
    expect(data.result.engineVersion).toBe(MATCHMAKING_ENGINE_VERSION)
    expect(data).not.toHaveProperty('engineVersion') // no column — JSONB only
    expect(koota(data.result, 'varna').evidence.bride.rashiNumber).toBe(3)

    const body = await res.json()
    expect(body.engineVersion).toBe(MATCHMAKING_ENGINE_VERSION)
    expect(body.tablesVersion).toBe(MATCHMAKING_TABLES_VERSION)
    expect(body.result.engineVersion).toBe(MATCHMAKING_ENGINE_VERSION)
  })

  it('POST /api/matchmaking/preview returns the stamp and persists nothing', async () => {
    const res = await postPreview(
      postRequest('/api/matchmaking/preview', { brideChartId: BRIDE_AT_BOUNDARY.id, groomChartId: GROOM_ORDINARY.id })
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.engineVersion).toBe(MATCHMAKING_ENGINE_VERSION)
    expect(body.result.engineVersion).toBe(MATCHMAKING_ENGINE_VERSION)
    expect(body.tablesVersion).toBe(MATCHMAKING_TABLES_VERSION)
    expect(prisma.compatibilityMatch.create).not.toHaveBeenCalled()
  })
})

describe('GET /api/matchmaking/[id] reads the stamp defensively', () => {
  const CURRENT_RESULT = computeMatchResult(BRIDE_AT_BOUNDARY, GROOM_ORDINARY)
  /** What a row saved before the engine stamp existed looks like. */
  const LEGACY_RESULT = stripEngineStamp(CURRENT_RESULT)

  function persistedRow(result: unknown, tablesVersion = MATCHMAKING_TABLES_VERSION) {
    return {
      id: 'match-1',
      userId: OWNER_ID,
      label: null,
      result,
      tablesVersion,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      brideChart: { name: 'Bride', source: 'paste' },
      groomChart: { name: 'Groom', source: 'paste' },
    }
  }

  async function getWith(row: ReturnType<typeof persistedRow>) {
    ;(prisma.compatibilityMatch.findUnique as any).mockResolvedValue(row)
    const res = await getMatch(new NextRequest('http://localhost:3000/api/matchmaking/match-1'), {
      params: { id: 'match-1' },
    })
    return { status: res.status, body: await res.json() }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    ;(resolveRequestUser as any).mockResolvedValue(OWNER_ID)
  })

  it('a legacy row reports engineVersion null and stale, with result returned verbatim', async () => {
    const { status, body } = await getWith(persistedRow(LEGACY_RESULT))
    expect(status).toBe(200)
    expect(body.engineVersion).toBeNull()
    expect(body.stale).toBe(true)
    expect(body.tablesVersion).toBe(MATCHMAKING_TABLES_VERSION)
    expect(body.result).toEqual(LEGACY_RESULT)
    expect(body.result).not.toHaveProperty('engineVersion')
  })

  it('a row saved by this build is not stale', async () => {
    const { body } = await getWith(persistedRow(CURRENT_RESULT))
    expect(body.engineVersion).toBe(MATCHMAKING_ENGINE_VERSION)
    expect(body.stale).toBe(false)
  })

  it('a row saved under older tables is stale', async () => {
    const { body } = await getWith(persistedRow(CURRENT_RESULT, 'matchmaking-tables-v1-oracle-verified'))
    expect(body.engineVersion).toBe(MATCHMAKING_ENGINE_VERSION)
    expect(body.stale).toBe(true)
  })

  it.each([
    ['null', null],
    ['an array', [1, 2]],
    ['a string', 'not a result'],
    ['a number', 42],
  ])('the API still answers 200 for a result that is %s (engineVersion null, stale)', async (_label, result) => {
    const { status, body } = await getWith(persistedRow(result))
    expect(status).toBe(200)
    expect(body.engineVersion).toBeNull()
    expect(body.stale).toBe(true)
    expect(body.result).toEqual(result)
  })
})
