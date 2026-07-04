# VedicMojoAI — Entity Relationship Diagram (ERD)

**Version:** 1.0
**Last updated:** 2026-07-04
**Status:** Draft

---

## 1. Entity Relationship Diagram (Crow's Foot Notation)

```
┌──────────────────────────────────┐
│             CHART                │
│──────────────────────────────────│
│ PK  id               UUID        │
│     client_name      VARCHAR(255)│
│     lagna            VARCHAR(50) │
│     yogakaraka       VARCHAR(50) │  ← null for 6 lagnas
│     chart_json       JSONB       │  ← immutable, raw ChartInputV1
│     chart_hash       VARCHAR(64) │  ← sha256(chart_json), unique
│     moon_longitude   DECIMAL     │  ← extracted for dasha engine
│     birth_datetime   TIMESTAMPTZ │  ← extracted for dasha engine
│     created_at       TIMESTAMPTZ │
└──────────────────┬───────────────┘
                   │ 1
                   │
                   │ has many
                   │ ∞
┌──────────────────▼───────────────┐        ┌──────────────────────────────┐
│          PIPELINE_RUN            │        │         WAVE1_CACHE          │
│──────────────────────────────────│        │──────────────────────────────│
│ PK  id               UUID        │        │ PK  id            UUID       │
│ FK  chart_id         UUID ───────┼────────┤ UK  chart_hash    VARCHAR(64)│
│     run_type         VARCHAR(50) │        │     chart_summary TEXT       │
│     query_types      TEXT[]      │        │     wave1_delta   JSONB      │
│     user_query       TEXT        │        │     dasha_tree    JSONB      │
│     is_followup      BOOLEAN     │        │     created_at    TIMESTAMPTZ│
│     parent_run_id    UUID        │  ←─────┤     updated_at    TIMESTAMPTZ│
│     planner_output   JSONB       │  self- └──────────────────────────────┘
│     status    VARCHAR(20)        │  ref   (1:1 with Chart via chart_hash)
│     report_path      TEXT        │
│     total_token_in   INTEGER     │
│     total_token_out  INTEGER     │
│     total_cost_usd   DECIMAL     │
│     created_at       TIMESTAMPTZ │
│     completed_at     TIMESTAMPTZ │
└──────┬──────────────┬────────────┘
       │ 1            │ 1
       │              │
  has  │         has  │
  many │         many │
       │ ∞            │ ∞
┌──────▼───────────┐  ┌▼─────────────────────────────────┐
│   WAVE_OUTPUT    │  │          RUN_MESSAGE             │
│──────────────────│  │──────────────────────────────────│
│ PK id   UUID     │  │ PK  id            UUID           │
│ FK run_id  UUID  │  │ FK  run_id        UUID           │
│    agent_id      │  │     role    VARCHAR(20)          │
│    VARCHAR(10)   │  │     content TEXT                 │
│    wave_number   │  │     agent_id  VARCHAR(10)        │
│    INTEGER       │  │     created_at TIMESTAMPTZ       │
│    domain        │  └──────────────────────────────────┘
│    VARCHAR(30)   │   (stores conversation thread for
│    output_json   │    follow-ups; immutable after insert)
│    JSONB         │
│    fact_summary  │
│    TEXT          │  ← populated only for agent 4X
│    prompt_version│
│    VARCHAR(50)   │
│    model_id      │
│    VARCHAR(100)  │
│    provider      │
│    VARCHAR(50)   │
│    token_in      │
│    INTEGER       │
│    token_out     │
│    INTEGER       │
│    cost_usd      │
│    DECIMAL       │
│    status        │
│    VARCHAR(20)   │
│    error_message │
│    TEXT          │
│    started_at    │
│    TIMESTAMPTZ   │
│    completed_at  │
│    TIMESTAMPTZ   │
└──────────────────┘

┌──────────────────────────────────┐
│          MODEL_CONFIG            │
│──────────────────────────────────│
│ PK  id            UUID           │
│ UK  wave_id       VARCHAR(10)    │  ← '1A','2F','4C', etc.
│     model_id      VARCHAR(100)   │  ← 'claude-opus-4-5'
│     provider      VARCHAR(50)    │  ← 'anthropic'
│     temperature   DECIMAL        │
│     max_tokens    INTEGER        │
│     prompt_version VARCHAR(50)   │
│     updated_at    TIMESTAMPTZ    │
└──────────────────────────────────┘
(standalone config table; read by engine/llm.ts at runtime)
```

---

## 2. Entity Descriptions

### CHART
The root entity. One row per submitted birth chart.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK | Generated on insert |
| `client_name` | VARCHAR(255) | NOT NULL | Derived from ChartInputV1.meta or supplied by practitioner |
| `lagna` | VARCHAR(50) | NOT NULL | Derived from ChartInputV1 on submit |
| `yogakaraka` | VARCHAR(50) | NULLABLE | Null for Aries, Gemini, Virgo, Scorpio, Sagittarius, Pisces lagnas |
| `chart_json` | JSONB | NOT NULL | Immutable after insert. Full ChartInputV1 |
| `chart_hash` | VARCHAR(64) | UNIQUE NOT NULL | sha256(chart_json). Used for duplicate detection and Wave1Cache keying |
| `moon_longitude` | DECIMAL(8,4) | NOT NULL | Extracted on submit; sole input to computeVimshottari() |
| `birth_datetime` | TIMESTAMPTZ | NOT NULL | Extracted on submit; anchors dasha calendar dates |
| `created_at` | TIMESTAMPTZ | NOT NULL | Insert timestamp |

**Relationships:**
- Has many `PIPELINE_RUN` (1:N)
- Has one `WAVE1_CACHE` via `chart_hash` (1:0..1 — cache may not yet exist)

---

### PIPELINE_RUN
One row per analysis execution. A chart may have many runs (different domains, follow-ups).

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK | |
| `chart_id` | UUID | FK → CHART.id, NOT NULL | |
| `run_type` | VARCHAR(20) | NOT NULL | `first_query` or `followup` |
| `query_types` | TEXT[] | NOT NULL | e.g. `['health', 'wealth']` |
| `user_query` | TEXT | NULLABLE | Free-text practitioner question |
| `is_followup` | BOOLEAN | NOT NULL DEFAULT false | |
| `parent_run_id` | UUID | FK → PIPELINE_RUN.id, NULLABLE | Set when `is_followup = true` |
| `planner_output` | JSONB | NULLABLE | Resolved execution_plan + rationale |
| `status` | VARCHAR(20) | NOT NULL | `queued`, `running`, `done`, `failed`, `halted_for_review` |
| `report_path` | TEXT | NULLABLE | Relative path to HTML file; null until 4C completes |
| `total_token_in` | INTEGER | DEFAULT 0 | Sum of all agent token_in |
| `total_token_out` | INTEGER | DEFAULT 0 | Sum of all agent token_out |
| `total_cost_usd` | DECIMAL(10,6) | DEFAULT 0 | Sum of all agent cost_usd |
| `halt_reason` | JSONB | NULLABLE | Array of critical error objects from 4A; set when status = halted_for_review |
| `override_applied` | BOOLEAN | NOT NULL DEFAULT false | True if practitioner forced continuation past a critical halt |
| `created_at` | TIMESTAMPTZ | NOT NULL | |
| `completed_at` | TIMESTAMPTZ | NULLABLE | Set when status = done or failed |

**Relationships:**
- Belongs to one `CHART` (N:1)
- Has many `WAVE_OUTPUT` (1:N)
- Has many `RUN_MESSAGE` (1:N)
- Self-referential: `parent_run_id` → `PIPELINE_RUN.id` for follow-up chains

---

### WAVE1_CACHE
Keyed by `chart_hash`. Stores the expensive-to-compute foundation layer.
Populated on the first run of any chart. Reused on all subsequent runs.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK | |
| `chart_hash` | VARCHAR(64) | UNIQUE NOT NULL | Matches CHART.chart_hash |
| `chart_summary` | TEXT | NOT NULL | ~2KB compact summary, injected as prefix for all agents |
| `wave1_delta` | JSONB | NOT NULL | Combined delta output of agents 1A+1B+1C+1D |
| `dasha_tree` | JSONB | NOT NULL | Full 120-year Vimshottari tree from computeVimshottari() |
| `created_at` | TIMESTAMPTZ | NOT NULL | |
| `updated_at` | TIMESTAMPTZ | NOT NULL | Set if force_rerun_wave1 triggers a refresh |

**Relationships:**
- Logically belongs to `CHART` via `chart_hash` (not FK to avoid cascade issues)

---

### WAVE_OUTPUT
One row per agent per run. Captures delta output, token usage, prompt version, and model.
This is the audit trail and the source for context assembly.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK | |
| `run_id` | UUID | FK → PIPELINE_RUN.id, NOT NULL | |
| `agent_id` | VARCHAR(10) | NOT NULL | `1A`, `1B`, `2F`, `2G`, `4X`, `4C`, etc. |
| `wave_number` | INTEGER | NOT NULL | 1, 2, 3, 4 |
| `domain` | VARCHAR(30) | NOT NULL | `foundation`, `health`, `wealth`, `career`, `marriage`, `property`, `cross_domain`, `validation`, `synthesis` |
| `output_json` | JSONB | NULLABLE | Delta output from this agent |
| `fact_summary` | TEXT | NULLABLE | Populated only for agent `4X`; the consolidated ~6KB summary fed to 4C |
| `prompt_version` | VARCHAR(50) | NOT NULL | Version tag of the prompt file used |
| `model_id` | VARCHAR(100) | NOT NULL | e.g. `claude-sonnet-4-5` |
| `provider` | VARCHAR(50) | NOT NULL | `anthropic`, `openai`, `google` |
| `token_in` | INTEGER | NOT NULL DEFAULT 0 | |
| `token_out` | INTEGER | NOT NULL DEFAULT 0 | |
| `cost_usd` | DECIMAL(10,6) | NOT NULL DEFAULT 0 | |
| `status` | VARCHAR(20) | NOT NULL | `running`, `done`, `failed`, `skipped` |
| `error_message` | TEXT | NULLABLE | Populated on failure |
| `started_at` | TIMESTAMPTZ | NOT NULL | |
| `completed_at` | TIMESTAMPTZ | NULLABLE | |

**Relationships:**
- Belongs to one `PIPELINE_RUN` (N:1)

**Indexes:**
- `(run_id, agent_id)` UNIQUE — one row per agent per run
- `(run_id, domain)` — for domain-scoped follow-up queries
- `(run_id, wave_number)` — for wave-ordered retrieval

---

### RUN_MESSAGE
Conversation thread for follow-up queries. Append-only — never updated.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK | |
| `run_id` | UUID | FK → PIPELINE_RUN.id, NOT NULL | The run this message belongs to |
| `role` | VARCHAR(20) | NOT NULL | `user`, `assistant`, `system` |
| `content` | TEXT | NOT NULL | Message content |
| `agent_id` | VARCHAR(10) | NULLABLE | Set when role = assistant (which agent produced it) |
| `created_at` | TIMESTAMPTZ | NOT NULL | Ordering key for thread reconstruction |

**Relationships:**
- Belongs to one `PIPELINE_RUN` (N:1)

---

### MODEL_CONFIG
Runtime configuration for model/provider per agent. Read by engine at call time.
Supports per-wave model assignment from UI (Phase 2, US-6.2).

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK | |
| `wave_id` | VARCHAR(10) | UNIQUE NOT NULL | `1A`–`4C`, `4X`, `verification` |
| `model_id` | VARCHAR(100) | NOT NULL | e.g. `claude-haiku-4-5`, `claude-opus-4-5` |
| `provider` | VARCHAR(50) | NOT NULL | `anthropic`, `openai`, `google` |
| `temperature` | DECIMAL(3,2) | NOT NULL DEFAULT 0.3 | Wave 4 uses 0.0 |
| `max_tokens` | INTEGER | NOT NULL | Per-agent token budget cap |
| `prompt_version` | VARCHAR(50) | NOT NULL | Tracks which prompt version this config targets |
| `updated_at` | TIMESTAMPTZ | NOT NULL | |

**Default wave assignments:**

| Wave | Agents | Default Model |
|---|---|---|
| Wave 1 | 1A, 1B, 1C, 1D | claude-haiku-4-5 |
| Wave 2 | 2A–2G | claude-sonnet-4-5 |
| Wave 3 | 3A–3D | claude-sonnet-4-5 |
| Wave 4 — 4X, 4A, 4B | consolidation + QA | claude-sonnet-4-5 |
| Wave 4 — 4C | final synthesis | claude-opus-4-5 |
| Verification Agent | follow-ups | claude-sonnet-4-5 |

---

## 3. Full Relationship Summary

```
CHART ──────────────── 1:N ──────────────── PIPELINE_RUN
  │                                              │
  │                                    ┌─────────┼─────────┐
  │ (via chart_hash)                   │         │         │
  │                                   1:N       1:N    self-ref
  ▼                                    │         │   (parent_run_id)
WAVE1_CACHE                      WAVE_OUTPUT  RUN_MESSAGE
(1:0..1)

MODEL_CONFIG  (standalone, no FK — keyed by wave_id string)
```

---

## 4. Prisma Schema

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Chart {
  id             String        @id @default(uuid())
  clientName     String
  lagna          String
  yogakaraka     String?
  chartJson      Json
  chartHash      String        @unique
  moonLongitude  Decimal       @db.Decimal(8, 4)
  birthDatetime  DateTime      @db.Timestamptz
  createdAt      DateTime      @default(now()) @db.Timestamptz

  runs           PipelineRun[]

  @@map("chart")
}

model PipelineRun {
  id             String        @id @default(uuid())
  chartId        String
  chart          Chart         @relation(fields: [chartId], references: [id])
  runType        String        // 'first_query' | 'followup'
  queryTypes     String[]
  userQuery      String?
  isFollowup     Boolean       @default(false)
  parentRunId    String?
  parentRun      PipelineRun?  @relation("FollowupChain", fields: [parentRunId], references: [id])
  childRuns      PipelineRun[] @relation("FollowupChain")
  plannerOutput  Json?
  status         String        // 'queued' | 'running' | 'done' | 'failed' | 'halted_for_review'
  reportPath     String?
  totalTokenIn   Int           @default(0)
  totalTokenOut  Int           @default(0)
  totalCostUsd   Decimal       @default(0) @db.Decimal(10, 6)
  haltReason     Json?                      // Critical errors from 4A when halted
  overrideApplied Boolean      @default(false)
  createdAt      DateTime      @default(now()) @db.Timestamptz
  completedAt    DateTime?     @db.Timestamptz

  waveOutputs    WaveOutput[]
  messages       RunMessage[]

  @@index([chartId])
  @@index([status])
  @@map("pipeline_run")
}

model Wave1Cache {
  id           String   @id @default(uuid())
  chartHash    String   @unique
  chartSummary String
  wave1Delta   Json
  dashaTree    Json
  createdAt    DateTime @default(now()) @db.Timestamptz
  updatedAt    DateTime @updatedAt @db.Timestamptz

  @@map("wave1_cache")
}

model WaveOutput {
  id            String      @id @default(uuid())
  runId         String
  run           PipelineRun @relation(fields: [runId], references: [id])
  agentId       String      // '1A' | '1B' | ... | '4X' | '4C' | 'verification'
  waveNumber    Int
  domain        String      // 'foundation' | 'health' | 'wealth' | 'career' | ...
  outputJson    Json?
  factSummary   String?     // populated only for agentId = '4X'
  promptVersion String
  modelId       String
  provider      String
  tokenIn       Int         @default(0)
  tokenOut      Int         @default(0)
  costUsd       Decimal     @default(0) @db.Decimal(10, 6)
  status        String      // 'running' | 'done' | 'failed' | 'skipped'
  errorMessage  String?
  startedAt     DateTime    @db.Timestamptz
  completedAt   DateTime?   @db.Timestamptz

  @@unique([runId, agentId])
  @@index([runId, domain])
  @@index([runId, waveNumber])
  @@map("wave_output")
}

model RunMessage {
  id        String      @id @default(uuid())
  runId     String
  run       PipelineRun @relation(fields: [runId], references: [id])
  role      String      // 'user' | 'assistant' | 'system'
  content   String
  agentId   String?
  createdAt DateTime    @default(now()) @db.Timestamptz

  @@index([runId])
  @@map("run_message")
}

model ModelConfig {
  id            String   @id @default(uuid())
  waveId        String   @unique  // '1A' | '2F' | '4C' | 'verification' etc.
  modelId       String
  provider      String
  temperature   Decimal  @db.Decimal(3, 2)
  maxTokens     Int
  promptVersion String
  updatedAt     DateTime @updatedAt @db.Timestamptz

  @@map("model_config")
}
```

---

## 5. Key Constraints and Integrity Rules

| Rule | Enforced by |
|---|---|
| `chart_json` is never updated after insert | Application layer (no UPDATE on chart_json) |
| `chart_hash` is unique — duplicate detection at submission | DB UNIQUE constraint |
| One `WAVE_OUTPUT` row per agent per run | `@@unique([runId, agentId])` |
| `moon_longitude` must be 0–360 | Application validation before insert |
| Dasha tree integrity (sum = 120yr ± 1 day) | `DashaIntegrityError` thrown in engine before any run |
| `RUN_MESSAGE` rows are append-only | No UPDATE/DELETE exposed in API layer |
| `parent_run_id` FK must reference a `first_query` run | Application layer check in planner |
| `WAVE_OUTPUT.factSummary` only set for agentId = `4X` | Application layer |
| `yogakaraka` is nullable (6 lagnas have none) | DB NULLABLE column; all agents handle null |
| Report path set only after 4C completes | Orchestrator sets `reportPath` on `done` transition |
| Critical errors halt the pipeline before 4B | Orchestrator checks `4A.critical_errors > 0`; sets status to `halted_for_review` |
| Override decision is permanent and auditable | `override_applied = true` + report carries watermark |
