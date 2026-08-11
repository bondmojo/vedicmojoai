# VedicMojoAI Phase 1 MVP — Tasks

## Completed Tasks

### Task 1: Project Initialization
- [x] Next.js 14 project with package.json, tsconfig, tailwind
- [x] Docker (Dockerfile + docker-compose.yml + entrypoint)
- [x] .env.example, .eslintrc, .gitignore
- [x] Prisma schema + initial migration + seed script

### Task 2: Lib Layer
- [x] lib/types.ts — Full type system (ChartInputV1, DashaTree, pipeline types)
- [x] lib/validation.ts — Zod schema, V1-V15 hard rules, W1-W6 warnings
- [x] lib/errors.ts — DashaIntegrityError, ChartValidationError, PipelineHaltError, LLMCallError
- [x] lib/db.ts — Prisma singleton

### Task 3: Engine Core (Deterministic)
- [x] engine/constants.ts — YEAR_DAYS, nakshatras, DOMAIN_AGENTS, AGENT_CATALOGUE
- [x] engine/computeVimshottari.ts — Full 120-year dasha tree with integrity checks
- [x] engine/pre_analysis.ts — 11 rules
- [x] engine/chartSummary.ts — Compact ~2KB summary builder
- [x] engine/planner.ts — Deterministic query → agent resolution

### Task 4: Engine LLM + Orchestrator
- [x] engine/llm.ts — Vercel AI SDK wrapper, cost estimation
- [x] engine/orchestrator.ts — Pipeline execution, halt gate, context assembly, resume
- [x] engine/waves/wave1-4.ts — Per-wave helpers
- [x] engine/renderer.ts — 4C JSON → tabbed HTML report

### Task 5: API Routes
- [x] /api/charts (GET list, POST submit)
- [x] /api/charts/[id] (GET detail)
- [x] /api/charts/[id]/dasha (GET computed tree)
- [x] /api/runs (POST start)
- [x] /api/runs/[id] (GET status)
- [x] /api/runs/[id]/events (GET SSE stream)
- [x] /api/runs/[id]/override (POST)
- [x] /api/runs/[id]/rerun (POST)
- [x] /api/runs/[id]/cancel (POST)
- [x] /api/reports/[id] (GET serve HTML)
- [x] /api/health (GET)

### Task 6: UI Pages
- [x] /charts — Chart list (Server Component)
- [x] /charts/new — Submit chart (Client Component, file upload + paste)
- [x] /charts/[id] — Chart detail + run history
- [x] /charts/[id]/run — New run form (type selector, agent preview)
- [x] /charts/[id]/dasha — Interactive dasha timeline
- [x] /runs/[id] — Run progress (SSE, halt actions)
- [x] /runs/[id]/report — Report viewer (iframe)

### Task 7: Review + Fixes
- [x] Fix Vimshottari integrity check (was always failing)
- [x] Add verification agent to AGENT_CATALOGUE
- [x] Add /api/runs/[id]/rerun route
- [x] Fix Dockerfile public/ directory
- [x] Wave 3 domain-scoped context filtering
- [x] Empty factSummary guard after 4X
- [x] validateAgentSelection called on custom agents
- [x] AI SDK packages in serverComponentsExternalPackages

## Remaining Tasks (Not Yet Implemented)

### Task 8: Testing
- [ ] Unit tests for computeVimshottari (edge cases: 0°, 360°, boundary nakshatras)
- [ ] Unit tests for pre_analysis rules
- [ ] Unit tests for planner (all query types, follow-ups, custom agents)
- [ ] Integration tests for API routes (with test DB)
- [ ] Set up Vitest configuration

### Task 9: Data Migration
- [ ] backfill_runs.ts script (walks existing runs/ directory)
- [ ] djma.json → ChartInputV1 converter
- [ ] Validate all migrated data against schema

### Task 10: End-to-End Verification
- [ ] Submit sample.json → full pipeline → verify report generated
- [ ] Test follow-up query flow (Wave 1 cached, verification runs)
- [ ] Test halt gate (inject critical error, verify halt state + override)
- [ ] Docker cold start: `docker compose up` builds and runs successfully
- [ ] Verify SSE stream in browser

### Task 11: Polish
- [ ] Error boundary components for UI pages
- [ ] Loading states / skeleton screens
- [ ] Responsive design verification (mobile)
- [ ] Cost estimation display on "New Run" page before starting
