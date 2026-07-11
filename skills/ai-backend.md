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
| `engine/renderer.ts` | Synthesis JSON → HTML report |
| `engine/waves/*.ts` | Wave-specific utilities |

## Detailed Guides

This skill is split into focused sub-documents in `skills/backend/`:

| File | Topic |
|---|---|
| [llm-layer.md](backend/llm-layer.md) | `callLLM()` gateway, provider factory, cost estimation |
| [orchestrator.md](backend/orchestrator.md) | Parallel fan-out, sequential waves, context accumulation, DB writes, halt gate |
| [planner.md](backend/planner.md) | Deterministic agent resolution, domain→agent map, conditional logic |
| [context-assembly.md](backend/context-assembly.md) | Per-wave token-optimized context injection strategy |
| [prompt-engineering.md](backend/prompt-engineering.md) | Rules for structured JSON output, temperature tiers, anti-hallucination |
| [model-config.md](backend/model-config.md) | Runtime model swap via `model_config` table, tier assignments |
| [halt-gate.md](backend/halt-gate.md) | Critical error detection (4A), halt/resume/override flow |
| [sse-protocol.md](backend/sse-protocol.md) | Real-time event types and implementation |
| [compute-engine.md](backend/compute-engine.md) | Swiss Ephemeris calculations, deterministic Wave 1, pure function rules |
| [pre-analysis.md](backend/pre-analysis.md) | 11 rules engine + Vimshottari dasha computation |
| [duration-analysis.md](backend/duration-analysis.md) | DA pipeline (slicer → transitOverlay → DA-1 → DA-2 → DA-3) |
| [error-handling.md](backend/error-handling.md) | Error types and recovery patterns |
| [api-routes.md](backend/api-routes.md) | All backend API routes reference |
| [adding-agents.md](backend/adding-agents.md) | 7-step checklist for introducing new pipeline agents |
