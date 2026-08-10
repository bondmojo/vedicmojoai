# VedicMojoAI Phase 1 MVP — Requirements

## Overview

VedicMojoAI is an internal web application that wraps an 18-agent, 4-wave Vedic astrology analysis pipeline. It accepts a pre-computed birth chart as JSON, orchestrates LLM agents, persists outputs, and renders interactive HTML reports.

## Functional Requirements

### FR-1: Chart Submission
- Accept ChartInputV1 JSON (paste or file upload)
- Validate against schema (15 hard rules)
- Persist to PostgreSQL with generated chart_id
- Duplicate detection via sha256(chart_json)

### FR-2: Chart History
- List all submitted charts with client name, lagna, run count, last run date
- Re-open and re-run on existing charts

### FR-3: Query Intent
- Multi-select analysis types: generic | health | wealth | career | property | marriage | full
- Optional free-text user_query
- Display which agents will run before confirmation

### FR-4: Deterministic Planner
- Map query types → minimum agent set via static DOMAIN_AGENTS lookup
- ALWAYS_RUN applies only to first query on a chart
- Planner output persisted for auditability

### FR-5: Pipeline Execution
- Async execution (POST returns 202 immediately)
- Status transitions: queued → running → done | failed | halted_for_review
- Each wave output persisted as it completes

### FR-6: Live Progress
- SSE endpoint emits agent_start, agent_complete, agent_error, run_complete, critical_error
- UI shows per-agent progress with token counts

### FR-7: Custom Agent Selection
- Hand-pick waves/agents via UI checkboxes
- "Force re-run Wave 1" toggle
- Validation (e.g., 4C requires 4X)

### FR-8: Wave 1 Caching
- Cache Wave 1 output per chart (keyed by chart_hash)
- Reuse unless force_rerun_wave1 = true

### FR-9: HTML Reports
- Render to reports/{slug}_{timestamp}_{query}.html
- Store path in pipeline_runs.report_path

### FR-10: Report Viewer
- In-browser tabbed view (health/wealth/career/marriage/property/dasha)
- Domain tabs correspond to query types run

### FR-11: Follow-up Queries
- Reuse Wave 1 (cached), skip ALWAYS_RUN
- Run only applicable domain agents + Verification Agent
- Preserve conversation history in run_messages

### FR-12: Token/Cost Tracking
- Per-agent: token_in, token_out, cost_usd in WaveOutput
- Per-run totals in PipelineRun

### FR-13: Provider-Agnostic LLM
- Vercel AI SDK wrapper (callLLM in engine/llm.ts)
- Provider/model configurable via model_config table

### FR-14: Vimshottari Dasha Engine
- Deterministic computation from Moon longitude + birth datetime
- YEAR_DAYS = 365.2425 (single constant)
- Self-verifying (contiguity, AD sum, total check)
- Stored in Wave1Cache

### FR-15: Dasha Timeline UI
- Interactive viewer: mahadasha bars → expand to antardasha → pratyantar
- Current period highlighted, colour-coded

### FR-16: Career Agent (2F)
- D10 analysis, H10 yogas, career peak/stress periods
- career_strength_score (1-10)

### FR-17: Marriage Agent (2G)
- D9 analysis, H7, Venus/Jupiter karakas, timing windows
- relationship_strength_score (1-10)

### FR-18: Wave 4 Fact Consolidation (4X)
- Distills Waves 1-3 into ~6KB fact_summary
- 4C receives only: chart_summary + fact_summary + 4A + 4B (~15K tokens)

### FR-19: Critical Error Halt Gate
- Between 4A and 4B
- Critical errors → halt (no report generated)
- Practitioner can: Override | Re-run from Wave X | Cancel

### FR-20: Data Migration
- backfill_runs script to import existing runs/ directory

## Non-Functional Requirements

| # | Requirement |
|---|---|
| NFR-1 | ~10 reports/month, single user. No Celery/Redis needed. |
| NFR-2 | Single TypeScript/Next.js monorepo. No cross-language coupling. |
| NFR-3 | PostgreSQL via Prisma + HTML reports on disk. |
| NFR-4 | Model/provider swappable without code changes. |
| NFR-5 | Full auditability: planner decision, per-wave output, prompt version, model, cost. |
| NFR-6 | Token optimization: cached W1, delta outputs, chart_summary prefix, 4X consolidation. |
| NFR-7 | Full run: 60-120s. Follow-ups materially faster. |
| NFR-8 | Runs locally via one command. Deployable to GCP Cloud Run. |
| NFR-9 | Chart immutable per run. Prior synthesis never overwritten. |
| NFR-10 | Dasha computation is deterministic and reproducible. |

## References

- #[[file:docs/USER_STORIES_v1.md]]
- #[[file:docs/ChartInputV1_schema.md]]
