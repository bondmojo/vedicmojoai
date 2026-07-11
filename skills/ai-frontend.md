# VedicMojoAI — AI Frontend Skill

Guidelines for building and maintaining the frontend UI that interacts with the AI pipeline.

## Architecture

- Next.js 14 App Router with React Server Components (RSC) by default
- Client Components (`'use client'`) only for: SSE streams, form interactions, real-time updates
- Tailwind CSS for styling — dark theme (gray-900 backgrounds, gray-700 borders)
- No component library — custom UI built with Tailwind utility classes

## Detailed Guides

This skill is split into focused sub-documents in `skills/frontend/`:

| File | Topic |
|---|---|
| [architecture.md](frontend/architecture.md) | Next.js App Router, RSC vs Client Components, styling approach |
| [sse-pattern.md](frontend/sse-pattern.md) | `EventSource` consumption, event types, cleanup |
| [run-progress-ui.md](frontend/run-progress-ui.md) | Wave-grouped agent status, token/cost display, halt state |
| [report-viewer.md](frontend/report-viewer.md) | Server Component iframe rendering, toolbar |
| [unified-charts-ui.md](frontend/unified-charts-ui.md) | Generate Chart + AI Analysis pages, data flow |
| [chart-visualization.md](frontend/chart-visualization.md) | 10 compute components (North/South Indian, Dasha, etc.) |
| [form-patterns.md](frontend/form-patterns.md) | Query type selection, agent preview, 202 redirect flow |
| [state-management.md](frontend/state-management.md) | Local state + SSE-driven updates, no global store |
| [duration-analysis-ui.md](frontend/duration-analysis-ui.md) | DA form, results page, symptom gate, follow-up chat |
| [accessibility.md](frontend/accessibility.md) | Semantic HTML, non-color-only indicators, disabled states |
| [error-handling.md](frontend/error-handling.md) | Network errors, 404s, loading states |
