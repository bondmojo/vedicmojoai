---
inclusion: auto
---

# VedicMojoAI — AI Backend Skill

Guidelines for the LLM pipeline engine, agent orchestration, prompt engineering, and model management.

## Architecture Overview

The backend is a 4-wave pipeline of 18+ LLM agents orchestrated by deterministic TypeScript code.

```
Pre-Analysis (deterministic) → Wave 1 (parallel) → Wave 2 (parallel, selected)
→ Wave 3 (parallel, selected) → Wave 4 (sequential: 4X→4A→HALT→4B→4C)
```

**Core files:**

| File | Responsibility |
|---|---|
| `engine/llm.ts` | Single LLM gateway — all model calls route here |
| `engine/orchestrator.ts` | Fan-out execution, DB writes, SSE emission, halt gate |
| `engine/planner.ts` | Deterministic query-type → agent resolution |
| `engine/constants.ts` | All constants, domain→agent maps, agent catalogue |
| `engine/chartSummary.ts` | Builds compact context from raw chart data |
| `engine/pre_analysis.ts` | 11 deterministic rules (no LLM) |
| `engine/computeVimshottari.ts` | Moon longitude → 120-year dasha tree |
| `engine/renderer.ts` | Synthesis JSON → HTML/Markdown; persists report content in `PipelineRun` |
| `engine/waves/*.ts` | Wave-specific utilities |

## Serverless deployment rules

- `POST /api/unified-charts/[id]/analyze` and `POST /api/duration-analysis`
  return `202` but must register the pipeline Promise with `waitUntil()` and
  export the relevant Vercel `maxDuration`. This is a bounded execution window,
  not a substitute for a durable queue.
- Persist progress and final output before assuming a client has received an
  SSE event. SSE routes are separate serverless invocations; normal analysis
  reconnects from persisted `WaveOutput` state and supplies a connected snapshot.
- Treat `PipelineRun.reportHtml`/`reportMarkdown` as the report source of truth.
  Disk writes in `renderer.ts` are optional compatibility output, so filesystem
  failures must not fail the pipeline.

## Detailed Guides

This skill is split into focused sub-documents in `skills/backend/`:

| File | Topic |
|---|---|
| #[[file:skills/backend/llm-layer.md]] | `callLLM()` gateway, provider factory, cost estimation |
| #[[file:skills/backend/orchestrator.md]] | Parallel fan-out, sequential waves, context accumulation, DB writes, halt gate |
| #[[file:skills/backend/planner.md]] | Deterministic agent resolution, domain→agent map, conditional logic |
| #[[file:skills/backend/context-assembly.md]] | Per-wave token-optimized context injection strategy |
| #[[file:skills/backend/prompt-engineering.md]] | Rules for structured JSON output, temperature tiers, anti-hallucination |
| #[[file:skills/backend/model-config.md]] | Runtime model swap via `model_config` table, tier assignments |
| #[[file:skills/backend/halt-gate.md]] | Critical error detection (4A), halt/resume/override flow |
| #[[file:skills/backend/sse-protocol.md]] | Real-time event types and implementation |
| #[[file:skills/backend/compute-engine.md]] | Swiss Ephemeris calculations, deterministic Wave 1, pure function rules |
| #[[file:skills/backend/pre-analysis.md]] | 11 rules engine + Vimshottari dasha computation |
| #[[file:skills/backend/duration-analysis.md]] | DA pipeline (slicer → transitOverlay → DA-1 → DA-2 → DA-3) |
| #[[file:skills/backend/error-handling.md]] | Error types and recovery patterns |
| #[[file:skills/backend/api-routes.md]] | All backend API routes reference |
| #[[file:skills/backend/adding-agents.md]] | 7-step checklist for introducing new pipeline agents |
| #[[file:skills/backend/mcp-server.md]] | MCP server (`mcp/`) for Claude Desktop — tools/resources/prompts, cost-guard rule. Deliberately outside the paid LLM pipeline above: it's a read/compute-only bridge, never a caller of it. |
