# VedicMojoAI — Database & Prisma Conventions

## Database: PostgreSQL (via Prisma ORM)

## Entities

| Table | Purpose | Key Fields |
|---|---|---|
| `chart` | Immutable birth chart record | `id`, `chart_hash` (unique), `chart_json` (JSONB), `moon_longitude`, `birth_datetime` |
| `pipeline_run` | One per analysis execution | `chart_id` (FK), `unified_chart_id` (nullable FK), `status`, `query_types[]`, `planner_output`, `halt_reason`, `override_applied` |
| `wave1_cache` | Foundation layer cache | `chart_hash` (unique), `chart_summary`, `wave1_delta`, `dasha_tree` |
| `wave_output` | Per-agent per-run audit trail | `run_id` + `agent_id` (unique), `output_json`, `token_in/out`, `cost_usd` |
| `run_message` | Conversation thread (append-only) | `run_id`, `role`, `content`, `agent_id` |
| `model_config` | Runtime model/provider per agent | `wave_id` (unique), `model_id`, `provider`, `temperature`, `max_tokens` |
| `unified_chart` | **Canonical chart store** (Generate Chart + AI Analysis) | `id`, `source` (`compute`\|`paste`), `chart_hash` (unique), one JSONB column per domain, `chart_input_v1` |
| `saved_chart` | Legacy computed chart store (superseded by `unified_chart`) | `id`, `input_hash` (unique), `chart_data` (JSONB), `dasha_tree` |

## UnifiedChart (column-per-domain)

`unified_chart` is the current canonical chart table. One JSONB column per domain
lets the AI pipeline read exactly what it needs and lets the compute path skip LLM
Wave 1.

- **Scalar index fields** (for list/filter without parsing JSONB): `name`, `source`,
  `lagna`, `lagna_longitude`, `moon_longitude`, `ayanamsa`, `birth_datetime`.
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

## Key Constraints

- `chart.chart_json` is NEVER updated after insert (immutable)
- `chart.chart_hash = sha256(chart_json)` — duplicate detection
- `wave_output` has unique constraint on `(run_id, agent_id)` — one row per agent per run
- `run_message` is append-only — no UPDATE or DELETE
- `pipeline_run.status` enum: `queued | running | done | failed | halted_for_review`
- `pipeline_run` has BOTH `chart_id` (required, legacy `Chart` FK) and
  `unified_chart_id` (nullable, `UnifiedChart` FK). AI Analysis from a unified chart
  ensures a matching legacy `Chart` exists (by `chart_hash`) and sets both.
- `unified_chart.chart_hash` = SHA-256 of canonical input (birth params for compute,
  full JSON for paste) — duplicate detection; deleting a unified chart deletes its
  `pipeline_run` rows first (no automatic cascade in Prisma).

## Prisma Usage Rules

- Always use Prisma Client for DB access (no raw SQL)
- Singleton pattern in `lib/db.ts` (avoid multiple instances in dev hot-reload)
- Use `@default(uuid())` for all primary keys
- Use `@db.Timestamptz` for all datetime fields
- Use `@db.Decimal(10, 6)` for cost fields
- Run `npx prisma migrate dev` for schema changes
- Seed `model_config` table with default tier assignments via `prisma/seed.ts`

## Connection

```
DATABASE_URL="postgresql://user:password@localhost:5432/vedicmojoai?schema=public"
```

In Docker: host is `db` (service name in docker-compose).

## Indexes

- `pipeline_run`: indexed on `chart_id`, `unified_chart_id`, `status`
- `wave_output`: indexed on `(run_id, domain)`, `(run_id, wave_number)`
- `run_message`: indexed on `run_id`
- `unified_chart`: indexed on `name`, `lagna`, `source`
