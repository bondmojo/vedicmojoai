# MojoAI — User Stories v1

**Document owner:** Product
**Status:** Draft v2
**Last updated:** 2026-07-04

---

## 1. Introduction

### 1.1 Purpose
This document defines the product requirements and user stories for **VedicMojoAI**,
an internal tool that turns an existing command-line Vedic astrology analysis
pipeline into a usable web application with persistent storage, report delivery,
and follow-up querying.

### 1.2 Background
Today, MojoAI is an **internal backend tool** that wraps an existing multi-wave agentic
Vedic astrology analysis pipeline (18 agents across 4 waves + pre-analysis) and
gives it a web front end, a database, and persistent report storage.

User runs these agents on top of LLMs, but the current problems are context management
and excessive token usage.

### 1.3 Problem Statement
- The practitioner must run the pipeline manually and manage output files by hand.
- There is no history of past analyses per client.
- Foundation waves (chart extraction, nakshatra, bala, relationships) are
  recomputed on every run, wasting tokens and time.
- There is no cheap path to answer a follow-up question — the whole pipeline re-runs.
- Analysis scope cannot be targeted; the practitioner cannot say "only run health
  and career" without editing code.
- The Vimshottari dasha tree is currently hand-assembled in input JSON, causing
  arithmetic errors and inconsistencies that break downstream agents.
- Career and marriage/relationship analyses have no dedicated specialist agents;
  findings are scattered across general yogas and timing agents.
- The Opus (4C) synthesis agent receives raw accumulated context from all prior waves
  (~100K tokens), making it the single largest cost driver in the pipeline.

### 1.4 Goals
- Give the practitioner a web UI to submit charts, run targeted analyses, watch
  progress, and read reports.
- Persist charts, runs, and reports in a database + file store.
- Introduce a **planner** so only the agents relevant to the query run.
- Cache foundation waves so they are computed once per chart.
- **Compute the Vimshottari dasha tree deterministically** from the Moon's sidereal
  longitude, eliminating hand-assembled date errors and enabling a full lifetime view.
- **Add dedicated career (2F) and marriage/relationships (2G) agents** to cover the
  two domain gaps in the current pipeline.
- **Move Wave 4 fact-consolidation into Phase 1** to reduce the Opus 4C token load
  ~85% from the first production run.
- Support cheap **follow-up queries** that reuse prior work and run a verification
  pass with full prior context.
- Consolidate the entire system into **one TypeScript / Next.js project**.

### 1.5 Non-Goals (Phase 1)
- ~~No authentication or multi-tenant support (single internal user).~~
  **Superseded** — see `.kiro/specs/user-management/` (signup/login/forgot-
  password, `UnifiedChart` ownership per user, per-user MCP tokens). OAuth/
  social login remains a non-goal there.
- No birth-chart calculation — the chart arrives as `ChartInputV1` JSON.
- No payments, subscriptions, or client-facing accounts.
- No mobile application.
- MCP integration is **not** committed (see Parking Lot).

### 1.6 The Analysis Pipeline (What We're Wrapping)
The pipeline is the core asset and is **not being rewritten** — only ported to
TypeScript and wrapped. It runs in stages:

- **Pre-analysis** — a deterministic (non-LLM) engine that flags 11 conditions AND
  computes the full Vimshottari dasha tree from the Moon's sidereal longitude.
- **Wave 1 (foundation, parallel)** — extract and structure the raw chart.
- **Wave 2 (specialists, parallel)** — domain analyses (yogas, wealth, health, career, marriage).
- **Wave 3 (synthesis, parallel)** — timing, cross-chart, financial freedom.
- **Wave 4 (final, sequential)** — consolidation → error detection → validation → synthesis.

The full agent-by-agent catalogue is in **Appendix A**.

---

## 2. Requirements

### 2.1 Functional Requirements
| # | Requirement | Stories |
|---|---|---|
| FR-1 | Accept a pre-computed chart as `ChartInputV1` JSON (paste/upload), validate it, and persist it. | US-1.1 |
| FR-2 | List and re-open previously submitted charts and their run history. | US-1.2, US-1.3 |
| FR-3 | Let the practitioner specify analysis **types** (multi-select) plus a free-text **user query**. | US-2.1 |
| FR-4 | Resolve query intent to the minimum required agent set via a deterministic planner; default to the full set on first query. | US-2.2, US-2.3 |
| FR-5 | Execute the pipeline asynchronously and persist each wave's output as it completes. | US-3.1 |
| FR-6 | Stream live per-wave/agent progress to the UI. | US-3.2 |
| FR-7 | Allow custom selection of individual waves/agents to run. | US-4.1, US-4.2 |
| FR-8 | Cache foundation Wave 1 output per chart and reuse it unless force-re-run. | US-5.1 |
| FR-9 | Render each analysis to an HTML report file and store its path. | US-7.1 |
| FR-10 | Display reports in-browser with domain navigation including a dedicated Dasha Timeline view. | US-7.2, US-7.4 |
| FR-11 | Support follow-up queries that reuse Wave 1, run only applicable agents + the Verification Agent, and preserve conversation history. | US-8.1, US-8.2, US-8.3 |
| FR-12 | Track token usage and estimated cost per run. | US-5.5 |
| FR-13 | Route all model calls through a provider-agnostic wrapper; allow per-wave model configuration. | US-6.1, US-6.2 |
| FR-14 | Import the existing `runs/` directory into the new database. | US-9.1 |
| FR-15 | Compute the complete Vimshottari dasha tree deterministically from the Moon's sidereal longitude using 365.2425 days/year. | US-10.1 |
| FR-16 | Display the full dasha timeline (mahadasha + antardasha + pratyantar) in an interactive UI. | US-10.2 |
| FR-17 | Run dedicated career analysis (agent 2F) when career is a selected query type. | US-11.1 |
| FR-18 | Run dedicated marriage/relationship analysis (agent 2G) when marriage/family is a selected query type. | US-11.2 |
| FR-19 | Consolidate Waves 1–3 output into a compact fact summary before Opus 4C synthesis. | US-5.4 |
| FR-20 | Halt the pipeline before report generation when 4A detects critical errors; allow practitioner override or re-run. | US-4.3 |

### 2.2 Non-Functional Requirements
| # | Requirement |
|---|---|
| NFR-1 | **Scale:** ~10 reports/month, single concurrent user. Infrastructure sized accordingly (no Celery/Redis; Next.js background execution is sufficient). |
| NFR-2 | **Single codebase:** one Next.js (TypeScript) project — UI, API, engine, and report rendering. No cross-language subprocess coupling. |
| NFR-3 | **Persistence:** PostgreSQL (via Prisma) for structured data; HTML reports written to `reports/` as files, referenced by path. |
| NFR-4 | **Model portability:** provider/model swappable (Claude, OpenAI, Gemini) via config, without code changes. |
| NFR-5 | **Auditability:** every run persists planner decision, per-wave output, prompt version, model ID, token usage, and cost. |
| NFR-6 | **Cost efficiency:** foundation waves cached; delta-only agent outputs; compact chart-summary prefix; Wave 4 fact consolidation (Phase 1). Dasha tree computed once in pre-analysis, never re-derived by LLM agents. |
| NFR-7 | **Latency:** a full run completes in ~60–120s; follow-ups are materially faster by skipping cached waves. |
| NFR-8 | **Portability:** runs locally via a single command; deployable to GCP Cloud Run + Cloud SQL. |
| NFR-9 | **Data integrity:** the input chart is immutable per run; completed synthesis is never overwritten by follow-ups. |
| NFR-10 | **Dasha determinism:** `computeVimshottari(moonLongitude, birthDateTime)` uses 365.2425 days/year as the sole year-length constant. The same inputs must always produce the same output. |

---

## 3. Context

MojoAI is an **internal backend tool** that wraps an existing multi-wave agentic
Vedic astrology analysis pipeline (18 agents across 4 waves + pre-analysis) and
gives it a web front end, a database, and persistent report storage.

**Phase-1 constraints (locked):**

- ~~Single internal user (the practitioner). **No auth.**~~ **Superseded** —
  real accounts + per-user chart ownership shipped in `.kiro/specs/user-management/`.
  The ~10 reports/month scale assumption (below) still holds; this just adds
  a real `User` instead of implicitly assuming one practitioner.
- ~10 reports/month. Right-sized infrastructure, not enterprise scale.
- **Chart calculation is out of scope.** The system receives a fully computed
  chart as `ChartInputV1` JSON from the front end.
- Single **Next.js (TypeScript)** project — UI + API + ported pipeline engine in
  one repo, one language, one deploy.
- **Postgres + Prisma** for storage; reports written as HTML files to `reports/`.
- LLM calls routed through a provider-agnostic wrapper (Vercel AI SDK) so
  model/provider is swappable.
- **Vimshottari dasha tree is computed by the engine, not supplied in input JSON.**

**Personas:**

- **Practitioner** — the single internal user (you), runs analyses for clients.
- **Client** — future, out of Phase 1 scope; accesses read-only data.
- **System** — automated behaviors with no direct human trigger.

**Priority:** P0 = MVP/Phase 1 · P1 = Phase 2 · P2 = Later
**Sizing:** S (≤1 day) · M (2–4 days) · L (1 week+)

> **⚠ MCP integration is NOT finalized.** All MCP-related stories are in the
> Parking Lot and excluded from Phase 1 / Phase 2 scope until a decision is made.

---

## EPIC 1 — Chart Management

### US-1.1 · Submit a new chart · P0 · M
As a Practitioner, I want to submit a birth chart as `ChartInputV1` JSON (paste
or file upload), so that I can run an analysis without a chart-calculation engine.

**Acceptance Criteria**
- Form accepts pasted JSON or `.json` file upload.
- JSON is validated against the `ChartInputV1` schema; invalid input shows
  field-level errors.
- On success, the chart is persisted to Postgres with a generated `chart_id` and
  derived `lagna` and `client_name`.
- Duplicate detection: if an identical `chart_json` hash exists, offer
  "use existing" vs "create new".

### US-1.2 · View chart history · P0 · S
As a Practitioner, I want to see all charts I've submitted, so that I can re-run
analyses without re-entering data.

**Acceptance Criteria**
- List shows client name, lagna, run count, and last-run date.
- Each row links to a chart detail view.

### US-1.3 · Re-run analysis on an existing chart · P0 · S
As a Practitioner, I want to trigger a new analysis on a stored chart with a
different query intent, so that I can explore multiple domains for the same client.

**Acceptance Criteria**
- Re-run reuses stored `wave1_output` (see US-5.1) unless force re-run is set.

---

## EPIC 2 — Query Intent & Planner

### US-2.1 · Specify query type and free-text question · P0 · S
As a Practitioner, I want to select one or more analysis types (generic, health,
wealth, career, property, marriage/family, full) AND write a natural-language
question, so that the analysis targets exactly what the client asked.

**Acceptance Criteria**
- Multi-select for `types[]`: `generic | health | wealth | career | property | marriage | full`.
- Optional free-text `user_query` field.
- `full` overrides individual selections.
- `generic` runs: `2A + 2B + 2C + 2E + 2F + 3A + 3C` (sensible default covering wealth, health, career).
- UI displays which agents will run before the user confirms, enabling an override (see US-4.1).

### US-2.2 · Deterministic planner routing · P0 · M
As the System, I want to map selected types to the minimum required agent set via
a deterministic function, so that only relevant agents run and cost is controlled.

**Acceptance Criteria**
- `DOMAIN_AGENTS` map resolves types → Wave 2/3 agents:
  - `health`   → `[2E, 3C]`
  - `wealth`   → `[2A, 2C, 3A, 3B]`
  - `career`   → `[2A, 2F, 3A, 3C]`
  - `property` → `[2A, 2D, 3A]`
  - `marriage` → `[2A, 2G, 3C]`
  - `generic`  → `[2A, 2B, 2C, 2E, 2F, 3A, 3C]`
  - `full`     → all Wave 2 + Wave 3 agents
- `ALWAYS_RUN = [1A, 1B, 1C, 1D, 2B, 4X, 4A, 4B, 4C]` applies **only to the first query on a chart**.
  (`4X` = new Wave 4 fact-consolidation agent, see Epic 5.)
- Planner output is persisted to `pipeline_runs.planner_output` for auditability.

### US-2.3 · LLM-assisted planner for ambiguous queries · P1 · M
As the System, I want to invoke a lightweight (Haiku) planner agent when `user_query`
is non-empty and the types are broad (generic/full), so that free-text intent can
expand the agent set intelligently.

**Acceptance Criteria**
- The Haiku call fires only under the ambiguity condition; the deterministic map
  is the default path.

---

## EPIC 3 — Pipeline Execution

### US-3.1 · Trigger a pipeline run · P0 · L
As a Practitioner, I want to start an analysis and have it run in the background,
so that I'm not blocked while the 60–120s pipeline executes.

**Acceptance Criteria**
- `POST /api/runs` returns `202` with a `run_id` immediately.
- Run status transitions: `queued → running → done | failed`.
- Each wave's output is persisted to the DB as it completes (not only at the end).

### US-3.2 · Watch live wave progress · P0 · M
As a Practitioner, I want to see real-time progress per wave/agent, so that I know
the pipeline is working and where it is.

**Acceptance Criteria**
- SSE endpoint (`/api/runs/{id}/events`) emits `agent_complete` events.
- UI shows a per-agent progress indicator (pre-analysis → Wave 1 → 2 → 3 → 4)
  with agent ID, status, and token count per step.
- On failure, the failed agent and error message are shown.

### US-3.3 · Graceful failure and resume · P1 · M
As a Practitioner, I want a failed run to preserve completed waves, so that I can
resume rather than restart from scratch.

**Acceptance Criteria**
- Completed agents are reused on retry; only the failed agent onward re-runs.

---

## EPIC 4 — Custom Run Controls

### US-4.1 · Custom agent/wave selection · P0 · M
As a Practitioner, I want to hand-pick which waves and individual agents run, so
that I can debug or target a specific analysis (e.g. run only 2E + 3C).

**Acceptance Criteria**
- UI checkboxes per wave; expandable to individual agents (e.g. ☑2F ☑2G ☐2C).
- "Force re-run Wave 1" toggle overrides the cache.
- Selection is validated (e.g. 4C requires 4X output present).

### US-4.2 · Individual sub-agent run · P1 · S
As a Practitioner, I want to run a single agent in isolation against stored
upstream data, so that I can iterate on one analysis cheaply.

### US-4.3 · Critical error halt gate · P0 · M
As a Practitioner, I want the pipeline to halt before producing a report when
agent 4A detects **critical** errors, so that I am never served an unreliable
report without my explicit decision to override.

**Acceptance Criteria**
- After 4A completes, the orchestrator inspects `error_detection.critical_errors`.
- **Three-tier triage:**
  - `minor` (severity = minor, e.g. unused alert) — pipeline continues; 4C applies
    correction inline. UI shows a green "corrections applied" badge on the report.
  - `moderate` (severity = moderate, e.g. score out of range) — pipeline continues;
    4C applies correction + flags it. UI shows an amber "review flagged items" badge.
  - `critical` (severity = critical, e.g. fabricated dasha dates, yogakaraka
    classified as VRY, 3D ran when it should not) — **pipeline halts**. Status
    transitions to `halted_for_review`. No report is generated.
- On halt:
  - SSE emits a `critical_error` event with the list of critical failures.
  - Run detail page shows a "Halted — Critical Errors" state with:
    - Each critical error: check name, description, location, correction suggestion.
    - Three action buttons:
      1. **Override & Continue** — force 4B + 4C to proceed. The report will carry
         a permanent "Override applied" watermark and audit log entry.
      2. **Re-run from Wave X** — re-execute from the wave that produced the
         faulty output (orchestrator determines which wave based on `affects_waves`).
      3. **Cancel run** — mark as `failed` and discard.
  - `pipeline_runs.halt_reason` (JSONB, nullable) stores the critical errors array
    when status = `halted_for_review`.
- Override audit: if the practitioner overrides, `pipeline_runs.override_applied = true`
  and the report includes `corrections_applied` entries prefixed with `[OVERRIDDEN]`.
- The halt logic lives in `engine/orchestrator.ts` between the 4A and 4B execution
  steps — it is a simple conditional, not a separate agent.
- `pipeline_runs.status` enum gains a new value: `halted_for_review`.

---

## EPIC 5 — Token & Cost Optimization

### US-5.1 · Wave 1 result caching · P0 · M
As the System, I want to reuse a chart's `wave1_output` across runs (keyed by
chart hash), so that foundation extraction is never paid for twice.

**Acceptance Criteria**
- `wave1_cache_key = sha256(chart_json)`.
- Reused unless `force_rerun_wave1 = true`.
- A cache hit skips all four Wave 1 agents.

### US-5.2 · Delta-only agent outputs · P0 · S
As the System, I want every agent instructed to output only new findings (not
restate inputs), so that downstream token load drops 30–40%.

### US-5.3 · Chart summary prefix + prompt caching · P0 · M
As the System, I want a pre-computed compact `chart_summary` (~2KB) as a cached
prompt prefix shared by all agents, so that repeated chart data is not re-sent.

**Acceptance Criteria**
- `chart_summary` is generated once from `ChartInputV1` + computed dasha tree.
- Stored in `Wave1Cache.chart_summary_json`.
- Injected as the first block of every agent prompt instead of the raw chart JSON.

### US-5.4 · Wave 4 fact consolidation · P0 · M
As the System, I want a consolidation step (agent 4X) to distill Waves 1–3 into a
compact fact summary before Wave 4C, so that the Opus synthesis input shrinks ~85%.

**Acceptance Criteria**
- Agent 4X runs immediately after Wave 3, before 4A.
- 4X input: `chart_summary` + all Wave 2/3 delta outputs.
- 4X output: `fact_summary` (~6KB) containing high-confidence findings, all scores,
  corrections needed, cross-channel divergences, and sade-sati status.
- 4C receives **only** `chart_summary + fact_summary + 4A_output + 4B_output`.
  It does NOT receive raw Wave 1–3 dumps.
- Prompt file for 4X is created in `prompts/agents/wave4_4x_consolidation.md`.

### US-5.5 · Per-run token & cost tracking · P0 · S
As a Practitioner, I want each run to record token usage and estimated cost, so
that I can monitor spend at ~10 reports/month.

**Acceptance Criteria**
- `token_in`, `token_out`, `cost_usd` stored per agent in `WaveOutput`.
- Run detail page shows a cost breakdown by agent and a run total.

---

## EPIC 6 — Model Configuration

### US-6.1 · Provider-agnostic LLM layer · P0 · M
As the System, I want all model calls routed through a Vercel AI SDK wrapper,
so that providers and models are swappable without code changes.

### US-6.2 · Configure model per wave from UI · P1 · S
As a Practitioner, I want to set the model for each wave (e.g. Haiku for Wave 1,
Opus for 4C) from the UI, so that I can tune the cost/quality tradeoff without
redeploying.

**Acceptance Criteria**
- `model_config` table persists `{wave, model_id, provider, prompt_version}`.
- UI dropdowns per wave; defaults preserve the current tiering.

---

## EPIC 7 — Reports

### US-7.1 · Generate and store an HTML report · P0 · M
As a Practitioner, I want the pipeline to render a report to
`reports/{client_slug}_{timestamp}_{query_type}.html`, so that reports are
persistent, named, and portable.

**Acceptance Criteria**
- File written to disk; the path is stored in `pipeline_runs.report_path`.

### US-7.2 · View report in-browser with domain tabs · P0 · M
As a Practitioner, I want to view the rendered report inside the app with domain
tabs (health / wealth / career / marriage / property / dasha), so that I can
navigate a large report easily.

**Acceptance Criteria**
- Report viewer renders the stored HTML.
- Domain tabs correspond to the query types that were run.
- Dasha tab is always present (see US-7.4).

### US-7.3 · Share a report via link · P1 · S
As a Practitioner, I want a shareable link (with default expiry of 7 days) to a
report, so that I can deliver it to a client without them logging in.

**Acceptance Criteria**
- Report ID is an unguessable UUID token (not sequential).
- Expiry is on by default; the practitioner can extend or disable it.

### US-7.4 · Dasha timeline viewer · P0 · M
As a Practitioner, I want an interactive Vimshottari dasha timeline in the report
UI, so that I can quickly scan an entire lifetime of periods and their cashflow
direction.

**Acceptance Criteria**
- Timeline shows all mahadashas as horizontal bars on a life axis (birth → age 120).
- Clicking a mahadasha expands to show its antardashas.
- Each period is colour-coded: green = positive cashflow direction, red = negative,
  amber = neutral.
- Current active period is highlighted.
- Pratyantar periods shown in a detail panel when an antardasha is selected.

---

## EPIC 8 — Follow-up Queries & Conversation

### US-8.1 · Follow-up runs skip foundation waves · P0 · M
As the System, I want follow-up queries on a chart to reuse Wave 1 and run only
the applicable domain agents plus the Verification Agent, so that follow-ups are
fast and cheap.

**Acceptance Criteria**
- `ALWAYS_RUN` does **not** apply to follow-ups.
- The Verification Agent always runs on follow-ups.

### US-8.2 · Verification Agent sees prior context · P0 · M
As a Practitioner, I want the Verification Agent to review previous synthesis and
prior conversation before validating a follow-up, so that continuity is preserved
and contradictions with earlier findings are surfaced.

**Acceptance Criteria**
- Verification input: previous run's 4C output + conversation history (from `run_messages`).
- Output flags any contradiction with prior conclusions.

### US-8.3 · Conversation history persistence · P0 · S
As the System, I want follow-up turns stored as a message thread per chart, so
that context survives across turns (the LLM API is stateless).

**Acceptance Criteria**
- `run_messages` stores `role`, `content`, `run_id`, `created_at`.
- The original synthesis stays immutable; follow-ups layer on top.

---

## EPIC 9 — Data Migration & Platform

### US-9.1 · Backfill existing runs · P0 · M
As a Practitioner, I want a script to import my existing `runs/` directory into
Postgres, so that historical analyses are queryable in the new system.

**Acceptance Criteria**
- `backfill_runs` walks `runs/`, converting manifests + wave JSON to DB rows.
- A `djma.json → ChartInputV1` converter is included.

### US-9.2 · Single Next.js project · P0 · L
As a Practitioner, I want the entire system (UI + API + engine) in one TypeScript
Next.js project, so that there's one language, one repo, one deploy.

**Acceptance Criteria**
- The Python pipeline is ported to `engine/*.ts`.
- Prompt `.md` files are unchanged.
- Runs locally via one command; deployable to GCP Cloud Run.

---

## EPIC 10 — Vimshottari Dasha Engine

### US-10.1 · Deterministic Vimshottari computation · P0 · M
As the System, I want the engine to compute the full Vimshottari dasha tree from
the Moon's sidereal longitude and the birth datetime, so that dasha dates are
always consistent, self-verifying, and free of hand-assembly errors.

**Acceptance Criteria**
- Function signature: `computeVimshottari(moonLongitudeDeg: number, birthDatetime: Date): DashaTree`.
- Year-length constant: **365.2425 days** (Gregorian mean year). This constant is
  defined once in `engine/constants.ts` and never duplicated.
- Output covers the full 120-year Vimshottari cycle from the balance-of-first-dasha
  at birth through all 9 mahadashas.
- Each mahadasha contains its 9 antardashas with exact start/end dates.
- Each antardasha in the **current** and **next** mahadasha contains its 9
  pratyantardashas with exact start/end dates.
- Balance-of-first-dasha formula:
  `balance_years = (1 − (moonLong mod 13.3333°) / 13.3333°) × MD_lord_years`
- The computed dasha tree replaces any `vimshottari_dasha` block in the input
  JSON; the input block is stored for audit but ignored by all agents.
- Self-verification: sum of all mahadasha durations must equal 120 years ± 1 day.
  If it does not, the run fails with a DashaIntegrityError before any LLM agent runs.
- The computed tree is stored in `Wave1Cache` and reused for all subsequent runs
  on the same chart.

**Nakshatra → Dasha-lord mapping (fixed constants):**

| Nakshatra index | Nakshatra | Dasha lord | Years |
|---|---|---|---|
| 0 | Ashwini | Ketu | 7 |
| 1 | Bharani | Venus | 20 |
| 2 | Krittika | Sun | 6 |
| 3 | Rohini | Moon | 10 |
| 4 | Mrigashira | Mars | 7 |
| 5 | Ardra | Rahu | 18 |
| 6 | Punarvasu | Jupiter | 16 |
| 7 | Pushya | Saturn | 19 |
| 8 | Ashlesha | Mercury | 17 |
| 9 | Magha | Ketu | 7 |
| 10 | Purva Phalguni | Venus | 20 |
| 11 | Uttara Phalguni | Sun | 6 |
| 12 | Hasta | Moon | 10 |
| 13 | Chitra | Mars | 7 |
| 14 | Swati | Rahu | 18 |
| 15 | Vishakha | Jupiter | 16 |
| 16 | Anuradha | Saturn | 19 |
| 17 | Jyeshtha | Mercury | 17 |
| 18 | Mula | Ketu | 7 |
| 19 | Purva Ashadha | Venus | 20 |
| 20 | Uttara Ashadha | Sun | 6 |
| 21 | Shravana | Moon | 10 |
| 22 | Dhanishtha | Mars | 7 |
| 23 | Shatabhisha | Rahu | 18 |
| 24 | Purva Bhadrapada | Jupiter | 16 |
| 25 | Uttara Bhadrapada | Saturn | 19 |
| 26 | Revati | Mercury | 17 |

### US-10.2 · Dasha timeline UI · P0 · M
(See US-7.4 — covered in Epic 7 Reports. This story tracks the engine data
contract that feeds that UI.)

**Acceptance Criteria**
- `GET /api/charts/{id}/dasha` returns the full computed dasha tree as JSON.
- Each period includes: `lord`, `start`, `end`, `duration_days`, `cashflow_direction`
  (populated after Wave 3A runs; null until then).
- The "current period" is derived from `today()` at request time, not stored —
  so the response always reflects the correct active period regardless of when
  the chart was originally submitted.

---

## EPIC 11 — Career & Marriage Agents

### US-11.1 · Dedicated career analysis agent (2F) · P0 · M
As a Practitioner, I want a dedicated career agent that analyses the D10 chart,
H10 yogas, and career-linked dasha timing, so that career readings are as
structured and auditable as health or wealth readings.

**Acceptance Criteria**
- Agent file created at `prompts/agents/wave2_2f_career.md`.
- Runs as part of Wave 2 (parallel), planner-selected when `types` includes `career`.
- Consumes: `chart_summary`, `wave1_output`, `pre_analysis_alerts`.
- Produces structured JSON covering:
  - D10 lagna + lagna lord strength
  - D10 H10 (career apex) lord placement + strength
  - D10 H6 (service/obstacles) and H11 (income from career) analysis
  - Career yogas from D1 (Dharma-Karma Adhipati, Raja Yoga activation in D10)
  - Yogakaraka role in career context (D1 house vs D10 house)
  - Top 3 career peak dasha periods with approximate dates
  - Top 2 career stress periods with mitigation
  - Career mode classification: `self_employed | service | entrepreneurial | mixed`
  - `career_strength_score` (1–10) with rationale

**Key astrological scope for 2F:**
- Primary: D10 (Dasamsa) — H1, H10, H6, H11 analysis
- Secondary: D1 H10 (natal career house), H6 (service/competition)
- Yogas: Dharma-Karma Adhipati (H9+H10 lords), Raja Yoga activation in career context
- Atma Karaka sign and house in D10 — soul-purpose alignment with career
- Saturn's role as karma-karaka in D10
- Sun's role as authority/government signifier in D10

### US-11.2 · Dedicated marriage & relationships agent (2G) · P0 · M
As a Practitioner, I want a dedicated marriage/relationships agent that analyses
the D9 (Navamsa) chart, the 7th house, and relationship-linked timing, so that
marriage and partnership readings are as structured as other domain reports.

**Acceptance Criteria**
- Agent file created at `prompts/agents/wave2_2g_marriage.md`.
- Runs as part of Wave 2 (parallel), planner-selected when `types` includes `marriage`.
- Consumes: `chart_summary`, `wave1_output`, `pre_analysis_alerts`.
- Produces structured JSON covering:
  - D1 H7 lord: sign, house, strength, functional nature for lagna
  - D1 H7 occupants and any malefic/benefic influence on H7
  - D9 lagna and lagna lord (quality of the spouse/partnership promise)
  - D9 H7 lord (spouse's nature/condition in navamsa)
  - Venus placement in D1 and D9 (natural karaka for marriage)
  - Jupiter placement for female charts (natural karaka for husband)
  - Upapada Lagna (UL) and its lord — marriage manifestation indicator
  - Darakarka (planet with lowest degree, excluding nodes) — spouse significator
  - Marriage timing: dasha periods that activate H7/D9 link
  - Relationship yoga detection: Kuja Dosha assessment, Kalatra Yoga, Jaya Yoga
  - Compatibility indicators for the current/upcoming dasha
  - `marriage_timing_window`: earliest and most probable dasha-based windows
  - `relationship_strength_score` (1–10) with rationale
  - `compatibility_notes`: what kind of partner the chart indicates

**Key astrological scope for 2G:**
- Primary: D9 (Navamsa) — full chart analysis for marriage promise
- Secondary: D1 H7 (spouse house), H2 (family), H12 (bed pleasures/separation)
- Venus (natural karaka for marriage/spouse for male charts)
- Jupiter (natural karaka for husband in female charts)
- Upapada Lagna (A7 arudha of H7) for marriage manifestation
- Kuja Dosha detection (Mars in H1/2/4/7/8/12 from lagna, Moon, Venus)
- Dasha activation: H7 lord, Venus, D9 lagna lord dashas trigger marriage events

---

## Phase Cut

| Phase | Stories | Theme |
|---|---|---|
| **Phase 1 (MVP)** | US-1.1–1.3, 2.1–2.2, 3.1–3.2, 4.1, 4.3, 5.1–5.5, 6.1, 7.1–7.2, 7.4, 8.1–8.3, 9.1–9.2, 10.1–10.2, 11.1–11.2 | Working web tool: submit → run → view, with follow-ups, dasha engine, career + marriage agents, Wave-1 caching, 4C fact-consolidation, and critical-error halt gate |
| **Phase 2** | US-2.3, 3.3, 4.2, 6.2, 7.3 | Optimization, model config UI, resumable runs, report sharing |
| **Later** | Parking-lot items, ~~multi-user/auth~~ (shipped, `.kiro/specs/user-management/`), chart-calculation engine, remedies agent | Client-facing expansion |

---

## Parking Lot — NOT Finalized (Candidate Scope)

> These items depend on decisions that have **not** been made. They are recorded
> for continuity and are **excluded** from the committed Phase 1 / Phase 2 scope.

### MCP Server Integration (undecided)

**Candidate value:** Let a user open Claude.ai, connect a MojoAI MCP server, and
ask about a chart conversationally — Claude fetches chart data and past reports
via tools, eliminating the need to build a custom follow-up chat UI.

**Candidate read tools:** `list_charts`, `get_chart_data`, `get_synthesis`,
`get_timeline`, `get_remedies`, `list_runs`.

**Candidate write tool:** `trigger_analysis` (async — returns `run_id`).

**Open decisions blocking commitment:**
1. Whether to invest in MCP vs. the in-app conversation thread (Epic 8).
2. If MCP: `trigger_analysis` sync vs async UX in Claude.ai.
3. Auth model for MCP clients (API key vs OAuth).

**Note:** Epic 8 and MCP are not mutually exclusive. MCP, if pursued, is additive
and best sequenced after Phase 1.

### Remedies Agent (undecided)
A Wave 2H (or Wave 3E) agent that produces gem, mantra, charity, and upaya
recommendations per domain. Blocked on scope decision and domain agent stabilization.

---

## Open Decisions (tracked)

1. **Follow-up model:** v1 assumes thread on an existing run with immutable synthesis.
   Confirm this matches intent vs. spawning a fully new run.
2. **MCP:** entire Parking Lot section pending go/no-go.
3. **D7 (Saptamsa):** Marriage agent 2G cannot analyse children/progeny without D7.
   Decide whether D7 is added to `ChartInputV1` in Phase 1 or deferred.
4. **Score stability:** Define when computed scores (wealth_potential, etc.) are
   allowed to change. Proposed rule: scores are frozen on first successful 4C
   synthesis per query type; re-run with `force_recompute = true` to update.
5. **Null yogakaraka handling:** Six lagnas have no yogakaraka. Confirm that
   `yogakaraka: null` is handled gracefully in all 18 agent prompts and in 4A CHECK 1
   before Phase 1 launch.

---

---

## Appendix A — Agent Catalogue (v2 — 18 agents + pre-analysis)

The pipeline ships with **18 agent prompts** plus a deterministic pre-analysis
stage. All prompt files live in `prompts/agents/`.

### Stage 0 — Pre-Analysis (deterministic, no LLM)
| Component | File | Purpose |
|---|---|---|
| Pre-analysis rules + Dasha Engine | `engine/pre_analysis.ts` | 11 rules (combustion/cazimi, grahan yoga, lagna-lord damage, yogakaraka damage, neechabhanga, vargottama, atma karaka, kala sarpa/amrita, parivartana, retrograde count). **Also computes the full Vimshottari dasha tree** via `computeVimshottari(moonLong, birthDate)` at 365.2425 days/year. Emits `alerts[]` and `dasha_tree` consumed by every downstream agent. |

### Wave 1 — Foundation (parallel; part of `ALWAYS_RUN`)
| ID | File | Role |
|---|---|---|
| **1A** | `wave1_1a_extraction.md` | Chart extraction & planetary positions — structures every body's sign, house, degree, retrograde, combustion, nakshatra, pada, dignity into JSON. |
| **1B** | `wave1_1b_nakshatra.md` | Nakshatra & disha analysis — nakshatra/pada/lord/sub-lord, directional (dig bala) strength, Rahu–Ketu axis, depositor chains. |
| **1C** | `wave1_1c_bala.md` | Bala deep audit — all 6 Shadbala components, combustion signal, Ishta/Kashta, Pinda %, Vimsopaka, strength ranking, guaranteed-delivery flags. |
| **1D** | `wave1_1d_relationships.md` | Inter-planetary relationship geometry — conjunctions, aspects (full + special), graha yuddha, mutual reception, clusters. **Single source of truth** for geometry. |

### Wave 2 — Specialists (parallel; planner-selected; 2B always runs)
| ID | File | Role | Domain |
|---|---|---|---|
| **2A** | `wave2_2a_yogas.md` | Yoga detection & classification (Raja/Dhana/Gaja Kesari/Pancha Mahapurusha/Parivartana, etc.) with yogakaraka-protection rule. | wealth, career, family |
| **2B** | `wave2_2b_ashtakavarga.md` | Ashtakavarga (SAV + BAV + Pinda) — house strength classification, weak/strong life areas. | cross-domain (always) |
| **2C** | `wave2_2c_wealth.md` | Wealth formation across D1 + D9 + D10 — H2/H11/H5/H9 lords and links. | wealth |
| **2D** | `wave2_2d_property.md` | Asset & property analysis (D4 primary + D1) — land/vehicle/immovable, Mars/Venus/Saturn in D4. | property |
| **2E** | `wave2_2e_health.md` | Health & resilience — body-parts-at-risk, D1/D9/D30 health analysis, protective factors, health resilience score. | health |
| **2F** *(new)* | `wave2_2f_career.md` | Career analysis — D10 chart, H10 yogas, career mode classification, peak + stress dasha windows, career strength score. | career |
| **2G** *(new)* | `wave2_2g_marriage.md` | Marriage & relationships — D9 primary, H7 analysis, Venus/Jupiter karaka, Upapada Lagna, Kuja Dosha, marriage timing windows, relationship strength score. | marriage |

### Wave 3 — Synthesis (parallel; planner-selected; 3D conditional)
| ID | File | Role | Domain |
|---|---|---|---|
| **3A** | `wave3_3a_cashflow.md` | Cash flow & dasha timeline — maps every mahadasha/antardasha to a cashflow direction using the **computed** dasha tree. | wealth, career, property |
| **3B** | `wave3_3b_freedom.md` | Financial freedom assessment — H11 passive income, sustain-without-employment potential, earliest freedom window. | wealth |
| **3C** | `wave3_3c_crosschannel.md` | Cross-channel analysis — D1 vs D9/D10/D4 dignity divergences, cross-chart matrix, alignment/inversion flags. | health, career, family |
| **3D** | `wave3_3d_lagnalord.md` | Lagna-lord sovereignty deep-dive — **conditional**: runs only when pre-analysis flags the lagna lord as damaged; self-skips otherwise. | conditional |

### Wave 4 — Final (sequential; part of `ALWAYS_RUN`)
| ID | File | Role | Model |
|---|---|---|---|
| **4X** *(new)* | `wave4_4x_consolidation.md` | **Fact consolidation** — distils all Wave 1–3 delta outputs into a ~6KB `fact_summary`. This is the only input 4C receives beyond `chart_summary`. Reduces Opus token load ~85%. | Sonnet |
| **4A** | `wave4_4a_errors.md` | Error detection & correction — 8 checks against `fact_summary` + original wave outputs. | Sonnet |
| **4B** | `wave4_4b_validation.md` | Cross-validation & confidence assignment — validates all findings in `fact_summary`, assigns confidence. | Sonnet |
| **4C** | `wave4_4c_synthesis.md` | Final synthesis — receives `chart_summary + fact_summary + 4A_output + 4B_output` only. Produces the authoritative report JSON. | Opus |

### Net-new agents introduced by this product
| Agent | Introduced by | Purpose |
|---|---|---|
| **Planner** | US-2.2 / US-2.3 | Resolves query intent → agent subset. Deterministic map first; optional Haiku pass for ambiguous queries. |
| **4X Consolidator** | US-5.4 | Distils Waves 1–3 into `fact_summary` before 4C. |
| **2F Career** | US-11.1 | Dedicated D10 + career timing specialist. |
| **2G Marriage** | US-11.2 | Dedicated D9 + H7 + relationship timing specialist. |
| **Verification Agent** | US-8.1 / US-8.2 | Runs on follow-up queries. Reviews prior synthesis + conversation history. |

### `ALWAYS_RUN` vs planner-selected (summary)
- **First query on a chart:**
  `ALWAYS_RUN = [1A, 1B, 1C, 1D, 2B, 4X, 4A, 4B, 4C]`
  plus the domain agents mapped from the selected types.
- **Follow-up query:**
  Wave 1 reused from cache; only the applicable domain agents run,
  **plus the Verification Agent and 4C**. `ALWAYS_RUN` does not apply.
  4X re-runs on follow-ups using only the new wave outputs appended to prior `fact_summary`.

### Domain → Agent map (planner reference)
| Query type | Wave 2 agents | Wave 3 agents |
|---|---|---|
| `health` | 2E | 3C |
| `wealth` | 2A, 2C | 3A, 3B |
| `career` | 2A, 2F | 3A, 3C |
| `property` | 2A, 2D | 3A |
| `marriage` | 2A, 2G | 3C |
| `generic` | 2A, 2B, 2C, 2E, 2F | 3A, 3C |
| `full` | 2A, 2B, 2C, 2D, 2E, 2F, 2G | 3A, 3B, 3C, 3D* |

*3D runs only if pre-analysis flags lagna lord as damaged.
2B is always added regardless of type.
