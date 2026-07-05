# VedicMojoAI — Next.js Project Structure

This is a Next.js 14 (App Router) TypeScript monorepo. All UI, API routes, pipeline engine, and report rendering live in one project.

## Directory Layout

```
vedicmojoai/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Root layout
│   ├── page.tsx                  # Redirects to /charts (home)
│   ├── charts/
│   │   └── [id]/
│   │       ├── page.tsx          # Chart detail + run history
│   │       ├── run/page.tsx      # New run form (legacy path)
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
│   └── api/
│       ├── charts/               # GET, POST (legacy chart management)
│       │   └── [id]/
│       │       ├── route.ts
│       │       └── dasha/route.ts
│       ├── compute/              # POST compute; save/load computed charts
│       │   ├── route.ts
│       │   ├── save/route.ts
│       │   └── charts/[id]/route.ts
│       ├── unified-charts/       # UnifiedChart CRUD + ingestion + analyze
│       │   ├── route.ts          # GET list
│       │   ├── from-compute/route.ts  # POST Path A (Generate Chart)
│       │   ├── from-paste/route.ts    # POST Path B (Generate Chart)
│       │   └── [id]/
│       │       ├── route.ts           # GET/DELETE
│       │       └── analyze/route.ts   # POST AI Analysis
│       ├── runs/                 # POST (start legacy run)
│       │   └── [id]/
│       │       ├── route.ts      # GET run status
│       │       ├── events/route.ts  # SSE stream
│       │       ├── override/route.ts
│       │       ├── rerun/route.ts
│       │       └── cancel/route.ts
│       ├── reports/
│       │   └── [id]/route.ts     # Serve HTML report
│       └── health/route.ts       # Health check
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
│   │   ├── planets.ts            # planet longitudes, signs, houses
│   │   ├── nakshatras.ts         # nakshatra, pada, sub-lord
│   │   ├── divisional.ts         # D1–D30 incl. D2/D3/D12 (required for Shadbala)
│   │   ├── ashtakavarga.ts       # BAV/SAV
│   │   ├── karakas.ts            # Jaimini chara karakas
│   │   ├── arudhaPadas.ts        # arudha padas
│   │   ├── specialLagnas.ts      # HL, GL, SL etc.
│   │   ├── upagrahas.ts          # Gulika, Mandi etc.
│   │   ├── pindaStrength.ts      # pinda strength
│   │   ├── transits.ts           # transits + Sade Sati
│   │   ├── shadbala.ts           # deterministic 1C — full 6-component Shadbala
│   │   ├── relationships.ts      # deterministic 1D — conjunctions/aspects/yuddha/parivartana
│   │   ├── nakshatraRelationships.ts # sub-lords, depositor chains, clusters
│   │   ├── jaimini.ts            # argala, yogi/avayogi, special-lagna aspects
│   │   ├── bhavaBala.ts          # Bhavadhipati/Dig/Drishti bala
│   │   └── types.ts              # all compute type definitions
│   └── waves/
│       ├── wave1.ts              # LLM path: 1A, 1B, 1C, 1D (skipped for compute path)
│       ├── wave2.ts              # parallel, planner-selected: 2A–2G
│       ├── wave3.ts              # parallel, planner-selected: 3A–3D
│       └── wave4.ts              # sequential: 4X → 4A → 4B → 4C
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
├── skills/                       # AI convention guides (this directory — tracked in git)
├── docs/                         # Architecture docs: ERD, HLD, DFD, computation guides
├── data/
│   ├── reports/                  # Generated HTML reports
│   └── sample/                   # Sample chart JSONs
├── Agents.md                     # Agent catalogue + pipeline reference
├── Claude.md                     # Claude Desktop orientation guide
├── docker-compose.yml
├── Dockerfile
├── .env.example
├── package.json
├── tsconfig.json
└── next.config.ts
```

## Key Conventions

- **API routes** use Next.js Route Handlers (`app/api/...`)
- **Server Components** by default; Client Components only for interactivity (SSE, forms)
- **Prisma** for all DB access — never raw SQL
- **Vercel AI SDK** for LLM calls — provider-agnostic
- **No authentication** in Phase 1 (single internal user)
- **HTML reports** written to `data/reports/` as files, path stored in DB
- **Prompt files** in `prompts/agents/*.md` — read at runtime, never modified by the app
- **`lib/chart-mapper.ts`** is the single source of truth for all format conversions between
  `ComputedChart`, `ChartInputV1`, and `UnifiedChart` — never hand-roll mapping elsewhere
