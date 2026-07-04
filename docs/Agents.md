# VedicMojoAI — Agent Catalogue

**Version:** 1.0
**Last updated:** 2026-07-04
**Status:** Draft

---

## Overview

VedicMojoAI runs an 18-agent, 4-wave pipeline plus a deterministic pre-analysis engine.
Each agent is an LLM call with a structured prompt file, defined input context, and
structured JSON output.

**Execution model:**
- Waves 1–3: agents within a wave run **in parallel**
- Wave 4: agents run **strictly sequentially** (4X → 4A → 4B → 4C)
- Pre-analysis: deterministic (no LLM), always runs first

**Prompt files:** `prompts/agents/{wave}_{id}_{name}.md`

---

## Pre-Analysis (Deterministic — No LLM)

| Component | File | Input | Output |
|---|---|---|---|
| Rule Engine | `engine/pre_analysis.ts` | `ChartInputV1` | `alerts[]` (11 rules) |
| Vimshottari Engine | `engine/computeVimshottari.ts` | `moonLongitudeDeg`, `birthDatetime` | `DashaTree` (120-year) |
| Chart Summary Builder | `engine/chartSummary.ts` | `ChartInputV1` + `alerts[]` + `DashaTree` | `chart_summary` (~2KB) |

**Always runs.** Results cached in `Wave1Cache` (keyed by `chart_hash`).

---

## Wave 1 — Foundation (Parallel)

Extracts and structures the raw chart data. Runs only on the first query for a chart (cached thereafter).

| Agent ID | Name | Prompt File | Model | Input | Output |
|---|---|---|---|---|---|
| **1A** | Chart Extraction | `wave1_1a_extraction.md` | claude-haiku-4-5 | `chart_summary` + `pre_analysis_alerts` | Structured extraction of all planetary positions, dignities, house lords |
| **1B** | Nakshatra Analysis | `wave1_1b_nakshatra.md` | claude-haiku-4-5 | `chart_summary` + `pre_analysis_alerts` | Nakshatra-level analysis for all 9 planets, pada effects, nakshatra lords |
| **1C** | Bala Deep Audit | `wave1_1c_bala.md` | claude-haiku-4-5 | `chart_summary` + `pre_analysis_alerts` | Shadbala interpretation, strength rankings, functional benefic/malefic classification |
| **1D** | Relationship Geometry | `wave1_1d_relationships.md` | claude-haiku-4-5 | `chart_summary` + `pre_analysis_alerts` | Planetary aspects, conjunctions, mutual receptions, dispositorship chains |

**Cache behaviour:** Combined output stored as `wave1_delta` in `Wave1Cache`. Reused for all subsequent runs unless `force_rerun_wave1 = true`.

---

## Wave 2 — Domain Specialists (Parallel, Planner-Selected)

Deep analysis per domain. Agents are selected by the planner based on `query_types[]`.

| Agent ID | Name | Prompt File | Model | Domain | Input | Output |
|---|---|---|---|---|---|---|
| **2A** | Yoga Detection | `wave2_2a_yogas.md` | claude-sonnet-4-5 | cross_domain | `chart_summary` + `wave1_delta` | All identified yogas: Raja, Dhana, Viparita, Pancha Mahapurusha, etc. with activation periods |
| **2B** | Ashtakavarga Analysis | `wave2_2b_ashtakavarga.md` | claude-sonnet-4-5 | cross_domain | `chart_summary` + `wave1_delta` | House-by-house bindhu analysis, transit strength, SAV patterns |
| **2C** | Wealth Analysis | `wave2_2c_wealth.md` | claude-sonnet-4-5 | wealth | `chart_summary` + `wave1_delta` | H2/H11 analysis, Dhana yogas, wealth accumulation periods, Sree Lagna |
| **2D** | Property Analysis | `wave2_2d_property.md` | claude-sonnet-4-5 | property | `chart_summary` + `wave1_delta` | H4 analysis, D4 chart, property acquisition windows, land/vehicle yogas |
| **2E** | Health Analysis | `wave2_2e_health.md` | claude-sonnet-4-5 | health | `chart_summary` + `wave1_delta` | D30 analysis, H6/H8 lords, disease significations, health-risk periods |
| **2F** | Career Analysis | `wave2_2f_career.md` | claude-sonnet-4-5 | career | `chart_summary` + `wave1_delta` | D10 analysis, H10 yogas, career peak/stress periods, career mode classification |
| **2G** | Marriage & Relationships | `wave2_2g_marriage.md` | claude-sonnet-4-5 | marriage | `chart_summary` + `wave1_delta` | D9 analysis, H7, Venus/Jupiter karakas, timing windows, Kuja Dosha, compatibility |

**Planner routing:**

| Query Type | Wave 2 Agents Selected |
|---|---|
| `health` | 2E |
| `wealth` | 2A, 2C |
| `career` | 2A, 2F |
| `property` | 2A, 2D |
| `marriage` | 2A, 2G |
| `generic` | 2A, 2B, 2C, 2E, 2F |
| `full` | 2A, 2B, 2C, 2D, 2E, 2F, 2G |

**Note:** 2B (Ashtakavarga) always runs on the first query regardless of domain (`ALWAYS_RUN`).

---

## Wave 3 — Synthesis & Timing (Parallel, Planner-Selected)

Cross-domain synthesis and timeline correlation. Receives relevant Wave 2 outputs only (not all).

| Agent ID | Name | Prompt File | Model | Domain | Input | Output |
|---|---|---|---|---|---|---|
| **3A** | Cashflow Timeline | `wave3_3a_cashflow.md` | claude-sonnet-4-5 | wealth | `chart_summary` + `wave1_delta` + relevant wave2 deltas | Year-by-year cashflow direction for all mahadashas, income/expense peaks |
| **3B** | Financial Freedom | `wave3_3b_freedom.md` | claude-sonnet-4-5 | wealth | `chart_summary` + `wave1_delta` + 2C output | Financial independence timeline, passive income potential, retirement window |
| **3C** | Cross-Channel Synthesis | `wave3_3c_crosschannel.md` | claude-sonnet-4-5 | cross_domain | `chart_summary` + `wave1_delta` + all relevant wave2 deltas | Cross-domain correlations, reinforcing/conflicting patterns across domains |
| **3D** | Lagna Lord Deep Dive | `wave3_3d_lagnalord.md` | claude-sonnet-4-5 | cross_domain | `chart_summary` + `wave1_delta` | Conditional: runs only when lagna lord is afflicted/debilitated. Deep lagna lord analysis |

**Planner routing:**

| Query Type | Wave 3 Agents Selected |
|---|---|
| `health` | 3C |
| `wealth` | 3A, 3B |
| `career` | 3A, 3C |
| `property` | 3A |
| `marriage` | 3C |
| `generic` | 3A, 3C |
| `full` | 3A, 3B, 3C, 3D (conditional) |

**Note:** 3D is conditional — it only runs if pre-analysis or Wave 1 flags lagna lord debilitation/affliction. Enforced by planner + orchestrator check.

---

## Wave 4 — Quality & Synthesis (Sequential)

Final pipeline: consolidation → error detection → halt gate → validation → synthesis.
Runs strictly in order. No parallelism.

| Agent ID | Name | Prompt File | Model | Input | Output |
|---|---|---|---|---|---|
| **4X** | Fact Consolidation | `wave4_4x_consolidation.md` | claude-sonnet-4-5 | `chart_summary` + all Wave 2/3 deltas | `fact_summary` (~6KB): high-confidence findings, scores, corrections needed, cross-channel divergences |
| **4A** | Error Detection | `wave4_4a_errors.md` | claude-sonnet-4-5 | `chart_summary` + `fact_summary` | `corrections[]`: errors found with severity (minor/moderate/critical), affected waves, correction suggestions |
| **4B** | Validation | `wave4_4b_validation.md` | claude-sonnet-4-5 | `chart_summary` + `fact_summary` + `4A_output` | `confidence_matrix[]`: per-finding confidence scores, cross-verification results |
| **4C** | Final Synthesis | `wave4_4c_synthesis.md` | claude-opus-4-5 | `chart_summary` + `fact_summary` + `4A_output` + `4B_output` | Authoritative final report JSON (~15K tokens input), applies corrections inline |

**Critical Error Halt Gate** (between 4A and 4B):
- If `4A.critical_errors > 0` → pipeline halts with status `halted_for_review`
- Practitioner can: Override & Continue | Re-run from Wave X | Cancel
- Minor/moderate errors: pipeline continues, 4C self-corrects

---

## Verification Agent (Follow-up Runs Only)

| Agent ID | Name | Model | Input | Output |
|---|---|---|---|---|
| **verification** | Continuity Verification | claude-sonnet-4-5 | `fact_summary` + prior 4C synthesis + `conversation_history` | `continuity_check`: contradictions with prior conclusions, consistency validation |

Runs after Wave 3 on follow-up queries. Ensures the new analysis doesn't contradict established findings without justification.

---

## Model Assignment Summary

| Tier | Agents | Default Model | Temperature | Rationale |
|---|---|---|---|---|
| Foundation | 1A, 1B, 1C, 1D | claude-haiku-4-5 | 0.3 | Structured extraction — speed and cost matter, low creativity needed |
| Specialists | 2A–2G | claude-sonnet-4-5 | 0.3 | Domain expertise — needs interpretive skill but structured output |
| Synthesis | 3A–3D | claude-sonnet-4-5 | 0.3 | Cross-domain reasoning — moderate complexity |
| QA & Consolidation | 4X, 4A, 4B | claude-sonnet-4-5 | 0.0 | Deterministic checks — zero temperature for consistency |
| Final Synthesis | 4C | claude-opus-4-5 | 0.0 | Highest-quality narrative synthesis — the authoritative report |
| Verification | verification | claude-sonnet-4-5 | 0.0 | Contradiction detection — deterministic |

---

## Context Assembly (Token Budget)

Each agent receives a **compact context**, not raw accumulated output:

| Agent Group | Context Injected | Approx Size |
|---|---|---|
| 1A–1D | `chart_summary` + `pre_analysis_alerts` | ~3KB |
| 2A–2G | `chart_summary` + `wave1_delta` only | ~10KB |
| 3A–3D | `chart_summary` + relevant Wave 2 delta outputs only | ~12KB |
| 4X | `chart_summary` + all Wave 2/3 delta outputs | ~40KB |
| 4A–4B | `chart_summary` + `fact_summary` | ~8KB |
| 4C (Opus) | `chart_summary` + `fact_summary` + `4A` + `4B` | ~15KB |

---

## Agent Output Contract

Every agent produces a JSON delta with this envelope:

```typescript
interface AgentOutput {
  agent_id: string          // '1A' | '2F' | '4C' etc.
  domain: string            // 'foundation' | 'health' | 'wealth' | ...
  version: string           // prompt version tag
  findings: any             // domain-specific structured findings
  scores?: Record<string, number>  // domain-specific scores (1–10)
  timing?: DashaPeriod[]    // relevant dasha periods identified
  flags?: string[]          // alerts/warnings for downstream agents
}
```

---

## Pipeline Execution Order

```
1. Pre-Analysis (deterministic)
   └── Rule Engine → alerts[]
   └── Vimshottari Engine → dasha_tree
   └── Chart Summary Builder → chart_summary

2. Wave 1 (parallel): 1A ║ 1B ║ 1C ║ 1D
   └── Combined output → wave1_delta → Wave1Cache

3. Wave 2 (parallel, planner-selected): 2A ║ 2B ║ 2C ║ 2D ║ 2E ║ 2F ║ 2G
   └── Per-agent output → wave2_deltas[]

4. Wave 3 (parallel, planner-selected): 3A ║ 3B ║ 3C ║ 3D(cond.)
   └── Per-agent output → wave3_deltas[]

5. Wave 4 (sequential):
   4X → fact_summary
   4A → corrections[] + severity triage
   ─── HALT GATE (critical → stop) ───
   4B → confidence_matrix[]
   4C → synthesis_json → HTML report
```

---

## Follow-up Query Agent Selection

On follow-up queries, the pipeline skips Wave 1 (cached) and `ALWAYS_RUN` does not apply:

```
Load Wave1Cache → Planner (follow-up mode) → Wave 2 (domain subset)
→ Wave 3 (domain subset) → 4X (incremental) → Verification Agent
→ 4A → HALT GATE → 4B → 4C
```
