/**
 * tests/places-loader.test.ts
 * ---------------------------
 * Validates: Requirement 10.5 of the place-location-picker spec.
 *
 * Three things are pinned here, in order of how much damage getting them wrong
 * would do:
 *
 * 1. **Coordinate orientation.** The source `location` array is
 *    `[longitude, latitude]` — longitude FIRST. No downstream check can catch a
 *    swap: Indian latitudes (8-37) and longitudes (68-97) are both legal
 *    latitudes and both legal longitudes, so a swapped pair still computes a
 *    perfectly plausible chart — with a different lagna, different cusps, and a
 *    birth place hundreds of kilometres away. The Bengaluru fixture below is the
 *    only thing standing between that bug and production, which is why it uses
 *    the real dataset row (`place_city.ndjson`, osm_id 3401391999) verbatim.
 * 2. **Every skip reason.** "348,845 read, 272,499 loaded" is only meaningful if
 *    each discard is attributed, so each of the seven reasons gets a row that
 *    triggers exactly it.
 * 3. **Idempotence.** Re-running the loader over the same data must leave the row
 *    count unchanged, which is `@@unique([osmType, osmId])` +
 *    `createMany({ skipDuplicates: true })` working together.
 * 4. **The two raw maintenance statements.** `--truncate` must be a `TRUNCATE`
 *    rather than a 272,499-row `deleteMany`, and a successful load must end in
 *    `ANALYZE` so the planner has fresh statistics for the prefix index the
 *    whole search design depends on. Both are hard-coded strings, and the tests
 *    below pin the exact text — an interpolated table name in either would be
 *    raw SQL taking operator input.
 *
 * Prisma is mocked with an in-memory table that enforces the unique key the way
 * Postgres would, so the whole file runs with no database — matching the
 * `vi.mock('@/lib/db')` convention of tests/gochar-api.test.ts. The fixture is
 * written to a temp dir rather than committed, because the loader must read it
 * through a real `createReadStream`.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * An in-memory stand-in for the `place` table.
 *
 * `createMany` reproduces the two behaviours the loader depends on: rows are
 * rejected on the `(osmType, osmId)` unique key, and `count` reports rows
 * actually inserted — not rows submitted. That distinction is the whole point of
 * the idempotence test: on a second run every row maps successfully and nothing
 * is skipped by a filter, yet `count` is 0.
 */
const store = new Map<string, Record<string, unknown>>()

function naturalKey(row: Record<string, unknown>): string {
  return `${String(row.osmType)}:${String(row.osmId)}`
}

vi.mock('@/lib/db', () => ({
  prisma: {
    place: {
      createMany: vi.fn(
        async ({
          data,
          skipDuplicates,
        }: {
          data: Record<string, unknown>[]
          skipDuplicates?: boolean
        }) => {
          let count = 0
          for (const row of data) {
            const key = naturalKey(row)
            if (store.has(key)) {
              if (!skipDuplicates) {
                throw new Error(`Unique constraint failed on place(osmType, osmId): ${key}`)
              }
              continue
            }
            store.set(key, row)
            count++
          }
          return { count }
        }
      ),
      count: vi.fn(async () => store.size),
      // Kept on the mock deliberately, even though the loader no longer calls
      // it: the truncate test asserts it is NOT used, which is only meaningful
      // if it is available to be used.
      deleteMany: vi.fn(async () => {
        const count = store.size
        store.clear()
        return { count }
      }),
    },
    /**
     * Stands in for the two raw maintenance statements. `TRUNCATE` empties the
     * in-memory table the way Postgres would; `ANALYZE` touches no rows. Both
     * return the affected-row count Prisma returns, which for these statements
     * is 0 — which is exactly why the loader reads the count separately instead
     * of trusting the return value.
     */
    $executeRawUnsafe: vi.fn(async (sql: string) => {
      if (/^TRUNCATE/i.test(sql)) store.clear()
      return 0
    }),
  },
}))

import { readFileSync } from 'node:fs'
import {
  analyzePlaceTable,
  loadFile,
  mapPlaceRow,
  truncatePlaceTable,
} from '../scripts/load-places'
import { prisma } from '@/lib/db'

/** The loader's own source, for the two assertions that are about the SQL text. */
const loaderSource = readFileSync(join(__dirname, '../scripts/load-places.ts'), 'utf8')

/**
 * The Bengaluru row exactly as it appears in `place_city.ndjson`, trimmed of the
 * `other_names` / `bbox` / `border` fields the loader does not read. `location`
 * is copied in source order — longitude first — on purpose: writing it as
 * `[12.97…, 77.59…]` here would make this test agree with a swapped loader.
 */
const BENGALURU = {
  name: 'Bengaluru',
  display_name: 'Bengaluru, Bangalore North, Bengaluru Urban, Karnataka, 560001, India',
  address: {
    city: 'Bengaluru',
    county: 'Bangalore North',
    state_district: 'Bengaluru Urban',
    state: 'Karnataka',
    'ISO3166-2-lvl4': 'IN-KA',
    postcode: '560001',
    country: 'India',
    country_code: 'in',
  },
  population: 10839725,
  osm_type: 'node',
  osm_id: 3401391999,
  type: 'city',
  location: [77.590082, 12.9767936],
}

/** Bengaluru's true coordinates, as the `place` table must hold them. */
const BENGALURU_LATITUDE = 12.9767936
const BENGALURU_LONGITUDE = 77.590082

let fixtureDir: string

function writeFixture(name: string, rows: unknown[]): string {
  const path = join(fixtureDir, name)
  // Lines that are already strings are written raw, so a deliberately malformed
  // line survives to reach JSON.parse.
  const body = rows
    .map((row) => (typeof row === 'string' ? row : JSON.stringify(row)))
    .join('\n')
  writeFileSync(path, `${body}\n`, 'utf8')
  return path
}

beforeAll(() => {
  fixtureDir = mkdtempSync(join(tmpdir(), 'places-loader-'))
})

afterAll(() => {
  rmSync(fixtureDir, { recursive: true, force: true })
})

beforeEach(() => {
  store.clear()
  vi.clearAllMocks()
  // The loader prints a per-file line; keep the test output readable.
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('coordinate orientation (source location is [longitude, latitude])', () => {
  it('maps the real Bengaluru row to (12.9767936, 77.590082)', () => {
    const outcome = mapPlaceRow('city', BENGALURU)

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return

    expect(outcome.row.latitude).toBe(BENGALURU_LATITUDE)
    expect(outcome.row.longitude).toBe(BENGALURU_LONGITUDE)
  })

  it('would fail loudly if the two indices were swapped', () => {
    const outcome = mapPlaceRow('city', BENGALURU)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return

    // Redundant with the pin above, deliberately: these two assertions state the
    // reason the pin exists. A swap keeps both numbers inside the *legal*
    // coordinate ranges the loader validates, but 77.59 is not a plausible
    // Indian latitude and 12.97 is not a plausible Indian longitude.
    expect(outcome.row.latitude).toBeGreaterThan(8)
    expect(outcome.row.latitude).toBeLessThan(37)
    expect(outcome.row.longitude).toBeGreaterThan(68)
    expect(outcome.row.longitude).toBeLessThan(97)
  })

  it('carries the orientation through the streaming path into the insert', async () => {
    // The pin is worthless if mapPlaceRow is right but the batch writer reorders
    // the pair, so the same assertion is made on what actually reaches Prisma.
    const path = writeFixture('place_city.ndjson', [BENGALURU])
    await loadFile('city', path)

    expect(store.size).toBe(1)
    const stored = store.get('node:3401391999')
    expect(stored?.latitude).toBe(BENGALURU_LATITUDE)
    expect(stored?.longitude).toBe(BENGALURU_LONGITUDE)
  })

  it('maps the rest of the Bengaluru row as the schema expects', () => {
    const outcome = mapPlaceRow('city', BENGALURU)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return

    expect(outcome.row).toMatchObject({
      osmType: 'node',
      osmId: 3401391999n,
      name: 'Bengaluru',
      nameNorm: 'bengaluru',
      kind: 'city',
      kindRank: 1,
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      county: 'Bangalore North',
      postcode: '560001',
    })
  })
})

describe('skip reasons', () => {
  /** A complete, loadable row; each case below removes or breaks one thing. */
  function validRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      name: 'Alandi',
      address: { state: 'Maharashtra', state_district: 'Pune', county: 'Khed' },
      osm_type: 'node',
      osm_id: 1234567890,
      type: 'village',
      location: [73.8977, 18.6773],
      ...overrides,
    }
  }

  function reasonFor(row: Record<string, unknown>): string | null {
    const outcome = mapPlaceRow('village', row)
    return outcome.ok ? null : outcome.reason
  }

  it('accepts the control row, so every case below differs by one field', () => {
    expect(reasonFor(validRow())).toBeNull()
  })

  it('noName — only administrative parents, the 75,435-row majority of discards', () => {
    expect(
      reasonFor({
        address: {
          county: 'Begusarai',
          state_district: 'Begusarai',
          state: 'Bihar',
          country: 'India',
        },
        osm_type: 'node',
        osm_id: 1,
        location: [86.13, 25.42],
      })
    ).toBe('noName')
  })

  it('junkName — the literal "---", all 11 junk rows in the dataset', () => {
    expect(reasonFor(validRow({ name: '---' }))).toBe('junkName')
  })

  it('noState — 1 row in the dataset', () => {
    expect(
      reasonFor(validRow({ address: { state_district: 'Pune', county: 'Khed' } }))
    ).toBe('noState')
  })

  it('noDistrict — neither state_district nor county', () => {
    expect(reasonFor(validRow({ address: { state: 'Maharashtra' } }))).toBe('noDistrict')
  })

  it('noDistrict does NOT fire when only county is present (the tehsil fallback)', () => {
    // 0.5% of rows rely on this; without the fallback they would be skipped and
    // `district` could not be non-nullable in the schema.
    const outcome = mapPlaceRow(
      'village',
      validRow({ address: { state: 'Maharashtra', county: 'Khed' } })
    )
    expect(outcome.ok).toBe(true)
    if (outcome.ok) expect(outcome.row.district).toBe('Khed')
  })

  it('badLocation — missing, wrong-length, non-numeric or out-of-range', () => {
    expect(reasonFor(validRow({ location: undefined }))).toBe('badLocation')
    expect(reasonFor(validRow({ location: [73.8977] }))).toBe('badLocation')
    expect(reasonFor(validRow({ location: [73.8977, 18.6773, 0] }))).toBe('badLocation')
    expect(reasonFor(validRow({ location: ['73.8977', '18.6773'] }))).toBe('badLocation')
    expect(reasonFor(validRow({ location: [73.8977, NaN] }))).toBe('badLocation')
    // Latitude out of range — index 1 is the latitude, so 91 is illegal there
    // while it would be a legal longitude at index 0.
    expect(reasonFor(validRow({ location: [73.8977, 91] }))).toBe('badLocation')
    expect(reasonFor(validRow({ location: [181, 18.6773] }))).toBe('badLocation')
  })

  it('noIdentity — no usable osm_type / osm_id, so the row has no natural key', () => {
    expect(reasonFor(validRow({ osm_type: undefined }))).toBe('noIdentity')
    expect(reasonFor(validRow({ osm_id: undefined }))).toBe('noIdentity')
    expect(reasonFor(validRow({ osm_id: 'not-a-number' }))).toBe('noIdentity')
    expect(reasonFor(validRow({ osm_id: 1.5 }))).toBe('noIdentity')
  })

  it('attributes a row failing several checks to the first one only', () => {
    // The reported breakdown is comparable to the survey figures precisely
    // because a row is counted once, under the first reason that fires.
    expect(reasonFor({ osm_type: undefined })).toBe('noName')
  })

  it('parseError — invalid JSON and valid JSON that is not an object', async () => {
    // Only reachable through the streaming path, and it must never abort the
    // file: one malformed line in a 190,054-row export is not a fatal error.
    const path = writeFixture('place-village.ndjson', [
      '{"name": "Broken", "address"',
      '[1, 2, 3]',
      '"just a string"',
      BENGALURU,
    ])

    const stats = await loadFile('village', path)

    expect(stats.read).toBe(4)
    expect(stats.skipped.parseError).toBe(3)
    expect(stats.loaded).toBe(1)
    expect(store.size).toBe(1)
  })

  it('counts every reason once across a mixed file and loads only the good rows', async () => {
    const path = writeFixture('place-town.ndjson', [
      BENGALURU,
      { address: { state: 'Bihar', state_district: 'Begusarai' }, osm_type: 'node', osm_id: 2, location: [86.1, 25.4] },
      { ...BENGALURU, name: '---', osm_id: 3 },
      { ...BENGALURU, osm_id: 4, address: { state_district: 'Pune' } },
      { ...BENGALURU, osm_id: 5, address: { state: 'Maharashtra' } },
      { ...BENGALURU, osm_id: 6, location: [77.59, 91] },
      { ...BENGALURU, osm_id: undefined },
      'not json at all',
    ])

    const stats = await loadFile('town', path)

    expect(stats.read).toBe(8)
    expect(stats.loaded).toBe(1)
    expect(stats.skipped).toEqual({
      noName: 1,
      junkName: 1,
      noState: 1,
      noDistrict: 1,
      badLocation: 1,
      noIdentity: 1,
      parseError: 1,
    })
  })
})

describe('idempotence', () => {
  it('loading the same fixture twice leaves the row count unchanged', async () => {
    const path = writeFixture('place-village.ndjson', [
      BENGALURU,
      { ...BENGALURU, name: 'Alandi', osm_id: 1234567890, location: [73.8977, 18.6773] },
      { ...BENGALURU, name: 'Sohra (Cherrapunji)', osm_id: 555, location: [91.7, 25.27] },
      // A row that is skipped, not loaded — so the "unchanged count" below is
      // not trivially satisfied by every line being insertable.
      { ...BENGALURU, name: '---', osm_id: 999 },
    ])

    const first = await loadFile('village', path)
    const countAfterFirst = await prisma.place.count()

    const second = await loadFile('village', path)
    const countAfterSecond = await prisma.place.count()

    expect(countAfterFirst).toBe(3)
    expect(countAfterSecond).toBe(countAfterFirst)

    // Same rows read and same rows skipped both times — the run is not idempotent
    // by virtue of having read less.
    expect(second.read).toBe(first.read)
    expect(second.skipped).toEqual(first.skipped)

    // `loaded` counts rows Prisma actually inserted, so the second pass reports 0
    // rather than re-claiming the three it submitted.
    expect(first.loaded).toBe(3)
    expect(second.loaded).toBe(0)
  })

  it('relies on skipDuplicates rather than on the rows being absent', async () => {
    // The mock throws on a duplicate when skipDuplicates is not set, so this
    // asserts the loader passes the flag — the actual source of idempotence.
    const path = writeFixture('place_city.ndjson', [BENGALURU])

    await loadFile('city', path)
    await expect(loadFile('city', path)).resolves.toBeDefined()

    expect(prisma.place.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true })
    )
  })

  it('de-duplicates within a single run when a file repeats a natural key', async () => {
    // The same (osm_type, osm_id) twice in one file — a re-export artefact. The
    // unique key absorbs it instead of the run failing.
    const path = writeFixture('place_city.ndjson', [BENGALURU, BENGALURU])

    const stats = await loadFile('city', path)

    expect(stats.read).toBe(2)
    expect(stats.loaded).toBe(1)
    expect(await prisma.place.count()).toBe(1)
  })
})

describe('--truncate empties the table with TRUNCATE, not deleteMany', () => {
  async function seedThreeRows(): Promise<void> {
    const path = writeFixture('place-truncate.ndjson', [
      BENGALURU,
      { ...BENGALURU, name: 'Alandi', osm_id: 1234567890, location: [73.8977, 18.6773] },
      { ...BENGALURU, name: 'Sohra (Cherrapunji)', osm_id: 555, location: [91.7, 25.27] },
    ])
    await loadFile('village', path)
    expect(await prisma.place.count()).toBe(3)
  }

  it('reports the rows removed and leaves the table empty', async () => {
    await seedThreeRows()

    // The operator-facing contract is unchanged from the deleteMany version:
    // "removed N existing place row(s)". TRUNCATE reports nothing back, so the
    // count has to be read first — this asserts it is.
    const removed = await truncatePlaceTable()

    expect(removed).toBe(3)
    expect(await prisma.place.count()).toBe(0)
  })

  it('issues exactly TRUNCATE TABLE "place" and nothing else', async () => {
    await seedThreeRows()
    vi.mocked(prisma.$executeRawUnsafe).mockClear()

    await truncatePlaceTable()

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(1)
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith('TRUNCATE TABLE "place"')
  })

  it('does NOT fall back to deleteMany', async () => {
    // The regression this guards: `deleteMany({})` on a 272,499-row table is a
    // row-at-a-time DELETE that leaves a dead tuple per row behind, right before
    // the loader inserts 272,499 fresh rows into that bloated heap. It is
    // available on the mock, so this assertion means something.
    await seedThreeRows()
    await truncatePlaceTable()

    expect(prisma.place.deleteMany).not.toHaveBeenCalled()
  })

  it('a load after a truncate re-inserts every row (the flag actually enables correction)', async () => {
    // Why --truncate exists: skipDuplicates makes a plain re-run a no-op, so
    // correcting a bad row requires emptying the table first. If TRUNCATE did
    // not really clear it, `loaded` here would be 0 and the operator's
    // correction would silently not apply.
    const path = writeFixture('place-truncate-reload.ndjson', [BENGALURU])
    const first = await loadFile('city', path)
    expect(first.loaded).toBe(1)

    await truncatePlaceTable()

    const second = await loadFile('city', path)
    expect(second.loaded).toBe(1)
    expect(await prisma.place.count()).toBe(1)
  })
})

describe('a successful load ends in ANALYZE', () => {
  it('issues exactly ANALYZE "place"', async () => {
    await analyzePlaceTable()

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(1)
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith('ANALYZE "place"')
  })

  it('does not touch the rows it just analyzed', async () => {
    const path = writeFixture('place-analyze.ndjson', [BENGALURU])
    await loadFile('city', path)

    await analyzePlaceTable()

    // ANALYZE is maintenance DDL: it samples the table and updates
    // pg_statistic. If this ever changes the row count, the statement is not
    // what this function claims it is.
    expect(await prisma.place.count()).toBe(1)
  })

  it('is not a VACUUM (which cannot run inside a transaction block)', async () => {
    await analyzePlaceTable()

    const [sql] = vi.mocked(prisma.$executeRawUnsafe).mock.calls[0]
    expect(sql).not.toMatch(/VACUUM/i)
  })

  it('main runs it after the summary, so a completed load never leaves stale statistics', () => {
    // main() is argv-gated and not exported, so the wiring is asserted against
    // the source: the ANALYZE has to come after the per-file loop, not before
    // it, or it would describe the pre-load table.
    const mainBody = loaderSource.slice(loaderSource.indexOf('async function main('))
    const loadLoopAt = mainBody.indexOf('results.push(await loadFile(')
    const analyzeAt = mainBody.indexOf('await analyzePlaceTable()')

    expect(loadLoopAt).toBeGreaterThan(-1)
    expect(analyzeAt).toBeGreaterThan(loadLoopAt)
  })
})

describe('the two raw statements take no input', () => {
  it('are hard-coded string literals with no interpolation', () => {
    // The no-raw-SQL rule in .kiro/skills/database-prisma.md exists to keep
    // caller input out of SQL. These two statements are exempt because there is
    // no input in them at all — assert that stays true. A `${...}` or a backtick
    // template in either constant is the thing this catches.
    expect(loaderSource).toContain(`const TRUNCATE_PLACE_SQL = 'TRUNCATE TABLE "place"'`)
    expect(loaderSource).toContain(`const ANALYZE_PLACE_SQL = 'ANALYZE "place"'`)
  })

  it('are the only raw SQL the loader executes, and always via a constant', () => {
    const callSites = loaderSource
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => /^await prisma\.\$(?:execute|query)Raw/.test(line))

    // Two call sites, each passing one of the frozen constants by name. Anything
    // else — a third statement, or a literal inlined at the call site where a
    // later edit could start appending to it — fails here.
    expect(callSites).toEqual([
      'await prisma.$executeRawUnsafe(TRUNCATE_PLACE_SQL)',
      'await prisma.$executeRawUnsafe(ANALYZE_PLACE_SQL)',
    ])
  })
})
