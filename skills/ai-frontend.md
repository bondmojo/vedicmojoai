# VedicMojoAI — AI Frontend Skill

Guidelines for building and maintaining the frontend UI that interacts with the AI pipeline.

## Architecture

- Next.js 14 App Router with React Server Components (RSC) by default
- Client Components (`'use client'`) only for: SSE streams, form interactions, real-time updates
- Tailwind CSS for styling — dark theme (gray-900 backgrounds, gray-700 borders)
- No component library — custom UI built with Tailwind utility classes

## SSE (Server-Sent Events) Pattern

The pipeline sends real-time progress via SSE. Frontend consumes with `EventSource`:

```typescript
// Standard SSE consumption pattern
const eventSource = new EventSource(`/api/runs/${runId}/events`)

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data)
  switch (data.type) {
    case 'agent_start':    // Agent began execution
    case 'agent_complete': // Agent finished — includes tokenIn, tokenOut, costUsd
    case 'agent_error':    // Agent failed — includes error message
    case 'run_complete':   // Full pipeline done — includes totals
    case 'run_failed':     // Pipeline failed
    case 'critical_error': // 4A halt gate triggered — show override UI
  }
}
```

**Rules:**
- Always close `EventSource` on unmount (return cleanup in `useEffect`)
- Don't open SSE if run status is already terminal (`done`, `failed`)
- Handle reconnection gracefully — re-fetch full state on reconnect

## Run Progress UI

- Group agents by wave (1–4) for visual hierarchy
- Show per-agent: status icon (pulse animation for running), token count, cost
- Show totals: tokens, cost, agents completed
- Halt state: red alert box with Override & Cancel buttons
- Terminal state: link to report viewer

## Report Viewer

- Reports are HTML files rendered via iframe (`/api/reports/{id}`)
- Server Component — fetches run from DB, validates report exists
- Shows toolbar with: back link, client name, query types, override badge
- "Open in new tab" link for full-screen viewing

## Unified Charts UI (Generate Chart + AI Analysis)

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

## Chart Visualization Components

Located in `app/compute/components/`:

| Component | Purpose |
|---|---|
| `NorthIndianChart.tsx` | Diamond-style Rashi chart |
| `SouthIndianChart.tsx` | South Indian square chart |
| `ChartGrid.tsx` | Multi-chart grid (D1–D60) |
| `DashaTimeline.tsx` | Visual dasha period timeline |
| `PlanetTable.tsx` | Planet positions/dignities table |
| `NakshatraTable.tsx` | Nakshatra analysis view |
| `KarakaTable.tsx` | Jaimini karaka assignments |
| `AshtakavargaView.tsx` | Bindhu scores display |
| `PindaStrengthView.tsx` | Pinda/Bala strength bars |
| `TransitsView.tsx` | Current transits overlay |

**Rules for chart components:**
- Accept typed props — no `any` or loose objects
- Use SVG for chart diagrams (not canvas)
- All chart types defined in `chartTypes.ts`
- Responsive: work at 300px–800px widths

## Form Patterns

- Query type selection: toggle buttons with visual highlight (indigo border + bg)
- Multi-select uses state array; "full" selection clears others
- Agent preview: computed from `DOMAIN_AGENTS` map — shows user which agents will run
- Submission: POST to API, receive 202 + `runId`, redirect to progress page
- Error display: red box below form, cleared on next submit

## State Management

- Local component state (`useState`) for UI state — no global store
- SSE-driven state: agents array, run status, cost totals
- Initial state loaded via `fetch` on mount, then SSE takes over
- No polling — SSE is the live update mechanism

## Data Flow (Frontend → Backend)

```
User action → POST /api/unified-charts/[id]/analyze (or /api/runs, /api/charts, /api/compute)
  → Returns 202 { runId, waveStrategy, executionPlan }
  → Redirect to /runs/{id}
  → Open SSE connection
  → Receive real-time agent progress
  → Terminal event → show report link
```

## Token & Cost Display

- Format tokens with `.toLocaleString()` (e.g., `12,345`)
- Format cost with `.toFixed(4)` and `$` prefix
- Show per-agent breakdown + run totals
- Grid layout: 3 columns (Total Tokens | Estimated Cost | Agents Complete)

## Accessibility

- Use semantic HTML (`<main>`, `<section>`, `<h1>`–`<h3>`)
- Status indicators: don't rely on color alone — use text labels alongside
- Form buttons: `disabled` state during loading with `cursor-not-allowed`
- Links: descriptive text (not "click here")
- Status badge component: maps status → color + readable text

## Error Handling in UI

- Network errors: show user-friendly message, suggest retry
- 404s: use `notFound()` from `next/navigation` (Server Components)
- Invalid states: defensive rendering — check `null` before accessing nested data
- Loading states: centered gray text ("Loading run...", "Loading chart...")
