# Entity-Relationship Diagram (ERD) — VedicMojoAI

**Version:** 1.6
**Last updated:** 2026-08-07
**Status:** Draft

> **Maintenance rule:** Whenever the data model changes (new table, column, index,
> relation, or ingestion path), update this ERD **and** the AI Skills, HLD, and DFD
> in the same change. See `Agents.md → Documentation Maintenance`.

## What changed in v1.6

- **Vercel & Supabase Deployment** (`.kiro/specs/vercel-supabase-deployment/`):
  `PipelineRun` gains two nullable `@db.Text` columns, `reportHtml` and
  `reportMarkdown` (migration `20260807120614_add_database_reports`) — the
  full rendered report content, written by `engine/renderer.ts` alongside the
  existing `reportPath`. This exists because Vercel's serverless filesystem is
  read-only: `GET /api/runs/[id]/report-content` now reads these DB columns
  first, falling back to disk only for legacy pre-migration reports.
  `prisma/schema.prisma`'s `datasource` block also gains `directUrl =
  env("DIRECT_URL")` — `DATABASE_URL` points at the Supabase connection
  pooler for normal queries, `DIRECT_URL` at the unpooled connection Prisma
  needs to run migrations. No schema change for this half — connection
  routing only.

## What changed in v1.5

- Added **`CompatibilityMatch`** (migration `20260806083347_add_matchmaking_and_gender`,
  denormalized `verdict` column + `(userId, createdAt)` index added in
  `20260806100000_matchmaking_verdict_index`) — persisted Ashtakoota (Guna
  Milan) + Mangal Dosha results for the **Marriage Matchmaking**
  (`.kiro/specs/marriage-matchmaking/`) feature. Two named relations to
  `UnifiedChart` (`MatchBride`/`MatchGroom`) encode bride/groom role
  structurally — never a generic pair + role enum. See "Marriage Matchmaking"
  below.
- `UnifiedChart` gains `gender String?` — nullable, additive-only. Pre-fills
  the matchmaking picker's chart labels only; never used to infer a
  bride/groom role. Backfilled from `chartInputV1.meta.gender` by
  `prisma/backfill-gender.ts` (values normalized/validated via
  `lib/chart-mapper.ts`'s exported `toGender`).
- `DELETE /api/unified-charts/[id]` gained a `compatibilityMatch.deleteMany`
  step in its existing cascade `$transaction`, before the chart delete — a
  chart referenced by a saved match is no longer left dangling (a regression
  this feature would otherwise have reintroduced into an existing, shipped
  delete path).

## What changed in v1.4

- Added four MCP OAuth authorization server tables (migration
  `20260805152930_add_oauth_provider`): **`OAuthClient`**,
  **`OAuthAuthorizationCode`**, **`OAuthAccessToken`**,
  **`OAuthRefreshToken`**. A second, additional way to get a token for
  `POST /api/mcp` — the existing `McpApiToken` flow is unaffected. See
  "MCP OAuth Authorization Server" below.

## What changed in v1.3

- Added six User Management tables (`.kiro/specs/user-management/`): **`User`**,
  **`Account`**/**`VerificationToken`** (Auth.js adapter shape, unused in v1 — no
  OAuth providers), **`Session`** (database-backed sessions), **`PasswordResetToken`**,
  **`McpApiToken`**.
- `UnifiedChart` gains a required `userId` FK → `User` (nullable during the
  `prisma/backfill-owner.ts` migration window, then tightened to `NOT NULL` —
  see "UnifiedChart ownership" below). All chart CRUD, AI Analysis, Duration
  Analysis, and MCP-facing routes now resolve a caller identity
  (`lib/auth.ts`'s `resolveRequestUser`) and enforce ownership, 404 on mismatch.
- `lib/mcpAuth.ts`'s `requireMcpToken` (static shared-secret gate) is replaced by
  `resolveMcpUser` — resolves a per-user `McpApiToken` hash to a `userId` instead
  of a boolean allow/deny.

## What changed in v1.1

- Added the **`UnifiedChart`** table.
- `PipelineRun` links to both `Chart` and `UnifiedChart`.
- New deterministic domain columns on `UnifiedChart`.

## What changed in v1.2

- Added **`DurationAnalysis`** and **`DurationMessage`** tables — the new Duration Analysis feature's own 3-agent pipeline, separate from the 18-agent wave pipeline.
- `DurationAnalysis` links to `UnifiedChart` (foreign key) and has its own agent output columns (JSONB), error tracking (`errorMessage`), and override flag.
- `UnifiedChart` gains a `durationAnalyses` reverse relation.
- Vimshottari dasha tree now stores **all 729 PD entries** (9 MD × 9 AD × 9 PD) instead of only current + next MD. `AntarDasha.pratyantardashas` is now a required field (non-optional array).

## Complete ERD

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         PostgreSQL Database                              │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────────────────┐       1:N       ┌──────────────────────────┐
│       Chart          │────────────────▶│     PipelineRun          │
│ (Analysis Input)     │                 │ (AI Analysis Execution)  │
├──────────────────────┤                 ├──────────────────────────┤
│ PK id          UUID  │                 │ PK id            UUID    │
│    clientName  TEXT   │                 │ FK chartId       UUID    │
│    lagna       TEXT   │                 │    runType       TEXT    │
│    yogakaraka  TEXT?  │                 │    queryTypes    TEXT[]  │
│    chartJson   JSONB  │◀─ Full         │    userQuery     TEXT?   │
│    chartHash   TEXT   │   ChartInputV1 │    isFollowup    BOOL   │
│    moonLongitude DEC  │   (raw input)  │ FK parentRunId   UUID?  │
│    birthDatetime TSTZ │                 │    plannerOutput JSONB?  │
│    createdAt   TSTZ   │                 │    status        TEXT    │
└──────────────────────┘                 │    reportPath    TEXT?   │
                                          │    reportHtml    TEXT?   │
                                          │    reportMarkdown TEXT?  │
                                          │    totalTokenIn   INT    │
                                          │    totalTokenOut  INT    │
                                          │    totalCostUsd   DEC    │
                                          │    haltReason    JSONB?  │
                                          │    overrideApplied BOOL  │
                                          │    createdAt     TSTZ    │
                                          │    completedAt   TSTZ?   │
                                          └──────────────────────────┘
                                                    │ 1:N         │ 1:N
                                                    ▼             ▼
                                          ┌──────────────┐  ┌──────────────┐
                                          │  WaveOutput  │  │  RunMessage  │
                                          ├──────────────┤  ├──────────────┤
                                          │ PK id   UUID │  │ PK id   UUID │
                                          │ FK runId UUID│  │ FK runId UUID│
                                          │ agentId TEXT │  │ role     TEXT│
                                          │ waveNumber INT│  │ content  TEXT│
                                          │ domain   TEXT│  │ agentId TEXT?│
                                          │ outputJson J?│  │ createdAt TSZ│
                                          │ factSummary? │  └──────────────┘
                                          │ promptVersion│
                                          │ modelId  TEXT│
                                          │ provider TEXT│
                                          │ tokenIn  INT │
                                          │ tokenOut INT │
                                          │ costUsd  DEC │
                                          │ status   TEXT│
                                          │ errorMsg TEXT?│
                                          │ startedAt TSZ│
                                          │ completedAt? │
                                          └──────────────┘

┌──────────────────────┐                  ┌──────────────────────────┐
│    Wave1Cache        │                  │      SavedChart          │
│ (Compute Cache)      │                  │ (Saved Computed Charts)  │
├──────────────────────┤                  ├──────────────────────────┤
│ PK id       UUID     │                  │ PK id            UUID    │
│    chartHash TEXT (U) │                  │    name          TEXT    │
│    chartSummary TEXT  │                  │    birthDate     TEXT    │
│    wave1Delta JSONB   │                  │    birthTime     TEXT    │
│    dashaTree  JSONB   │                  │    timezone      DEC     │
│    createdAt  TSTZ    │                  │    latitude      DEC     │
│    updatedAt  TSTZ    │                  │    longitude     DEC     │
└──────────────────────┘                  │    sunriseMode   TEXT    │
                                          │    lagna         TEXT    │
┌──────────────────────┐                  │    lagnaLongitude DEC    │
│    ModelConfig       │                  │    moonLongitude DEC     │
├──────────────────────┤                  │    ayanamsa      DEC     │
│ PK id       UUID     │                  │    chartData     JSONB ◀─┐
│    waveId   TEXT (U)  │                  │    dashaTree     JSONB?  │
│    modelId  TEXT      │                  │    inputHash     TEXT(U) │
│    provider TEXT      │                  │    createdAt     TSTZ    │
│    temperature DEC    │                  │    updatedAt     TSTZ    │
│    maxTokens  INT     │                  └──────────────────────────┘
│    promptVersion TEXT │                            ▲
│    updatedAt  TSTZ    │                            │
└──────────────────────┘                     Full ComputedChart
                                             JSON blob (see below)
```

---

## UnifiedChart (Generate Chart + AI Analysis backbone)

`UnifiedChart` is the current canonical chart store. A single table holds all
chart data regardless of how it was ingested, using **one JSONB column per
domain**. This lets the AI pipeline read exactly the domain it needs and lets the
compute path skip LLM Wave 1 entirely.

**Gochar note (no schema change):** `POST /api/gochar` is a read-only compute
path. For a saved chart it reads the existing `moonLongitude` and
`lagnaLongitude` scalar fields; for unsaved birth data it derives the same two
values in memory. Gochar intervals are never persisted, and this feature adds no
table, column, index, relation, or migration.

```
┌───────────────────────────────────────────────┐    1:N (nullable)   ┌──────────────────────┐
│              UnifiedChart                      │────────────────────▶│     PipelineRun      │
│  (column-per-domain chart store)              │  unifiedChartId FK  │  "UnifiedChartRuns"  │
├───────────────────────────────────────────────┤                     └──────────────────────┘
│ PK id                UUID                      │
│    name              TEXT   (idx)              │
│    source            TEXT   "compute"|"paste" (idx) │
│    birthInput        JSONB? (BirthInput | ChartMeta)│
│ ── scalar index fields ──                      │
│    lagna             TEXT   (idx)              │
│    lagnaLongitude    DEC                       │
│    moonLongitude     DEC                       │
│    ayanamsa          DEC                       │
│    birthDatetime     TSTZ                      │
│    gender            TEXT?  "male"|"female"|"other" (v1.5) │
│ ── domain JSONB columns (compute engine) ──    │
│    planets           JSONB?  PlanetPosition[]  │
│    nakshatras        JSONB?  NakshatraInfo[]   │ ← 9 grahas + 'Ascendant'
│    divisionalCharts  JSONB?  DivisionalChart[] │
│    karakas           JSONB?  CharaKaraka[]     │
│    ashtakavarga      JSONB?  AshtakavargaResult│
│    upagrahas         JSONB?  Upagraha[]        │
│    specialLagnas     JSONB?  SpecialLagna[]    │
│    arudhaPadas       JSONB?  ArudhaPada[]      │
│    relationships     JSONB?  RelationshipGeometry (1D) │
│    shadbala          JSONB?  ShadbalResult (1C)│
│    jaimini           JSONB?  JaiminiGeometry   │
│    bhavaBala         JSONB?  BhavaBalaResult   │
│    transits          JSONB?  TransitAnalysis   │
│    pindaStrength     JSONB?  PindaStrengthEntry[] │
│    dashaTree         JSONB?  Serialized DashaTree │
│    yogas             JSONB?  Yoga[] (named-yoga catalogue) │
│ ── AI pipeline input ──                        │
│    chartInputV1      JSONB?  ChartInputV1      │
│ ── dedup & provenance ──                       │
│    chartHash         TEXT     SHA-256          │
│    sunriseMode       TEXT   default "precise"  │
│ ── ownership (v1.3) ──                         │
│ FK userId            TEXT   → User.id          │
│    createdAt         TSTZ                      │
│    updatedAt         TSTZ                      │
└───────────────────────────────────────────────┘
```

### Two ingestion paths (the `source` column)

| Source | Origin | Domain columns | `chartInputV1` | Wave 1 on AI Analysis |
|---|---|---|---|---|
| `compute` | Birth data → deterministic Swiss Ephemeris engine (Path A) | Fully populated | `null` (synthesized on demand) | **Skipped** — `wave1_delta` built from domain columns |
| `paste` | Practitioner-supplied `ChartInputV1` JSON (Path B) | `null` | Full pasted input | **Full Wave 1–4** LLM pipeline |

- Deduplication: `chartHash` is SHA-256 of the canonical input (birth params for
  compute, full JSON for paste). Unique per-user (`@@unique([userId, chartHash])`,
  not globally) — two practitioners can each independently save a chart for the
  same birth data (e.g. a shared client). Duplicate submissions by the *same*
  user return their existing record.
- Format mapping lives in `lib/chart-mapper.ts`
  (`mapComputedToUnified`, `mapPastedToUnified`, `buildChartInputV1FromUnified`).
- `relationships`, `shadbala`, `jaimini`, `bhavaBala` are produced by the
  deterministic engine modules and stand in for the LLM Wave 1 agents (1C/1D)
  on the compute path.
- `yogas` (`engine/compute/yogas.ts`, added by the `named-yoga-engine` spec) is a
  chart-wide, evidence-carrying named-yoga catalogue computed deterministically from
  `relationships` + `dignity.ts` — Pancha Mahapurusha, Raja (incl. a distinctly-keyed
  `raja.dka` for Dharma-Karmadhipati), Dhana, Viparita (Harsha/Sarala/Vimala),
  Neechabhanga, the lunar yogas, Gaja Kesari, Budha-Aditya, Parivartana, and Kartari.

---

## User Management (v1.3) — `.kiro/specs/user-management/`

Six new tables, all net-new (the repo had zero auth infrastructure before this
feature). Auth.js (NextAuth v5) with `@auth/prisma-adapter`, using
**database-backed sessions** and **no Credentials provider** (`providers: []`
— see below for why). `Account` and `VerificationToken` are the adapter's
standard OAuth shape, unused in v1 (no OAuth providers) but kept so the
adapter works as documented and OAuth can be added later without a schema
migration.

```
┌──────────────────────┐    1:N     ┌──────────────────────┐
│         User          │───────────▶│       Session         │
├──────────────────────┤            ├──────────────────────┤
│ PK id           UUID   │            │ PK id           UUID  │
│    email        TEXT(U)│            │    sessionToken TEXT(U)│
│    passwordHash TEXT   │            │ FK userId       UUID  │
│    name         TEXT?  │            │    expires      TSTZ  │
│    createdAt    TSTZ   │            └──────────────────────┘
│    updatedAt    TSTZ   │
└──────────────────────┘
   │ 1:N          │ 1:N              │ 1:N               │ 1:N
   ▼              ▼                  ▼                   ▼
┌──────────┐ ┌──────────────────┐ ┌──────────────────────┐ ┌──────────────────┐
│ Account  │ │PasswordResetToken │ │    McpApiToken        │ │  UnifiedChart     │
│(unused,  │ ├──────────────────┤ ├──────────────────────┤ │ (userId FK, v1.3) │
│OAuth shape)│PK id        UUID  │ │ PK id           UUID  │ └──────────────────┘
│          │ │FK userId    UUID  │ │ FK userId       UUID  │
│          │ │   tokenHash TEXT(U)│ │    tokenHash    TEXT(U)│
│          │ │   expiresAt TSTZ  │ │    label        TEXT? │
│          │ │   usedAt    TSTZ? │ │    lastUsedAt   TSTZ? │
│          │ │   createdAt TSTZ  │ │    revokedAt    TSTZ? │
│          │ └──────────────────┘ │    createdAt    TSTZ  │
└──────────┘                      └──────────────────────┘

┌──────────────────────┐
│  VerificationToken    │  (Auth.js adapter shape, unused in v1 — no OAuth/email providers)
├──────────────────────┤
│    identifier   TEXT  │
│    token        TEXT(U)│
│    expires      TSTZ  │
└──────────────────────┘
```

- **`User`** — one row per practitioner account. `passwordHash` is bcrypt
  (cost 12, `lib/passwords.ts`). Open self-serve signup, no email verification
  (`POST /api/auth/signup`).
- **`Session`** — database-backed sessions (not JWT). Created/deleted directly
  via the Prisma adapter's `createSession`/`deleteSession` by the custom
  `app/api/auth/{login,logout,signup}` routes — Auth.js's own `signIn()` is
  never called for credentials (see `lib/auth.ts`'s file-header comment for
  why: `@auth/core`'s `assertConfig` hard-errors on "Credentials + database
  sessions" if a Credentials provider is registered at all, so `providers: []`
  and credential verification is fully custom).
- **`PasswordResetToken`** — `tokenHash` is SHA-256 of a random 32-byte token;
  the raw token is only ever emailed (Resend, `lib/email.ts`), never stored.
  ~45-minute expiry. On successful reset, every `Session` row for that
  `userId` is deleted in the same transaction (all other logins invalidated).
- **`McpApiToken`** — lets the MCP stdio process (`mcp/`) authenticate as a
  specific `User` via the `x-mcp-token` header, replacing the old
  `MCP_TOKEN` shared-secret gate. `tokenHash` is SHA-256 of a random 32-byte
  token; the raw value is shown exactly once at generation
  (`POST /api/account/mcp-token`, session-only) and never persisted or
  re-displayed. v1 supports **one active token per user** — generating a new
  one revokes the old one. `lastUsedAt` is updated best-effort on each
  successful resolution and surfaced in the account settings UI.
- **`UnifiedChart.userId`** — required FK to `User` (see the updated
  `UnifiedChart` diagram above). Added nullable first, backfilled via
  `prisma/backfill-owner.ts` (assigns every unowned chart to one operator
  account), then tightened to `NOT NULL` in a follow-up migration —
  the same additive-then-tighten pattern as `npm run db:migrate-saved`.
- **Identity resolution** (`lib/auth.ts`'s `resolveRequestUser`): tries the
  session cookie first (`auth()`), falls back to `lib/mcpAuth.ts`'s
  `resolveMcpUser` (the `x-mcp-token` header). Every ownership check in the
  app — `UnifiedChart`, `PipelineRun`, `DurationAnalysis`, reports — is
  written once against this single function, so browser sessions and MCP
  tokens are handled identically. Cross-account access returns **404, never
  403** (avoids confirming a resource's existence to a non-owner).
  Injected into the compute-path `wave1_delta` under `1D` so Wave 2A (`2A` Yoga
  Detection) validates/interprets it instead of re-deriving formation; also read by
  the Duration-Analysis slicer (`sliceDashaTree`, which filters the catalogue by the
  running MD/AD lord) and exposed read-only over MCP (`get_yogas`). `null` on
  `source="paste"` charts, which have no computed geometry to build it from.

---

## Marriage Matchmaking (v1.5) — `.kiro/specs/marriage-matchmaking/`

One new table. Persists an Ashtakoota (Guna Milan, 36-point) + Mangal Dosha
(Kuja Dosha) result for a bride/groom pair of `UnifiedChart` rows.

```
┌──────────────────────┐  N:1 (MatchBride)  ┌──────────────────────────┐
│      UnifiedChart      │◀────────────────────│   CompatibilityMatch      │
│  (as bride)            │                     ├──────────────────────────┤
└──────────────────────┘  N:1 (MatchGroom)    │ PK id              UUID   │
┌──────────────────────┐◀────────────────────│ FK userId          UUID   │
│      UnifiedChart      │                     │ FK brideChartId    UUID   │──▶ UnifiedChart
│  (as groom)            │                     │ FK groomChartId    UUID   │──▶ UnifiedChart
└──────────────────────┘                     │    label           TEXT?  │
                                              │    gunaScore       DEC(4,1)│
                                              │    verdict         TEXT   │ ← denormalized (v1.5),
                                              │    result          JSONB  │   avoids fetching the
                                              │    tablesVersion   TEXT   │   full result JSONB just
                                              │    createdAt       TSTZ   │   for the list view
                                              │                          │
                                              │ IDX: userId, brideChartId,│
                                              │      groomChartId,        │
                                              │      (userId, createdAt)  │
                                              │ MAP: compatibility_match  │
                                              └──────────────────────────┘
```

- **Role encoding is structural, not conventional.** `brideChartId`/
  `groomChartId` (two distinct named FK relations, `MatchBride`/`MatchGroom`)
  ARE the role — there is no separate `roles` object or generic pair + enum.
  `UnifiedChart.gender` is only ever an informational label in the UI picker;
  nothing in the schema or API infers a role from it.
- **`gunaScore` and `verdict` are denormalized off `result`** (the persisted
  full `MatchResult` JSON) for the same reason `PipelineRun` keeps scalar
  `totalTokenIn`/`totalCostUsd` alongside its JSONB columns — `GET
  /api/matchmaking` (the list route) needs both for its summary rows and must
  not fetch the full `result` blob just to read two nested fields.
  `gunaScore` is `Decimal(4,1)` (never rounded — half-points from Vashya,
  Graha Maitri, and Tara are load-bearing) and MUST be written from the raw
  JS number, never `.toFixed()`'d.
- **`result` is the verbatim, never-recomputed snapshot** — `GET
  /api/matchmaking/[id]` renders it as-is (OD-5); a later change to
  `matchmakingTables.ts` does not retroactively change what a practitioner
  already saw. `tablesVersion` (from `engine/compute/matchmakingTables.ts`'s
  `MATCHMAKING_TABLES_VERSION`) records which table version produced the
  stored score, mirroring `WEIGHTS_VERSION`'s precedent elsewhere.
- **No automatic cascade on chart delete** — Prisma doesn't cascade by
  default, so `DELETE /api/unified-charts/[id]` explicitly
  `compatibilityMatch.deleteMany`s any row referencing the chart as bride
  *or* groom, in the same `$transaction`, before deleting the chart itself.
- **Ownership**: `userId` stamped from `resolveRequestUser` at create time,
  same pattern as `UnifiedChart.userId`. Cross-account access to a match, or
  to either referenced chart, returns 404 (never 403).
- **No dedup / uniqueness constraint on `(brideChartId, groomChartId)`** —
  deliberate, not an oversight: a practitioner may legitimately re-score the
  same pair after `MATCHMAKING_TABLES_VERSION` bumps, or want multiple
  labeled attempts. A hard uniqueness constraint would block that.

---

## MCP OAuth Authorization Server (v1.4) — a second way to get a token for `POST /api/mcp`

Four new tables, all net-new. Lets an OAuth-aware remote MCP client (e.g.
claude.ai's "Add custom connector") obtain a token via browser login +
consent — the existing `McpApiToken` generate-and-paste flow above is
completely unaffected; this is an additional path, not a replacement.
Hand-rolled as plain Next.js Route Handlers rather than using
`@modelcontextprotocol/sdk`'s Express-only OAuth toolkit (incompatible with
this app's Vercel-serverless design) — see `docs/HLD.md` §3.9.

```
┌──────────────────────┐    1:N     ┌──────────────────────────┐
│         User          │───────────▶│   OAuthAuthorizationCode   │
└──────────────────────┘            ├──────────────────────────┤
   │ 1:N              │ 1:N          │ PK id              UUID   │
   ▼                  ▼              │    codeHash        TEXT(U)│
┌──────────────────┐ ┌──────────────┐│ FK clientId        UUID   │
│ OAuthAccessToken  │ │OAuthRefresh  ││ FK userId          UUID   │
├──────────────────┤ │Token         ││    redirectUri     TEXT   │
│ PK id       UUID  │ ├──────────────┤│    codeChallenge   TEXT   │
│    tokenHash TEXT(U)│PK id    UUID │ │    codeChallengeMethod   │
│ FK clientId UUID  │ │  tokenHash(U)│ │                    TEXT   │
│ FK userId   UUID  │ │FK clientId   │ │    resource        TEXT? │
│    resource TEXT? │ │FK userId     │ │    scope           TEXT? │
│    scope    TEXT? │ │  scope TEXT? │ │    expiresAt       TSTZ  │
│    expiresAt TSTZ │ │  expiresAt   │ │    usedAt          TSTZ? │
│    createdAt TSTZ │ │  revokedAt?  │ │    createdAt       TSTZ  │
└──────────────────┘ │  createdAt   │ └──────────────────────────┘
        ▲             └──────────────┘              ▲
        └───────────────────┬─────────────────────────┘
                             │ N:1
                      ┌──────────────────────┐
                      │      OAuthClient       │
                      ├──────────────────────┤
                      │ PK id           UUID   │
                      │    clientId     TEXT(U)│  ← the public RFC 7591 client_id
                      │    clientSecretHash TEXT?│  ← always null in v1 (PKCE-only clients)
                      │    clientName   TEXT?  │
                      │    redirectUris TEXT[] │
                      │    grantTypes   TEXT[] │
                      │    responseTypes TEXT[]│
                      │    tokenEndpointAuthMethod TEXT│
                      │    createdAt    TSTZ   │
                      └──────────────────────┘
```

- **`OAuthClient`** — one row per dynamically-registered client
  (`POST /api/oauth/register`, RFC 7591). Every v1 client is treated as
  **public/PKCE-only**: `clientSecretHash` is always `null` and
  `tokenEndpointAuthMethod` is always `'none'` — matches how claude.ai
  itself registers. `redirectUris` is the sole trusted destination set for
  that client; `/oauth/authorize` and `/api/oauth/authorize-decision` both
  check a candidate `redirect_uri` against it with an **exact string
  match**, never prefix/substring (the open-redirect guard).
- **`OAuthAuthorizationCode`** — short-lived (~5 min), single-use. `codeHash`
  is SHA-256 of a random 32-byte code, hashed at rest for the same
  defense-in-depth reason as `PasswordResetToken`/`McpApiToken` despite the
  short TTL. Consumed via an **atomic conditional `updateMany`** claim
  (`usedAt: null` → set `usedAt`, checking the affected-row count is exactly
  1) rather than read-then-write, which would be a replay race — the
  authorization-code analog of the `usedAt` pattern `PasswordResetToken`
  already uses, but tightened because RFC 6749 §4.1.2 requires the code
  never be usable twice, not just discouraged.
- **`OAuthAccessToken`** / **`OAuthRefreshToken`** — bearer tokens minted by
  `POST /api/oauth/token`. `tokenHash` is SHA-256, same pattern. Access
  tokens are short-lived (~1 hr); refresh tokens (~90 days) are **rotated on
  every use** — the presented refresh token is atomically revoked
  (`revokedAt`) in the same claim that authorizes minting its replacement.
  Newly-issued access-token raw values carry a `mcp_oat_` prefix (refresh:
  `mcp_ort_`) so `lib/mcpAuth.ts`'s `resolveMcpUser` can branch to this table
  instead of `McpApiToken` without a blind lookup against both on every MCP
  call.
- **Known v1 simplification**, stated explicitly (same spirit as
  `McpApiToken`'s "one active token per user"): no refresh-token-family
  tracking. A replayed (already-rotated) refresh token is rejected on that
  one request but doesn't cascade-revoke the rest of its lineage.

---

## Where is D1, D4 Planet Chart Data Stored?

Divisional chart data (D1, D2, D3, D4, D5, D6, D7, D9, D10, D12, D24, D30, D60) is stored **inside the `chartData` JSONB column** of the `saved_chart` table (and similarly inside `chartJson` of the `chart` table for analysis-input charts).

### Path within `chartData` JSON:

```
chartData.divisionalCharts[] → Array of DivisionalChart objects
```

Each `DivisionalChart` object has:

```json
{
  "division": 1,              // D1=1, D4=4, D7=7, D9=9, D10=10, D30=30
  "name": "Rashi",            // Human-readable name
  "shortName": "D1",
  "lagna": "Taurus",          // Varga lagna sign
  "lagnaSignNumber": 2,
  "lagnaDegreee": 15.23,
  "planets": [                // ◀── D1/D4 planet placements
    {
      "planet": "Sun",
      "sign": "Taurus",
      "signNumber": 2,
      "house": 1,
      "retrograde": false
    },
    ...
  ],
  "arudhaPadas": [...],       // A1–A12 for this varga
  "specialLagnas": [...],     // HL, GL, BL etc. projected into this varga
  "upagrahas": [...]          // Dhuma, Gulika etc. projected into this varga
}
```

### Access pattern:
- **D1 planets**: `chartData.divisionalCharts.find(c => c.division === 1).planets`
- **D4 planets**: `chartData.divisionalCharts.find(c => c.division === 4).planets`
- **D9 planets**: `chartData.divisionalCharts.find(c => c.division === 9).planets`

---

## Where is Upagraha Data Stored?

Upagrahas are stored at **two levels**:

### 1. Top-level (D1 positions with full longitude):
```
chartData.upagrahas[] → Array of Upagraha objects
```

```json
{
  "name": "Gulika",
  "abbr": "Gu",
  "longitude": 245.67,       // Absolute sidereal longitude
  "sign": "Sagittarius",
  "signNumber": 9,
  "degreeInSign": 5.67,
  "house": 8                 // House from lagna
}
```

Includes: Dhuma, Vyatipata, Parivesh, Indrachapa, Upaketu, Gulika, Mandi

### 2. Per-varga projected positions:
```
chartData.divisionalCharts[n].upagrahas[] → Array of ChartPointMark
```

```json
{
  "abbr": "Gu",
  "signNumber": 3,          // Sign in that specific varga
  "house": 2                // House from that varga's lagna
}
```

---

## Where is Lagna (Ascendant) Data Stored?

### Top-level lagna (natal D1):
```
chartData.lagna            → "Taurus" (sign name)
chartData.lagnaSignNumber  → 2
chartData.lagnaLongitude   → 45.23 (absolute sidereal degrees)
chartData.lagnaDegreeInSign → 15.23 (degrees within sign)
```

### Per-varga lagnas:
```
chartData.divisionalCharts[n].lagna           → sign name in that varga
chartData.divisionalCharts[n].lagnaSignNumber  → sign number in that varga
chartData.divisionalCharts[n].lagnaDegreee     → degree within lagna sign
```

### Special Lagnas (HL, GL, BL, SL, VL, IL, KL, BBL, KS, PL):
```
chartData.specialLagnas[] → Array of SpecialLagna objects
```

```json
{
  "name": "Hora Lagna",
  "abbr": "HL",
  "longitude": 67.89,
  "sign": "Gemini",
  "signNumber": 3,
  "degreeInSign": 7.89,
  "house": 2
}
```

Also projected per-varga: `chartData.divisionalCharts[n].specialLagnas[]`

---

## Complete Data Hierarchy (chartData JSONB structure)

```
ComputedChart (root)
├── input: BirthInput
│   ├── date, time, timezone
│   ├── latitude, longitude
│   └── sunriseMode
├── lagna, lagnaSignNumber, lagnaLongitude, lagnaDegreeInSign
├── ayanamsa, julianDay, sunriseMode, sunriseFallback
├── planets[]: PlanetPosition[]              ← 9 grahas (Sun–Ketu)
│   ├── planet, longitude, latitude, speed
│   ├── retrograde, sign, signNumber
│   ├── degreeInSign, house
├── nakshatras[]: NakshatraInfo[]            ← 9 grahas + a final 'Ascendant' entry (10 total)
│   ├── planet, nakshatra, nakshatraIndex
│   ├── pada, nakshatraLord, degreeInNakshatra, subLord
├── ascendantNakshatra: NakshatraInfo        ← Lagna nakshatra (planet: 'Ascendant');
│                                              derived purely from lagnaLongitude
├── divisionalCharts[]: DivisionalChart[]    ← D1, D2, D3, D4, D5, D6, D7, D9, D10, D12, D24, D30, D60
│   ├── division, name, shortName
│   ├── lagna, lagnaSignNumber, lagnaDegreee
│   ├── planets[]: DivisionalPlacement[]     ← planet positions in this varga
│   │   └── (+ optional dignity, vargottama — see below)
│   ├── arudhaPadas[]: ChartArudhaMark[]     ← A1–A12 in this varga
│   ├── specialLagnas[]: ChartPointMark[]    ← projected special lagnas
│   └── upagrahas[]: ChartPointMark[]        ← projected upagrahas
├── charaKarakas[]: CharaKaraka[]            ← AK, AmK, BK, etc.
├── ashtakavarga: AshtakavargaResult
│   ├── bav: Record<planet, number[12]>      ← SIGN-indexed (0=Aries)
│   ├── sav: number[12]                      ← SIGN-indexed (0=Aries)
│   ├── savTotal: number
│   ├── lagnaSignNumber?: number             ← optional; absent on pre-2026-07 charts
│   └── byHouse?: AshtakavargaHouseEntry[]   ← optional; house-indexed view (house 1 = lagna), pre-rotated
├── upagrahas[]: Upagraha[]                  ← D1 positions with full longitude
├── specialLagnas[]: SpecialLagna[]          ← D1 positions with full longitude
├── arudhaPadas[]: ArudhaPada[]              ← A1–A12 from natal lagna
├── pindaStrength[]: PindaStrengthEntry[]
└── transits: TransitAnalysis
    ├── transits[]: TransitPlanet[]
    ├── sadeSati: SadeSatiInfo
    ├── sadeSatiByDegree?: DegreeSadeSatiInfo  (±45° of natal Moon; absent when natalMoonLongitude not supplied)
    ├── moonTransits[]: MoonTransitPeriod[]
    └── ascendantTransits[]: AscendantTransitPeriod[]
```

---

## Duration Analysis Tables (v1.2)

Two new tables back the **Duration Analysis** feature — a focused 3-agent pipeline
separate from the 18-agent wave pipeline.

```
┌───────────────────────────────────────────────────────────┐       ┌──────────────────────┐
│              DurationAnalysis                              │  1:N  │   DurationMessage    │
│  (3-agent sequential pipeline run)                        │──────►│  (conversation log)  │
├───────────────────────────────────────────────────────────┤       ├──────────────────────┤
│ PK id              UUID                                    │       │ PK id       UUID     │
│ FK unifiedChartId  UUID  → unified_chart                  │       │ FK analysisId  UUID  │
│    dateFrom        TSTZ                                    │       │    role     TEXT      │
│    dateTo          TSTZ                                    │       │    content  TEXT      │
│    category        TEXT  health|career|wealth|marriage|    │       │    agentId  TEXT?     │
│                          property|cashflow                │       │    focusPeriod TEXT?  │
│    userQuestion    TEXT?                                   │       │    tokenIn  INT       │
│    symptoms        TEXT?                                   │       │    tokenOut INT       │
│    status          TEXT  queued|running|symptom_unmatched  │       │    createdAt TSTZ     │
│                          |done|failed|cancelled           │       └──────────────────────┘
│    periodSlice     JSONB? DashaSlice[] — Step 0a output   │
│    transitOverlay  JSONB? TransitOverlay[] — Step 0b output│
│    foundationOutput JSONB? FoundationOutput — Step 0e      │
│                          (natal sub-agents; null=pre-feat) │
│    contextSummary  TEXT?  ~500-token follow-up summary    │
│    errorMessage    TEXT?  failure reason (when failed)    │
│    overrideApplied BOOL   true if symptom gate bypassed   │
│    da1Output       JSONB? DA1Output (Domain Analyser)     │
│    da2Output       JSONB? DA2Output (Symptom Validator)   │
│    da3Output       JSONB? DA3Output (Future Analyser)     │
│    totalTokenIn    INT                                     │
│    totalTokenOut   INT                                     │
│    totalCostUsd    DEC(10,6)                               │
│    createdAt       TSTZ                                    │
│    updatedAt       TSTZ                                    │
│                                                            │
│ IDX: unifiedChartId, status                               │
│ MAP: duration_analysis                                     │
└───────────────────────────────────────────────────────────┘
```

**Key design decisions:**
- `periodSlice` stores the output of the deterministic `sliceDashaTree()` with full
  lord annotations and yoga activations baked in — computed before any LLM call.
- `transitOverlay` stores Saturn/Jupiter/Rahu/Ketu positions at each AD boundary in
  the requested window, plus BAV scores, Sade Sati phase, and ashtamaShani flags.
- `foundationOutput` (Track 2) stores the merged natal foundation sub-agent outputs
  (planets/nakshatra/upagraha/BAV), computed once per (chart, domain) at Step 0e and
  injected into DA-1/DA-3; `null` on runs created before the feature.
- `da1Output` is enriched post-LLM with `transitContext` and `lordAnnotations` merged
  back onto each `period_analysis` entry (pipeline-side join, not LLM responsibility).
- `errorMessage` enables the SSE route to surface the real failure reason without
  the client having to infer it from status alone.
- `ModelConfig` entries `DA-1`, `DA-2`, `DA-3` control model/temperature per agent.

---

## Table Relationships Summary

| Relationship | Type | Description |
|---|---|---|
| Chart → PipelineRun | 1:N | Each chart can have multiple analysis runs |
| PipelineRun → WaveOutput | 1:N | Each run produces outputs from multiple AI agents |
| PipelineRun → RunMessage | 1:N | Each run has a conversation log |
| PipelineRun → PipelineRun | 1:N (self) | Follow-up runs chain to parent |
| UnifiedChart → PipelineRun | 1:N (nullable) | Each unified chart can back multiple AI analysis runs (`unifiedChartId`) |
| UnifiedChart → DurationAnalysis | 1:N | Each unified chart can have multiple Duration Analysis runs |
| DurationAnalysis → DurationMessage | 1:N | Each analysis has a conversation log |
| User → UnifiedChart | 1:N | Each user owns multiple charts (`userId`, required) |
| User → Session | 1:N | Database-backed sessions, one row per active login |
| User → PasswordResetToken | 1:N | Historical reset attempts; only unexpired/unused rows are valid |
| User → McpApiToken | 1:N | Historical tokens; only one non-revoked row per user in v1 |
| User → OAuthAuthorizationCode / OAuthAccessToken / OAuthRefreshToken | 1:N each | MCP OAuth server grants — see "MCP OAuth Authorization Server" above |
| User → CompatibilityMatch | 1:N | Each user owns multiple saved matchmaking results |
| UnifiedChart → CompatibilityMatch | 1:N each, via `MatchBride`/`MatchGroom` | A chart can appear as bride and/or groom across many saved matches; deleting the chart deletes dependent matches first (no automatic FK cascade) |
| OAuthClient → OAuthAuthorizationCode / OAuthAccessToken / OAuthRefreshToken | 1:N each | One dynamically-registered client can hold many grants across users |
| SavedChart (standalone) | — | Legacy independent computed chart storage — READ-ONLY since the compute page moved to UnifiedChart; existing rows promoted via `npm run db:migrate-saved` |
| Wave1Cache (standalone) | — | Caches expensive Wave 1 computations by chartHash |
| ModelConfig (standalone) | — | AI model configuration per wave/agent — including DA-1, DA-2, DA-3 |

> **Note:** `PipelineRun` keeps its original required `chartId` FK to the legacy
> `Chart` table for backward compatibility. When AI Analysis is triggered from a
> `UnifiedChart`, the analyze route ensures a matching legacy `Chart` row exists
> (by `chartHash`) and sets `unifiedChartId` on the run as well.
