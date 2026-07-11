# API Routes (Backend)

| Route | Method | Purpose |
|---|---|---|
| `/api/runs` | POST | Start a new pipeline run (returns 202 + runId) |
| `/api/runs/[id]` | GET | Get run status + agent outputs |
| `/api/runs/[id]/events` | GET | SSE stream for real-time progress |
| `/api/runs/[id]/override` | POST | Override halt gate, resume from 4B |
| `/api/runs/[id]/rerun` | POST | Re-run from specific wave |
| `/api/runs/[id]/cancel` | POST | Cancel a halted/running run |
| `/api/charts` | GET/POST | List/create charts |
| `/api/charts/[id]` | GET | Chart detail |
| `/api/charts/[id]/dasha` | GET | Computed dasha tree |
| `/api/compute` | POST | Run deterministic compute engine |
| `/api/unified-charts` | GET | List unified charts (filters: `search`, `lagna`, `source`) |
| `/api/unified-charts/from-compute` | POST | Generate Chart (Path A) — compute + persist `source="compute"` |
| `/api/unified-charts/from-paste` | POST | Generate Chart (Path B) — validate + persist `source="paste"` |
| `/api/unified-charts/[id]` | GET/DELETE | Load full domain data / delete (cascades runs) |
| `/api/unified-charts/[id]/analyze` | POST | AI Analysis on a unified chart (202); skips Wave 1 for compute source |
| `/api/duration-analysis` | POST | **Duration Analysis** — create run (202 + analysisId); validates 10yr cap + dashaTree present |
| `/api/duration-analysis` | GET | Run history — newest 50, optional `?unifiedChartId=` filter; sweeps stale runs first |
| `/api/duration-analysis/[id]` | GET | Full analysis record with all agent outputs and message thread (reaps if stalled) |
| `/api/duration-analysis/[id]/events` | GET | SSE stream for DA pipeline progress; emits `run_cancelled`, fails stalled runs |
| `/api/duration-analysis/[id]/chat` | POST | Follow-up question to DA-3 (synchronous); prompt-cached prefix; rolls up token cost |
| `/api/duration-analysis/[id]/override` | POST | Override symptom gate (status=symptom_unmatched → resume DA-3) |
| `/api/duration-analysis/[id]/cancel` | POST | Cancel run (queued/running/symptom_unmatched → cancelled; pipeline unwinds at next checkpoint) |
| `/api/reports/[id]` | GET | Serve HTML report file |
| `/api/health` | GET | Health check (DB + reports dir) |

**Pattern:** Long-running operations return 202 immediately. Progress via SSE.
