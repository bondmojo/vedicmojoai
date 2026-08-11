---
inclusion: auto
---

# VedicMojoAI — Next.js Project Structure

This is a Next.js 14 (App Router) TypeScript monorepo. All UI, API routes, pipeline engine, and report rendering live in one project.

## Directory Layout

```
vedicmojoai/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Root layout
│   ├── page.tsx                  # Chart list (home)
│   ├── charts/
│   │   └── [id]/
│   │       ├── page.tsx          # Chart detail + run history
│   │       ├── run/page.tsx      # New run form
│   │       └── dasha/page.tsx    # Dasha timeline viewer
│   ├── runs/
│   │   └── [id]/
│   │       ├── page.tsx          # Run progress (SSE)
│   │       └── report/page.tsx   # Report viewer (Reporting)
│   ├── compute/                  # Generate Chart — compute UI + chart components
│   │   └── components/           # NorthIndianChart, ChartGrid, DashaTimeline, etc.
│   ├── unified-charts/           # Generate Chart hub + AI Analysis launcher
│   │   ├── page.tsx              # List unified charts (compute + paste)
│   │   └── [id]/
│   │       ├── page.tsx          # Unified chart detail (full domain view)
│   │       └── analyze/page.tsx  # AI Analysis launcher
│   ├── matchmaking/              # Marriage Matchmaking (Ashtakoota + Mangal Dosha)
│   │   ├── page.tsx              # Bride/groom picker + saved-match list
│   │   └── [id]/page.tsx         # Match result (8-koota breakdown, Mangal Dosha)
│   └── api/
│       ├── charts/               # GET, POST
│       │   └── [id]/
│       │       ├── route.ts
│       │       └── dasha/route.ts
│       ├── compute/              # POST compute; save/load computed charts
│       │   ├── route.ts
│       │   ├── save/route.ts
│       │   └── charts/[id]/route.ts
│       ├── unified-charts/       # UnifiedChart CRUD + ingestion + analyze
│       │   ├── route.ts          # GET list
│       │   ├── from-compute/route.ts  # POST Path A
│       │   ├── from-paste/route.ts    # POST Path B
│       │   └── [id]/
│       │       ├── route.ts      # GET/DELETE
│       │       └── analyze/route.ts   # POST AI Analysis
│       ├── runs/                 # POST (start run)
│       │   └── [id]/
│       │       ├── route.ts      # GET run status
│       │       ├── events/route.ts  # SSE stream
│       │       ├── override/route.ts
│       │       ├── rerun/route.ts
│       │       └── cancel/route.ts
│       ├── matchmaking/          # Marriage Matchmaking (CompatibilityMatch CRUD)
│       │   ├── route.ts          # POST (create+persist), GET (list, summary fields)
│       │   ├── preview/route.ts  # POST — identical, no persistence (MCP-reachable)
│       │   ├── [id]/route.ts     # GET (verbatim persisted result), DELETE
│       │   └── _shared.ts        # MatchRequestSchema, resolveChartsForMatch, computeMatchResult, buildMangalInput
│       └── reports/
│           └── [id]/route.ts     # Serve HTML report
├── engine/                       # Pipeline engine (TypeScript)
│   ├── constants.ts              # YEAR_DAYS, nakshatra map, dasha years, domain→agent map
│   ├── pre_analysis.ts           # 11 deterministic rules → alerts[]
│   ├── computeVimshottari.ts     # Moon longitude → DashaTree
│   ├── planner.ts                # query types → agent execution plan
│   ├── orchestrator.ts           # Fan-out execution, DB writes, SSE emission
│   ├── llm.ts                    # Vercel AI SDK wrapper
│   ├── chartSummary.ts           # ChartInputV1 + DashaTree → compact summary
│   ├── renderer.ts               # Synthesis JSON → HTML report
│   ├── compute/                  # deterministic Swiss Ephemeris engine
│   │   ├── index.ts              # computeFullChart()
│   │   ├── planets.ts, nakshatras.ts, divisional.ts (incl. D2/D3/D12)
│   │   ├── ashtakavarga.ts, karakas.ts, arudhaPadas.ts, specialLagnas.ts
│   │   ├── upagrahas.ts, pindaStrength.ts, transits.ts
│   │   ├── shadbala.ts           # deterministic 1C
│   │   ├── relationships.ts      # deterministic 1D
│   │   ├── nakshatraRelationships.ts, jaimini.ts, bhavaBala.ts
│   │   ├── matchmakingTables.ts   # Ashtakoota static reference tables (nakshatra/rashi attrs, 5 matrices)
│   │   ├── matchmaking.ts        # pure Ashtakoota + Mangal Dosha engine (computeMatch)
│   │   └── types.ts
│   └── waves/
│       ├── wave1.ts
│       ├── wave2.ts
│       ├── wave3.ts
│       └── wave4.ts
├── lib/                          # Shared utilities
│   ├── db.ts                     # Prisma client singleton
│   ├── validation.ts             # ChartInputV1 schema validation
│   ├── errors.ts                 # Typed error classes
│   ├── chart-mapper.ts           # ComputedChart / ChartInputV1 ↔ UnifiedChart mapping
│   └── types.ts                  # Shared TypeScript interfaces
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts                   # ModelConfig seed data
├── prompts/
│   └── agents/                   # LLM prompt files (read-only at runtime)
├── data/
│   ├── reports/                  # Generated HTML reports
│   └── sample/                   # Sample chart JSONs
├── docker-compose.yml            # PostgreSQL + app
├── Dockerfile
├── .env.example
├── package.json
├── tsconfig.json
└── next.config.ts
```

## Key Conventions

- **API routes** use Next.js Route Handlers (app/api/...)
- **Server Components** by default; Client Components only for interactivity (SSE, forms)
- **Prisma** for all DB access — never raw SQL
- **Vercel AI SDK** for LLM calls — provider-agnostic
- **Authentication**: Auth.js (NextAuth v5) + database sessions, per-user
  `UnifiedChart` ownership (`.kiro/specs/user-management/`). Every route
  resolves a caller via `resolveRequestUser` (`lib/auth.ts`) — session cookie
  first, then a per-user MCP token; ownership mismatch → 404, not 403.
- **Rendered reports** are stored in `PipelineRun.reportHtml` or
  `PipelineRun.reportMarkdown`; `data/reports/` is a best-effort local/Cloud
  Run copy and fallback for legacy reports. Route
  `GET /api/runs/[id]/report-content` must read the DB content first.
- **Prompt files** in `prompts/agents/*.md` — read at runtime, never modified by the app
- **Vercel background routes** that launch pipelines must use
  `waitUntil(pipelinePromise)` and export an explicit `maxDuration`; returning
  `202` with only an unawaited Promise is not durable serverless work.
- **Runtime-read assets:** keep `prompts/**/*` and `swisseph-v2/**/*` in
  `experimental.outputFileTracingIncludes` for API routes. Vercel's tracer
  cannot infer those filesystem/native-addon reads.
