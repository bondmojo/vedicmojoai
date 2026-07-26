# Planner (`engine/planner.ts`)

Deterministic (no LLM). Maps `query_types[]` → agent execution plan.

**Core logic:**
1. Resolve domain agents from `DOMAIN_AGENTS` map
2. First queries: add `ALWAYS_RUN_FIRST_QUERY` set
3. Follow-ups: add Wave 4 + verification, skip Wave 1 (unless `forceRerunWave1`)
4. Conditional: 3D only if lagna lord afflicted/debilitated (checked via alerts)
5. Sort by wave order for execution

**Output:** `ExecutionPlan { agents, rationale, query_types, is_followup, skipped_waves }`

Validation: `validateAgentSelection()` checks dependency constraints (e.g., 4C requires 4X).
