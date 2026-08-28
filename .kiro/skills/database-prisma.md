---
inclusion: auto
---

# VedicMojoAI — Database & Prisma Conventions

## Database: PostgreSQL (via Prisma ORM)

## Entities

| Table | Purpose | Key Fields |
|---|---|---|
| `chart` | Immutable birth chart record | `id`, `chart_hash` (unique), `chart_json` (JSONB), `moon_longitude`, `birth_datetime` |
| `pipeline_run` | One per analysis execution | `chart_id` (FK), `status`, `query_types[]`, `planner_output`, `halt_reason`, `override_applied`, `report_path`, `report_html`, `report_markdown` |
| `wave1_cache` | Foundation layer cache | `chart_hash` (unique), `chart_summary`, `wave1_delta`, `dasha_tree` |
| `wave_output` | Per-agent per-run audit trail | `run_id` + `agent_id` (unique), `output_json`, `token_in/out`, `cost_usd` |
| `run_message` | Conversation thread (append-only) | `run_id`, `role`, `content`, `agent_id` |
| `model_config` | Runtime model/provider per agent | `wave_id` (unique), `model_id`, `provider`, `temperature`, `max_tokens` |
| `unified_chart` | **Canonical chart store** (Generate Chart + AI Analysis) | `id`, `source` (`compute`\|`paste`), `chart_hash` (unique), `user_id` (FK, required), one JSONB column per domain, `chart_input_v1` |
| `saved_chart` | Legacy computed chart store (superseded by `unified_chart`) | `id`, `input_hash` (unique), `chart_data` (JSONB), `dasha_tree` |
| `user` | Practitioner account (`.kiro/specs/user-management/`) | `id`, `email` (unique), `password_hash` (bcrypt), `name` |
| `session` | Database-backed Auth.js session | `id`, `session_token` (unique), `user_id` (FK), `expires` |
| `account`, `verification_token` | Auth.js adapter shape, unused in v1 (no OAuth providers) | — |
| `password_reset_token` | Forgot-password flow | `user_id` (FK), `token_hash` (unique, SHA-256), `expires_at`, `used_at` |
| `mcp_api_token` | Per-user MCP credential | `user_id` (FK), `token_hash` (unique, SHA-256), `label`, `last_used_at`, `revoked_at` |
| `compatibility_match` | Marriage Matchmaking result (`.kiro/specs/marriage-matchmaking/`) | `user_id` (FK), `bride_chart_id`/`groom_chart_id` (FK → `unified_chart`, roles structural), `guna_score` (`Decimal(4,1)`), `verdict` (denormalized), `result` (JSONB, full snapshot), `tables_version` |

## Place (shared reference data)

`place` stores the Indian OSM settlement dataset used by `GET /api/places`. It is
shared **reference data**, not practitioner content:

- It has no `userId`, no `User` relation, and no relation to `UnifiedChart`.
  `UnifiedChart.birthInput.place` is optional display metadata in JSON, never a
  foreign key; the saved chart retains its copied coordinates.
- Do not add `Place` to `DELETE /api/unified-charts/[id]`'s explicit cascade.
  No chart owns a place, and re-ingesting source data must neither delete a
  chart's place row nor orphan a saved chart.
- `@@unique([osmType, osmId])` is the stable OSM natural key. The out-of-band
  `scripts/load-places.ts` loader writes batches with
  `prisma.place.createMany({ skipDuplicates: true })`, making repeat ingestion
  idempotent. The application reads this table but does not write it.

### The loader's raw-SQL exemption (do not "fix" this)

`scripts/load-places.ts` contains the only raw SQL outside `prisma/migrations/`:
`TRUNCATE TABLE "place"` for `--truncate`, and `ANALYZE "place"` after a
successful load. The no-raw-SQL rule below is about **queries** — anything that
reads or writes rows, where raw SQL costs type safety and invites interpolated
input. Neither of these is a query:

- `TRUNCATE` is a DDL-level bulk delete. `deleteMany({})` is equivalent only in
  intent: it deletes row by row and leaves a dead tuple per row for autovacuum,
  immediately before the loader inserts 272,499 fresh rows into that bloated
  heap. Prisma exposes no truncate API. `place` has no inbound foreign keys, so
  no `CASCADE` is used — a future FK should make this fail loudly rather than
  cascade through user data.
- `ANALYZE` is maintenance DDL: it touches no rows and returns nothing.
  `createMany` does not update `pg_statistic`, so until autovacuum's analyze
  worker catches up the planner costs searches against statistics for an empty
  table — exactly the case where it declines the prefix index and scans instead.

Both are frozen string constants with **no interpolation of any kind** — no
parameters, nothing derived from `argv` or the dataset — so the injection surface
the rule exists to close is empty. The table name is the literal from
`@@map("place")`. If either statement ever needs a variable, it needs a different
design, not a template literal.

### Place migrations and indexes

`Place` has two required, explicitly named indexes on `nameNorm`, plus ordinary
btree indexes on `state`, `district`, and persisted `kindRank`:

- `place_nameNorm_prefix_idx`: btree with `text_pattern_ops`, serving exact and
  prefix (`=`, `LIKE 'q%'`) search.
- `place_nameNorm_trgm_idx`: GIN with `gin_trgm_ops`, serving substring
  (`LIKE '%q%'`) search.

The target collation is `en_US.utf8`, so a default btree cannot serve prefix
`LIKE`; the trigram GIN index does not replace the dedicated prefix index in
planner practice. `gin_trgm_ops` requires PostgreSQL's `pg_trgm` extension.
Create Place migrations with `npx prisma migrate dev --create-only`, then
prepend `CREATE EXTENSION IF NOT EXISTS pg_trgm;` before the index statements in
the migration. This unsupported DDL is the permitted raw-SQL exception: use
Prisma Client for application queries and hand-written SQL only in migrations.

Keep both indexes declared in `schema.prisma` with their explicit `map:` names;
two indexes on the same field otherwise conflict. Prisma can regenerate an
identical drop/recreate pair for the `text_pattern_ops` index in a future
migration. Remove that redundant pair rather than rebuilding the applied index;
do not remove the schema declaration, which would cause Prisma to propose
dropping the index.

`tests/place-schema-indexes.test.ts` is the static guard on all of this — pure
`readFileSync` over `prisma/schema.prisma` and the `place` migration, no database
connection, so it runs anywhere. It fails if either `@@index` declaration or its
`map:` name, `@@unique([osmType, osmId])`, `@@map("place")` (the literal the
loader's TRUNCATE/ANALYZE hard-code), or the hand-added
`CREATE EXTENSION IF NOT EXISTS pg_trgm` ahead of both `CREATE INDEX` statements
goes missing, and if any later migration drops a `nameNorm` index. It exists
because every one of those is something a routine `prisma migrate dev` quietly
tries to undo, and nothing else in the toolchain says so: the regenerated
drop/recreate pair must be deleted by hand, deleting the declaration instead makes
Prisma drop the live index (search stays correct and gets ~50x slower, with no
error anywhere), and Prisma cannot regenerate the extension line at all — without
it the GIN index creation fails outright on a fresh database. Update this guard in
the same change as any deliberate index change, so the reason is recorded.

## UnifiedChart (column-per-domain)

`unified_chart` is the current canonical chart table. One JSONB column per domain
lets the AI pipeline read exactly what it needs and lets the compute path skip LLM
Wave 1.

- **Scalar index fields** (for list/filter without parsing JSONB): `name`, `source`,
  `lagna`, `lagna_longitude`, `moon_longitude`, `ayanamsa`, `birth_datetime`,
  `gender` (nullable, informational picker hint for Marriage Matchmaking only —
  never used to infer a bride/groom role; see "CompatibilityMatch" below).
- **Domain JSONB columns:** `planets`, `nakshatras`, `divisional_charts`, `karakas`,
  `ashtakavarga`, `upagrahas`, `special_lagnas`, `arudha_padas`, `relationships` (1D),
  `shadbala` (1C), `jaimini`, `bhava_bala`, `transits`, `pinda_strength`, `dasha_tree`.
- **AI pipeline input:** `chart_input_v1` — populated directly for `source="paste"`,
  synthesized on demand from domains for `source="compute"`.
- **Indexes:** `name`, `lagna`, `source`. **Unique:** `chart_hash` (SHA-256 dedup).
- **Relation:** `pipeline_run.unified_chart_id` (nullable FK, relation
  `"UnifiedChartRuns"`). A run still keeps its required legacy `chart_id`.

**Mapping:** all format conversion lives in `lib/chart-mapper.ts`
(`mapComputedToUnified`, `mapPastedToUnified`, `buildChartInputV1FromUnified`,
`serializeDashaTree`) — do not hand-roll domain→column mapping elsewhere.

**Backfill:** `npm run db:backfill-gender` (`prisma/backfill-gender.ts`)
populates `gender` from `chartInputV1.meta.gender` for existing rows where it
is still null — idempotent, validates/normalizes through `chart-mapper.ts`'s
exported `toGender` (never writes an unrecognized value), mirrors
`prisma/backfill-owner.ts`'s one-off-migration shape.

## CompatibilityMatch (Marriage Matchmaking)

`compatibility_match` persists an Ashtakoota (Guna Milan) + Mangal Dosha
result for a bride/groom pair. Two distinct FK relations to `unified_chart`
(`MatchBride`/`MatchGroom`, i.e. `bride_chart_id`/`groom_chart_id`) encode the
role structurally — never a generic chart-pair + role enum, and never
inferred from `unified_chart.gender`.

- **Denormalized read columns**: `guna_score` (`Decimal(4,1)`, never rounded
  — half-points are load-bearing) and `verdict` both live outside the `result`
  JSONB specifically so `GET /api/matchmaking` (the list route) can select
  them without fetching the full snapshot — same rationale as `pipeline_run`
  keeping scalar `total_cost_usd` alongside its JSONB columns.
- **`result` is a verbatim, never-recomputed snapshot** (OD-5) — `GET
  /api/matchmaking/[id]` renders exactly what was persisted, even if
  `matchmakingTables.ts` changes later. `tables_version` records which table
  version produced it.
- **Indexes**: `user_id`, `bride_chart_id`, `groom_chart_id`, and a composite
  `(user_id, created_at)` for the list route's `WHERE user_id = ? ORDER BY
  created_at DESC` query.
- **No unique constraint on `(bride_chart_id, groom_chart_id)`** — deliberate:
  a practitioner may legitimately re-score the same pair after
  `MATCHMAKING_TABLES_VERSION` bumps.
- **Cascade**: no automatic FK cascade in Prisma, so
  `DELETE /api/unified-charts/[id]` explicitly
  `compatibility_match.deleteMany`s rows referencing the chart as bride *or*
  groom, in the same `$transaction`, before deleting the chart.

## Key Constraints

- `chart.chart_json` is NEVER updated after insert (immutable)
- `chart.chart_hash = sha256(chart_json)` — duplicate detection
- `wave_output` has unique constraint on `(run_id, agent_id)` — one row per agent per run
- `run_message` is append-only — no UPDATE or DELETE
- `pipeline_run.status` enum: `queued | running | done | failed | halted_for_review`
- `pipeline_run` has BOTH `chart_id` (required, legacy `Chart` FK) and
  `unified_chart_id` (nullable, `UnifiedChart` FK). AI Analysis from a unified chart
  ensures a matching legacy `Chart` exists (by `chart_hash`) and sets both.
- `pipeline_run.report_html` and `pipeline_run.report_markdown` are nullable
  `TEXT` columns and are the authoritative rendered-report storage. `report_path`
  is retained for local disk output and legacy report fallback only; do not make
  a report read depend on that path existing.
- `unified_chart.chart_hash` = SHA-256 of canonical input (birth params for compute,
  full JSON for paste) — duplicate detection; deleting a unified chart deletes its
  `pipeline_run` rows first (no automatic cascade in Prisma).
- `unified_chart.user_id` is a required FK to `user` — every chart is owned.
  Stamped from `resolveRequestUser` (`lib/auth.ts`) at create time, never
  trusted from the request body. Ownership mismatch → 404, never 403.
- `password_reset_token.token_hash` and `mcp_api_token.token_hash` store only
  a SHA-256 hash — the raw token is never persisted (emailed once for
  password reset, shown once in the UI for MCP tokens).
- `unified_chart` deletion also cascades `compatibility_match` rows
  (bride-side and groom-side) — added in the same change that introduced the
  `CompatibilityMatch` FK relation, so the FK never existed without the
  cascade.

## Prisma Usage Rules

- Always use Prisma Client for DB access (no raw SQL). The two exceptions are
  migration DDL and `scripts/load-places.ts`'s `TRUNCATE`/`ANALYZE` — see
  "The loader's raw-SQL exemption" above for the conditions that make them
  acceptable (maintenance DDL, frozen strings, zero interpolation)
- Singleton pattern in `lib/db.ts` (avoid multiple instances in dev hot-reload)
- Use `@default(uuid())` for all primary keys
- Use `@db.Timestamptz` for all datetime fields
- Use `@db.Decimal(10, 6)` for cost fields
- Run `npx prisma migrate dev` for schema changes
- Seed `model_config` table with default tier assignments via `prisma/seed.ts`

## Connection

```
# Local development: the values may be identical.
DATABASE_URL="postgresql://user:password@localhost:5432/vedicmojoai?schema=public"
DIRECT_URL="postgresql://user:password@localhost:5432/vedicmojoai?schema=public"
```

In Docker: host is `db` (service name in docker-compose).

On Vercel + Supabase, `DATABASE_URL` must be the transaction-pooler URL
(`pgbouncer=true&connection_limit=1`); `DIRECT_URL` must be the unpooled
database URL used by `prisma migrate deploy`. Keep `directUrl =
env("DIRECT_URL")` in `schema.prisma`; serverless application queries use the
pooled URL to avoid exhausting Postgres connections.

## Indexes

- `pipeline_run`: indexed on `chart_id`, `unified_chart_id`, `status`
- `wave_output`: indexed on `(run_id, domain)`, `(run_id, wave_number)`
- `run_message`: indexed on `run_id`
- `unified_chart`: indexed on `name`, `lagna`, `source`
- `compatibility_match`: indexed on `user_id`, `bride_chart_id`, `groom_chart_id`, `(user_id, created_at)`
