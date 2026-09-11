/**
 * tests/places-api.test.ts
 * ------------------------
 * GET /api/places — route contract tests.
 *
 * Validates: Requirement 10.1 of the place-location-picker spec.
 *
 * Following tests/gochar-api.test.ts: `vi.mock('@/lib/auth')` plus
 * `vi.mock('@/lib/db')`, then the exported `GET` invoked with a `NextRequest`.
 * No database, no network.
 *
 * The `place.findMany` mock is a small in-memory evaluator rather than a chain
 * of `mockResolvedValueOnce` calls, because the behaviour under test *is* the
 * interaction between the three retrieval stages: what the exact tier claims
 * decides what the prefix tier may still contribute, and so on down, and
 * asserting on where-clause shapes would pass just as happily against a route
 * that ranked its results backwards. The evaluator supports exactly the
 * operators the route uses and **throws on anything else**, so it cannot
 * silently green-light a route that starts filtering some other way.
 *
 * Two SQL semantics it deliberately reproduces:
 *   - `contains` / `startsWith` against a NULL column never match (`NULL LIKE
 *     '%x%'` is NULL, not true), which is what makes a null `county` invisible
 *     to narrowing rather than a wildcard.
 *   - only `mode: 'insensitive'` folds case. The `nameNorm` stages omit it on
 *     purpose — the `text_pattern_ops` index cannot serve ILIKE — so a test that
 *     matched case-insensitively there would hide a broken normalization path.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { normalizePlaceName } from '@/lib/places-normalize'

vi.mock('@/lib/auth', () => ({
  resolveRequestUser: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  prisma: {
    place: {
      findMany: vi.fn(),
      // Present so the tests can assert they are never called: `truncated` must
      // come from the over-fetch rather than a COUNT, and search is read-only.
      count: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}))

import { GET, type PlaceSearchResponse } from '../app/api/places/route'
import { resolveRequestUser } from '@/lib/auth'
import { prisma } from '@/lib/db'

// ─── Fake `place` table ───────────────────────────────────────────────────

interface FakePlaceRow {
  id: string
  name: string
  nameNorm: string
  kind: string
  kindRank: number
  state: string
  district: string
  county: string | null
  countryCode: string
  latitude: Prisma.Decimal
  longitude: Prisma.Decimal
}

interface FindManyArgs {
  where?: Record<string, unknown>
  select?: Record<string, boolean>
  orderBy?: Record<string, 'asc' | 'desc'>[]
  take?: number
}

/** Columns the evaluator knows how to match; anything else is a test failure. */
const TEXT_COLUMNS = [
  'name',
  'nameNorm',
  'kind',
  'state',
  'district',
  'county',
  'countryCode',
] as const

function matchesText(raw: string | null, filter: unknown): boolean {
  // `nameNorm: 'rampur'` — Prisma's shorthand for equality, which is how the
  // exact tier is retrieved.
  if (typeof filter === 'string') return raw === filter

  if (typeof filter !== 'object' || filter === null) {
    throw new Error(`fake findMany: expected a string or operator object, got ${JSON.stringify(filter)}`)
  }

  const entries = Object.entries(filter as Record<string, unknown>)
  const insensitive = (filter as Record<string, unknown>).mode === 'insensitive'
  const fold = (value: string): string => (insensitive ? value.toLowerCase() : value)

  for (const [operator, operand] of entries) {
    if (operator === 'mode') continue

    // `not: { startsWith: 'rampur' }` — a nested filter, which is how the
    // substring tier subtracts the prefix tier. `NOT (col LIKE 'x%')` over a
    // NULL column is NULL, i.e. not true, so a null value fails either way.
    if (operator === 'not' && typeof operand === 'object' && operand !== null) {
      if (raw === null || matchesText(raw, operand)) return false
      continue
    }

    if (typeof operand !== 'string') {
      throw new Error(`fake findMany: non-string operand for "${operator}"`)
    }

    const value = raw === null ? null : fold(raw)
    const needle = fold(operand)

    switch (operator) {
      // A NULL column matches no LIKE pattern, so `county: { contains }` skips
      // the 2.5% of rows without a tehsil instead of treating them as wildcards.
      case 'startsWith':
        if (value === null || !value.startsWith(needle)) return false
        break
      case 'contains':
        if (value === null || !value.includes(needle)) return false
        break
      // `col <> 'x'` is also NULL — and therefore not true — for a NULL column.
      case 'not':
        if (value === null || value === needle) return false
        break
      default:
        throw new Error(`fake findMany: unsupported string operator "${operator}"`)
    }
  }

  return true
}

function rowMatches(row: FakePlaceRow, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, condition]) => {
    // `AND: []` — what a single-token query produces — is vacuously true, same
    // as Prisma treats it.
    if (key === 'AND') {
      return (condition as Record<string, unknown>[]).every((child) => rowMatches(row, child))
    }
    if (key === 'OR') {
      return (condition as Record<string, unknown>[]).some((child) => rowMatches(row, child))
    }
    if ((TEXT_COLUMNS as readonly string[]).includes(key)) {
      return matchesText(row[key as (typeof TEXT_COLUMNS)[number]] as string | null, condition)
    }
    throw new Error(`fake findMany: unsupported where key "${key}"`)
  })
}

function compareRows(orderBy: Record<string, 'asc' | 'desc'>[]) {
  return (a: FakePlaceRow, b: FakePlaceRow): number => {
    for (const clause of orderBy) {
      const [field, direction] = Object.entries(clause)[0]
      const left = a[field as keyof FakePlaceRow]
      const right = b[field as keyof FakePlaceRow]
      const comparison =
        typeof left === 'number' && typeof right === 'number'
          ? left - right
          : String(left ?? '').localeCompare(String(right ?? ''))
      if (comparison !== 0) return direction === 'desc' ? -comparison : comparison
    }
    return 0
  }
}

/** The rows the current test's queries run against. Reset per test. */
let table: FakePlaceRow[] = []

async function fakeFindMany(args: FindManyArgs): Promise<FakePlaceRow[]> {
  // The route must never fetch whole rows: `nameNorm` and `kindRank` are
  // ranking machinery and must not reach the client.
  if (!args.select) throw new Error('fake findMany: expected an explicit select')

  const matched = table
    .filter((row) => rowMatches(row, args.where ?? {}))
    .sort(compareRows(args.orderBy ?? []))

  return typeof args.take === 'number' ? matched.slice(0, args.take) : matched
}

// ─── Fixtures ─────────────────────────────────────────────────────────────

/**
 * `nameNorm` is derived through the shipped `normalizePlaceName` rather than
 * hand-written, exactly as ingestion derives it — so a fixture can never encode
 * a normalization the loader would not have produced.
 */
function place(row: {
  id: string
  name: string
  kind: string
  kindRank: number
  state: string
  district: string
  county: string | null
  /** Defaults to `'in'`, matching the column default. */
  countryCode?: string
  latitude?: string
  longitude?: string
}): FakePlaceRow {
  return {
    ...row,
    nameNorm: normalizePlaceName(row.name),
    countryCode: row.countryCode ?? 'in',
    latitude: new Prisma.Decimal(row.latitude ?? '25.0000000'),
    longitude: new Prisma.Decimal(row.longitude ?? '80.0000000'),
  }
}

/**
 * The real "Rampur" ambiguity from the requirements document, plus the rows that
 * make each ranking tier observable:
 *   - five distinct exact `Rampur`s spanning city / town / village
 *   - a sixth `Rampur` that duplicates the Himachal town at a lower `kindRank`
 *   - a `Rampur` hamlet, for the default exclusion
 *   - `Rampura` (prefix but not exact) and `Shrirampur` (substring only)
 */
const RAMPUR_UP = place({
  id: 'up-city',
  name: 'Rampur',
  kind: 'city',
  kindRank: 1,
  county: null, // the 2.5% with no tehsil — exercises the label fallback
  district: 'Rampur',
  state: 'Uttar Pradesh',
})
const RAMPUR_HP = place({
  id: 'hp-town',
  name: 'Rampur',
  kind: 'town',
  kindRank: 2,
  county: 'Rampur',
  district: 'Shimla',
  state: 'Himachal Pradesh',
})
const RAMPUR_MP = place({
  id: 'mp-town',
  name: 'Rampur',
  kind: 'town',
  kindRank: 2,
  county: 'Rampur Naikin Tahsil',
  district: 'Sidhi',
  state: 'Madhya Pradesh',
})
const RAMPUR_WB = place({
  id: 'wb-town',
  name: 'Rampur',
  kind: 'town',
  kindRank: 2,
  county: 'Tapan',
  district: 'Dakshin Dinajpur',
  state: 'West Bengal',
})
const RAMPUR_TG = place({
  id: 'tg-village',
  name: 'Rampur',
  kind: 'village',
  kindRank: 3,
  county: 'Armoor mandal',
  district: 'Nizamabad',
  state: 'Telangana',
})
/** Same settlement as RAMPUR_HP described by a second OSM object. */
const RAMPUR_HP_DUPLICATE = place({
  id: 'hp-village-duplicate',
  name: 'Rampur',
  kind: 'village',
  kindRank: 3,
  county: 'Rampur',
  district: 'Shimla',
  state: 'Himachal Pradesh',
})
const RAMPUR_HAMLET = place({
  id: 'br-hamlet',
  name: 'Rampur',
  kind: 'hamlet',
  kindRank: 4,
  county: 'Teghra',
  district: 'Begusarai',
  state: 'Bihar',
})
const RAMPURA = place({
  id: 'rj-prefix',
  name: 'Rampura',
  kind: 'town',
  kindRank: 2,
  county: 'Sujangarh',
  district: 'Churu',
  state: 'Rajasthan',
})
const SHRIRAMPUR = place({
  id: 'mh-substring',
  name: 'Shrirampur',
  kind: 'town',
  kindRank: 2,
  county: 'Shrirampur',
  district: 'Ahmadnagar',
  state: 'Maharashtra',
})
const ALANDI = place({
  id: 'alandi',
  name: 'Alandi',
  kind: 'village',
  kindRank: 3,
  county: 'Khed',
  district: 'Pune',
  state: 'Maharashtra',
  latitude: '18.6772446',
  longitude: '73.8981129',
})
/** A macron name: reachable only if the query side folds diacritics too. */
const HARIDWAR = place({
  id: 'haridwar',
  name: 'Haridwār',
  kind: 'city',
  kindRank: 1,
  county: 'Haridwar',
  district: 'Haridwar',
  state: 'Uttarakhand',
})

const ALL_PLACES: FakePlaceRow[] = [
  RAMPUR_UP,
  RAMPUR_HP,
  RAMPUR_MP,
  RAMPUR_WB,
  RAMPUR_TG,
  RAMPUR_HP_DUPLICATE,
  RAMPUR_HAMLET,
  RAMPURA,
  SHRIRAMPUR,
  ALANDI,
  HARIDWAR,
]

// ─── Multi-word primary names ─────────────────────────────────────────────
//
// Real settlements whose OWN name is more than one word. These are kept out of
// ALL_PLACES and installed per-test, so that the Rampur ranking fixtures above
// stay a closed set: `Rampur Bushahr` is a prefix match for "rampur" and sits in
// the same district as `RAMPUR_HP`, so including it globally would rewrite most
// of the narrowing assertions without testing anything new.

/** The design's worked example: the full name of the Shimla Rampur. */
const RAMPUR_BUSHAHR = place({
  id: 'hp-bushahr',
  name: 'Rampur Bushahr',
  kind: 'town',
  kindRank: 2,
  county: 'Rampur',
  district: 'Shimla',
  state: 'Himachal Pradesh',
})
/** Two words, neither of which is an administrative name. */
const ALANDI_DEVACHI = place({
  id: 'alandi-devachi',
  name: 'Alandi Devachi',
  kind: 'village',
  kindRank: 3,
  county: 'Haveli',
  district: 'Pune',
  state: 'Maharashtra',
})
/** Two words where the SECOND happens to also be a state and a district. */
const NEW_DELHI = place({
  id: 'new-delhi',
  name: 'New Delhi',
  kind: 'city',
  kindRank: 1,
  county: null,
  district: 'New Delhi',
  state: 'Delhi',
})
/** Three words, the first of which normalizes to two characters. */
const ST_THOMAS_MOUNT = place({
  id: 'st-thomas-mount',
  name: 'St. Thomas Mount',
  kind: 'town',
  kindRank: 2,
  county: 'Alandur',
  district: 'Chennai',
  state: 'Tamil Nadu',
})

// ─── Harness ──────────────────────────────────────────────────────────────

/**
 * The route's own response type, widened with the error envelope so the 400/500
 * cases can be read through the same helper.
 */
type SearchBody = PlaceSearchResponse & { error?: string; details?: unknown }

interface SearchOutcome {
  status: number
  body: SearchBody
}

function makeRequest(query: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/places${query}`)
}

/** `?q=…` with `q` encoded, so multi-token queries survive the URL. */
async function search(q: string, extra = ''): Promise<SearchOutcome> {
  const response = await GET(makeRequest(`?q=${encodeURIComponent(q)}${extra}`))
  return { status: response.status, body: await response.json() }
}

/** Result ids in response order — the shape most assertions here are about. */
function names(body: SearchBody): string[] {
  return body.results.map((result) => result.id)
}

beforeEach(() => {
  vi.clearAllMocks()
  table = [...ALL_PLACES]
  vi.mocked(resolveRequestUser).mockResolvedValue('user-1')
  vi.mocked(prisma.place.findMany).mockImplementation(fakeFindMany as never)
})

// ─── Authentication and validation ────────────────────────────────────────

describe('GET /api/places — access and input', () => {
  it('requires authentication', async () => {
    vi.mocked(resolveRequestUser).mockResolvedValue(null)

    const { status } = await search('rampur')

    expect(status).toBe(401)
    expect(prisma.place.findMany).not.toHaveBeenCalled()
  })

  it.each([
    ['absent q', ''],
    ['limit below the floor', '?q=rampur&limit=0'],
    ['limit above the ceiling', '?q=rampur&limit=51'],
    ['non-numeric limit', '?q=rampur&limit=lots'],
    ['fractional limit', '?q=rampur&limit=2.5'],
    ['non-boolean includeHamlets', '?q=rampur&includeHamlets=yes'],
  ])('returns 400 with details for %s', async (_label, query) => {
    const response = await GET(makeRequest(query))

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toBe('Invalid input')
    expect(body.details).toBeDefined()
    expect(prisma.place.findMany).not.toHaveBeenCalled()
  })

  it('reads "false" as false rather than as a truthy string', async () => {
    // z.coerce.boolean() would make includeHamlets=false *include* hamlets,
    // which is why the schema uses an explicit enum.
    const { body } = await search('rampur', '&includeHamlets=false')

    expect(body.hamletsExcluded).toBe(true)
    expect(names(body)).not.toContain(RAMPUR_HAMLET.id)
  })

  it('never writes through the read-only search path', async () => {
    await search('rampur')

    expect(prisma.place.create).not.toHaveBeenCalled()
    expect(prisma.place.createMany).not.toHaveBeenCalled()
    expect(prisma.place.update).not.toHaveBeenCalled()
    expect(prisma.place.deleteMany).not.toHaveBeenCalled()
  })
})

// ─── The 3-character short-circuit ────────────────────────────────────────

describe('short query', () => {
  it.each([
    ['one letter', 'r'],
    ['two letters', 'ra'],
    ['whitespace only', '   '],
    // Three characters as typed, one after normalization — the threshold is on
    // the normalized query, not on the raw input.
    ['trailing punctuation', 'r.,'],
  ])('returns query_too_short for %s without touching the database', async (_label, q) => {
    const { status, body } = await search(q)

    expect(status).toBe(200)
    expect(body).toEqual({
      results: [],
      truncated: false,
      hamletsExcluded: true,
      reason: 'query_too_short',
    })
    expect(prisma.place.findMany).not.toHaveBeenCalled()
  })

  it('searches at exactly three characters', async () => {
    const { body } = await search('ram')

    expect(body.reason).toBeUndefined()
    expect(prisma.place.findMany).toHaveBeenCalled()
    expect(names(body).length).toBeGreaterThan(0)
  })

  it('keeps a dotted initial inside the name token rather than splitting on it', async () => {
    // `q` is split on commas and whitespace only, so "b.k" stays one token and
    // normalizes to "b k" — three characters, and therefore searchable. That is
    // what lets the 542 dotted names ("B. Kothakota") be reached the way people
    // type them; the space the dot became counts toward the threshold.
    const { body } = await search('b.k')

    expect(body.reason).toBeUndefined()
    const [call] = vi.mocked(prisma.place.findMany).mock.calls
    expect((call[0] as FindManyArgs).where).toMatchObject({ nameNorm: 'b k' })
  })

  it('measures the threshold against the whole query, not its first word', async () => {
    // "St. Thomas Mount" normalizes its FIRST token to "st" — two characters.
    // Measuring the guard there rejected a 16-character query as too short,
    // which is how a real dataset name became unreachable. 542 names carry a
    // dotted initial like this.
    table = [ST_THOMAS_MOUNT]

    const { status, body } = await search('st. thomas mount')

    expect(status).toBe(200)
    expect(body.reason).toBeUndefined()
    expect(prisma.place.findMany).toHaveBeenCalled()
    expect(names(body)).toEqual([ST_THOMAS_MOUNT.id])
  })

  it('searches a short first word once later words make the query long enough', async () => {
    // Changed deliberately: this used to short-circuit as
    // `query_too_short` because only the first token was measured. "ra shimla"
    // is nine normalized characters, well past a trigram, so the index-based
    // reason for refusing to query does not apply — and the user typed enough
    // to deserve an answer, even if that answer is an empty list.
    const { status, body } = await search('ra shimla')

    expect(status).toBe(200)
    expect(body.reason).toBeUndefined()
    expect(prisma.place.findMany).toHaveBeenCalled()
  })
})

// ─── Ranking ──────────────────────────────────────────────────────────────

describe('ranked retrieval', () => {
  it('orders exact, then prefix, then substring — and within a tier by kindRank then state', async () => {
    const { body } = await search('rampur')

    expect(names(body)).toEqual([
      // exact `nameNorm` tier, kindRank ascending then state ascending
      RAMPUR_UP.id, // city
      RAMPUR_HP.id, // town, Himachal Pradesh
      RAMPUR_MP.id, // town, Madhya Pradesh
      RAMPUR_WB.id, // town, West Bengal
      RAMPUR_TG.id, // village
      // prefix tier — "Rampura" is a kindRank-2 town, yet it still ranks below
      // every exact match, including the villages. Tier beats kindRank.
      RAMPURA.id,
      // substring tier
      SHRIRAMPUR.id,
    ])
    // The Himachal duplicate is gone, collapsed into the town above.
    expect(names(body)).not.toContain(RAMPUR_HP_DUPLICATE.id)
  })

  it('asks the database for a total ordering, so identical input returns identical results', async () => {
    await search('rampur')

    for (const call of vi.mocked(prisma.place.findMany).mock.calls) {
      expect((call[0] as FindManyArgs).orderBy).toEqual([
        { kindRank: 'asc' },
        { state: 'asc' },
        { district: 'asc' },
        { name: 'asc' },
      ])
    }
  })

  it('matches the name case-insensitively and diacritic-insensitively', async () => {
    // Neither ILIKE nor the trigram index folds a macron; both sides going
    // through normalizePlaceName() is what makes this work.
    for (const q of ['Haridwar', 'HARIDWAR', 'Haridwār', 'haridwār']) {
      const { body } = await search(q)
      expect(names(body)).toEqual([HARIDWAR.id])
    }
  })

  it('retrieves each tier as its own query, so the over-fetch cannot starve a higher tier', async () => {
    // The tier has to be decided in SQL. A single `startsWith` query ordered by
    // kindRank interleaves exact and prefix matches, so its `take` can cut off
    // exact matches while prefix matches sit inside the window — measured
    // against the loaded table, `q=rampur` reached only 13 of its 112 exact
    // matches that way and filled the rest of the page with `Rampura` and
    // friends. Three disjoint queries make that impossible by construction.
    await search('rampur')

    const wheres = vi
      .mocked(prisma.place.findMany)
      .mock.calls.map((call) => (call[0] as FindManyArgs).where as Record<string, unknown>)

    expect(wheres.map((where) => where.nameNorm)).toEqual([
      'rampur',
      { startsWith: 'rampur', not: 'rampur' },
      { contains: 'rampur', not: { startsWith: 'rampur' } },
    ])
  })

  it('stops issuing queries once the over-fetch is spent', async () => {
    // limit 1 → over-fetch 3, and there are more than three exact matches, so
    // no lower tier could contribute anything that outranks them.
    const filled = await search('rampur', '&limit=1')
    expect(filled.body.results).toHaveLength(1)
    expect(vi.mocked(prisma.place.findMany)).toHaveBeenCalledTimes(1)

    vi.mocked(prisma.place.findMany).mockClear()

    // "shrirampur" is neither exact nor a prefix match, so only the substring
    // tier can find it — and it is only reached because room was left.
    const spilled = await search('rampur', '&limit=20')
    expect(vi.mocked(prisma.place.findMany)).toHaveBeenCalledTimes(3)
    expect(names(spilled.body)).toContain(SHRIRAMPUR.id)
  })

  it('never lets a prefix match consume the over-fetch ahead of an exact match', async () => {
    // The regression this guards was found by exercising the loaded table
    // (task 3.7): retrieving one `startsWith` page and partitioning it
    // afterwards puts exact and prefix matches in the SAME window, so the
    // `take` can spend the whole budget on prefix matches that happen to sort
    // earlier — here three kindRank-2 towns ahead of a kindRank-3 exact
    // village. The exact match then vanishes from a search for its own name.
    table = [
      place({ id: 'exact', name: 'Rampur', kind: 'village', kindRank: 3, county: 'Zira', district: 'Zira', state: 'Zira' }),
      place({ id: 'prefix-a', name: 'Rampura', kind: 'town', kindRank: 2, county: 'A', district: 'A', state: 'Andhra Pradesh' }),
      place({ id: 'prefix-b', name: 'Rampurwa', kind: 'town', kindRank: 2, county: 'B', district: 'B', state: 'Bihar' }),
      place({ id: 'prefix-c', name: 'Rampuria', kind: 'town', kindRank: 2, county: 'C', district: 'C', state: 'Chhattisgarh' }),
    ]

    // limit 1 → over-fetch 3, exactly the number of prefix matches available.
    const { body } = await search('rampur', '&limit=1')

    expect(names(body)).toEqual(['exact'])
    expect(body.truncated).toBe(true)
  })

  it('makes the tiers disjoint, so no row is returned twice', async () => {
    const { body } = await search('rampur')

    expect(new Set(names(body)).size).toBe(names(body).length)
    // The exact match `Rampur` is a prefix and a substring match too; only the
    // `not` clauses keep it out of the two lower tiers.
    expect(names(body).filter((id) => id === RAMPUR_UP.id)).toHaveLength(1)
  })
})

// ─── Multi-word primary names ─────────────────────────────────────────────

describe('multi-word primary names', () => {
  it('finds a settlement whose own name is the whole query', async () => {
    // The defect this covers: treating only the first token as the name and
    // forcing "bushahr" to match state/district/county made the town's real
    // name unsearchable — "Rampur Bushahr" is in Rampur tehsil, Shimla, so
    // nothing administrative says "Bushahr" at all.
    table = [RAMPUR_HP, RAMPUR_BUSHAHR, RAMPURA]

    const { body } = await search('rampur bushahr')

    expect(names(body)).toEqual([RAMPUR_BUSHAHR.id])
  })

  it.each([
    ['neither word administrative', 'alandi devachi', 'alandi-devachi'],
    ['a first word that normalizes to two characters', 'st. thomas mount', 'st-thomas-mount'],
  ])('finds a two-or-more-word name with %s', async (_label, q, expected) => {
    table = [ALANDI, ALANDI_DEVACHI, ST_THOMAS_MOUNT]

    const { body } = await search(q)

    expect(names(body)).toEqual([expected])
  })

  it('ranks a phrase match above a token match with a better kindRank', async () => {
    // The whole point of the tier order. `RAMPUR_IN_BUSHAHR` is a *city* found
    // by name + narrowing; `RAMPUR_BUSHAHR` is a *town* whose own name is
    // exactly what was typed. Tier beats kindRank, so the town leads.
    const RAMPUR_IN_BUSHAHR = place({
      id: 'rampur-in-bushahr',
      name: 'Rampur',
      kind: 'city',
      kindRank: 1,
      county: 'Bushahr',
      district: 'Bushahr',
      state: 'Himachal Pradesh',
    })
    table = [RAMPUR_IN_BUSHAHR, RAMPUR_BUSHAHR]

    const { body } = await search('rampur bushahr')

    expect(names(body)).toEqual([RAMPUR_BUSHAHR.id, RAMPUR_IN_BUSHAHR.id])
  })

  it('still narrows administratively when the phrase names nothing', async () => {
    // Requirement 3.4 survives the phrase tiers: no settlement is called
    // "Rampur Shimla", so every phrase tier misses and the token + narrowing
    // tiers do the work — the design's worked example, exact tier then prefix.
    table = [RAMPUR_UP, RAMPUR_HP, RAMPUR_TG, RAMPUR_BUSHAHR]

    const { body } = await search('rampur shimla')

    expect(names(body)).toEqual([RAMPUR_HP.id, RAMPUR_BUSHAHR.id])
  })

  it('returns a row found by both the phrase and the token tiers exactly once', async () => {
    // "New Delhi" is matched by `phrase-exact` (its name) and by
    // `token-prefix` ("new" + district "New Delhi"). Dedupe on
    // `(nameNorm, county, district, state)` collapses the two retrievals.
    table = [NEW_DELHI]

    const { body } = await search('new delhi')

    expect(names(body)).toEqual([NEW_DELHI.id])
    expect(body.results).toHaveLength(1)
    // Both families really did run — the dedupe is doing the work, not luck.
    expect(vi.mocked(prisma.place.findMany).mock.calls.length).toBeGreaterThan(3)
  })

  it('costs no extra round trip when the query is a single word', async () => {
    // With nothing to narrow with, the token tiers would be byte-identical to
    // the phrase tiers, so they are not issued at all.
    await search('rampur', '&limit=20')

    expect(vi.mocked(prisma.place.findMany)).toHaveBeenCalledTimes(3)
  })

  it('issues at most one query per tier for a multi-token query', async () => {
    await search('rampur shimla', '&limit=20')

    expect(vi.mocked(prisma.place.findMany)).toHaveBeenCalledTimes(6)
  })
})

// ─── Country scoping ──────────────────────────────────────────────────────

describe('countryCode scoping', () => {
  it('scopes every retrieval stage to India', async () => {
    await search('rampur shimla', '&limit=20')

    const calls = vi.mocked(prisma.place.findMany).mock.calls
    expect(calls).toHaveLength(6)
    for (const call of calls) {
      expect((call[0] as FindManyArgs).where).toMatchObject({ countryCode: 'in' })
    }
  })

  it('never returns a row from another country', async () => {
    // The dataset is India-only today. This is the guard against a future
    // non-India ingest leaking into a picker that hard-codes IST on selection.
    table = [
      place({
        id: 'np-rampur',
        name: 'Rampur',
        kind: 'town',
        kindRank: 2,
        county: 'Rampur',
        district: 'Palpa',
        state: 'Lumbini',
        countryCode: 'np',
      }),
    ]

    const { status, body } = await search('rampur')

    expect(status).toBe(200)
    expect(body.results).toEqual([])
  })
})

// ─── Dedupe ───────────────────────────────────────────────────────────────

describe('dedupe on (nameNorm, county, district, state)', () => {
  it('keeps the lowest kindRank and does not let the survivor jump the ranking', async () => {
    const { body } = await search('rampur shimla')

    // Two rows describe the Himachal Rampur — a town and a village. One result,
    // described as the town.
    expect(body.results).toHaveLength(1)
    expect(body.results[0].id).toBe(RAMPUR_HP.id)
    expect(body.results[0].kind).toBe('town')
  })

  it('does not collapse same-named settlements in different districts', async () => {
    const { body } = await search('rampur')

    // Five distinct Rampurs share a `nameNorm`; only the administrative tuple
    // separates them, and it must.
    expect(names(body)).toEqual(
      expect.arrayContaining([
        RAMPUR_UP.id,
        RAMPUR_HP.id,
        RAMPUR_MP.id,
        RAMPUR_WB.id,
        RAMPUR_TG.id,
      ])
    )
  })
})

// ─── Multi-token narrowing ────────────────────────────────────────────────

describe('multi-token narrowing', () => {
  it.each([
    ['district token', 'rampur shimla'],
    ['comma separator', 'rampur, shimla'],
    ['state token', 'rampur himachal'],
    ['mixed case', 'rampur SHIMLA'],
    ['two narrowing tokens', 'rampur shimla himachal'],
  ])('narrows the Rampurs to one row via a %s', async (_label, q) => {
    const { body } = await search(q)

    expect(names(body)).toEqual([RAMPUR_HP.id])
    expect(body.truncated).toBe(false)
  })

  it('accepts a tehsil (county) as the narrowing token', async () => {
    const { body } = await search('rampur armoor')

    expect(names(body)).toEqual([RAMPUR_TG.id])
  })

  it('requires every narrowing token to match, so a wrong pairing returns nothing', async () => {
    const { status, body } = await search('rampur shimla telangana')

    expect(status).toBe(200)
    expect(body.results).toEqual([])
  })

  it('leaves a single-token query unnarrowed', async () => {
    await search('rampur')

    expect((vi.mocked(prisma.place.findMany).mock.calls[0][0] as FindManyArgs).where).toMatchObject(
      { AND: [] }
    )
  })
})

// ─── Hamlets ──────────────────────────────────────────────────────────────

describe('hamlet handling', () => {
  it('excludes hamlets by default and says so', async () => {
    const { body } = await search('rampur')

    expect(body.hamletsExcluded).toBe(true)
    expect(body.results.every((result) => result.kind !== 'hamlet')).toBe(true)
    expect((vi.mocked(prisma.place.findMany).mock.calls[0][0] as FindManyArgs).where).toMatchObject(
      { kind: { not: 'hamlet' } }
    )
  })

  it('includes them on request, still ranked last, and stops advertising the toggle', async () => {
    const { body } = await search('rampur', '&includeHamlets=true')

    expect(body.hamletsExcluded).toBe(false)
    const ids = names(body)
    expect(ids).toContain(RAMPUR_HAMLET.id)
    // Last of the exact tier: after every other exact match, before the
    // prefix-tier "Rampura".
    expect(ids.indexOf(RAMPUR_HAMLET.id)).toBeGreaterThan(ids.indexOf(RAMPUR_TG.id))
    expect(ids.indexOf(RAMPUR_HAMLET.id)).toBeLessThan(ids.indexOf(RAMPURA.id))
    expect((vi.mocked(prisma.place.findMany).mock.calls[0][0] as FindManyArgs).where).not.toHaveProperty(
      'kind'
    )
  })

  it('reports hamletsExcluded even when no hamlet was filtered out', async () => {
    // The client needs the flag to offer the toggle, and cannot know whether a
    // hamlet was waiting behind it.
    const { body } = await search('alandi')

    expect(body.results).toHaveLength(1)
    expect(body.hamletsExcluded).toBe(true)
  })
})

// ─── Truncation ───────────────────────────────────────────────────────────

describe('truncated', () => {
  it('is true when more matches exist than the limit, and slices to the limit', async () => {
    const { body } = await search('rampur', '&limit=3')

    expect(body.truncated).toBe(true)
    expect(names(body)).toEqual([RAMPUR_UP.id, RAMPUR_HP.id, RAMPUR_MP.id])
  })

  it('is false when everything fits', async () => {
    const { body } = await search('rampur', '&limit=20')

    expect(body.results).toHaveLength(7)
    expect(body.truncated).toBe(false)
  })

  it('is derived from the over-fetch, not from a second count query', async () => {
    await search('rampur', '&limit=3')

    // No COUNT anywhere: the surplus the tiers over-fetched is the evidence.
    expect(prisma.place.count).not.toHaveBeenCalled()

    // The over-fetch is limit * 3 = 9, and it is a budget shared across the
    // tiers rather than a ceiling each one gets: the exact tier may claim all 9,
    // takes 6, and each later tier asks only for what is left.
    const takes = vi
      .mocked(prisma.place.findMany)
      .mock.calls.map((call) => (call[0] as FindManyArgs).take as number)
    expect(takes).toEqual([9, 3, 2])
  })

  it('is false for an empty result set', async () => {
    const { body } = await search('nonexistentplace')

    expect(body).toEqual({ results: [], truncated: false, hamletsExcluded: true })
  })
})

// ─── Serialization ────────────────────────────────────────────────────────

describe('result serialization', () => {
  it('returns coordinates as numbers, not Prisma Decimal objects', async () => {
    const { body } = await search('alandi')
    const [result] = body.results

    // A raw Decimal serializes as {"s":1,"e":1,"d":[...]}, which only breaks
    // once the value reaches the ephemeris.
    expect(typeof result.latitude).toBe('number')
    expect(typeof result.longitude).toBe('number')
    expect(result.latitude).toBe(18.6772446)
    expect(result.longitude).toBe(73.8981129)
  })

  it('builds the label from the tehsil when present', async () => {
    const { body } = await search('alandi')

    expect(body.results[0].label).toBe('Alandi, Khed, Maharashtra')
  })

  it('falls back to the district when county is null, with no orphan separator', async () => {
    const { body } = await search('rampur, uttar')
    const [result] = body.results

    expect(result.county).toBeNull()
    expect(result.label).toBe('Rampur, Rampur, Uttar Pradesh')
    expect(result.label).not.toContain(', ,')
  })

  it('exposes the contract fields only — ranking columns stay server-side', async () => {
    const { body } = await search('alandi')

    expect(Object.keys(body.results[0]).sort()).toEqual([
      'county',
      'district',
      'id',
      'kind',
      'label',
      'latitude',
      'longitude',
      'name',
      'state',
    ])
  })
})

// ─── Failure ──────────────────────────────────────────────────────────────

describe('database failure', () => {
  it('returns 500 without leaking the cause, so the picker can fall back to manual entry', async () => {
    vi.mocked(prisma.place.findMany).mockRejectedValue(new Error('relation "place" does not exist'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const { status, body } = await search('rampur')

    expect(status).toBe(500)
    expect(body).toEqual({ error: 'Place search failed' })
    errorSpy.mockRestore()
  })
})
