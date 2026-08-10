# VedicMojoAI Phase 1 MVP — Design

## Architecture

Single Next.js 14 (TypeScript) monorepo with App Router. UI, API routes, pipeline engine, and report renderer all in one project.

```
Browser → Next.js API Layer → Engine → LLM APIs (Claude/OpenAI/Gemini)
                                ↓
                        PostgreSQL (Prisma)
                        File System (reports/)
```

## Technology Stack

| Component | Choice | Rationale |
|---|---|---|
| Framework | Next.js 14 (App Router) | Single deploy, SSR + API in one |
| Language | TypeScript (strict) | Type safety across full stack |
| Database | PostgreSQL 16 via Prisma | Type-safe ORM, easy migrations |
| LLM SDK | Vercel AI SDK | Provider-agnostic, streaming, Next.js native |
| Validation | Zod | Runtime schema validation with type inference |
| Container | Docker (node:20-alpine) | Portable, multi-stage build |
| Styling | Tailwind CSS | Utility-first, no component library needed |

## Data Model

6 tables: Chart, PipelineRun, Wave1Cache, WaveOutput, RunMessage, ModelConfig.
Full schema in #[[file:prisma/schema.prisma]].

Key relationships:
- Chart 1:N PipelineRun
- PipelineRun 1:N WaveOutput
- PipelineRun 1:N RunMessage
- Chart 1:0..1 Wave1Cache (via chart_hash)
- PipelineRun self-referential (parent_run_id for follow-ups)

## Engine Architecture

```
engine/
├── constants.ts          — YEAR_DAYS, nakshatra map, DOMAIN_AGENTS, ALWAYS_RUN
├── computeVimshottari.ts — Pure function: Moon longitude → DashaTree
├── pre_analysis.ts       — 11 deterministic rules → alerts[]
├── chartSummary.ts       — ChartInputV1 + alerts + DashaTree → ~2KB summary
├── planner.ts            — query_types → AgentId[] (deterministic)
├── orchestrator.ts       — Fan-out execution, DB writes, SSE, halt gate
├── llm.ts                — Vercel AI SDK wrapper (single callLLM function)
├── renderer.ts           — 4C synthesis → HTML report file
└── waves/                — Per-wave execution helpers
```

## Pipeline Flow

1. Pre-Analysis (deterministic): rules + dasha computation + chart_summary
2. Wave 1 (parallel): 1A, 1B, 1C, 1D → foundation extraction
3. Wave 2 (parallel, planner-selected): 2A-2G → domain analysis
4. Wave 3 (parallel, planner-selected): 3A-3D → synthesis/timing
5. Wave 4 (sequential): 4X → 4A → HALT GATE → 4B → 4C → report

## Context Assembly (Token Optimization)

| Agent | Context Injected | ~Size |
|---|---|---|
| 1A-1D | chart_summary + alerts | 3KB |
| 2A-2G | chart_summary + wave1_delta | 10KB |
| 3A-3D | chart_summary + wave1_delta + relevant wave2 deltas | 12KB |
| 4X | chart_summary + all wave2/3 deltas | 40KB |
| 4A, 4B | chart_summary + fact_summary | 8KB |
| 4C (Opus) | chart_summary + fact_summary + 4A + 4B | 15KB |

## API Design

| Endpoint | Method | Purpose |
|---|---|---|
| /api/charts | GET, POST | List / submit chart |
| /api/charts/[id] | GET | Chart detail + run history |
| /api/charts/[id]/dasha | GET | Computed dasha tree (current period derived at request time) |
| /api/runs | POST | Start pipeline run (202) |
| /api/runs/[id] | GET | Run status + agent results |
| /api/runs/[id]/events | GET | SSE stream |
| /api/runs/[id]/override | POST | Override halt, resume from 4B |
| /api/runs/[id]/rerun | POST | Re-run from specific wave |
| /api/runs/[id]/cancel | POST | Cancel halted/running run |
| /api/reports/[id] | GET | Serve HTML report |
| /api/health | GET | Health check |

## Key Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| LLM wrapper | Vercel AI SDK (not LangChain) | Pipeline is fixed topology, not dynamic graph. Simpler, less overhead. |
| Dasha computation | Deterministic TypeScript | Math is exact; LLM dasha dates are error-prone |
| Error handling | Severity triage + halt gate | Critical errors must not produce a report |
| 4C input reduction | 4X fact-consolidation | Reduces Opus input from ~100K to ~15K tokens |
| Report storage | HTML files on disk | Simple, portable, no blob-storage complexity |
| Auth | None (Phase 1) | Single internal user |

## References

- #[[file:docs/HLD.md]]
- #[[file:docs/ERD.md]]
- #[[file:docs/DFD.md]]
- #[[file:docs/Agents.md]]
