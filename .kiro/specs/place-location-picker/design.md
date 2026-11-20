# Design Document: Place Location Picker

## Overview

Three new pieces of code and one changed input surface:

```
~/Documents/Mohit/in/*.ndjson  (160 MB, outside the repo)
        │
        │  one-off, idempotent
        ▼
scripts/load-places.ts ──────────► place table (272,499 rows, Postgres)
                                        │
                                        │  Prisma, 6-tier ranked query
                                        ▼
                          GET /api/places?q=&limit=&includeHamlets=
                                        │
                                        │  debounced 250 ms, AbortController
                                        ▼
                          app/components/PlacePicker.tsx
                                        │
                                        │  onSelect → { latitude, longitude, timezone, placeId, placeLabel }
                                        ▼
              app/page.tsx  ·  app/unified-charts/page.tsx (ComputeForm)
                                        │
                                        ▼
                       POST /api/compute   (unchanged contract)
                       POST /api/unified-charts/from-compute  (+ optional `place`)
                                        │
                                        ▼
                       UnifiedChart.birthInput.place   (NOT in chartHash)
```

The compute contract is untouched. The picker is an **input-resolution layer** that turns
a place name into the coordinates the engine already consumes. That keeps the change
additive: every existing chart, the MCP path, and the paste path are unaffected.

## Guiding Constraints

1. **Coordinates stay visible and stay editable.** This is a chart application; a wrong
   coordinate silently changes the lagna. The picker fills the numbers, it does not hide
   them, and manual entry remains a first-class path (India-only dataset, 273k rows ≠ all
   settlements).
2. **`chartHash` is frozen.** Adding place metadata must not change the dedupe key, or
   every one of the existing rows would need a recompute backfill and renaming a chart
   would change its identity. Place is display metadata inside `birthInput`, excluded from
   the hash.
3. **`engine/` does not learn about places.** Per
   `.kiro/skills/nextjs-project-structure.md`, `engine/` must not depend on `app/`
   concerns. `BirthInput` is an engine type, so `place` is threaded as a mapper argument
   instead of being bolted onto it.
4. **Prisma only for queries; raw SQL only in migrations.** Per
   `.kiro/skills/database-prisma.md`. Ranking is therefore designed around a persisted
   `kindRank` column and one query per relevance tier rather than a hand-written
   `ORDER BY CASE`.

## Data Model

```prisma
/// Indian settlements derived from OpenStreetMap (Nominatim export).
/// Shared reference data: deliberately NOT owned by a User and NOT part of
/// the UnifiedChart delete cascade. Loaded by scripts/load-places.ts.
model Place {
  id          String   @id @default(uuid())

  // Stable natural key — makes re-ingestion idempotent via skipDuplicates.
  osmType     String   // "node" | "way" | "relation"
  osmId       BigInt

  name        String
  /// Lowercased, diacritics stripped, whitespace collapsed by
  /// lib/places-normalize.ts. Pre-normalized so that case-insensitive
  /// matching needs no ILIKE and so that diacritics fold — a trigram index
  /// alone would not fold them.
  nameNorm    String

  kind        String   // "city" | "town" | "village" | "hamlet"
  /// Persisted relevance rank (city=1, town=2, village=3, hamlet=4) so
  /// ordering is a plain Prisma orderBy instead of raw SQL.
  kindRank    Int

  state       String   // address.state          — 100.0% coverage
  district    String   // address.state_district —  99.5% coverage
  county      String?  // address.county (tehsil/taluka/mandal) — 97.5%
  postcode    String?

  latitude    Decimal  @db.Decimal(9, 7)
  longitude   Decimal  @db.Decimal(10, 7)

  countryCode String   @default("in")
  createdAt   DateTime @default(now()) @db.Timestamptz

  @@unique([osmType, osmId])
  @@index([nameNorm(ops: raw("gin_trgm_ops"))], type: Gin)
  @@index([state])
  @@index([district])
  @@index([kindRank])
  @@map("place")
}
```

`district` is non-nullable while coverage is 99.5%: the 1,770 rows without
`address.state_district` fall back to `address.county`, and are skipped only if both are
absent. `county` stays nullable because the picker's secondary line has a defined degraded
form for it (Requirement 4.3).

`osmId` is `BigInt` — the surveyed ids reach 10,139,722,692, past `Int4`.

### The two name indexes

Verified against the target database: **PostgreSQL 16.14, collation `en_US.utf8`,
`pg_trgm` 1.6.** The non-C collation is the starting point: under `en_US.utf8` a *default*
btree cannot serve `LIKE 'query%'` at all, so a bare `@@index([nameNorm])` would be
useless for search.

Each access pattern therefore gets its own index. The exact and prefix stages both reduce
to `LIKE 'q%'` (an equality is its degenerate case), so the two of them share the btree:

| Index | `= 'q'` / `LIKE 'q%'` (exact + prefix stages) | `LIKE '%q%'` (substring stage) |
|---|---|---|
| btree `text_pattern_ops` | **yes** — rewritten as a range scan | no |
| GIN `gin_trgm_ops` | possible, but not chosen | **yes** |

A trigram GIN index *can* answer a prefix query — it extracts trigrams from the pattern —
but **the planner does not choose it.** Measured on 40,000 synthetic rows:

| Query | Plan | Time |
|---|---|---|
| prefix matching 1 row, GIN only | Seq Scan | 19.0 ms |
| prefix matching 1 row, GIN only, `enable_seqscan=off` | Bitmap Index Scan | — (proves capability) |
| prefix matching 1 row, with `text_pattern_ops` btree | Index Scan | **0.35 ms** |
| common prefix + `LIMIT 20`, GIN only | Seq Scan | 6.9 ms |
| common prefix + `LIMIT 20`, with btree | Index Scan | **0.24 ms** |

pg_trgm's cost estimates for `LIKE` are poor enough that Postgres preferred a sequential
scan over 40k rows even when the prefix matched a single row. Prefix search is the common
path — someone typing "aland" to reach "Alandi" — so it keeps a dedicated index. This
supersedes an earlier draft of this design, which dropped the btree on the theory that
trigram prefix support made it redundant. It is redundant in capability and not in
practice.

The 3-character minimum from Requirement 3.3 remains justified by the GIN index: a trigram
is three characters, so a 1-2 character substring pattern cannot use it and would degrade
to a sequential scan.

Declared in the schema, not only in SQL, with explicit names (two indexes on one column
would otherwise both be auto-named `place_nameNorm_idx` and fail validation):

```prisma
@@index([nameNorm(ops: raw("text_pattern_ops"))], map: "place_nameNorm_prefix_idx")
@@index([nameNorm(ops: raw("gin_trgm_ops"))], type: Gin, map: "place_nameNorm_trgm_idx")
```

Created with `prisma migrate dev --create-only` so that
`CREATE EXTENSION IF NOT EXISTS pg_trgm;` can be prepended before the index statements —
`gin_trgm_ops` does not exist until the extension does.

**Known Prisma churn, verified rather than assumed.** `prisma migrate diff` on 5.22.0
emits, on a schema that is already fully applied:

```sql
-- DropIndex
DROP INDEX "place_nameNorm_prefix_idx";
-- CreateIndex
CREATE INDEX "place_nameNorm_prefix_idx" ON "place"("nameNorm" text_pattern_ops);
```

So it is the **`text_pattern_ops` btree** that fails to round-trip, not the trigram GIN
index — the opposite of what
[prisma/prisma#17518](https://github.com/prisma/prisma/issues/17518) (which is about
extension-provided operator classes) would suggest. The regenerated statements are
byte-identical to what is already applied, so the fix is to delete that pair from any
future generated migration. Leaving the indexes out of `schema.prisma` instead would be
worse: Prisma would diff them as indexes to *drop*, and they would silently disappear.

Because none of that is enforced by the toolchain, `tests/place-schema-indexes.test.ts`
enforces it statically: it asserts both declarations (with their `map:` names), the
`CREATE EXTENSION` line and its position ahead of both `CREATE INDEX` statements, and that
no later migration drops either name index. No database connection — `readFileSync` over
two files — so what it proves is that the committed source still *says* the right thing,
which is the cheap half of the guarantee and the half that keeps regressing.

Column names in this repo are camelCase — models carry `@@map`, fields carry no `@map`
(see `prisma/migrations/0003_unified_chart/migration.sql`: `"lagnaLongitude"`,
`"chartHash"`). The indexed column is `"nameNorm"`, not `"name_norm"`.

Expected footprint at 272,499 rows: ~35 MB heap, ~40 MB trigram GIN, ~12 MB prefix btree.

## Normalization (`lib/places-normalize.ts`)

A small pure module, shared by the loader and the search route so ingestion and query
normalization can never diverge.

```ts
/** Lowercase, fold diacritics, punctuation → space, collapse whitespace. */
export function normalizePlaceName(raw: string): string

/** True when a name normalizes to nothing. Defined in terms of the above. */
export function isJunkPlaceName(raw: string): boolean

/** name → address.hamlet → village → town → city → municipality, else null */
export function resolvePlaceName(row: RawPlaceRow): string | null

/** Narrows a row's `type` to a PlaceKind, or null. */
export function toPlaceKind(value: unknown): PlaceKind | null

export const KIND_RANK: Record<PlaceKind, number> =
  { city: 1, town: 2, village: 3, hamlet: 4 }

/** The 3-character floor, shared by the route and the picker. */
export const MIN_PLACE_QUERY_LENGTH = 3

/** Query-side half of the same contract — see §Query parsing. */
export function parsePlaceQuery(q: string): ParsedPlaceQuery   // { phrase, nameToken, narrowTokens }
```

`parsePlaceQuery` lives here rather than in the route because `phrase` and `nameToken` are
compared against the `nameNorm` this module wrote; splitting the two apart would let them
drift.

The transform is `NFD` → strip `\p{M}` → lowercase → `[^\p{L}\p{N}\s]+` → space →
collapse. Every step earns its place against a measured property of the real data:

| Step | Real data it serves | Count |
|---|---|---|
| fold diacritics | `Haridwār`, `Bāgeshwar`, `Balāngīr` — macrons nobody types | 3,356 names |
| punctuation → **space**, not deletion | `St. Thomas Mount`, `B. Kothakota` — users type a space where the dot is, so deleting it would yield the unsearchable `stthomas` | 542 names |
| keep parenthetical content | `Sohra (Cherrapunji)`, `Karanja (Laad)` — the parenthetical is frequently the name people actually search | 761 names |
| keep digits (`\p{N}`) | `1 ALM ALDIN`, `29 -A. Chinta -Makulapalle` — real survey codes, not junk | 1,051 names |

`isJunkPlaceName` is defined as `normalizePlaceName(raw) === ''` rather than as its own
punctuation blacklist, so the two can never disagree about what "empty" means. An earlier
draft of this design listed `§U rural` as a junk sample; that was wrong — it normalizes to
`u rural`, which is perfectly searchable, and it is a real settlement in Sri Ganganagar,
Rajasthan. Exactly **11** rows in the entire dataset are junk, and all eleven are the
literal string `---`.

**Accepted caveat.** Stripping combining marks also strips Indic vowel signs, so a
native-script name (`ગાંધીધામ`) is mangled rather than romanized. Because the identical
transform is applied on both sides, such a name still matches itself; it simply cannot be
reached from a Latin-script query. The `other_names` follow-up addresses this properly.

**Idempotence is load-bearing** and therefore property-tested: ingestion normalizes once
and the query path normalizes again on the way in, so a non-idempotent transform would
desynchronize the two and silently return nothing.

## Ingestion Design (`scripts/load-places.ts`)

Streaming, batched, idempotent:

```
for each file in [place_city, place-town, place-village, place-hamlet]  (kind from filename)
  readline over a createReadStream (never readFile — largest file is 91 MB)
    JSON.parse each line
    name = resolvePlaceName(row)
    skip unless name && !isJunkPlaceName(name)
    skip unless row.address.state
    skip unless Array.isArray(row.location) && row.location.length === 2
    district = row.address.state_district ?? row.address.county
    skip unless district
    push { osmType, osmId, name, nameNorm, kind, kindRank, state, district,
           county, postcode, latitude: location[1], longitude: location[0] }
    every 5,000 → prisma.place.createMany({ data, skipDuplicates: true })
  report { read, loaded, skipped: { junkName, noState, noDistrict, badLocation } }
```

Note `location` is `[lon, lat]` — longitude first. Getting this backwards is the single
most likely bug in the whole feature, so the loader asserts
`-90 ≤ location[1] ≤ 90 && -180 ≤ location[0] ≤ 180` and a fixture test pins Bengaluru at
`(12.9767936, 77.590082)`.

Idempotence comes from `@@unique([osmType, osmId])` + `skipDuplicates: true`. Re-running
after a dataset correction updates nothing — corrections require `--truncate`, an explicit
opt-in flag that empties the table first.

### The loader's two raw statements

`--truncate` issues `TRUNCATE TABLE "place"`, and a successful load ends with
`ANALYZE "place"`. These are the only raw SQL in the repository outside
`prisma/migrations/`, and they are a deliberate, narrow exemption from
"Prisma only for queries":

- **`TRUNCATE`, not `deleteMany({})`.** On the 272,499-row table this flag exists to
  correct, `deleteMany` is a row-at-a-time `DELETE` that walks every row, fires triggers,
  and leaves one dead tuple per row for autovacuum — immediately before the operator
  inserts 272,499 fresh rows into that bloated heap. `TRUNCATE` reclaims the storage at
  once. Prisma exposes no truncate API. `place` has no inbound foreign keys (verified in
  `schema.prisma`), so no `CASCADE` is needed; a future FK would make this fail loudly
  rather than cascade silently through user data. The removed count is read with a
  `COUNT(*)` first, because `TRUNCATE` reports nothing back.
- **`ANALYZE`** is maintenance DDL: it touches no rows and returns nothing. `createMany`
  does not update `pg_statistic`, so straight after a load the planner is costing queries
  against statistics describing an empty table — and the prefix index is exactly what it
  declines to use under bad estimates (19 ms seq scan vs 0.35 ms index scan). Autovacuum's
  analyze worker gets there minutes to hours later; one `ANALYZE` closes the window. Not
  `VACUUM ANALYZE`: a freshly loaded table has no dead tuples, and `VACUUM` cannot run
  inside a transaction block.

Neither is a query, both are frozen string constants with **no interpolation of any kind**
(the table name is the literal from `@@map("place")`), so the injection surface the
no-raw-SQL rule exists to close is empty. If either ever needs a variable, it needs a
different design rather than a template literal.

Expected results, from the survey:

| File | Rows | Loaded | Skipped |
|---|---|---|---|
| `place_city` | 572 | 545 | 27 |
| `place-town` | 4,301 | 4,148 | 153 |
| `place-village` | 190,054 | 171,406 | 18,648 |
| `place-hamlet` | 153,918 | 96,400 | 57,518 |
| **Total** | **348,845** | **272,499** | **76,346** |

These are exact, produced by replaying all 348,845 rows through the shipped
`lib/places-normalize.ts` (not through a throwaway script). Skip reasons across the whole
dataset:

| Reason | Rows |
|---|---|
| `noName` | 75,435 |
| `noDistrict` | 899 |
| `junkName` | 11 |
| `noState` | 1 |
| `badLocation` | 0 |

**98.8% of discards are `noName`** — rows carrying only administrative parents (`state`,
`state_district`, `county`) with no settlement name and no `other_names`. 56,912 of them
are hamlets and 18,365 villages. These are unnamed OSM place nodes with nothing to
recover; verified by inspecting the address keys present on them. That is a property of the
OSM export, not a loader defect. Junk names, by contrast, are a rounding error at 11 rows.

## Search Design (`app/api/places/route.ts`)

### Query parsing

`parsePlaceQuery()` lives in `lib/places-normalize.ts`, next to `normalizePlaceName` —
it is the query-side half of the same contract (`phrase` and `nameToken` are compared
against the `nameNorm` that ingestion wrote through that module), and a second copy in the
route would be free to drift from it.

```
parsePlaceQuery(q) → { phrase, nameToken, narrowTokens }

  tokens = q.split(/[,\s]+/).map(raw => ({ raw, norm: normalizePlaceName(raw) }))
                            .filter(t => t.norm !== '')     // drop a stray "--"
  phrase = tokens.map(t => t.norm).join(' ')                // already normalized

  // Grow the name token until it clears the floor, then stop.
  nameToken = the first N tokens' norms joined, for the smallest N where
              length >= MIN_PLACE_QUERY_LENGTH (or N = tokens.length)
  narrowTokens = the remaining tokens, kept RAW

q = "rampur, shimla"     → phrase "rampur shimla"   nameToken "rampur"     narrow ["shimla"]
q = "rampur"             → phrase "rampur"          nameToken "rampur"     narrow []
q = "St. Thomas Mount"   → phrase "st thomas mount" nameToken "st thomas"  narrow ["Mount"]

  → if phrase.length < 3 → { results: [], reason: 'query_too_short' }   // no DB call
```

Two details are load-bearing:

**The guard measures `phrase`, not `nameToken`.** A two-character *first* token is
ordinary in this dataset — `"St. Thomas Mount"`, `"B. Kothakota"`, 542 dotted names — and
rejecting a 16-character query because of it told the practitioner to type more while they
were already typing the right thing. The floor itself still has to exist: a trigram is
three characters, so a shorter pattern cannot use the GIN index and would sequentially
scan 272k rows. `phrase` is the longest pattern any tier will use, so it is the right
thing to measure, and because `nameToken` grows until it either clears the floor or
consumes the whole phrase, `nameToken` is at least three characters too whenever the route
proceeds.

**`narrowTokens` stay raw while `nameToken` is normalized.** They are matched
case-insensitively against `state` / `district` / `county`, which store display text
rather than normalized text — normalizing them here would fold away the very characters
being matched (`Bāgeshwar` the district would stop matching `Bāgeshwar` the typed token).

`narrowTokens` become an AND of ORs across the administrative columns:

```ts
const narrowing = narrowTokens.map((t) => ({
  OR: [
    { state:    { contains: t, mode: 'insensitive' as const } },
    { district: { contains: t, mode: 'insensitive' as const } },
    { county:   { contains: t, mode: 'insensitive' as const } },
  ],
}))
```

### Six-tier ranked retrieval

A query string is ambiguous by construction: `"rampur bushahr"` is one settlement's full
name, `"rampur shimla"` is a settlement plus its district, and nothing in the text says
which. So **both readings are retrieved**, and the phrase reading is ranked above the
narrowing reading:

| # | Tier | `nameNorm` matched against | Narrowing |
|---|---|---|---|
| 1 | `phrase-exact` | `phrase` | none |
| 2 | `phrase-prefix` | `phrase` | none |
| 3 | `phrase-substring` | `phrase` | none |
| 4 | `token-exact` | `nameToken` | every `narrowToken` |
| 5 | `token-prefix` | `nameToken` | every `narrowToken` |
| 6 | `token-substring` | `nameToken` | every `narrowToken` |

The phrase family is what makes multi-word primary names reachable at all — `rampur
bushahr`, `alandi devachi`, `new delhi`, `st thomas mount`. Under a token-only reading,
`"rampur bushahr"` matched nothing: `bushahr` is not a state, district or tehsil, so the
narrowing eliminated the very town the practitioner named. It is ranked first because a
row whose own name is everything the user typed is the best answer available — there is no
interpretation of the query it fails to satisfy. That means a **phrase-substring match
outranks a token-exact match**, which is the one ordering consequence worth stating
explicitly.

The token family is **omitted entirely** when `narrowTokens` is empty: there
`nameToken === phrase`, so its three queries would be byte-identical to the phrase tiers.
A single-word query therefore still costs at most three round trips; only a multi-token
query can reach six, and only while the shared budget is unspent.

Ranking is expressed as one ordered query per tier rather than one `ORDER BY CASE`,
keeping everything in Prisma and letting each tier use its own index. The tiers share a
single over-fetch budget and the loop stops once that budget is spent:

```
OVERFETCH = 3        // headroom for dedupe
kindWhere = includeHamlets ? {} : { kind: { not: 'hamlet' } }
baseOrder = [{ kindRank: 'asc' }, { state: 'asc' }, { district: 'asc' }, { name: 'asc' }]
budget    = limit * OVERFETCH

// One tier = one nameNorm predicate + the narrowing that applies to it.
tiersFor(pattern, narrowing) = [
  { nameNorm: pattern,                                       narrowing },  // exact
  { nameNorm: { startsWith: pattern, not: pattern },          narrowing },  // prefix
  { nameNorm: { contains: pattern, not: { startsWith: pattern } }, narrowing },  // substring
]

stages = narrowing.length === 0
  ? tiersFor(phrase, [])
  : [ ...tiersFor(phrase, []), ...tiersFor(nameToken, narrowing) ]

candidates = []
for (stage of stages) {
  if (candidates.length >= budget) break
  candidates.push(...place.findMany({
    where:   { nameNorm: stage.nameNorm, countryCode: 'in', ...kindWhere, AND: stage.narrowing },
    orderBy: baseOrder,
    take:    budget - candidates.length,
  }))
}

deduped   = dedupeBy(candidates, p => `${p.nameNorm}|${p.county}|${p.district}|${p.state}`)
truncated = deduped.length > limit
results   = deduped.slice(0, limit)
```

Every tier is scoped to `countryCode: 'in'`. With every row `"in"` today this changes no
result and is deliberately un-indexed — the planner treats it as the cheap residual filter
it is. It exists so a future non-India ingest cannot silently leak rows into a picker whose
whole timezone story ("every one of the 36 states is IST") assumes India: widening the
scope should be a deliberate edit, not a side effect of loading a file.

A row can legitimately satisfy both families — a settlement actually named "Rampur Shimla"
in Shimla district matches `phrase-exact` and `token-prefix`. The dedupe below collapses it
to one result at its phrase-tier position, so overlap costs a slot in the over-fetch and
never a duplicate row.

**The tier must be decided in SQL, not after the fetch.** Retrieving one `startsWith`
page and partitioning it on `nameNorm === pattern` afterwards reads as equivalent and is
not: that window is ordered by `baseOrder`, which interleaves exact and prefix matches, so
the `take` can spend the budget on prefix matches that happen to sort earlier and cut off
exact matches entirely. Measured against the loaded table (task 3.7), `q=rampur` reached
only **13 of its 112** exact non-hamlet matches that way, and filled the remaining result
slots with `Rampura` / `Rampurhat` / `Rampuram Thanda` while the Rampurs of Maharashtra,
Odisha, Punjab, Rajasthan and Telangana never appeared at all — a direct violation of
Requirement 3.5.

Each tier names itself (`"phrase-substring"`, `"token-exact"`, …) in the error it throws,
so a 500 distinguishes "search is down" from "the substring tier is down" — a connection
problem versus a missing trigram index.

The `not` clauses are what make the tiers disjoint: `startsWith` is a superset of the
equality above it, and `contains` a superset of both. Subtracting with a predicate rather
than with `id: { notIn: [...] }` keeps each query independent of how many rows its
predecessors happened to return.

No `mode: 'insensitive'` on any `nameNorm` filter: that would emit `ILIKE`, which the
`text_pattern_ops` btree cannot serve. Case-insensitivity comes from both sides being
pre-normalized through `lib/places-normalize.ts`, which additionally folds diacritics —
something neither `ILIKE` nor a trigram index does on its own, and what makes `Rāmpur`
reachable by typing `rampur`.

`truncated` is derived from the over-fetch, so no second `COUNT` query is issued.

### Response

```ts
interface PlaceSearchResponse {
  results: PlaceResult[]
  truncated: boolean          // more matches exist than `limit`
  hamletsExcluded: boolean    // drives the footer toggle
  reason?: 'query_too_short'
}

interface PlaceResult {
  id: string
  name: string
  kind: 'city' | 'town' | 'village' | 'hamlet'
  state: string
  district: string
  county: string | null
  latitude: number            // Decimal → number at the boundary
  longitude: number
  label: string               // `${name}, ${county ?? district}, ${state}`
}
```

Prisma `Decimal` must be converted with `.toNumber()` before serialization — returning it
raw yields `{"s":1,"e":1,"d":[...]}` in JSON, which is the kind of bug that surfaces only
once a coordinate reaches the ephemeris.

### Worked example

Measured against the loaded table, not estimated (task 3.7).

The measured results below were taken before the phrase family was added and still hold
under it, because every one of these queries reaches the same rows by the same route —
re-checked tier by tier against the shipped code:

`q = "rampur"`, `limit = 20`, hamlets excluded. A single-word query, so `narrowTokens` is
empty and the token family is skipped: the three phrase tiers ARE the three stages this
query always ran. The name normalizes to `rampur`, which **112 non-hamlet rows match
exactly** (4 towns, 108 villages — plus 59 hamlets, filtered out) and 396 match as a
prefix. `phrase-exact` alone therefore fills the page: `kindRank` puts the four town
Rampurs first, ordered by state — Himachal Pradesh (Shimla), Madhya Pradesh (Sidhi), Uttar
Pradesh (Rampur, the row with no tehsil), West Bengal (Dakshin Dinajpur) — then the
villages, also by state, from Bihar onward. `truncated: true` prompts "add a district or
state to narrow". No prefix row such as `Rampura` appears, because none of them outranks an
exact match.

`q = "rampur shimla"` returns **three** rows, all in Shimla, Himachal Pradesh, with the
intended town first. Nothing is named `rampur shimla`, so all three phrase tiers come back
empty and the token tiers produce the page:

```
1. town     Rampur           Rampur · Shimla · Himachal Pradesh   ← token-exact
2. town     Rampur Bushahr   Rampur · Shimla · Himachal Pradesh   ← token-prefix (same town, full name)
3. village  Rampuri          Jubbal · Shimla · Himachal Pradesh   ← token-prefix
```

Requirement 3.5 mandates a prefix tier, so those two are ranked *after* the exact match
rather than dropped; dedupe cannot collapse `Rampur Bushahr` into `Rampur` because the key
starts with `nameNorm`, and the two names differ. `q = "rampur, himachal"` returns the same
three plus `Dharampur` (Solan) from `token-substring` — correctly last, even though it is a
town and `Rampuri` above it is a village, because tier beats `kindRank`.

What the phrase family changes is the query the token-only design could not answer:

- `q = "rampur bushahr"` now returns that town **first**, from `phrase-exact`. Under a
  token-only reading it returned **nothing at all**: `bushahr` was required to match a
  state, district or tehsil, and it matches none of them, so the narrowing eliminated the
  one row the practitioner had named in full. Row 2 above is that same town, which is how
  the gap was found.
- `q = "St. Thomas Mount"` now searches at all. The old guard measured the first token
  (`st`, two characters) and returned `query_too_short` for a 16-character query;
  `nameToken` now grows to `st thomas` and the guard measures the 15-character phrase, so
  `phrase-exact` matches the settlement directly.

## Component Design (`app/components/PlacePicker.tsx`)

```ts
interface PlacePickerProps {
  value: SelectedPlace | null
  onSelect: (place: SelectedPlace) => void
  onManualEntry: () => void
  disabled?: boolean
}
```

Built on `Popover` + `Command`, mirroring `app/page.tsx:331-370`, with
**`shouldFilter={false}`** so cmdk does not re-filter server-ranked results.

Internal state: `query`, `results`, `loading`, `error`, `truncated`, `hamletsExcluded`,
`includeHamlets` (seeded from `localStorage`), `queryTooShort` (the server's `reason`), and
`skipDebounce`.

### Dropdown states

| Condition | Rendered |
|---|---|
| `query.length < 3` | "Type at least 3 letters to search." |
| `loading` | single spinner row, `role="status" aria-live="polite"` |
| `error` | "Search unavailable — enter coordinates manually" + action |
| server said `query_too_short`, locally long enough | "Enter at least 3 letters or numbers — punctuation does not count towards the search." |
| `results.length === 0` | "No place found" + **"enter coordinates manually"** action |
| `results.length > 0` | result rows, then footers |
| `truncated` | footer: "Showing top 20 — add a district or state to narrow" |
| `hamletsExcluded \|\| includeHamlets` | footer toggle: "Include hamlets" / "Exclude hamlets" |
| always | footer: "Place data © OpenStreetMap contributors, ODbL" |

The fourth row is its own state because the two thresholds count different things: the
local check counts raw characters, the server's counts normalized ones, so `"r.,"` passes
one and fails the other. Repeating "type at least 3 letters" there would be a lie about a
query that already has three, so the message names what actually counts. It is a
`role="status"` instruction in muted text, not a styled failure — it is correctable, and
must not be conveyed by colour.

The attribution footer is unconditional and rendered **last** in the footer stack, so it
never displaces the hint or the toggle the practitioner is reaching for (§Open Risks #1).

### Result row

```
┌──────────────────────────────────────────────────────────┐
│ Alandi                                        [village]  │   ← primary: name
│ Khed · Pune · Maharashtra                                │   ← secondary: tehsil·district·state
└──────────────────────────────────────────────────────────┘
```

Secondary line is `[county, district, state].filter(Boolean).join(' · ')`, so a null
`county` degrades to `Pune · Maharashtra` with no orphan separator. `kind` renders as a
`Badge` — a text label, not a colour, per the project's non-colour-only rule.

### Fetch discipline

```
onQueryChange   → skipDebounce = false → clearTimeout → setTimeout(250ms) → fetch(signal)
onHamletToggle  → skipDebounce = true  → clearTimeout → setTimeout(0)     → fetch(signal)
                  (cleanup aborts whatever the previous run had in flight)
```

One effect, keyed on `query`, `includeHamlets` and `skipDebounce`, owns every request; the
toggle does not get a second, unguarded path to the API. The debounce exists to wait out a
*keystroke*, and the hamlet toggle is a deliberate click on a query that has finished being
typed, so it schedules at 0 ms rather than sitting through another 250 ms with nothing to
coalesce (Requirement 6.4). It is still *scheduled* rather than called inline, so both
paths share one `AbortController` lifecycle and differ only in the delay.

The `AbortController` matters more than the debounce here: a 2-character-slower response
for "ram" arriving after "rampur" would otherwise replace the correct results. It is also
what stops the response to a request the toggle replaced from overwriting the toggle's own
results.

## Home Page Integration

`ComputeForm` gains two fields; `latitude`/`longitude` stay as strings so
`birthInputFromForm` is unchanged:

```ts
interface ComputeForm {
  name: string
  date: string
  time: string
  timezone: string
  latitude: string
  longitude: string
  placeId: string | null      // NEW — null when coordinates were typed by hand
  placeLabel: string          // NEW — "" when unknown
  sunriseMode: 'precise' | 'jhora'
}
```

Transitions:

| Action | Effect on form |
|---|---|
| Select a place | `placeId`, `placeLabel`, `latitude`, `longitude` set; `timezone = '5.5'` |
| Edit lat or long by hand | `placeId = null`, `placeLabel = ''` (never keep a stale label) |
| Load a saved chart with `birthInput.place` | all four restored from storage |
| Load a saved chart without `place` | `placeId = null`; Manual_Coords disclosure opens |

Layout: the picker occupies the grid cell where Latitude sits today; the coordinate readout
and the "Enter coordinates manually" disclosure occupy the Longitude cell. The grid stays
`md:grid-cols-3`, so no layout rework.

**New `useState` calls must be added after the `activeTab` declaration.** `app/page.test.tsx`
stubs the React dispatcher and identifies `activeTab` by `useState` **call index** (the 6th);
inserting state above that line silently breaks the test suite.

Every one of the 36 states in the dataset is IST, so `timezone = '5.5'` on selection is
sound. The field stays editable rather than disabled — pre-1942 Indian births used local
mean time, which is out of scope but shouldn't be made unrepresentable.

### The shared contract (`lib/place-form.ts`)

Both birth-data forms — `app/page.tsx` and the `ComputeForm` in
`app/unified-charts/page.tsx` — answer the same question ("do we have a usable birth
location, and is there trustworthy place metadata to persist alongside it?"), and they
answered it in two different ways: one validated in JS and stripped the selection down to
the persisted shape, the other did neither and so selected a place and then silently
dropped it. One module now owns the answer:

```ts
export interface PersistedBirthPlace {           // exactly the 7 persisted display fields
  id: string; name: string; kind: PlaceKind
  state: string; district: string; county: string | null; label: string
}

export function isPersistedBirthPlace(value: unknown): value is PersistedBirthPlace
export function persistedPlaceFromSelection(
  selection: unknown,
  options?: { expectedPlaceId?: string | null },
): PersistedBirthPlace | undefined
export function validateBirthLocation(draft: {
  latitude: string; longitude: string; hasSelectedPlace: boolean
}): BirthLocationValidation
export const LATITUDE_MIN / LATITUDE_MAX / LONGITUDE_MIN / LONGITUDE_MAX
```

Two invariants live there and nowhere else:

1. **The persisted place is exactly seven display fields.** The `place` schema on
   `POST /api/unified-charts/from-compute` is `.strict()`, so an extra key is a 400 that
   rejects the whole save — and a picker selection carries `latitude`/`longitude` too.
   `persistedPlaceFromSelection` strips them; coordinates stay top-level compute inputs.
   Its optional `expectedPlaceId` gates the selection against the form's own record of
   which place is current (a form restored from storage may hold an id and label without
   the rest of the metadata — enough to compute with, not enough to persist). The home form
   passes it; the unified-charts form omits it, because there the live selection is the only
   record. Omitting the option is deliberately *not* the same as passing `undefined`.
   `PersistedBirthPlace` is redeclared rather than imported from `chart-mapper.ts`'s
   structurally identical `BirthPlace`, because that module pulls in Prisma and this one
   must stay node-pure (and free of React) for the existing Vitest setup.
2. **Location validation is explicit JS and always yields a message.** See below.

### Why the coordinate inputs carry no `required`

Manual_Coords sit inside a `<details>` that is closed by default. Browser constraint
validation on a control that is not focusable **aborts submission without firing the submit
event**: with `required` (or `min`/`max`) on those inputs, clicking Compute with an empty
form did nothing, showed nothing, and logged nothing — the button read as broken. The
constraint therefore belongs to `validateBirthLocation`, and each call site:

- renders the returned `message` in a `role="alert"` container, so a blocked submission is
  announced rather than conveyed by red text alone;
- sets the disclosure open, so the fields the message names are visible and focusable;
- keeps `onInvalid` on both inputs as belt-and-braces for any residual native check (a
  browser's `badInput` on a number field), which also reveals the disclosure.

The three failure reasons exist so the message is actionable: `location_required` (nothing
entered), `place_missing_coordinates` (a place is selected but produced no coordinates —
a different problem), `coordinate_out_of_range`. Validation reads the coordinate *strings*
rather than the selection, because a selection only ever reaches the engine through the
coordinates it wrote into the form, so one check covers both the picked and the hand-typed
path.

This will read as an oversight to the next author — a form with no `required` on its
required fields — so it is recorded as a rule with its reason in
`skills/frontend/form-patterns.md` and `skills/frontend/accessibility.md`.

## Persistence Design

### Threading `place` without touching the engine

```ts
// lib/chart-mapper.ts
export interface BirthPlace {
  id: string; name: string; kind: string
  state: string; district: string; county: string | null
  label: string
}

export function mapComputedToUnified(
  chart: ComputedChart,
  dashaTree: SerializedDashaTree,
  name: string,
  place?: BirthPlace,          // NEW — optional, so every existing caller compiles
): UnifiedChartCreateInput {
  const chartHash = computeChartHash({
    source: 'compute',
    date: chart.input.date,
    time: chart.input.time,
    timezone: chart.input.timezone,
    latitude: chart.input.latitude,
    longitude: chart.input.longitude,
    sunriseMode: chart.input.sunriseMode ?? 'precise',
  })                            // ← UNCHANGED. `place` is deliberately absent.

  return {
    // ...
    birthInput: { ...chart.input, place } as unknown as Prisma.InputJsonValue,
  }
}
```

`engine/compute/types.ts`'s `BirthInput` is untouched. `place` rides in the persisted JSON
only, spread on at the mapper boundary.

Call chain: `PlacePicker` → `app/page.tsx` form → `POST from-compute` (optional
Zod-validated `place`) → `createUnifiedChartFromBirthData(input)` → `mapComputedToUnified(…, place)`.

### The `birth_place` fix

`lib/chart-mapper.ts:345` currently reads:

```ts
birth_place: birthInput?.name ?? undefined,
```

`birthInput.name` is the **client's name** (`BirthInput.name`, set from the chart name), so
today every compute-path `chartInputV1.meta.birth_place` — which flows into the
`chart_summary` given to every LLM agent — contains a person's name where a location
belongs. With `place` available this becomes:

```ts
birth_place: birthInput?.place?.label ?? undefined,
```

Charts saved before this feature get `undefined` (absent) rather than a wrong value, which
is strictly better than the current behaviour.

## Hamlet Toggle: Design Decision

The requirement was "add hamlets behind a toggle". Two placements were considered:

| Option | Behaviour | Cost of changing your mind |
|---|---|---|
| Load-time flag | hamlets never enter the table unless `--kinds` includes them | re-run a multi-minute ingestion |
| **Runtime filter (chosen)** | hamlets always ingested; excluded from search by default; per-user toggle | flip a boolean |

Chosen: **ingest always, filter at query time.** The 96,400 hamlet rows cost roughly 30 MB
including index share — immaterial — and the product goal (keep common searches clean) is
fully served by excluding them from results. It also means a practitioner whose client was
born in a hamlet is one click away instead of one ops ticket away. The loader keeps
`--kinds` for operators who want a smaller table, and the API's default exclusion is
independent of that choice.

## Error Handling

| Failure | Behaviour |
|---|---|
| Unauthenticated request to `/api/places` | 401, consistent with every other route |
| Invalid `q`/`limit`/`includeHamlets` | 400 with Zod `details` |
| Normalized phrase < 3 chars | 200, `{ results: [], reason: 'query_too_short' }`, no DB call |
| Phrase long enough locally, too short once normalized (`"r.,"`) | same 200 response; the picker shows the punctuation-specific message rather than the below-threshold hint |
| A retrieval tier throws | 500 logged with the failing tier named (`phrase-substring` points at the trigram index, `token-exact` at the btree or the connection) |
| Location missing/out of range on submit | no request; `validateBirthLocation` message rendered in `role="alert"` and the Manual_Coords disclosure opened |
| DB unavailable / query throws | 500 logged; picker shows "Search unavailable — enter coordinates manually" and stays usable |
| `place` table empty (ingestion not run) | indistinguishable from no-match: empty state + manual escape hatch. Chart computation is never blocked |
| Loader hits a malformed NDJSON line | count it under `skipped.parseError`, continue; one bad line never aborts a 190k-row file |
| Loader run twice | `skipDuplicates` makes it a no-op |
| Aborted in-flight search | swallowed (`AbortError`), no error surfaced |

The through-line: **search degrading never blocks chart computation.** Manual coordinate
entry is always reachable.

## Testing Strategy

Vitest, `environment: 'node'`, no jsdom — matching the existing suite.

| File | Covers |
|---|---|
| `lib/places-normalize.test.ts` | `normalizePlaceName` (case, diacritics, whitespace, punctuation), `isJunkPlaceName` against the real `---` sample (and asserting `§U rural` is NOT junk), `resolvePlaceName` fallback chain + null case, `KIND_RANK` ordering, idempotence, `parsePlaceQuery` (phrase joining, name-token growth on `"St. Thomas Mount"`, raw narrow tokens) |
| `tests/places-api.test.ts` | 401; 400; the 3-char short-circuit measured on the phrase, **asserting Prisma was not called** — and that a long query with a two-character first token still searches; exact→prefix→substring within a family and phrase-before-token across families; token tiers skipped when `narrowTokens` is empty; `kindRank` tie-break; multi-token narrowing (`"rampur shimla"` → 1 row); hamlet exclusion/inclusion; dedupe; `truncated`; `Decimal`→number serialization |
| `lib/place-form.test.ts` | the seven-field strip (coordinates dropped), the `expectedPlaceId` gate including omitted-vs-explicit-`undefined`, and every `validateBirthLocation` outcome |
| `tests/place-schema-indexes.test.ts` | static guard over `schema.prisma` + the `place` migration: both `@@index` declarations with their `map:` names, `@@unique([osmType, osmId])`, `@@map("place")`, `CREATE EXTENSION pg_trgm` **before** both `CREATE INDEX`es, and no later migration dropping either name index |
| `tests/places-loader.test.ts` | lat/long orientation (Bengaluru fixture), skip predicates by reason, idempotence (load twice → same count) |
| `app/components/PlacePicker.test.tsx` | below-threshold hint, loading row, empty state + escape hatch, two-line row content, degraded secondary line when `county` is null, `shouldFilter={false}` is set |
| `tests/chart-hash-place-stability.test.ts` | `mapComputedToUnified` with and without `place` produces an **identical `chartHash`** (Requirement 7.2) |
| `app/page.test.tsx` | existing tests keep passing — verifies new `useState` calls landed after `activeTab` |

`tests/places-api.test.ts` follows `tests/gochar-api.test.ts`: `vi.mock('@/lib/auth')`,
`vi.mock('@/lib/db')` with a `place: { findMany: vi.fn() }` stub, then invoke the exported
`GET` with a `NextRequest`.

## Documentation

Per the `Agents.md` maintenance table, in the same change:

- `docs/ERD.md` — `Place` model, indexes, no `User` relation, not in the delete cascade
- `docs/HLD.md` — `GET /api/places`, `PlacePicker`, `scripts/load-places.ts`
- `docs/DFD.md` — place resolution → coordinates → compute, from **both** forms
- `.kiro/skills/database-prisma.md` — `pg_trgm` requirement; `Place` as unowned reference
  data; the loader's TRUNCATE/ANALYZE exemption and the static schema guard
- `skills/backend/api-routes.md` — `GET /api/places`
- `skills/frontend/form-patterns.md` — `PlacePicker`, the `lib/place-form.ts` contract, and
  the no-`required`-inside-a-disclosure rule *with its reason*
- `skills/frontend/unified-charts-ui.md` — the ComputeForm's picker + place forwarding
- `skills/frontend/accessibility.md` — validation inside a collapsed disclosure must be
  explicit JS with a `role="alert"` message
- `.kiro/skills/nextjs-project-structure.md` — `PLACES_DATA_DIR`; dataset deliberately *not* in `outputFileTracingIncludes`
- `Claude.md` — brief update
- `README.md` + `.env.example` — the one-off `npm run db:load-places` setup step

## Open Risks

1. **Dataset provenance — resolved.** The NDJSON is an OSM/Nominatim export and OSM is
   ODbL-licensed, so derived data carries attribution obligations. The rows live in a
   private database and are not republished, so this is courtesy rather than a strict
   obligation — and it was cheap enough not to defer. `PlacePicker` renders an
   always-visible footer, "Place data © OpenStreetMap contributors, ODbL", last in the
   footer stack (Requirement 4.13). The dropdown is where the data is actually consumed,
   which makes it a better home than an About page nobody opens while searching.
2. **Coordinate authority.** OSM place nodes mark a settlement's centroid or a
   representative point, not a hospital. For a village a few hundred metres of error is
   astrologically negligible; for a large city the centroid may sit kilometres from the
   birth location. The read-only coordinate display plus retained manual entry is the
   mitigation.
3. **`other_names` gap.** A practitioner searching "Bangalore" (the `old_name`) or a
   regional-script name gets nothing in v1. The most likely source of "the search is
   broken" feedback; queued as the first follow-up.
4. **Duplicate settlements.** OSM sometimes carries the same settlement as both a node and
   a relation. `@@unique([osmType, osmId])` does not collapse those; the response-level
   dedupe on `(nameNorm, county, district, state)` does, but only within a result page.
