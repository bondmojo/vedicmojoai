# Context Assembly (Token Optimization)

Each agent gets minimal, relevant context — not accumulated raw output:

| Agent | Receives |
|---|---|
| 1A–1D | `chart_summary` + `alerts` (~3KB) |
| 2A–2G | `chart_summary` + `alerts` + `wave1_delta` (~10KB) |
| 3A–3D | `chart_summary` + `alerts` + `wave1_delta` + relevant wave2 deltas (~12KB) |
| 4X | `chart_summary` + all wave2/3 deltas (~40KB) |
| 4A, 4B | `chart_summary` + `fact_summary` (~8KB) |
| 4C | `chart_summary` + `fact_summary` + `4A` + `4B` (~15KB) |

**Rules:**
- Never pass raw `ChartInputV1` (~30KB) to agents — always `chart_summary` (~2KB)
- Wave 3 agents only get domain-relevant Wave 2 output (via `getRelevantWave2ForWave3()`)
- Prompt template goes LAST in the assembled prompt (after all context sections)
- Context sections use delimiters: `--- SECTION_NAME ---`
