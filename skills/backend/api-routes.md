# API Routes (Backend)

> **v1.3:** the legacy `Chart`-model routes (`/api/charts`, `/api/charts/[id]`,
> `/api/charts/[id]/dasha`, `POST /api/runs`) and the dormant
> `/api/compute/save`, `/api/compute/charts`, `/api/compute/charts/[id]`,
> `/api/reports/[id]`, `/api/runs/[id]/rerun` routes were deleted — none had a
> remaining UI caller (confirmed by grepping for `fetch(...)`/`EventSource(...)`
> call sites across `app/`). `POST /api/unified-charts/[id]/analyze` is the only
> way to start a pipeline run now. `/api/reports` (list) and `/api/runs/[id]/*`
> (GET/events/override/cancel/chat/report-content) remain — those ARE called
> from the Reports and Run Progress/Report pages.

| Route | Method | Purpose |
|---|---|---|
| `/api/runs/[id]` | GET | Get run status + agent outputs |
| `/api/runs/[id]/events` | GET | SSE stream for real-time progress |
| `/api/runs/[id]/override` | POST | Override halt gate, resume from 4B |
| `/api/runs/[id]/cancel` | POST | Cancel a halted/running run |
| `/api/runs/[id]/chat` | POST | Follow-up question against a completed report |
| `/api/runs/[id]/report-content` | GET | Raw markdown/HTML report content |
| `/api/reports` | GET | List all completed pipeline runs (Reports page) |
| `/api/compute` | POST | Run deterministic compute engine (UI: home page `/`) |
| `/api/compute/varshaphal` | POST | Tajika Varshaphal (annual solar-return chart) for a `varshaYear` — returns Varsha Pravesh, annual chart, Muntha, Panchavargeeya Bala, Varshesha |
| `/api/unified-charts` | GET | List unified charts (filters: `search`, `lagna`, `source`) |
| `/api/unified-charts/from-compute` | POST | Generate Chart (Path A) — compute + persist `source="compute"` |
| `/api/unified-charts/from-paste` | POST | Generate Chart (Path B) — validate + persist `source="paste"` |
| `/api/unified-charts/[id]` | GET/PATCH/DELETE | Load full domain data / rename (`{name}`) / delete (cascades pipeline runs + duration analyses/messages) |
| `/api/unified-charts/[id]/analyze` | POST | AI Analysis on a unified chart (202); skips Wave 1 for compute source |
| `/api/duration-analysis` | POST | **Duration Analysis** — create run (202 + analysisId); validates 10yr cap + dashaTree present |
| `/api/duration-analysis` | GET | Run history — newest 50, optional `?unifiedChartId=` filter; sweeps stale runs first |
| `/api/duration-analysis/[id]` | GET | Full analysis record with all agent outputs and message thread (reaps if stalled) |
| `/api/duration-analysis/[id]/events` | GET | SSE stream for DA pipeline progress; emits `run_cancelled`, fails stalled runs |
| `/api/duration-analysis/[id]/chat` | POST | Follow-up question to DA-3 (synchronous); prompt-cached prefix; rolls up token cost |
| `/api/duration-analysis/[id]/override` | POST | Override symptom gate (status=symptom_unmatched → resume DA-3) |
| `/api/duration-analysis/[id]/cancel` | POST | Cancel run (queued/running/symptom_unmatched → cancelled; pipeline unwinds at next checkpoint) |
| `/api/health` | GET | Health check (DB + reports dir) |

**Pattern:** Long-running operations return 202 immediately. Progress via SSE.
