/**
 * scripts/load-places.ts
 *
 * Ingests the offline OpenStreetMap-derived Indian settlement dataset into the
 * `place` table, which backs the birth-place picker (GET /api/places).
 *
 * The dataset is four NDJSON files totalling ~160 MB / 348,845 rows and lives
 * OUTSIDE the repository — 160 MB of reference data is not version-controlled,
 * and nothing reads NDJSON at runtime. Point the loader at it with `--dir`, or
 * set PLACES_DATA_DIR once in your environment.
 *
 * Streaming is not an optimization here, it is a requirement: the largest file
 * is 91 MB, so every file is read line-by-line through `readline` over a
 * `createReadStream`. `readFile` is never used.
 *
 * Idempotent by construction: `@@unique([osmType, osmId])` plus
 * `createMany({ skipDuplicates: true })` means re-running over the same dataset
 * leaves the row count unchanged and does not throw. Because a re-run cannot
 * therefore *correct* an existing row, fixing bad data is an explicit
 * `--truncate` opt-in that empties the table first (with `TRUNCATE`, not a
 * 272,499-row `deleteMany`).
 *
 * A successful load ends with `ANALYZE "place"`: bulk `createMany` inserts leave
 * the planner's statistics stale, and the ranked search depends on the planner
 * choosing the `text_pattern_ops` prefix index rather than a sequential scan.
 * These two statements are the loader's only raw SQL — see TRUNCATE_PLACE_SQL
 * below for why they are exempt from the no-raw-SQL rule.
 *
 * Run:
 *   npm run db:load-places
 *   npm run db:load-places -- --dir ~/Documents/Mohit/in
 *   npm run db:load-places -- --kinds city,town,village
 *   npm run db:load-places -- --truncate
 *
 * See .kiro/specs/place-location-picker/design.md §Ingestion Design.
 */

import { createReadStream, existsSync, statSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { join } from 'node:path'
import { prisma } from '../lib/db'
import {
  isJunkPlaceName,
  KIND_RANK,
  normalizePlaceName,
  resolvePlaceName,
  toPlaceKind,
  type PlaceKind,
} from '../lib/places-normalize'

/** The four settlement kinds, in ingestion (and relevance) order. */
const ALL_KINDS = Object.keys(KIND_RANK) as PlaceKind[]

/**
 * Source filenames per kind. The dataset is inconsistent — `place_city` uses an
 * underscore where the other three use a hyphen — so both separators are probed
 * rather than hard-coding the quirk and failing on a re-export that fixed it.
 */
const FILE_CANDIDATES: Record<PlaceKind, string[]> = {
  city: ['place_city.ndjson', 'place-city.ndjson'],
  town: ['place-town.ndjson', 'place_town.ndjson'],
  village: ['place-village.ndjson', 'place_village.ndjson'],
  hamlet: ['place-hamlet.ndjson', 'place_hamlet.ndjson'],
}

/**
 * Why a source row was not loaded. Every skip is attributed, because "348,845
 * read, 272,499 loaded" without a breakdown is indistinguishable from a loader
 * bug — 21.6% of the source rows legitimately carry no settlement name at all.
 */
export interface SkipCounts {
  /** `resolvePlaceName` found no name field anywhere on the row. */
  noName: number
  /** The resolved name normalizes to nothing (11 rows, all the literal `---`). */
  junkName: number
  /** No `address.state`. */
  noState: number
  /** Neither `address.state_district` nor `address.county`. */
  noDistrict: number
  /** `location` is not `[lon, lat]` within valid coordinate ranges. */
  badLocation: number
  /**
   * No usable `osm_type` / `osm_id`, so the row has no stable natural key and
   * could not be de-duplicated on a re-run. Zero across all 348,845 rows of the
   * surveyed dataset (both fields have 100% coverage) — it exists so that being
   * pointed at a differently-shaped export is reported as a skip rather than
   * crashing on `BigInt(undefined)` 40,000 rows in.
   */
  noIdentity: number
  /**
   * The line was not valid JSON, or was valid JSON that is not an object.
   * Counted and skipped; never aborts the file.
   */
  parseError: number
}

export interface FileStats {
  kind: PlaceKind
  file: string
  read: number
  loaded: number
  skipped: SkipCounts
}

interface LoaderArgs {
  dir: string
  kinds: PlaceKind[]
  truncate: boolean
}

const USAGE = `
Usage: npm run db:load-places [-- options]

Options:
  --dir <path>     Directory holding the four NDJSON files.
                   Defaults to $PLACES_DATA_DIR.
  --kinds <csv>    Subset of ${ALL_KINDS.join(',')} to ingest. Defaults to all four.
                   Hamlets are ingested by default; GET /api/places excludes them
                   from results unless includeHamlets=true, so omitting them here
                   is only for operators who want a smaller table.
  --truncate       Empty the place table first. Required to CORRECT existing rows,
                   because a plain re-run skips duplicates instead of updating them.
  --help           Show this message.
`.trim()

class LoaderArgsError extends Error {}

function newSkipCounts(): SkipCounts {
  return {
    noName: 0,
    junkName: 0,
    noState: 0,
    noDistrict: 0,
    badLocation: 0,
    noIdentity: 0,
    parseError: 0,
  }
}

/**
 * Parses `--dir` / `--kinds` / `--truncate`. Unknown flags are an error rather
 * than being ignored: a silently-dropped `--truncate` would leave the operator
 * believing they had corrected the data.
 */
export function parseArgs(argv: string[]): LoaderArgs {
  let dir = process.env.PLACES_DATA_DIR ?? ''
  let kinds = ALL_KINDS
  let truncate = false

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]

    if (arg === '--truncate') {
      truncate = true
      continue
    }

    if (arg === '--dir' || arg === '--kinds') {
      const value = argv[++i]
      if (!value || value.startsWith('--')) {
        throw new LoaderArgsError(`${arg} requires a value`)
      }
      if (arg === '--dir') {
        dir = value
      } else {
        kinds = parseKinds(value)
      }
      continue
    }

    throw new LoaderArgsError(`Unknown argument: ${arg}`)
  }

  if (!dir) {
    throw new LoaderArgsError(
      'No dataset directory. Pass --dir <path> or set PLACES_DATA_DIR.'
    )
  }

  return { dir: expandHome(dir), kinds, truncate }
}

/** `~/Documents/...` → an absolute path, since shells do not expand it inside a value. */
function expandHome(path: string): string {
  if (path === '~' || path.startsWith('~/')) {
    const home = process.env.HOME ?? process.env.USERPROFILE
    if (home) return join(home, path.slice(1))
  }
  return path
}

function parseKinds(csv: string): PlaceKind[] {
  const requested = csv
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)

  if (requested.length === 0) {
    throw new LoaderArgsError('--kinds needs at least one kind')
  }

  const unknown = requested.filter((kind) => !(kind in KIND_RANK))
  if (unknown.length > 0) {
    throw new LoaderArgsError(
      `Unknown kind(s): ${unknown.join(', ')}. Expected any of ${ALL_KINDS.join(', ')}.`
    )
  }

  // Deduplicate and restore canonical order so the ingestion sequence — and the
  // report — does not depend on how the operator typed the flag.
  return ALL_KINDS.filter((kind) => requested.includes(kind))
}

/** Resolves a kind to its file, or null when the dataset does not carry it. */
function resolveFile(dir: string, kind: PlaceKind): string | null {
  for (const candidate of FILE_CANDIDATES[kind]) {
    const path = join(dir, candidate)
    if (existsSync(path)) return path
  }
  return null
}

/**
 * Yields one line at a time from an NDJSON file.
 *
 * This is the whole reason the loader can handle a 91 MB file in a container
 * with a modest memory limit: at no point is more than one line resident.
 * `crlfDelay: Infinity` keeps CRLF-terminated exports from leaving a stray `\r`
 * on the end of every line — which would make `JSON.parse` throw on all of them.
 */
async function* readNdjsonLines(path: string): AsyncGenerator<string> {
  const rl = createInterface({
    input: createReadStream(path, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  })

  try {
    for await (const line of rl) {
      const trimmed = line.trim()
      if (trimmed) yield trimmed
    }
  } finally {
    // Releases the underlying file descriptor even when the consumer throws or
    // breaks out early.
    rl.close()
  }
}

/**
 * A mapped `place` row, ready for `createMany`.
 *
 * Field names are the Prisma model's, not the NDJSON's — by the time a row has
 * this shape the source's `[longitude, latitude]` pair has already been split
 * into named `latitude` / `longitude`, so nothing downstream has to remember the
 * source ordering.
 */
export interface PlaceRow {
  osmType: string
  osmId: bigint
  name: string
  nameNorm: string
  kind: PlaceKind
  kindRank: number
  state: string
  district: string
  county: string | null
  postcode: string | null
  latitude: number
  longitude: number
}

/** Named skip reasons are exactly the counter's keys, so a reason can index it. */
export type SkipReason = keyof SkipCounts

/**
 * Rows per `createMany`. Requirement 2.5 fixes this at 5,000 — large enough that
 * the village file's 171,406 usable rows are 35 round trips rather than 171,406
 * (measured: the whole 190,054-row file streams and loads in 17 s), and small
 * enough that one batch stays inside Postgres' 65,535 bind-parameter ceiling:
 * `createMany` sends a single multi-row INSERT, so 12 columns × 5,000 = 60,000
 * parameters. That leaves little headroom — adding columns to `PlaceRow` matters
 * here, and 5,000 is near the practical maximum rather than an arbitrary round
 * number.
 */
const BATCH_SIZE = 5_000

/**
 * The loader's two raw statements, and the only raw SQL in the repository
 * outside `prisma/migrations/`.
 *
 * `.kiro/skills/database-prisma.md` says "always use Prisma Client for DB access
 * (no raw SQL)", and Requirement 3.10 confines raw SQL to the migration. That
 * rule is about *queries* — anything that reads or writes rows, where raw SQL
 * costs type safety and invites interpolated input. Neither of these is a query:
 *
 *   TRUNCATE — DDL-level bulk delete. `deleteMany({})` is the Prisma equivalent
 *     in intent only: it fetches and deletes row by row and leaves 272,499 dead
 *     tuples for autovacuum, where the intent is simply "empty the table".
 *     Prisma exposes no truncate API.
 *   ANALYZE — maintenance DDL. It touches no rows and returns nothing. Prisma
 *     exposes no equivalent either, and there is nothing for a query builder to
 *     build.
 *
 * Both are frozen string constants with **no interpolation of any kind** — no
 * parameters, no operator input, nothing derived from `argv` or the dataset — so
 * the injection surface that the no-raw-SQL rule exists to close is empty here.
 * The table name is the literal `"place"` from `@@map("place")`. If either
 * statement ever needs a variable, it needs a different design, not a template
 * literal.
 */
const TRUNCATE_PLACE_SQL = 'TRUNCATE TABLE "place"'
const ANALYZE_PLACE_SQL = 'ANALYZE "place"'

/**
 * Skip reasons in report order: the five named in Requirement 2.3 in the order
 * `mapPlaceRow` checks them, then the two structural ones. Keeping this aligned
 * with the check order is what makes the printed breakdown comparable to the
 * survey figures — a row is attributed to the first reason that fires.
 */
const SKIP_COLUMNS: SkipReason[] = [
  'noName',
  'junkName',
  'noState',
  'noDistrict',
  'badLocation',
  'noIdentity',
  'parseError',
]

function totalSkipped(skipped: SkipCounts): number {
  return Object.values(skipped).reduce((sum, count) => sum + count, 0)
}

/**
 * Writes one batch and empties the buffer, returning how many rows were actually
 * inserted.
 *
 * `skipDuplicates: true` is what makes a re-run a no-op rather than a unique
 * constraint violation on `@@unique([osmType, osmId])`, and it is why the return
 * value is used instead of `batch.length`: on a second run over the same dataset
 * every row maps successfully and is *not* skipped by any filter, yet `count` is
 * 0. Reporting `batch.length` there would claim 272,499 fresh inserts into a
 * table whose row count did not move.
 *
 * The buffer is truncated in place (`length = 0`) rather than reassigned so the
 * caller keeps one array for the whole file — that array is the only reason peak
 * memory is a batch rather than a file.
 */
async function flushBatch(batch: PlaceRow[]): Promise<number> {
  if (batch.length === 0) return 0
  const { count } = await prisma.place.createMany({
    data: batch,
    skipDuplicates: true,
  })
  batch.length = 0
  return count
}

/** Either a row to load, or the single reason it was rejected. */
export type MapOutcome =
  | { ok: true; row: PlaceRow }
  | { ok: false; reason: SkipReason }

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/** A trimmed non-empty string, or undefined — anything else is treated as absent. */
function readString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/**
 * Splits the source's `location` array into named coordinates, or null when it
 * is not a usable pair.
 *
 * **`location` is `[longitude, latitude]` — longitude FIRST.** This is the one
 * mistake in this feature that no downstream check could catch: for Indian
 * coordinates (lat 8-37, lon 68-97) a swap leaves both values inside the legal
 * ranges, so the ephemeris happily computes a chart with a different lagna,
 * different house cusps and different special lagnas, hundreds of kilometres
 * from the birth place. Hence the indexed reads below, the range assertions, and
 * the Bengaluru fixture test that pins `(12.9767936, 77.590082)`.
 *
 * The range assertions are a guard against a malformed row, not against a
 * pre-swapped file: an Indian pair survives swapping precisely because 68-97
 * is a legal latitude on paper. Only the fixture test rules that out.
 */
function readCoordinates(
  value: unknown
): { latitude: number; longitude: number } | null {
  if (!Array.isArray(value) || value.length !== 2) return null

  const longitude = value[0] // index 0 — LONGITUDE
  const latitude = value[1] // index 1 — LATITUDE

  if (!isFiniteNumber(latitude) || !isFiniteNumber(longitude)) return null
  if (latitude < -90 || latitude > 90) return null
  if (longitude < -180 || longitude > 180) return null

  return { latitude, longitude }
}

/**
 * The OSM id as a BigInt. Ids reach 12,997,584,050 in the surveyed data — past
 * `Int4`, hence `BigInt` in the schema, but still a safe JS integer, so the
 * value `JSON.parse` produced is exact and can be widened without loss.
 */
function readOsmId(value: unknown): bigint | null {
  if (typeof value === 'bigint') return value
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) ? BigInt(value) : null
  }
  const text = readString(value)
  return text && /^\d+$/.test(text) ? BigInt(text) : null
}

/**
 * Maps one parsed NDJSON row to a `place` row, or attributes it to a single
 * named skip reason.
 *
 * Pure and total: it never throws and never touches the database, so the skip
 * predicates are testable without a fixture file or a connection.
 *
 * Check order is load-bearing for the reported breakdown — a row missing both a
 * name and a district is counted once, under `noName` — and matches the order in
 * which the dataset survey produced the figures the loader is verified against
 * (`noName` 75,435 · `noDistrict` 899 · `junkName` 11 · `noState` 1 ·
 * `badLocation` 0).
 */
export function mapPlaceRow(
  fileKind: PlaceKind,
  row: Record<string, unknown>
): MapOutcome {
  // The source is arbitrary JSON, so the address is reduced to trimmed strings
  // once here; non-string values are dropped rather than coerced, and every
  // field below reads from this view instead of from `row.address` directly.
  const address: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(asRecord(row.address) ?? {})) {
    address[key] = readString(value)
  }

  const name = resolvePlaceName({ name: readString(row.name), address })
  // 21.6% of the source rows — unnamed OSM place nodes carrying only their
  // administrative parents. Nothing to recover, so this is the largest skip
  // category by far, not a loader defect.
  if (!name) return { ok: false, reason: 'noName' }

  // Deliberately the shared predicate rather than a local `nameNorm === ''`:
  // ingestion and search must not be able to disagree about what is empty.
  if (isJunkPlaceName(name)) return { ok: false, reason: 'junkName' }

  const state = address.state
  if (!state) return { ok: false, reason: 'noState' }

  // `state_district` covers 99.5% of rows; the rest fall back to `county` (the
  // tehsil). That fallback is why `district` can be non-nullable in the schema —
  // a row with neither is skipped rather than stored with a hole.
  const district = address.state_district ?? address.county
  if (!district) return { ok: false, reason: 'noDistrict' }

  const coordinates = readCoordinates(row.location)
  if (!coordinates) return { ok: false, reason: 'badLocation' }

  const osmType = readString(row.osm_type)
  const osmId = readOsmId(row.osm_id)
  if (!osmType || osmId === null) return { ok: false, reason: 'noIdentity' }

  // Kind normally comes from the file being read. The row's own `type` wins when
  // it names a *settlement* class, because that is OSM's own classification and
  // it drives search ranking. Most disagreements are not settlement classes at
  // all — measured on the shipped dataset, the 50 rows whose `type` differs from
  // their file are things like `administrative`, `bus_stop` and `jeweller`, none
  // of which `toPlaceKind` accepts — so they keep the file's kind and the
  // per-kind totals (545 / 4,148 / 171,406 / 96,400) are unaffected. Note this
  // is not a skip: those 50 rows are real named settlements and are included in
  // the verified 272,499.
  const kind = toPlaceKind(row.type) ?? fileKind

  return {
    ok: true,
    row: {
      osmType,
      osmId,
      name,
      nameNorm: normalizePlaceName(name),
      kind,
      kindRank: KIND_RANK[kind],
      state,
      district,
      county: address.county ?? null,
      postcode: address.postcode ?? null,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
    },
  }
}

/**
 * Streams one file, attributing every row to loaded or a named skip reason.
 *
 * Exported for tests/places-loader.test.ts, which runs it twice over the same
 * small fixture against a mocked `prisma`. Idempotence is a property of the
 * streaming path — `flushBatch` + `skipDuplicates` — not of `mapPlaceRow`, so it
 * cannot be verified through the pure helpers alone. `parseError` is likewise
 * only reachable here.
 */
export async function loadFile(kind: PlaceKind, path: string): Promise<FileStats> {
  const stats: FileStats = {
    kind,
    file: path,
    read: 0,
    loaded: 0,
    skipped: newSkipCounts(),
  }

  const sizeMb = (statSync(path).size / 1_048_576).toFixed(1)
  console.log(`\n${kind.padEnd(7)} ${path} (${sizeMb} MB)`)

  // The single buffer for the whole file. It is flushed — and truncated in place
  // — the moment it reaches BATCH_SIZE, so it never holds more than 5,000 rows
  // no matter how large the file is. Together with the line-at-a-time reader
  // this is what keeps a 91 MB / 190,054-row file flat in memory.
  const batch: PlaceRow[] = []

  for await (const line of readNdjsonLines(path)) {
    stats.read++

    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      // One malformed line never aborts a 190,000-row file.
      stats.skipped.parseError++
      continue
    }

    const row = asRecord(parsed)
    if (!row) {
      // Valid JSON, but a scalar or an array — not a place.
      stats.skipped.parseError++
      continue
    }

    const outcome = mapPlaceRow(kind, row)
    if (!outcome.ok) {
      stats.skipped[outcome.reason]++
      continue
    }

    batch.push(outcome.row)

    if (batch.length >= BATCH_SIZE) {
      // Awaiting inside the `for await` suspends the read stream until the write
      // completes. That backpressure is deliberate: without it the reader would
      // race ahead of Postgres and the queued batches, not the buffer, would
      // become the memory ceiling.
      stats.loaded += await flushBatch(batch)
    }
  }

  // The tail — the final partial batch, and on a `--kinds` subset possibly the
  // only one.
  stats.loaded += await flushBatch(batch)

  console.log(
    `  read ${stats.read.toLocaleString()}` +
      `  loaded ${stats.loaded.toLocaleString()}` +
      `  skipped ${totalSkipped(stats.skipped).toLocaleString()}`
  )
  return stats
}

/**
 * Prints the per-file `read / loaded / skipped{…}` table required by
 * Requirement 2.3, plus a totals row to compare against the design's expected
 * results (348,845 read → 272,499 loaded).
 *
 * `dupe` is derived, not counted: `read - loaded - skipped` is exactly the rows
 * `createMany` dropped on the unique key. It is printed because otherwise the
 * table silently fails to add up on a re-run — every row maps, nothing is
 * skipped, and `loaded` is 0 — and an operator would reasonably read that as a
 * loader bug rather than as idempotence working.
 */
function printSummary(results: FileStats[]): void {
  const columns = ['kind', 'read', 'loaded', 'skipped', 'dupe', ...SKIP_COLUMNS]

  const toRow = (
    label: string,
    read: number,
    loaded: number,
    skipped: SkipCounts
  ): string[] => {
    const skippedTotal = totalSkipped(skipped)
    return [
      label,
      read.toLocaleString(),
      loaded.toLocaleString(),
      skippedTotal.toLocaleString(),
      Math.max(0, read - loaded - skippedTotal).toLocaleString(),
      ...SKIP_COLUMNS.map((reason) => skipped[reason].toLocaleString()),
    ]
  }

  const rows = results.map((stats) =>
    toRow(stats.kind, stats.read, stats.loaded, stats.skipped)
  )

  const totals = results.reduce(
    (acc, stats) => {
      acc.read += stats.read
      acc.loaded += stats.loaded
      for (const reason of SKIP_COLUMNS) {
        acc.skipped[reason] += stats.skipped[reason]
      }
      return acc
    },
    { read: 0, loaded: 0, skipped: newSkipCounts() }
  )

  const body = [
    columns,
    ...rows,
    toRow('TOTAL', totals.read, totals.loaded, totals.skipped),
  ]

  // Width per column across header and every row, so the table stays aligned
  // whether the counts are 27 or 171,406.
  const widths = columns.map((_, index) =>
    Math.max(...body.map((cells) => cells[index].length))
  )

  // Label left-aligned, every count right-aligned — digits line up by place value.
  const render = (cells: string[]): string =>
    cells
      .map((cell, index) =>
        index === 0 ? cell.padEnd(widths[index]) : cell.padStart(widths[index])
      )
      .join('  ')

  console.log('')
  console.log(render(body[0]))
  console.log(widths.map((width) => '-'.repeat(width)).join('  '))
  for (const cells of body.slice(1, -1)) console.log(render(cells))
  console.log(render(body[body.length - 1]))
}

/**
 * Empties the `place` table, returning how many rows were removed.
 *
 * `TRUNCATE`, not `deleteMany({})`. On the 272,499-row table this flag exists to
 * correct, `deleteMany` is a row-at-a-time `DELETE` that has to walk every row,
 * fire triggers, and leave one dead tuple per row behind for autovacuum — and
 * the very next thing the operator does is insert 272,499 fresh rows into that
 * bloated heap. `TRUNCATE` reclaims the storage immediately.
 *
 * `place` has no inbound foreign keys — verified in `prisma/schema.prisma`: no
 * model declares a `Place` relation field, and no migration emits a
 * `REFERENCES "place"`. A chart's link to a place is a plain JSON object inside
 * `UnifiedChart.birthInput.place`, not a constraint. So nothing cascades and no
 * `CASCADE` clause is needed; if a real relation is ever added, this statement
 * will start failing loudly on the constraint, which is the correct outcome
 * rather than a silent cascade through user data.
 *
 * The count is read BEFORE truncating because `TRUNCATE` reports nothing back —
 * the operator-facing "removed N row(s)" line is the same as it was under
 * `deleteMany`, and is worth one cheap `COUNT(*)` on a flag that is used rarely
 * and deliberately.
 */
export async function truncatePlaceTable(): Promise<number> {
  const removed = await prisma.place.count()
  await prisma.$executeRawUnsafe(TRUNCATE_PLACE_SQL)
  return removed
}

/**
 * Refreshes the planner statistics for `place` after a bulk load.
 *
 * `createMany` inserts do not update `pg_statistic`, so straight after a load
 * Postgres still believes the table has whatever shape it had before — for a
 * fresh table, that it is empty. Until autovacuum's analyze worker catches up
 * (minutes to hours, depending on `autovacuum_naptime` and the insert
 * threshold), the planner is costing queries against statistics that describe a
 * different table.
 *
 * That matters more here than it usually would, because the whole ranked-search
 * design rests on the planner *choosing* the `text_pattern_ops` btree for the
 * prefix stage. The measurements in the design (§The two name indexes) already
 * show the planner declining a usable index and sequential-scanning in 19 ms
 * where the index scan takes 0.35 ms — with stale statistics on top of that, the
 * first searches after a load are exactly the case where it goes wrong. One
 * `ANALYZE` at the end of the load removes the window.
 *
 * Deliberately not `VACUUM ANALYZE`: a freshly loaded table has no dead tuples
 * to reclaim, and `VACUUM` cannot run inside a transaction block.
 */
export async function analyzePlaceTable(): Promise<void> {
  await prisma.$executeRawUnsafe(ANALYZE_PLACE_SQL)
}

async function main(): Promise<void> {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(USAGE)
    return
  }

  let args: LoaderArgs
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (err) {
    if (!(err instanceof LoaderArgsError)) throw err
    console.error(`${err.message}\n\n${USAGE}`)
    process.exitCode = 1
    return
  }

  if (!existsSync(args.dir) || !statSync(args.dir).isDirectory()) {
    console.error(`Not a directory: ${args.dir}`)
    process.exitCode = 1
    return
  }

  console.log(`Dataset : ${args.dir}`)
  console.log(`Kinds   : ${args.kinds.join(', ')}`)

  const files: { kind: PlaceKind; path: string }[] = []
  const missing: PlaceKind[] = []
  for (const kind of args.kinds) {
    const path = resolveFile(args.dir, kind)
    if (path) files.push({ kind, path })
    else missing.push(kind)
  }

  if (missing.length > 0) {
    console.error(`\nMissing NDJSON file(s) in ${args.dir} for: ${missing.join(', ')}`)
    process.exitCode = 1
    return
  }

  if (args.truncate) {
    const removed = await truncatePlaceTable()
    console.log(`Truncate: removed ${removed.toLocaleString()} existing place row(s)`)
  }

  const results: FileStats[] = []
  for (const { kind, path } of files) {
    results.push(await loadFile(kind, path))
  }

  printSummary(results)

  const total = await prisma.place.count()
  console.log(`\nplace table now holds ${total.toLocaleString()} row(s).`)

  // Only after every file loaded without throwing: a run that died halfway
  // leaves the operator re-running the loader anyway, and the ANALYZE at the end
  // of that run is the one that counts.
  await analyzePlaceTable()
  console.log(
    'Analyze : refreshed planner statistics on "place" — ' +
      'the prefix index is usable immediately, without waiting for autovacuum.'
  )
}

/**
 * Run the CLI only when this file IS the entry point.
 *
 * `mapPlaceRow`, `parseArgs` and `loadFile` are imported by
 * tests/places-loader.test.ts; without this guard, importing them would kick off
 * a 348,845-row dataset load (and a Prisma connect) as an import side effect.
 * The argv check is used rather than `require.main === module` because Vitest
 * loads this file as ESM, where `require` does not exist.
 */
if ((process.argv[1] ?? '').includes('load-places')) {
  main()
    .catch((err) => {
      console.error('Place ingestion failed:', err)
      process.exitCode = 1
    })
    .finally(() => prisma.$disconnect())
}
