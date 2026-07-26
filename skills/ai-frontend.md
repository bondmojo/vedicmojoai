# VedicMojoAI — AI Frontend Skill

Guidelines for building and maintaining the frontend UI that interacts with the AI pipeline.

## Architecture

- Next.js 14 App Router with React Server Components (RSC) by default
- Client Components (`'use client'`) only for: SSE streams, form interactions, real-time updates
- Tailwind CSS for styling — dark theme by default, **light theme also supported (v1.3)**
- No component library — custom UI built with Tailwind utility classes

## Theming (v1.3)

The app was built with literal `gray-*`/`slate-*`/`text-white` Tailwind classes
rather than the `dark:` variant system. Light-theme support was added WITHOUT
rewriting those ~800 occurrences, by redefining `gray`/`slate` (and adding a new
`ink` color for primary text) in `tailwind.config.ts` to resolve through CSS
variables (`--color-gray-*`, `--color-ink`) that flip between `:root` (light)
and `.dark` (dark) in `app/globals.css`. The light-mode scale is a **mirror**
of the dark-mode scale (light `gray-900` ≈ dark `gray-100`, etc.) so existing
dark-surface classes (`bg-gray-900`) become light surfaces, and existing
dark-safe muted-text classes (`text-gray-400`) stay legible.

- `next-themes` (`app/components/ThemeProvider.tsx`) toggles the `.dark` class
  on `<html>`; default is `"dark"` to preserve prior behavior. `enableSystem`
  is off — the toggle is explicit, not OS-driven.
- `app/components/ThemeToggle.tsx` is the sun/moon switch, rendered globally
  (fixed top-right) from `app/layout.tsx`.
- **When writing new components:** use bare `text-white` ONLY on a solid
  saturated background (`bg-indigo-600`, etc.) where white-on-color is correct
  in both themes. For primary text on a `gray`/`slate` surface, use `text-ink`
  instead so it flips correctly.

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
