# VedicMojoAI — Data Flow Diagram (DFD)

**Version:** 1.3
**Last updated:** 2026-07-11
**Status:** Draft

> **Maintenance rule:** Update this DFD alongside any change to processes, data
> stores, or flows — together with the AI Skills, ERD, and HLD. See
> `Agents.md → Documentation Maintenance`.

## What changed in v1.1

- Added P9: Unified Chart Ingestion + Analyze and D7: UnifiedChart.

## What changed in v1.2

- Added **P10: Duration Analysis** process and data stores **D8: DurationAnalysis** and **D9: DurationMessage**.
- Added D8/D9 to the Level 1 data store list.
- Extended the Data Dictionary with Duration Analysis data items.

## What changed in v1.3

- P10.4 is now a **registry-resolved per-domain agent** (DA1-HEALTH … DA1-CASHFLOW)
  with **batched** DA-1 calls (≤25 periods/call, merged via `mergeDA1Outputs()`)
  and lenient JSON parsing with one retry (`callAgentJson`).
- Added the **cashflow** category ("Money Agent" — liquidity, distinct from wealth).
- P10.2 slicer **fails fast on an empty period slice** (hint: `npm run db:backfill-pd`).
- **Stale-run reaper**: queued/running rows with no heartbeat (updatedAt) for 10 min are
  marked failed on every read path (GET [id], SSE poll, list). DA-1 batches persist
  totals per batch as the heartbeat.
- **Cancel**: `POST /[id]/cancel` → `status=cancelled`; the pipeline checks the flag
  between steps and unwinds without overwriting it. SSE emits `run_cancelled`.
- **History**: `GET /api/duration-analysis` lists the newest 50 runs (chart name,
  category, status, cost) for the launcher page's Recent analyses section.
- **Prompt caching**: DA-1 batches and DA-3 chat follow-ups send their stable
  chart-data prefix via `callLLM({ cachedPrefix })` (Anthropic cache_control).

## What changed in v1.4

- Added **P11 — MCP server** (`mcp/`): a separate stdio process that lets Claude
  Desktop read deterministic data + rubrics and reason locally at **$0 API cost**.
  It calls the app over HTTP and **never** flows into P4 (wave pipeline) or P10
  (duration pipeline) — the paid LLM processes. New external entity: **CLAUDE
  DESKTOP**. See the Level 2 — P11 section.
- New data stores/flows are read-only: `POST /api/timeline` (deterministic scoring,
  reuses P10.2/P10.3 pre-steps sans LLM) and `GET /api/knowledge/**` (rubric files).

---

## Level 0 — Context Diagram

The highest-level view. One process, two external entities.

```
┌─────────────┐   ChartInputV1 JSON         ┌─────────────────────┐
│             │   Query type + user_query    │                     │
│ PRACTITIONER├────────────────────────────►│                     │
│             │                             │   VEDICMOJOAI       │
│             │◄────────────────────────────│   SYSTEM            │
│             │   HTML Report               │                     │
│             │   Dasha Timeline JSON       │                     │
│             │   Run Progress (SSE)        │                     │
│             │   Token cost breakdown      └──────────┬──────────┘
└─────────────┘                                        │
                                                       │ LLM API calls
                                              ┌────────▼────────┐
                                              │   LLM PROVIDERS  │
                                              │ (Claude/OpenAI/  │
                                              │  Gemini)         │
                                              └─────────────────┘
```

---

## Level 1 — Major Processes

Breaks the system into its 7 primary processes and shows data flows between them.

```
PRACTITIONER
     │
     │ 1. ChartInputV1 JSON
     ▼
┌────────────────────┐
│  P1                │──── chart_hash ──────────────────────────────────┐
│  CHART MANAGEMENT  │                                                  │
│  (validate +       │──── ChartInputV1 (immutable) ──────────────────► D1: Chart
│   persist chart)   │                                                  │
└────────┬───────────┘                                                  │
         │ chart_id + lagna + yogakaraka                                │
         │ 2. query_types[] + user_query                                │
         ▼                                                              │
┌────────────────────┐                                                  │
│  P2                │──── execution_plan[] ──────────────────────────► D2: PipelineRun
│  PLANNER           │     planner_output                               │
│  (resolve agents)  │                                                  │
└────────┬───────────┘                                                  │
         │ execution_plan[]                                             │
         ▼                                                              │
┌────────────────────┐                                                  │
│  P3                │◄─── ChartInputV1 ──────────────── D1: Chart      │
│  PRE-ANALYSIS      │                                                  │
│  + DASHA ENGINE    │──── alerts[] ───────────────────────────────────►│
│  (deterministic)   │──── dasha_tree ─────────────────────────────────►│
│                    │──── chart_summary (~2KB) ───────────────────────► D3: Wave1Cache
└────────┬───────────┘                                                  │
         │ alerts[] + dasha_tree + chart_summary                        │
         ▼                                                              │
┌────────────────────┐                                                  │
│  P4                │◄─── chart_summary ──────────── D3: Wave1Cache    │
│  PIPELINE ENGINE   │◄─── execution_plan[] ────────── D2: PipelineRun  │
│  (orchestrate      │                                                  │
│   18 agents)       │──── wave_deltas[] ──────────────────────────────► D4: WaveOutput
│                    │──── SSE events ─────────────────────────────────► PRACTITIONER
└────────┬───────────┘                                                  │
         │ synthesis_json                                               │
         ▼                                                              │
┌────────────────────┐                                                  │
│  P5                │                                                  │
│  REPORT RENDERER   │──── HTML file path ─────────────────────────────► D2: PipelineRun
│  (synthesis →      │──── HTML file ──────────────────────────────────► FS: reports/
│   HTML)            │                                                  │
└────────┬───────────┘                                                  │
         │ report_path                                                  │
         ▼                                                              │
┌────────────────────┐                                                  │
│  P6                │◄─── report_path ──────────── D2: PipelineRun     │
│  REPORT VIEWER     │◄─── HTML file ─────────────── FS: reports/       │
│  (serve + display) │                                                  │
│                    │──── report HTML + dasha JSON ──────────────────► PRACTITIONER
└────────────────────┘                                                  │
                                                                        │
┌────────────────────┐                                                  │
│  P7                │◄─── prior 4C synthesis ──────── D4: WaveOutput   │
│  FOLLOW-UP /       │◄─── conversation history ──────── D5: RunMessage │
│  VERIFICATION      │◄─── wave1_delta ───────────────── D3: Wave1Cache │
│  (reuse + verify)  │                                                  │
│                    │──── follow-up synthesis ───────────────────────► D4: WaveOutput
│                    │──── new message ───────────────────────────────► D5: RunMessage
└────────────────────┘

┌────────────────────┐                                                  │
│  P8                │                                                  │
│  CHART COMPUTE     │                                                  │
│  + SAVE/LOAD       │                                                  │
│                    │◄─── birth data (date/time/tz/lat/lon) ────── PRACTITIONER
│  (deterministic    │                                                  │
│   engine —         │──── ComputedChart + DashaTree ────────────────► PRACTITIONER
│   no LLM)          │                                                  │
│                    │──── savedChart (chartData JSONB) ─────────────► D6: SavedChart
│                    │◄─── loadedChart ─────────────────────────────── D6: SavedChart
└────────────────────┘

Data Stores:
  D1: Chart          — immutable chart record (chart_id, lagna, chart_json, hash)
  D2: PipelineRun    — run record (status, planner_output, report_path, cost)
  D3: Wave1Cache     — chart_summary, wave1_delta, dasha_tree (keyed by chart_hash)
  D4: WaveOutput     — per-agent delta output, domain tag, token counts
  D5: RunMessage     — conversation thread (role, content, run_id)
  D6: SavedChart     — persisted computed charts (birth data + full chartData JSONB + dashaTree)
  D7: UnifiedChart   — canonical chart store, column-per-domain JSONB (source=compute|paste)
  D8: DurationAnalysis — duration analysis runs (periodSlice, transitOverlay, da1-3 outputs, errorMessage)
  D9: DurationMessage  — duration analysis conversation thread (role, content, analysisId)
  FS: reports/       — HTML report files on disk
```

---

## Level 2 — P3: Pre-Analysis + Dasha Engine (Detail)

```
ChartInputV1 JSON
       │
       ├──────────────────────────────────────────────────────────────┐
       │                                                              │
       ▼                                                              ▼
┌─────────────────┐                                        ┌──────────────────────┐
│ RULE ENGINE     │                                        │ VIMSHOTTARI ENGINE   │
│ (11 rules)      │                                        │ computeVimshottari() │
│                 │                                        │                      │
│ Rule 1: Dignity │  Moon.sidereal_longitude               │ Input:               │
│ Rule 2: Lagna   │◄───────────────────────────────────────│  moonLong (deg)      │
│ Rule 3: FB/FM   │                                        │  birthDatetime       │
│ Rule 4: YK      │                                        │                      │
│ Rule 5: Neecha  │                                        │ Steps:               │
│ Rule 6: Strength│                                        │  1. nakshatra_idx =  │
│ Rule 7: Yoga    │                                        │     floor(long/13.33)│
│    gate         │                                        │  2. balance_years =  │
│ Rule 8: Dasha   │                                        │     (1-frac)×MD_yrs  │
│    filter       │                                        │  3. lay MD sequence  │
│ Rule 9: SadeSati│                                        │  4. compute AD/PD    │
│ Rule 10: AK     │                                        │     recursively      │
│ Rule 11: Cross  │                                        │  5. integrity check  │
│    channel      │                                        │     (sum=120yr±1day) │
└────────┬────────┘                                        └──────────┬───────────┘
         │ alerts[]                                                   │ dasha_tree
         │                                                            │
         └────────────────────────┬───────────────────────────────────┘
                                  │
                                  ▼
                        ┌──────────────────┐
                        │ CHART SUMMARY    │
                        │ BUILDER          │
                        │                  │
                        │ Inputs:          │
                        │  ChartInputV1    │
                        │  alerts[]        │
                        │  dasha_tree      │
                        │                  │
                        │ Output:          │
                        │  chart_summary   │
                        │  (~2KB string)   │
                        │  stored in       │
                        │  Wave1Cache      │
                        └──────────────────┘
```

---

## Level 2 — P4: Pipeline Engine (Detail)

```
chart_summary + execution_plan[] + alerts[]
                    │
                    ▼
          ┌─────────────────┐
          │  ORCHESTRATOR   │
          │  orchestrator.ts│
          └────────┬────────┘
                   │
     ┌─────────────┼──────────────────────┐
     │             │                      │
     ▼             ▼                      ▼
  Wave 1?      Wave 1        Check Wave1Cache
  (first run)  (parallel)    (follow-up)
     │         │                      │
     │    ┌────┴──────────────────┐   │ wave1_delta (cached)
     │    │  1A  1B  1C  1D       │   │
     │    │  (parallel, 4 LLM     │   │
     │    │   calls)              │   │
     │    └────────────┬──────────┘   │
     │                 │              │
     └─────────────────┼──────────────┘
                       │ wave1_delta → Wave1Cache + WaveOutput
                       ▼
          ┌────────────────────────────┐
          │        WAVE 2              │
          │  (parallel, planner-       │
          │   selected subset)         │
          │                            │
          │  Each agent receives:      │
          │  • chart_summary           │
          │  • wave1_delta             │
          │  • pre_analysis_alerts     │
          │                            │
          │  2A  2B  2C  2D  2E  2F 2G │
          │  (up to 7 parallel LLM     │
          │   calls)                   │
          └────────────┬───────────────┘
                       │ wave2_deltas[] → WaveOutput (domain-tagged)
                       ▼
          ┌────────────────────────────┐
          │        WAVE 3              │
          │  (parallel, planner-       │
          │   selected subset)         │
          │                            │
          │  Each agent receives:      │
          │  • chart_summary           │
          │  • wave1_delta             │
          │  • relevant wave2_deltas[] │
          │    (not all — only domain- │
          │     relevant ones)         │
          │                            │
          │  3A  3B  3C  3D(cond.)     │
          └────────────┬───────────────┘
                       │ wave3_deltas[] → WaveOutput
                       ▼
          ┌────────────────────────────┐
          │        WAVE 4              │
          │  (strictly sequential)     │
          │                            │
          │  4X: CONSOLIDATION         │
          │  Input: chart_summary +    │
          │         all wave2/3 deltas │
          │  Output: fact_summary      │
          │  (~6KB) → WaveOutput       │
          │              │             │
          │              ▼             │
          │  4A: ERROR DETECTION       │
          │  Input: chart_summary +    │
          │         fact_summary       │
          │  Output: corrections[]     │
          │              │             │
          │              ▼             │
          │  4B: VALIDATION            │
          │  Input: chart_summary +    │
          │         fact_summary +     │
          │         4A_output          │
          │  Output: confidence_matrix │
          │              │             │
          │              ▼             │
          │  4C: SYNTHESIS (Opus)      │
          │  Input: chart_summary +    │
          │         fact_summary +     │
          │         4A_output +        │
          │         4B_output          │
          │  Output: synthesis_json    │
          │  (~15K tokens total input) │
          └────────────┬───────────────┘
                       │ synthesis_json → WaveOutput
                       ▼
                 REPORT RENDERER
```

---

## Level 2 — P7: Follow-up / Verification (Detail)

```
Practitioner submits follow-up query
          │ chart_id + new query_types[] + user_query
          ▼
┌──────────────────────────┐
│  Load from Wave1Cache    │
│  • chart_summary         │
│  • wave1_delta           │
│  • dasha_tree            │
│  (no re-run of Wave 1    │
│   or pre-analysis)       │
└──────────────┬───────────┘
               │
               ▼
┌──────────────────────────┐
│  Load prior context      │
│  from WaveOutput:        │
│  • prior 4C synthesis    │
│  • domain-specific       │
│    wave2/3 outputs       │
│  from RunMessage:        │
│  • full conversation     │
│    history               │
└──────────────┬───────────┘
               │
               ▼
┌──────────────────────────┐
│  PLANNER                 │
│  (follow-up mode)        │
│  ALWAYS_RUN not applied  │
│  Maps new types →        │
│  domain agents only      │
└──────────────┬───────────┘
               │ new_agent_list[]
               ▼
┌──────────────────────────┐
│  Wave 2 domain agents    │
│  (selected subset only)  │
│  Input: chart_summary +  │
│         wave1_delta      │
└──────────────┬───────────┘
               │ new wave2_deltas[]
               ▼
┌──────────────────────────┐
│  Wave 3 domain agents    │
│  (selected subset only)  │
└──────────────┬───────────┘
               │ new wave3_deltas[]
               ▼
┌──────────────────────────┐
│  4X: CONSOLIDATION       │
│  Appends new deltas to   │
│  prior fact_summary      │
│  (incremental, not full  │
│   rebuild)               │
└──────────────┬───────────┘
               │ updated fact_summary
               ▼
┌──────────────────────────┐
│  VERIFICATION AGENT      │
│  Input:                  │
│  • fact_summary          │
│  • prior 4C synthesis    │
│  • conversation_history  │
│  Output:                 │
│  • continuity_check      │
│  • contradictions[]      │
└──────────────┬───────────┘
               │
               ▼
┌──────────────────────────┐
│  4C: SYNTHESIS (Opus)    │
│  Produces follow-up      │
│  synthesis (layered —    │
│  prior synthesis stays   │
│  immutable in DB)        │
└──────────────┬───────────┘
               │
       ┌───────┴────────┐
       │                │
       ▼                ▼
  WaveOutput        RunMessage
  (new run_id)   (thread entry)
  synthesis_json   role=assistant
                   content=synthesis
```

---

## Level 2 — API ↔ Engine Data Flows

> **v1.3 note:** this flow originally ran through the legacy `Chart` model's
> `POST /api/runs` and `GET /api/charts/:id/dasha` / `GET /api/reports/:id`
> routes. Those routes had no remaining UI caller and were deleted. The
> current entry point is `POST /api/unified-charts/[id]/analyze` (see P9
> below); the SSE progress and run-detail flows are unchanged.

```
BROWSER                    API LAYER                    ENGINE / DB
   │                           │                            │
   │── POST /api/unified-      │                            │
   │   charts/:id/analyze ────►│                            │
   │   {queryTypes[],           │── read UnifiedChart ──────►│ D7: UnifiedChart
   │    userQuery, ...}         │                            │
   │                           │── create PipelineRun ─────►│ D2: PipelineRun
   │◄── 202 {run_id} ──────────│                            │
   │                           │                            │
   │── GET /api/runs/:id/events►│   (SSE connection open)   │
   │                           │◄── agent_start event ─────│ orchestrator
   │◄── SSE: agent_start ──────│                            │
   │◄── SSE: agent_complete ───│◄── wave_delta saved ──────│ D4: WaveOutput
   │◄── SSE: token_count ──────│                            │
   │◄── SSE: run_complete ─────│◄── synthesis saved ───────│ D4: WaveOutput
   │                           │◄── report written ────────│ FS: reports/
   │                           │◄── run updated ───────────│ D2: PipelineRun
   │                           │                            │
   │── GET /api/runs/:id ──────►│── read PipelineRun ───────►│ D2: PipelineRun
   │◄── run detail JSON ───────│                            │
   │                           │                            │
   │── GET /api/reports ───────►│── list done runs ──────────►│ D2: PipelineRun
   │◄── report list JSON ──────│                            │
   │                           │                            │
   │── GET /api/runs/:id/       │                            │
   │   report-content ─────────►│── read report_path ────────►│ D2: PipelineRun
   │◄── markdown/HTML content ─│── serve file content ──────│ FS: reports/
```

---

---

## Level 2 — P8: Chart Compute + Save/Load (SUPERSEDED by P9)

This process is independent from the AI analysis pipeline. It handles real-time
astronomical chart computation from birth data.

> **v1.3 note:** the P8.2/P8.3 save-and-load steps below (via `SavedChart` and
> `/api/compute/save`, `/api/compute/charts[/id]`) are historical — those routes
> were dormant and have been deleted. Save/Load now goes through P9's
> `UnifiedChart` (`POST /api/unified-charts/from-compute`, `GET
> /api/unified-charts[/id]`). P8.1 (the compute engine itself, stateless) is
> unchanged and still lives behind `POST /api/compute`; its UI is now the
> home page (`/`, formerly `/compute`).

```
PRACTITIONER
     │
     │ Birth data (date, time, timezone, latitude, longitude, sunriseMode)
     │ POST /api/compute
     ▼
┌───────────────────────────────┐
│  P8.1                         │
│  CHART COMPUTATION ENGINE     │
│  (engine/compute/index.ts)    │
│                               │
│  computeFullChart()           │
│  • Swiss Ephemeris calls      │
│  • Planetary positions (D1)   │
│  • Divisional charts          │
│    (D1–D30: D1,D2,D3,D4,D5,   │
│    D6,D7,D9,D10,D12,D24,D30) │
│  • Nakshatras                 │
│  • Chara Karakas              │
│  • Ashtakavarga               │
│  • Upagrahas                  │
│  • Special Lagnas             │
│  • Arudha Padas               │
│  • Pinda Strength             │
│  • Transits + Sade Sati       │
│                               │
│  computeVimshottari()         │
│  • Full dasha tree            │
└──────────────┬────────────────┘
               │ ComputedChart + DashaTree (JSON)
               │
               │─────────────────────────────────────► PRACTITIONER (Chart Compute UI, `/`)
               │
               │ (User clicks "Save Chart" — now via P9, see below)
               │ POST /api/unified-charts/from-compute
               ▼
              (See "Level 2 — P9: Unified Chart Ingestion + Analyze" —
               persists to UnifiedChart, not the legacy SavedChart table.)
```

### Data flows within Compute engine (P8.1):

```
BirthInput
    │
    ├─► Swiss Ephemeris (swisseph-v2) → Julian Day, Ayanamsa
    │
    ├─► computeAscendant()           → Lagna longitude, sign
    │
    ├─► computePlanetPositions()     → PlanetPosition[] (9 grahas)
    │       │
    │       ├─► computeNakshatras()  → NakshatraInfo[]
    │       ├─► computeDivisionalCharts() → DivisionalChart[] (D1–D30)
    │       │       └── Each varga gets:
    │       │           • planet placements
    │       │           • arudha padas (per-varga)
    │       │           • special lagnas (projected)
    │       │           • upagrahas (projected)
    │       ├─► computeCharaKarakas() → CharaKaraka[]
    │       ├─► computeAshtakavarga() → BAV/SAV
    │       ├─► computeUpagrahas()   → Upagraha[]
    │       ├─► computeSpecialLagnas() → SpecialLagna[]
    │       ├─► computeArudhaPadas() → ArudhaPada[]
    │       ├─► computePindaStrength() → PindaStrengthEntry[]
    │       └─► computeTransits()    → TransitAnalysis
    │
    └─► computeVimshottari(moonLong, birthDate) → DashaTree
```

### P8.4 — Varshaphal (Tajika annual solar-return chart) — on demand

Independent, stateless flow triggered from the `/compute` **Varshaphal** tab.

```
PRACTITIONER (Varshaphal tab: birth data + varshaYear)
     │ POST /api/compute/varshaphal
     ▼
┌───────────────────────────────────────────┐
│  computeVarshaphal() (engine/compute/       │
│  varshaphal.ts)                             │
│                                             │
│  • natal Sun sidereal longitude             │
│  • findSolarReturnJulianDay()   → Varsha    │
│    Pravesh instant (Newton on Sun long.)    │
│  • julianDayToLocalCivil()      → date/time │
│  • computeFullChart(annual)     → annual    │
│    chart (planets, Varsha Lagna, vargas,    │
│    Shadbala, …)                             │
│  • computeMuntha()  (+1 sign/year)          │
│  • computePanchavargeeyaBala()  (7 planets) │
│  • computeVarshesha() (5 candidates → lord) │
└──────────────┬──────────────────────────────┘
               │ VarshaphalResult (JSON)
               ▼
         PRACTITIONER (/compute Varshaphal tab)
```

No DB writes. Reuses `computeFullChart` for the annual chart (so the annual
Shadbala is the same engine as the natal). Method/caveats are surfaced in the
`method` field of the result.

---

## Level 2 — P9: Unified Chart Ingestion + Analyze (NEW)

Backs the **Generate Chart** and **AI Analysis** features. Chart data lands in the
`UnifiedChart` store (`D7`) via one of two ingestion paths, then AI Analysis runs
directly against that record.

```
PRACTITIONER
     │
     ├── Path A: birth data (date/time/tz/lat/lon/sunriseMode)
     │   POST /api/unified-charts/from-compute
     │        │
     │        ▼
     │   ┌────────────────────────────┐
     │   │ P9.1  COMPUTE + MAP         │
     │   │ computeFullChart()          │  (Swiss Ephemeris — deterministic)
     │   │ computeVimshottari()        │
     │   │ mapComputedToUnified()      │  (lib/chart-mapper.ts)
     │   └──────────────┬─────────────┘
     │                  │ UnifiedChart(source="compute", all domain columns)
     │                  ▼
     │            D7: UnifiedChart
     │
     └── Path B: ChartInputV1 JSON
         POST /api/unified-charts/from-paste
              │
              ▼
         ┌────────────────────────────┐
         │ P9.2  VALIDATE + MAP        │
         │ validateChartInput()        │
         │ mapPastedToUnified()        │
         └──────────────┬─────────────┘
                        │ UnifiedChart(source="paste", chartInputV1; domains null)
                        ▼
                  D7: UnifiedChart
                        │
                        │ (dedup on chartHash; 409 if exists)
                        │
                        │ POST /api/unified-charts/[id]/analyze
                        ▼
         ┌───────────────────────────────────────────────┐
         │ P9.3  ANALYZE (AI pipeline launcher)           │
         │                                               │
         │ • build ChartInputV1:                         │
         │     paste   → stored chartInputV1             │
         │     compute → buildChartInputV1FromUnified()  │
         │ • ensure legacy Chart row (by chartHash) ─────┼──► D1: Chart
         │ • computeVimshottari + preAnalysis +          │
         │   buildChartSummary                           │
         │ • resolvePlan(); compute path → strip Wave 1  │
         │ • wave1_delta:                                │
         │     compute → from D7 domain columns          │
         │     paste   → from D3 Wave1Cache (or run W1)  │
         │ • optional modelOverride → upsert ────────────┼──► model_config
         │ • create PipelineRun(chartId, unifiedChartId) ┼──► D2: PipelineRun
         └──────────────┬────────────────────────────────┘
                        │ 202 { runId, waveStrategy, executionPlan }
                        ▼
                  executePipeline()  ──►  P4: Pipeline Engine (Waves 2–4)
                        │                  (Wave 1 only for paste path)
                        ▼
                  D4: WaveOutput → P5: Report Renderer → FS: reports/
```

**Wave strategy summary:**

| `source` | Wave 1 | `wave1_delta` origin | `wave1Source` flag |
|---|---|---|---|
| `compute` | skipped (agents stripped from plan) | deterministic domain columns in `D7` | `"compute"` |
| `paste` | full LLM Wave 1 (unless cached) | `D3: Wave1Cache` or fresh Wave 1 run | `"llm"` |

---

## Level 2 — P10: Duration Analysis (NEW in v1.2)

Focused 3-agent sequential pipeline for date-range / domain-specific analysis.
Completely independent from the 18-agent wave pipeline.

Categories: health | career | wealth | marriage | property | cashflow.
The domain step (P10.4) is registry-driven: `DOMAIN_AGENT_REGISTRY`
(engine/durationAnalysis/registry.ts) resolves the category's agent id
(DA1-HEALTH … DA1-CASHFLOW), prompt file, model_config row, divisional charts,
and extra chart columns before the pipeline runs.

```
PRACTITIONER
     │ POST /api/duration-analysis
     │ { unifiedChartId, dateFrom, dateTo, category, symptoms?, userQuestion? }
     ▼
┌───────────────────────────┐
│ P10.1  API ROUTE           │──► create DurationAnalysis (status=queued) ──► D8
│  • validate (10yr cap,    │
│    dashaTree not null)    │──► create DurationMessage if userQuestion ───► D9
│  • fire pipeline (no await)│
└───────────────┬───────────┘
                │ 202 { analysisId }
                ▼ (fire-and-forget)
┌───────────────────────────┐
│ P10.2  STEP 0a — SLICER   │◄─── dashaTree, planets, nakshatras ────── D7: UnifiedChart
│  sliceDashaTree() pure TS │
│  • MD/AD/PD overlap filter│
│  • Lord annotations        │──► DashaSlice[] (with lordAnnotations,
│    (nakshatra, combustion, │      activatedYogas, ownsHouses, ...)
│    yogas, ownsHouses)     │
│  • Truncate to 200        │──► periodSlice + truncated flag
│  • empty → FAIL FAST      │      (no LLM call; hint: db:backfill-pd)
└───────────────┬───────────┘
                │
                ▼
┌───────────────────────────┐
│ P10.3  STEP 0b — TRANSIT  │◄─── transits, ashtakavarga ─────────── D7: UnifiedChart
│  buildTransitOverlay()    │
│  • Per unique AD boundary │──► calls computeTransits() [Swiss Eph]
│  • Saturn/Jup/Rahu/Ketu   │
│  • BAV scores from bav[]  │──► TransitOverlay[] → stored ──────────► D8
│  • Sade Sati from stored  │
│    allPeriods             │
│  • ashtamaShani, kantaka  │
└───────────────┬───────────┘
                │ periodSlice + transitOverlay persisted ──────────────► D8
                ▼
┌───────────────────────────┐
│ P10.4  DA-1 DOMAIN AGENT  │◄─── category-scoped chart data ──────── D7
│  (DA1-<DOMAIN>, registry- │      (registry: divisions + extra columns;
│   resolved prompt/model)  │       dashaTree stripped from prompt)
│  [Claude Sonnet, temp 0.3]│──► read DA1-<DOMAIN> model config ─── model_config
│  • BATCHED: ≤25 periods + │
│    matching overlays/call │──► callAgentJson(per-batch prompt)
│    (lenient JSON + 1 retry)│
│  • mergeDA1Outputs()      │
│  • Post-LLM: merge        │
│    transitContext +       │──► da1Output (merged, enriched) ────────► D8
│    lordAnnotations back   │
└───────────────┬───────────┘
                │
                ├── symptoms present? ───────► P10.5
                │
                └── no symptoms ─────────────► P10.6
                ▼
┌───────────────────────────┐
│ P10.5  DA-2 SYMPTOM       │◄─── da1Output ──────────────────────── D8
│  VALIDATOR (CONDITIONAL)  │
│  [Claude Sonnet, temp 0.0]│──► callLLM(DA-2 prompt)
│                           │──► da2Output ──────────────────────────► D8
│  GATE: found===false?     │
│    YES → status=           │
│      symptom_unmatched    │──────────────────────────────────────────► D8
│      SSE symptom_gate     │──────────────────────────────────────────► PRACTITIONER
│      STOP (overridable)   │
│    NO  → continue to DA-3 │
└───────────────┬───────────┘
                │
                ▼
┌───────────────────────────┐
│ P10.6  DA-3 FUTURE        │◄─── da1Output, da2Output, messages ─── D8, D9
│  ANALYSER                 │
│  [Claude Sonnet, temp 0.3]│──► callLLM(DA-3 prompt)
│                           │──► da3Output ──────────────────────────► D8
│  contextSummary generated │──► contextSummary (deterministic) ──────► D8
│  (no LLM, ~500 tokens)    │
│  status = done            │──────────────────────────────────────────► D8
│                           │──► assistant DurationMessage ──────────► D9
│  SSE run_complete ────────┼──────────────────────────────────────────► PRACTITIONER
└───────────────────────────┘

Override path (POST /api/duration-analysis/[id]/override):
  status=symptom_unmatched → set overrideApplied=true → resume P10.6 with mismatch note in prompt

Cancel path (POST /api/duration-analysis/[id]/cancel):
  status in queued|running|symptom_unmatched → status=cancelled ──► D8
  pipeline checks the flag between steps (per DA-1 batch, before DA-2/DA-3) and unwinds
  SSE run_cancelled ──► PRACTITIONER

Follow-up chat (POST /api/duration-analysis/[id]/chat):
  Load D8 (da1/da2/da3 outputs) + D9 (messages) → build DA-3 prompt →
  use contextSummary when history depth > 2 → callLLM → D9 message + D8 totals updated
```

---

## Level 2 — P11: MCP Server (Claude Desktop, no paid LLM)

The MCP server (`mcp/`) is a separate stdio process. It moves the *reasoning* into
Claude Desktop and only ever reads deterministic data + rubrics from the app — it
never triggers P4 or P10 (the paid LLM pipelines).

```
CLAUDE DESKTOP
     │  MCP (stdio): tools / resources / prompts
     ▼
┌─────────────────────┐
│  P11  MCP SERVER    │   thin HTTP client — no astrology logic, no LLM
│  (mcp/, Node)       │
└─────┬───────────────┘
      │ HTTP (localhost, optional x-mcp-token)
      ├──────────────► GET  /api/unified-charts[/id]     (D: UnifiedChart)   read
      ├──────────────► POST /api/compute[/varshaphal]    (stateless compute) no DB, no LLM
      ├──────────────► POST /api/timeline ───────────────► P10.2 slicer + P10.3 overlay
      │                                                    + deterministic scorePeriod + identifyPeaks
      │                                                    (NO DA-1/2/3, NO LLM)
      ├──────────────► GET  /api/knowledge/**  ──────────► prompts/domains + prompts/agents (readPromptFile)
      └──────────────► GET  /api/reports, /api/runs/[id], /api/duration-analysis[/id]   read-only

  Claude Desktop then reasons over the returned numbers using the returned rubric
  and writes the reading — billed to the Desktop subscription, $0 API.

  ✗ P11 never calls POST /api/unified-charts/[id]/analyze  (P4)
  ✗ P11 never calls POST /api/duration-analysis            (P10 create)
     Enforced by tests/mcp-cost-guard.test.ts.
```

**P11 data flows**

| Flow | From → To | Payload |
|---|---|---|
| discover | P11 → UnifiedChart | list/detail (read) |
| compute | P11 → compute engine | ComputedChart + dashaTree (stateless) |
| timeline | P11 → `/api/timeline` | scored MD/AD/PD periods + peaks + transit overlay |
| knowledge | P11 → `/api/knowledge` | domain/framework rubric text (include-expanded) |
| reports | P11 → runs / duration reads | already-generated results (no new cost) |

---

## Data Dictionary

| Data Item | Format | Size (approx) | Source | Consumers |
|---|---|---|---|---|
| `ChartInputV1` | JSON | ~30KB | Practitioner (input) | Pre-analysis, Chart table |
| `chart_summary` | String | ~2KB | chartSummary.ts | All 18 agents |
| `alerts[]` | JSON array | ~1KB | pre_analysis.ts | All agents via chart_summary |
| `dasha_tree` | JSON | ~5KB | computeVimshottari.ts | 3A, 4C, Dasha UI |
| `wave1_delta` | JSON | ~8KB | Agents 1A–1D | Wave 2 agents, Wave1Cache |
| `wave2_delta` (per agent) | JSON | ~4–6KB each | Agents 2A–2G | Wave 3 agents, 4X |
| `wave3_delta` (per agent) | JSON | ~4–6KB each | Agents 3A–3D | 4X |
| `fact_summary` | JSON | ~6KB | Agent 4X | 4A, 4B, 4C |
| `corrections[]` | JSON array | ~2KB | Agent 4A | 4B, 4C |
| `confidence_matrix[]` | JSON array | ~3KB | Agent 4B | 4C |
| `synthesis_json` | JSON | ~15KB | Agent 4C | Report renderer, RunMessage |
| `HTML report` | HTML file | ~50–150KB | renderer.ts | Browser, FS |
| `conversation_history` | JSON array | ~2KB/turn | RunMessage table | Verification Agent |
| `ComputedChart` | JSON (JSONB) | ~80–120KB | computeFullChart() | SavedChart.chartData, UnifiedChart domains, /compute UI |
| `DashaTree` (serialized) | JSON (JSONB) | ~5KB | computeVimshottari() | SavedChart.dashaTree, UnifiedChart.dashaTree, /compute UI |
| `UnifiedChart` (domain columns) | JSONB per domain | ~80–120KB total | chart-mapper.ts | Unified chart UI, AI Analysis (`wave1_delta` on compute path) |
| `shadbala` / `relationships` / `jaimini` / `bhavaBala` | JSON (JSONB) | ~4–15KB each | engine/compute deterministic modules | UnifiedChart columns, Wave 2 agents (compute path 1C/1D substitute) |
| `DashaSlice[]` (with annotations) | JSON (JSONB) | ~30–80KB (200 entries) | slicer.ts | DurationAnalysis.periodSlice; DA-1 prompt |
| `TransitOverlay[]` | JSON (JSONB) | ~5–15KB (one entry per AD boundary) | transitOverlay.ts | DurationAnalysis.transitOverlay; DA-1 prompt |
| `DA1Output` | JSON (JSONB) | ~20–50KB | DA-1 agent + post-merge | DurationAnalysis.da1Output; DA-2/DA-3 prompts |
| `DA2Output` | JSON (JSONB) | ~2–5KB | DA-2 agent | DurationAnalysis.da2Output; symptom gate |
| `DA3Output` | JSON (JSONB) | ~10–30KB | DA-3 agent | DurationAnalysis.da3Output; report UI |
| `contextSummary` | TEXT | ~500 tokens (~2KB) | index.ts (deterministic) | DurationAnalysis.contextSummary; DA-3 chat follow-up prompts |
