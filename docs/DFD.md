# VedicMojoAI — Data Flow Diagram (DFD)

**Version:** 1.0
**Last updated:** 2026-07-04
**Status:** Draft

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

Data Stores:
  D1: Chart          — immutable chart record (chart_id, lagna, chart_json, hash)
  D2: PipelineRun    — run record (status, planner_output, report_path, cost)
  D3: Wave1Cache     — chart_summary, wave1_delta, dasha_tree (keyed by chart_hash)
  D4: WaveOutput     — per-agent delta output, domain tag, token counts
  D5: RunMessage     — conversation thread (role, content, run_id)
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

```
BROWSER                    API LAYER                    ENGINE / DB
   │                           │                            │
   │── POST /api/runs ─────────►│                            │
   │   {chart_id, types[],      │── validate chart ─────────►│ D1: Chart
   │    user_query}             │                            │
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
   │── GET /api/charts/:id/    │                            │
   │       dasha ──────────────►│── read Wave1Cache ─────────►│ D3: Wave1Cache
   │◄── DashaTree JSON ────────│  (compute currentPeriod   │
   │   {currentPeriod derived  │   from today() at         │
   │    at request time}       │   request time)            │
   │                           │                            │
   │── GET /api/reports/:id ───►│── read report_path ────────►│ D2: PipelineRun
   │                           │── serve HTML file ─────────►│ FS: reports/
   │◄── HTML report ───────────│                            │
```

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
