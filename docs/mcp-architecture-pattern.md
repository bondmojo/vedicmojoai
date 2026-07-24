# One knowledge base, two runtimes

**How VedicMojoAI separates deterministic data, markdown-composed prompts, and
LLM orchestration — so the same rubric can be consumed by a paid, code-driven
pipeline *or* handed raw to Claude Desktop for $0 API cost.**

> Compiled as a reference for porting this pattern into other projects
> (originally requested for `thirdi-backend`). Also viewable as a formatted
> artifact: see the conversation this was generated from.

---

## 1. The four layers

Every request — paid or free — passes through the same four layers. Only what
sits *above* the LLM gateway differs.

```
Data layer (deterministic, no LLM)
  engine/compute/*.ts   — pure functions: Swiss Ephemeris, shadbala, dasha
  UnifiedChart (Postgres) — one JSONB column per domain
        │
        ▼ feeds
Knowledge layer (markdown, versioned as text)
  prompts/domains/*.md  — canonical rubric per life domain
  prompts/agents/*.md   — agent instructions, {{include:}} the rubric
        │
        ▼ assembled by
Orchestration layer (deterministic TypeScript)
  planner.ts       — query type → required agent set
  orchestrator.ts  — wave fan-out, context trim, halt gate
        │
        ▼ splits into two consumers
   ┌─────────────────────────┐   ┌──────────────────────────────┐
   │ → paid pipeline         │   │ → MCP server                 │
   │ orchestrator calls      │   │ ships the same rubric text +  │
   │ callLLM() directly.     │   │ tool results to Claude        │
   │ App's API key pays.     │   │ Desktop uninterpreted.        │
   │ Output: stored,         │   │ Desktop subscription pays.    │
   │ structured JSON report. │   │ No stored output.             │
   └─────────────────────────┘   └──────────────────────────────┘
```

**Why this works:** the rubric files and the deterministic data are
consumer-agnostic. Whether a human's Claude Desktop session reasons over them
for free, or the app's own orchestrator pays per-token to reason over them at
scale, nothing about the knowledge or the data changes — only who's holding
the model.

---

## 2. Knowledge layer — composable markdown, not a prompt-per-feature

Domain expertise lives once, in `prompts/domains/`, and is pulled into every
agent that needs it via a tiny include directive — so a career rubric fix
propagates to Wave 2's career agent, the Duration-Analysis career agent, and
the MCP `get_domain_knowledge` tool simultaneously.

**`prompts/agents/duration_da1_health.md`** (actual file):

```markdown
# DA-1 (Health Agent): Health Domain Analyser

You are the HEALTH domain agent. Apply the domain knowledge below to every period —
baseline every conclusion on the lagna lord's vitality and the Moon's condition, use
D30 for disease classification, and shadbala for recovery capacity.

{{include:domains/health.md}}

{{include:agents/duration_da1_domain_analyser.md}}
```

Two composable pieces: the *domain rubric* (what "health" means
astrologically) and the *role script* (how to behave as an analyser) — mixed
per agent without duplicating either.

| Piece | Location | Reused by |
|---|---|---|
| `domains/{career,health,wealth,marriage,property,cashflow}.md` | 6 files | Wave 2 domain agents, Duration-Analysis DA-1 agents, MCP `get_domain_knowledge` tool & Resources |
| `agents/*.md` | 29 files | one per pipeline agent — role, output contract, occasionally an include |
| `{{include:path}}` | `engine/llm.ts` → `expandIncludes()` | recursive, depth-limited (3), resolved server-side before every LLM call |

The include resolver is ~15 lines — a regex pass over
`{{include:relative/path.md}}`, recursing with a hard depth cap to fail loudly
on include cycles instead of hanging:

```ts
// engine/llm.ts — the entire composition engine
const INCLUDE_PATTERN = /\{\{include:([^}]+)\}\}/g
const MAX_INCLUDE_DEPTH = 3

async function expandIncludes(content, depth) {
  if (depth > MAX_INCLUDE_DEPTH) throw new Error('include depth exceeded')
  // ...replace each match with its file's own expanded content
}
```

---

## 3. Orchestration layer — planning is deterministic, execution is not

The decision of *which* agents run is a pure lookup table — no LLM makes that
call. Only the agents themselves think.

**`engine/planner.ts` — `resolvePlan()`**

- **Query type → agent set:** `DOMAIN_AGENTS['health']` resolves to a fixed
  Wave 2/3 agent list — no LLM routing.
- **First-query vs follow-up:** `ALWAYS_RUN_FIRST_QUERY` forces the
  foundation wave once; follow-ups reuse cached Wave 1 output and add a
  verification agent instead.
- **Conditional agents:** e.g. agent `3D` (afflicted lagna lord) only enters
  the plan if a pre-analysis alert already flagged it — a rule, not a guess.
- **Auditability:** every resolved plan is persisted with its `rationale`
  string, so "why did agent X run" is answerable from the DB row, not the
  logs.

**Wave execution — parallel inside a wave, sequential across waves:**

```
Pre-Analysis (deterministic, no LLM)
  → Wave 1 [1A 1B 1C 1D]              parallel · foundation, first-query only
  → Wave 2 [planner-selected 2A-2G]   parallel · domain specialists
  → Wave 3 [planner-selected 3A-3D]   parallel · cross-cutting checks
  → Wave 4  4X → 4A → HALT GATE → 4B → 4C   strictly sequential
```

The halt gate is the one place the pipeline can stop itself: if 4A
(error-detection) reports critical errors, the run parks as
`halted_for_review` — no 4B, no 4C, no report — until a human overrides,
reruns, or cancels.

**Context discipline — every agent gets a summary, never the raw chart.** A
raw chart is ~30KB; the compact `chart_summary` handed to each agent is ~2KB.
Agent `4X` exists purely to compress all of Wave 2/3's output into a ~6KB
`fact_summary` before the expensive synthesis model reads it — so the
priciest model in the stack (4C, Opus-tier) sees ≈15K tokens of curated fact,
not 100K tokens of transcript.

---

## 4. LLM gateway — one function, every model call

`engine/llm.ts` is the single chokepoint. No other file imports an Anthropic
or OpenAI SDK — that rule is what makes provider swaps a config change, not a
refactor.

| Concern | How it's handled |
|---|---|
| Provider abstraction | Vercel AI SDK (`generateText`) behind a `provider` string switch — `anthropic` / `openai` today |
| Model selection | read from a `model_config` DB table at runtime, keyed by agent tier — swap models with a row update, zero deploys |
| Model tiers | Foundation (haiku) → Specialists (sonnet) → QA (sonnet, temp 0) → Synthesis (opus, temp 0) |
| Cost accounting | static $/1M token table → every call returns `tokenIn/tokenOut/costUsd`, persisted per `WaveOutput` |
| Prompt caching | stable prefixes marked `cacheControl:'ephemeral'` (Anthropic) — repeat chat turns hit cache at ~10% input cost |
| Truncation guard | `finishReason==='length'` is surfaced as `truncated:true` so a clipped JSON agent fails loudly instead of parsing garbage |

---

## 5. The MCP bridge — the same knowledge, zero API spend

The MCP server is a *separate stdio process* that never imports `callLLM`. It
reaches the running app over plain HTTP and re-exposes the deterministic data
and the rubric text as the three MCP primitives — Claude Desktop supplies the
reasoning, for free.

| MCP primitive | Metaphor | Maps to |
|---|---|---|
| **Tools** | the ingredients | 19 thin HTTP wrappers — `get_shadbala`, `compute_chart`, `get_timeline_periods` — every one deterministic, none of them an LLM call |
| **Resources** | the reference book | the 6 domain rubrics, addressable as `knowledge://domains/{name}`, attachable directly as Desktop context |
| **Prompts** | the recipe | `analyze_health`, `duration_timeline`… — pre-written instructions that name which Tools to call, embed the matching rubric, and specify the output contract |

**Enforced boundary, not a convention.** `tests/mcp-cost-guard.test.ts`
asserts the MCP package never POSTs to the two paid routes (`/analyze`,
`/duration-analysis`). The free path isn't "please don't call the expensive
route" — it's a test that fails the build if anyone wires that in by
accident.

**Same rubric file, two exit doors.** `GET /api/knowledge/[type]/[name]`
calls the identical `readPromptFile()` the paid pipeline uses —
include-expansion and all — so a framework fetched by Claude Desktop
(`get_framework("wave2_2f_career")`) is byte-for-byte what the Sonnet agent
inside the paid pipeline would have received. One allow-listed,
path-traversal-safe route serves both audiences.

---

## 6. Two consumers, one contract

| | Paid pipeline | MCP → Claude Desktop |
|---|---|---|
| Who pays for tokens | App's Anthropic/OpenAI key | User's Claude Desktop subscription |
| Who reasons | 18+ orchestrated agents, code-driven | Claude Desktop itself, guided by a Prompt |
| Server-side LLM calls | Yes — `callLLM()` | Never — enforced by cost-guard test |
| Output | Structured JSON → rendered HTML report, stored | Whatever Desktop writes in-chat, not persisted |
| Latency / cost profile | Higher latency, metered $ per run | Interactive, $0 marginal cost |
| Best for | Bulk/repeatable, structured deliverables | Exploratory, ad-hoc practitioner questions |

---

## 7. Porting the pattern to another project

Build in this order — each step is usable on its own before the next exists.

1. **Isolate the deterministic data layer first.** Pure functions, no DB side
   effects, one canonical JSON store per entity — mirrors
   `engine/compute/` + `UnifiedChart`. This is what everything else reads
   from and never depends on an LLM being available.
2. **Externalize domain knowledge as versioned markdown.** Move expertise out
   of inline prompt strings into `prompts/domains/*.md`-style files, editable
   without a deploy. Build the `{{include:}}` resolver early — ~20 lines, and
   it's what lets one rubric serve many agents.
3. **One LLM gateway function, no exceptions.** Every model call routes
   through a single `callLLM()`-equivalent. Read model/provider from a DB
   config table from day one, even with one provider — the discipline is
   what stays cheap later.
4. **Planner before orchestrator.** Write the deterministic "which agents
   does this request need" lookup as plain data (a map), before writing the
   fan-out code that executes it. Keep the rationale string — it's free
   auditability.
5. **Add a context-compaction step for expensive models.** Whatever is the
   equivalent of 4X here: one cheap agent whose only job is compressing
   everything upstream into a small fact-summary before the priciest model
   reads it.
6. **Only then, consider an MCP bridge.** Once 1–5 exist, an MCP server is a
   thin, separate process exposing read-only Tools/Resources/Prompts over the
   same data + knowledge files. Add a cost-guard test on day one of that
   server, not after — it's the only thing standing between "free" and
   "accidentally billed."

---

*Sources: `mcp/README.md`, `mcp/src/{server,tools,resources,prompts}.ts`,
`engine/llm.ts`, `engine/planner.ts`, `.kiro/skills/{ai-backend,engine-pipeline}.md`,
`prompts/agents/duration_da1_health.md`, `app/api/knowledge/**`.*
