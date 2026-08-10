---
inclusion: auto
---

# VedicMojoAI — AI Frontend Skill

Guidelines for building and maintaining the frontend UI that interacts with the AI pipeline.

## Architecture

- Next.js 14 App Router with React Server Components (RSC) by default
- Client Components (`'use client'`) only for: SSE streams, form interactions, real-time updates
- Tailwind CSS for styling — dark theme (gray-900 backgrounds, gray-700 borders)
- No component library — custom UI built with Tailwind utility classes

## Long-running AI progress

- A `202` pipeline launch does not mean the browser owns the execution. The
  progress page must tolerate a dropped SSE connection and reconnect with
  capped backoff while the run remains non-terminal.
- On `connected`, merge the server's persisted agent-status snapshot into local
  state before processing later individual events. This makes a reconnection
  accurate without duplicating progress already persisted on the server.

## Detailed Guides

This skill is split into focused sub-documents in `skills/frontend/`:

| File | Topic |
|---|---|
| #[[file:skills/frontend/architecture.md]] | Next.js App Router, RSC vs Client Components, styling approach |
| #[[file:skills/frontend/sse-pattern.md]] | `EventSource` consumption, event types, cleanup |
| #[[file:skills/frontend/run-progress-ui.md]] | Wave-grouped agent status, token/cost display, halt state |
| #[[file:skills/frontend/report-viewer.md]] | Server Component iframe rendering, toolbar |
| #[[file:skills/frontend/unified-charts-ui.md]] | Generate Chart + AI Analysis pages, data flow |
| #[[file:skills/frontend/chart-visualization.md]] | 17 compute components (North/South Indian, Grahas, Bindu, Yogas, etc.) + shared modules |
| #[[file:skills/frontend/form-patterns.md]] | Query type selection, agent preview, 202 redirect flow |
| #[[file:skills/frontend/state-management.md]] | Local state + SSE-driven updates, no global store |
| #[[file:skills/frontend/duration-analysis-ui.md]] | DA form, results page, symptom gate, follow-up chat |
| #[[file:skills/frontend/accessibility.md]] | Semantic HTML, non-color-only indicators, disabled states |
| #[[file:skills/frontend/error-handling.md]] | Network errors, 404s, loading states |
