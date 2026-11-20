/**
 * tests/place-schema-indexes.test.ts
 * ----------------------------------
 * Validates: Requirement 1.3 and 1.6 of the place-location-picker spec.
 *
 * A static guard over `prisma/schema.prisma` and the `place` migration, because
 * the three things they encode are all things a routine `prisma migrate dev`
 * will quietly try to undo:
 *
 * 1. **The `text_pattern_ops` btree does not round-trip through Prisma.** Every
 *    future `migrate dev` regenerates a `DROP INDEX` / `CREATE INDEX` pair for
 *    `place_nameNorm_prefix_idx` that the migration's author must delete by
 *    hand. Nothing in the toolchain tells them that — this file does.
 * 2. **Removing the `@@index` declarations is worse than the churn.** Left out of
 *    the schema, Prisma stops seeing them as churn and starts seeing them as
 *    indexes to DROP. Search would then silently fall back to sequential scans:
 *    still correct, ~50x slower, no error anywhere.
 * 3. **`gin_trgm_ops` does not exist without `pg_trgm`.** The `CREATE EXTENSION`
 *    line was added by hand under `--create-only`; Prisma cannot generate it, so
 *    a regenerated migration will not carry it, and the GIN index creation fails
 *    outright on a fresh database.
 *
 * Deliberately no database connection: pure `readFileSync` over two files, so it
 * runs in the suite's existing `environment: 'node'` setup with no Postgres, no
 * `pg_trgm`, and no migration applied. What it can therefore prove is that the
 * committed source still *says* the right thing — not that a live database
 * matches it. Those are different guarantees, and this is the cheap one.
 *
 * See .kiro/specs/place-location-picker/design.md §Data Model → "The two name
 * indexes".
 */

import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const REPO_ROOT = join(__dirname, '..')
const SCHEMA_PATH = 'prisma/schema.prisma'
const MIGRATION_DIR = 'prisma/migrations/20260827061403_add_place_table'
const MIGRATION_PATH = `${MIGRATION_DIR}/migration.sql`

const schema = readFileSync(join(REPO_ROOT, SCHEMA_PATH), 'utf8')
const migration = readFileSync(join(REPO_ROOT, MIGRATION_PATH), 'utf8')

/** The `model Place { … }` block, so a match cannot come from another model. */
const placeModel = (() => {
  const block = /^model Place \{$([\s\S]*?)^\}$/m.exec(schema)
  if (!block) {
    throw new Error(
      `Could not find \`model Place\` in ${SCHEMA_PATH}.\n` +
        'The place table backs GET /api/places and the birth-place picker. If the ' +
        'model was renamed, update this guard along with it; if it was deleted, the ' +
        'picker no longer has data and scripts/load-places.ts has nowhere to load.'
    )
  }
  return block[1]
})()

/**
 * Asserts a fragment is present, and explains what breaks if it is not.
 *
 * A bare `.toContain()` failure here would print a 90-line schema block and
 * leave the author to work out why one operator class matters. The whole point
 * of this file is the explanation, so the message carries it.
 */
function expectPresent(
  subject: string,
  fragment: string | RegExp,
  consequence: string
): void {
  const found =
    typeof fragment === 'string' ? subject.includes(fragment) : fragment.test(subject)

  if (found) return

  throw new Error(
    `Missing from the committed source:\n  ${String(fragment)}\n\n${consequence}`
  )
}

describe(`${SCHEMA_PATH} — Place index declarations`, () => {
  it('declares the text_pattern_ops prefix btree with its explicit map name', () => {
    expectPresent(
      placeModel,
      '@@index([nameNorm(ops: raw("text_pattern_ops"))], map: "place_nameNorm_prefix_idx")',
      'This is the index the prefix stage of GET /api/places runs on — someone typing\n' +
        '"aland" to reach "Alandi", which is the common path. It is NOT redundant with the\n' +
        'trigram GIN index below: the database collation is en_US.utf8, under which a\n' +
        'DEFAULT btree cannot serve LIKE \'q%\' at all, and the planner measurably declines\n' +
        'to use the GIN index for prefix queries (19 ms seq scan vs 0.35 ms index scan on\n' +
        '40k rows).\n\n' +
        'If you deleted this because `prisma migrate dev` keeps regenerating a\n' +
        'DROP/CREATE pair for it: that churn is expected and documented in the schema\n' +
        'comment. Prisma does not round-trip the `text_pattern_ops` operator class. The fix\n' +
        'is to delete those two statements from the GENERATED MIGRATION, not to remove the\n' +
        'declaration — without the declaration Prisma will diff the live index as one to\n' +
        'DROP, and search silently degrades to sequential scans over 272,499 rows.'
    )
  })

  it('declares the gin_trgm_ops trigram GIN index with its explicit map name', () => {
    expectPresent(
      placeModel,
      '@@index([nameNorm(ops: raw("gin_trgm_ops"))], type: Gin, map: "place_nameNorm_trgm_idx")',
      'This is the index the substring stage of GET /api/places runs on (LIKE \'%q%\'),\n' +
        'which no btree can serve at any collation. Removing it does not break search —\n' +
        'it turns every substring query into a sequential scan over 272,499 rows.\n\n' +
        'It also explains the 3-character minimum in the search route: a trigram is three\n' +
        'characters, so a shorter pattern cannot use this index. If this index goes, that\n' +
        'threshold loses its justification too.'
    )
  })

  it('gives both name indexes explicit map names, since Prisma would collide on the default', () => {
    // Two indexes on one column would both be auto-named `place_nameNorm_idx`,
    // which fails `prisma validate`. The explicit names are also the contract
    // this file checks against the migration below.
    const nameNormIndexes = placeModel.match(/@@index\(\[nameNorm[^\n]*\)/g) ?? []

    expect(
      nameNormIndexes.length,
      'Expected exactly two @@index declarations on nameNorm (prefix btree + trigram GIN).'
    ).toBe(2)

    for (const declaration of nameNormIndexes) {
      expectPresent(
        declaration,
        /map: "place_nameNorm_(prefix|trgm)_idx"/,
        `The declaration\n  ${declaration}\ncarries no explicit map: name. Both indexes\n` +
          'cover the same column, so Prisma auto-names both `place_nameNorm_idx` and\n' +
          'validation fails. The explicit names are also what the migration creates and\n' +
          'what this guard matches them against.'
      )
    }
  })

  it('keeps the (osmType, osmId) natural key that makes re-ingestion idempotent', () => {
    expectPresent(
      placeModel,
      '@@unique([osmType, osmId])',
      'scripts/load-places.ts is idempotent solely because of this key plus\n' +
        '`createMany({ skipDuplicates: true })`. Without it, re-running the loader over\n' +
        'the same dataset inserts a second copy of all 272,499 rows — and GET /api/places\n' +
        'starts returning every settlement twice.'
    )
  })

  it('still maps the model to the "place" table the loader and migration name literally', () => {
    // scripts/load-places.ts hard-codes `"place"` in its TRUNCATE and ANALYZE
    // statements; those are the only raw SQL outside the migrations, and an
    // @@map change would silently break them at runtime rather than at compile
    // time.
    expectPresent(
      placeModel,
      '@@map("place")',
      'The table name is hard-coded as "place" in scripts/load-places.ts (TRUNCATE /\n' +
        'ANALYZE) and in every index name in the migration. Renaming the table means\n' +
        'updating those too.'
    )
  })
})

describe(`${MIGRATION_PATH} — applied DDL`, () => {
  const extensionAt = migration.search(/CREATE EXTENSION IF NOT EXISTS pg_trgm/i)
  const prefixIndexAt = migration.indexOf('CREATE INDEX "place_nameNorm_prefix_idx"')
  const trgmIndexAt = migration.indexOf('CREATE INDEX "place_nameNorm_trgm_idx"')

  it('enables pg_trgm — the extension gin_trgm_ops comes from', () => {
    expectPresent(
      migration,
      /CREATE EXTENSION IF NOT EXISTS pg_trgm/i,
      'gin_trgm_ops is supplied by the pg_trgm extension and does not exist without it,\n' +
        'so the GIN index below cannot be created on a database where this line is\n' +
        'missing — `prisma migrate deploy` fails outright on a fresh environment.\n\n' +
        'Prisma CANNOT generate this line. It was added by hand after running\n' +
        '`prisma migrate dev --create-only`. If you regenerated this migration and the\n' +
        'line disappeared, that is why — put it back, ahead of the CREATE INDEX\n' +
        'statements.'
    )
  })

  it('creates the prefix index as a btree with the text_pattern_ops operator class', () => {
    expectPresent(
      migration,
      'CREATE INDEX "place_nameNorm_prefix_idx" ON "place"("nameNorm" text_pattern_ops);',
      'Without the `text_pattern_ops` operator class this index is useless for search:\n' +
        'under the en_US.utf8 collation a default btree cannot serve LIKE \'q%\'. Note it\n' +
        'is a plain btree — no USING GIN — because the point is the range-scan rewrite\n' +
        '("nameNorm" >= \'q\' AND "nameNorm" < \'r\').'
    )
  })

  it('creates the trigram index as GIN with the gin_trgm_ops operator class', () => {
    expectPresent(
      migration,
      'CREATE INDEX "place_nameNorm_trgm_idx" ON "place" USING GIN ("nameNorm" gin_trgm_ops);',
      'The substring stage of GET /api/places (LIKE \'%q%\') has no other index to use.\n' +
        'Both the `USING GIN` and the `gin_trgm_ops` class are load-bearing: a btree\n' +
        'cannot answer a leading-wildcard pattern at any collation.'
    )
  })

  it('creates pg_trgm BEFORE the indexes that depend on it', () => {
    expect(extensionAt).toBeGreaterThan(-1)
    expect(trgmIndexAt).toBeGreaterThan(-1)

    // Ordering, not just presence: `CREATE INDEX ... gin_trgm_ops` fails with
    // "operator class does not exist" if the extension statement follows it, and
    // a migration that fails halfway leaves the table without its indexes.
    expect(
      extensionAt,
      'CREATE EXTENSION IF NOT EXISTS pg_trgm must come before both CREATE INDEX ' +
        'statements — gin_trgm_ops does not exist until the extension does.'
    ).toBeLessThan(trgmIndexAt)
    expect(extensionAt).toBeLessThan(prefixIndexAt)
  })

  it('creates the unique (osmType, osmId) key the loader relies on', () => {
    expectPresent(
      migration,
      'CREATE UNIQUE INDEX "place_osmType_osmId_key" ON "place"("osmType", "osmId");',
      'This is the constraint `createMany({ skipDuplicates: true })` skips against. If it\n' +
        'is not UNIQUE, skipDuplicates has nothing to detect and a second loader run\n' +
        'doubles the table instead of being a no-op.'
    )
  })

  it('creates the supporting btree indexes on state, district and kindRank', () => {
    for (const column of ['state', 'district', 'kindRank']) {
      expectPresent(
        migration,
        `CREATE INDEX "place_${column}_idx" ON "place"("${column}");`,
        `The multi-token narrowing in GET /api/places filters on state / district /\n` +
          `county, and orders by kindRank. Dropping the index on "${column}" makes those\n` +
          'queries scan.'
      )
    }
  })
})

describe('the schema and the applied migration name the same indexes', () => {
  it('every @@index map: name in the Place model is actually created by the migration', () => {
    // The failure mode this catches is a rename in one file only: the schema
    // then diffs clean against nothing, and Prisma generates a DROP of the real
    // index plus a CREATE of a differently-named one — without the operator
    // class, because that is the part Prisma cannot round-trip.
    const declaredNames = [...placeModel.matchAll(/map: "([^"]+)"/g)].map(
      (match) => match[1]
    )

    expect(declaredNames.sort()).toEqual([
      'place_nameNorm_prefix_idx',
      'place_nameNorm_trgm_idx',
    ])

    for (const name of declaredNames) {
      expectPresent(
        migration,
        `"${name}"`,
        `${SCHEMA_PATH} declares an index named ${name}, but ${MIGRATION_PATH} never\n` +
          'creates it. One of the two was renamed without the other. Prisma will diff the\n' +
          'difference as a DROP of the live index plus a CREATE of a new one — and the new\n' +
          'one will not carry its operator class.'
      )
    }
  })

  it('no later migration drops either name index', () => {
    // The documented hand-edit: delete the regenerated DROP/CREATE pair before
    // committing. This is what enforces it. Re-running the pair is a harmless
    // no-op in effect but rebuilds a 273k-row index on every deploy, and a
    // half-edited pair (DROP kept, CREATE dropped) removes the index for good.
    const migrationsRoot = join(REPO_ROOT, 'prisma/migrations')
    const offenders: string[] = []

    for (const entry of readdirSync(migrationsRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const sql = readFileSync(join(migrationsRoot, entry.name, 'migration.sql'), 'utf8')
      if (/DROP INDEX[^;]*place_nameNorm_(?:prefix|trgm)_idx/i.test(sql)) {
        offenders.push(entry.name)
      }
    }

    if (offenders.length > 0) {
      throw new Error(
        `These migrations DROP a place nameNorm index: ${offenders.join(', ')}.\n\n` +
          'Prisma regenerates a DROP/CREATE pair for `place_nameNorm_prefix_idx` on every\n' +
          '`migrate dev`, because it does not round-trip the `text_pattern_ops` operator\n' +
          'class. Those two statements are meant to be DELETED from the generated\n' +
          'migration before committing — the index they recreate is byte-identical to the\n' +
          'one already applied, so the pair only rebuilds a 272,499-row index.\n\n' +
          'If you genuinely intend to drop an index, remove its @@index declaration from\n' +
          `${SCHEMA_PATH} and update this guard in the same change, so the reason is\n` +
          'recorded somewhere.'
      )
    }
  })
})
