# Unified Charts UI (Generate Chart + AI Analysis)

Pages under `app/unified-charts/` drive the current chart lifecycle:

| Page | Route | Purpose |
|---|---|---|
| List | `/unified-charts` | Generate Chart hub — lists compute + paste charts with run counts; filter by `search`/`lagna`/`source` |
| Detail | `/unified-charts/[id]` | Full domain view of a unified chart + recent runs |
| Analyze | `/unified-charts/[id]/analyze` | AI Analysis launcher — query types, agent preview, optional per-tier model override |

**Rules:**
- Generate Chart submits to `POST /api/unified-charts/from-compute` (birth data) or
  `from-paste` (`ChartInputV1` JSON). A `409` means the chart already exists — surface
  the existing chart, don't error.
- AI Analysis submits to `POST /api/unified-charts/[id]/analyze`, receives `202`
  with `{ runId, waveStrategy, executionPlan }`, then redirects to `/runs/[id]` and
  opens the SSE stream (same progress + report flow as legacy runs).
- The analyze response's `waveStrategy` (`skip_wave1` | `full_pipeline`) can be shown
  so the user understands compute-path charts skip LLM Wave 1.

## Data Flow (Frontend → Backend)

```
User action → POST /api/unified-charts/[id]/analyze (or /api/runs, /api/charts, /api/compute)
  → Returns 202 { runId, waveStrategy, executionPlan }
  → Redirect to /runs/{id}
  → Open SSE connection
  → Receive real-time agent progress
  → Terminal event → show report link
```
