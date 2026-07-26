# VedicMojoAI — Architecture Diagram

**Version:** 1.0
**Last updated:** 2026-07-11

Standalone architectural view of the whole system. Detail lives in
[HLD.md](HLD.md) (components), [DFD.md](DFD.md) (data flows), [ERD.md](ERD.md)
(data model), and [Agents.md](../Agents.md) (agent catalogue). Update this
diagram alongside those documents (see `Agents.md → Documentation Maintenance`).

Diagrams are Mermaid — rendered natively by GitHub and VS Code.

---

## 1. System Overview

```mermaid
flowchart TB
    subgraph Browser["Browser — Next.js UI (dark theme, Tailwind)"]
        UI1["/compute<br/>Generate Chart"]
        UI2["/unified-charts<br/>List · Detail · Analyze"]
        UI3["/runs/[id]<br/>SSE progress · Report viewer"]
        UI4["/duration-analysis<br/>Form · Results · Chat"]
    end

    subgraph API["Next.js API Routes (/app/api) — 202 + SSE pattern"]
        A1["/api/compute<br/>/api/unified-charts/*"]
        A2["/api/unified-charts/[id]/analyze<br/>/api/runs/[id]/events"]
        A3["/api/reports/[id]"]
        A4["/api/duration-analysis<br/>[id] · events · chat · override"]
    end

    subgraph Engine["Engine (/engine)"]
        CE["Compute Engine<br/>engine/compute/*<br/>Swiss Ephemeris — pure functions<br/>planets · shadbala · relationships<br/>jaimini · divisional · transits"]
        WP["Wave Pipeline (18 agents)<br/>orchestrator · planner · waves 1–4<br/>pre-analysis · halt gate"]
        DA["Duration Analysis Pipeline<br/>engine/durationAnalysis/*<br/>registry-driven domain agents"]
        RD["Renderer<br/>engine/renderer.ts → HTML report"]
        LLM["callLLM() gateway — engine/llm.ts<br/>readPromptFile() + include expansion<br/>ONLY file importing provider SDKs"]
    end

    subgraph Data["Persistence"]
        PG[("PostgreSQL (Prisma)<br/>UnifiedChart · PipelineRun · WaveOutput<br/>DurationAnalysis · DurationMessage<br/>ModelConfig · Wave1Cache · ...")]
        FS[/"HTML reports on disk"/]
    end

    subgraph Prompts["prompts/ (runtime-read, never app-modified)"]
        PA["agents/*.md<br/>wave + DA agent prompts"]
        PD["domains/*.md<br/>CANONICAL domain knowledge<br/>(shared via include)"]
    end

    Providers["LLM Providers<br/>Anthropic · OpenAI (Vercel AI SDK)<br/>model/provider resolved from ModelConfig"]

    UI1 --> A1
    UI2 --> A2
    UI3 --> A2
    UI3 --> A3
    UI4 --> A4

    A1 --> CE
    A2 --> WP
    A3 --> FS
    A4 --> DA

    CE --> PG
    WP --> LLM
    DA --> LLM
    WP --> RD
    RD --> FS
    WP --> PG
    DA --> PG

    LLM --> Providers
    LLM -.reads.-> PA
    PA -.include.-> PD
```

---

## 2. Duration Analysis — Domain-Agent Pipeline

One registry entry per life domain selects the agent, its prompt, its model row,
and exactly the chart data it needs.

```mermaid
flowchart TB
    REQ["POST /api/duration-analysis<br/>{ chartId, dateFrom, dateTo, category,<br/>symptoms?, userQuestion? }"]
    REQ -->|"202 { analysisId } · fire-and-forget"| REG

    REG["Step 0 — DOMAIN_AGENT_REGISTRY<br/>category → agent id · prompt file ·<br/>model row · divisions · extra columns"]

    subgraph Registry["Registry entries (engine/durationAnalysis/registry.ts)"]
        direction LR
        H["health<br/>DA1-HEALTH<br/>D30 + shadbala"]
        C["career<br/>DA1-CAREER<br/>D9+D10 + shadbala,jaimini"]
        W["wealth<br/>DA1-WEALTH<br/>D2 + shadbala,jaimini"]
        M["marriage<br/>DA1-MARRIAGE<br/>D9 + jaimini"]
        P["property<br/>DA1-PROPERTY<br/>D4"]
        CF["cashflow (Money)<br/>DA1-CASHFLOW<br/>D2 + shadbala"]
    end

    REG --- Registry
    REG --> S0A

    S0A["Step 0a — sliceDashaTree() (pure TS)<br/>MD/AD/PD overlap filter + lord annotations<br/>+ yoga activation · empty → FAIL FAST"]
    S0A --> S0B
    S0B["Step 0b — buildTransitOverlay() (pure TS)<br/>Swiss Ephemeris per AD boundary<br/>Saturn/Jupiter/Rahu/Ketu + BAV + Sade Sati"]
    S0B --> DA1

    DA1["DA-1 Domain Agent (registry-resolved)<br/>BATCHED: ≤25 periods + matching overlays per call<br/>callAgentJson: lenient JSON + 1 retry<br/>→ mergeDA1Outputs() → mergePeriodContext()"]
    DA1 -->|symptoms provided| DA2
    DA1 -->|no symptoms| DA3

    DA2["DA-2 Symptom Validator (temp 0.0)<br/>fail-closed gate"]
    DA2 -->|"found = false → status=symptom_unmatched<br/>SSE symptom_gate · practitioner override"| HALT["HALT<br/>(override → DA-3)"]
    DA2 -->|found = true| DA3

    DA3["DA-3 Future Analyser<br/>forecast + follow-up chat<br/>deterministic contextSummary (~500 tokens)"]
    DA3 --> DONE["status = done · SSE run_complete<br/>results + chat at /duration-analysis/[id]"]
```

---

## 3. Prompt Composition — Single Source of Domain Knowledge

`prompts/domains/*.md` is the only place domain astrology rules live. Both
pipelines include the same fragment, expanded by `readPromptFile()` at load time.

```mermaid
flowchart LR
    DK["prompts/domains/career.md<br/>(canonical: houses, karakas,<br/>D9/D10 rules, yogas, dasha rules)"]

    subgraph DurationPipeline["Duration Analysis"]
        DAP["duration_da1_career.md<br/>role + {{include:domains/career.md}}<br/>+ {{include: DA-1 core}}"]
        CORE["duration_da1_domain_analyser.md<br/>shared core: rules, I/O format,<br/>output JSON schema"]
    end

    subgraph WavePipeline["Wave Pipeline"]
        W2F["wave2_2f_career.md<br/>Domain Knowledge Reference =<br/>{{include:domains/career.md}}"]
    end

    DK --> DAP
    CORE --> DAP
    DK --> W2F

    DAP --> R1["DA1-CAREER agent"]
    W2F --> R2["Wave 2F agent"]
```

Same pattern for health, wealth, marriage, property, and cashflow (2C/2D/2E/2G
on the wave side; cashflow is duration-only, mirroring Wave 3A's liquidity focus).

---

## 4. Key Architectural Rules

| Rule | Where enforced |
|---|---|
| All model calls go through `callLLM()`; no provider SDK imports elsewhere | `engine/llm.ts` |
| Duration LLM calls additionally go through `callAgentJson()` (lenient parse + 1 retry) | `engine/durationAnalysis/agentJson.ts` |
| Models/providers resolved at runtime from `model_config` (one row per agent) | `prisma/seed.ts`, orchestrators |
| Compute modules are pure functions — no DB, no side effects | `engine/compute/*`, `engine/durationAnalysis/{slicer,transitOverlay,extractor,registry}` |
| Long operations return 202 immediately; progress over SSE | all pipeline routes |
| Per-category logic lives ONLY in `DOMAIN_AGENT_REGISTRY` | `engine/durationAnalysis/registry.ts` |
| Domain astrology lives ONLY in `prompts/domains/` | prompt include composition |
