# Duration Analysis UI

Pages under `app/duration-analysis/`:

## Form Page (`/duration-analysis`)

- Chart picker populated from `GET /api/unified-charts`
- Date range inputs with client-side validation (required, dateFrom < dateTo)
- Category selector (pill tabs, pre-selected to health)
- Optional symptoms textarea and question textarea
- Submits to `POST /api/duration-analysis`; on 202 redirects to `/duration-analysis/[id]`

## Results Page (`/duration-analysis/[id]`)

- Medical disclaimer banner — persistent, non-dismissible when `category === 'health'`
- Agent progress panel: DA-1 / DA-2 / DA-3 status dots (pending / running / done / failed / skipped)
- **Symptom gate banner** (when `status === 'symptom_unmatched'`): amber panel with DA-2 analysis + "Override & Continue" / "Accept & Stop" buttons
- **Period table** (after DA-1): columns MD/AD/PD lord, Start, End, Intensity badge, Favorable, Transit (♄ H{N} ({bavScore}/8) color-coded), expandable Analysis with Bahiranga + Antaranga + Activated Yogas sections
- **Truncation notice** (when `record.periodSlice.length === 200`): amber note
- **DA-3 Forecast**: prominent `answer` card, accordion cards per AD period (bahiranga/antaranga/why/transit_why/recommendations)
- **Follow-up chat**: Focus Period dropdown, textarea + Send, message history (user right/assistant left)

## SSE Event Handling

- Connects to `GET /api/duration-analysis/[id]/events`
- Handles: `connected`, `agent_start`, `agent_complete`, `symptom_gate`, `agent_error`, `run_complete`
- On `run_complete`: refetch full record from `GET /api/duration-analysis/[id]`
- Close SSE on terminal states: `done | failed | symptom_unmatched`

## Override Flow

- "Override & Continue" calls `POST /api/duration-analysis/[id]/override`
- On 202: clear symptom gate banner, set local status to running, re-open SSE
