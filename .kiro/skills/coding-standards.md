---
inclusion: auto
---

# VedicMojoAI — Coding Standards

## Language & Framework

- TypeScript (strict mode) — single language for the entire project
- Next.js 14 with App Router
- React Server Components by default; `'use client'` only when needed (forms, SSE, interactivity)
- Node.js 20+

## Style

- Use `interface` over `type` for object shapes (unless union/intersection needed)
- Named exports over default exports
- Explicit return types on all public functions
- Use `const` by default; `let` only when reassignment is necessary
- No `any` — use `unknown` and narrow, or define proper types
- Error handling: throw typed errors (never string throws)
- Async/await over raw Promises

## File Naming

- Components: `PascalCase.tsx` (e.g., `ChartList.tsx`)
- Utilities/modules: `camelCase.ts` (e.g., `chartSummary.ts`)
- API routes: `route.ts` inside directory structure
- Types: co-located or in `lib/types.ts`

## API Routes

- Use Next.js Route Handlers (`app/api/.../route.ts`)
- Return proper HTTP status codes (201 created, 202 accepted, 400 bad request, 404 not found)
- Validate request bodies before processing
- Long-running operations: return 202 immediately, use SSE for progress. On
  Vercel, register the background Promise with `waitUntil()` and export an
  explicit `maxDuration`; an unawaited Promise can be stopped after the response.

## Engine Code

- Pure functions where possible (testable, no side effects)
- Engine functions do NOT import from `app/` — dependency flows one way
- Orchestrator is the only engine module that writes to DB
- LLM calls always go through `engine/llm.ts` — never call provider SDKs directly
- All constants in `engine/constants.ts` — no magic numbers in code

## Testing

- Unit tests for engine functions (pure logic: dasha computation, planner, pre-analysis)
- Integration tests for API routes (with test DB)
- Test framework: Vitest
- Test naming: `{module}.test.ts` co-located with source

## Error Types

```typescript
// lib/errors.ts
class DashaIntegrityError extends Error {}
class ChartValidationError extends Error {}
class PipelineHaltError extends Error {}
class LLMCallError extends Error {}
```

## Git

- Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`
- Branch naming: `feat/description`, `fix/description`
- No commits with failing builds
