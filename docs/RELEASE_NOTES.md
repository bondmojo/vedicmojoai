# VedicMojoAI — Release Notes

**Version:** 1.0
**Last updated:** 2026-07-26

Newest release first. Each entry covers one merge to `main`.

---

## v1.4 — Compute-first analysis, MCP for Claude Desktop, brand UI

**Date:** 2026-07-26
**Branch:** `ui-improvements` → `main` ([PR #1](https://github.com/bondmojo/vedicmojoai/pull/1))
**Scope:** 163 files, ~24.5k insertions / ~3.3k deletions

The theme of this release is **compute-first, LLM-narrates**: work that used to be an LLM
judgment call (period favourability, foundation extraction, yoga-adjacent geometry) is now
deterministic engine output, and a new MCP server lets Claude Desktop do the *reasoning* at
$0 API cost. It also lands the first real design system — brand palette, light/dark theming,
and a consolidated navigation.

---

### Highlights

| | |
|---|---|
| **MCP server** | Claude Desktop reads the deterministic engine directly — 23 tools, 6 domain resources, 9 ready-to-run prompts, zero paid pipeline calls |
| **Deterministic period scoring** | 0–100 score, intensity band, favourable flag, and auditable factor breakdown per dasha period — replaces LLM verdicts |
| **Duration Analyser (no-LLM)** | New `/duration-computation` UI over the same backbone: MD → AD → PD drill-down with computed drivers, no API spend |
| **Varshaphal + Chara Dasha + D60** | Tajika annual solar-return chart, Jaimini rasi dasha, and Shashtiamsa added to the compute engine |
| **Brand UI** | Indigo/gold token system, light + dark themes, shadcn-style component set, unified app nav |

---

### New features

#### VedicMojo MCP server (`mcp/`)
A separate stdio process (its own package) that exposes the deterministic engine to Claude
Desktop, so interpretation is billed to the Desktop subscription instead of the API.

- **Tools (23)** — discovery (`list_clients`, `get_client_chart`), compute (`compute_chart`,
  `compute_varshaphal`), focused extractors (`get_shadbala`, `get_divisional_chart`,
  `get_dasha_tree`, `get_active_dasha`, `get_chara_dasha`, `get_ashtakavarga`,
  `get_relationships`, `get_jaimini`, `get_bhava_bala`, `get_transits`), timeline
  (`get_timeline_periods`, `get_domain_dataset`), knowledge (`list_knowledge`,
  `get_domain_knowledge`, `get_framework`), and read-only report access.
- **Resources** — the 6 canonical domain rubrics (`knowledge://domains/{domain}`).
- **Prompts (8)** — `analyze_{career|health|wealth|marriage|property|cashflow}`,
  `duration_timeline`, `analyze_full_chart`.
- **Cost guard** — the server deliberately never calls `POST /api/unified-charts/[id]/analyze`
  or `POST /api/duration-analysis`; enforced by `tests/mcp-cost-guard.test.ts`.
- Backed by two new read-only, no-LLM routes: `POST /api/timeline` and
  `GET /api/knowledge/**`, both behind an optional `MCP_TOKEN` shared-secret guard
  (`lib/mcpAuth.ts`).
- Setup: `mcp/README.md`; architecture rationale: `docs/mcp-architecture-pattern.md`.

#### Deterministic period scoring engine
`engine/durationAnalysis/scoring.ts` + `scoringWeights.ts` turn period favourability into
auditable arithmetic instead of model opinion.

- 0–100 score, intensity band, favourable flag, and a persisted per-factor breakdown.
- Peak stress / peak favourable periods ranked by score, not chosen by the LLM.
- `DOMAIN_SCORING_WEIGHTS` — per-domain benefic/malefic houses, karakas, and factor weights.
- Reduced-confidence flag for paste-path / pre-migration charts missing optional inputs,
  surfaced through to the verdict and UI.
- DA-1 now narrates only — the pipeline overwrites any LLM-emitted verdict.
- Covered by `scoring.test.ts` and a `scoring.backtest.test.ts` fixture backtest.

#### Duration Analyser — deterministic UI (`/duration-computation`)
A no-LLM sibling of the paid Duration Analysis pipeline, on the same `POST /api/timeline`
backbone: pick a chart, drill MD → AD → PD, pick an analysis type (Career, Health, Money,
Family), and see every computed chart for that window. Each period gets a deterministic
**driver digest** (`engine/durationAnalysis/periodInsights.ts`) that selects and labels the
drishti / control / nakshatra / argala already present in the payload. See
`docs/duration-analyser.md` for the MCP-vs-UI exposure model.

#### Duration foundation sub-agents (Track 2)
`engine/durationAnalysis/foundation.ts` adds four cheap Haiku-tier natal-facet readers
(`FOUND-PLANETS`, `FOUND-NAKSHATRA`, `FOUND-UPAGRAHA`, `FOUND-BAV`) that run **once per
(chart, domain)** before DA-1 and are persisted to `DurationAnalysis.foundationOutput`.

#### Compute-engine additions
- **Varshaphal** (`engine/compute/varshaphal.ts`, `POST /api/compute/varshaphal`) — Tajika
  annual solar-return chart: Varsha Pravesh, annual chart (reusing `computeFullChart`, so
  annual Shadbala matches natal), Muntha, Panchavargeeya Bala, Varshesha. Stateless,
  on-demand, with a `Varshaphal` tab on the home page. Doc: `docs/computation_varshaphal.md`.
- **Chara Dasha** (`engine/compute/charaDasha.ts`) — Jaimini rasi dasha (KN Rao/Parashara
  method), returned by `POST /api/compute`, shown in the "Chara Dasha" tab and Copy-for-AI,
  and exposed via the `get_chara_dasha` MCP tool. Doc: `docs/computation_chara_dasha.md`.
- **D60 (Shashtiamsa)** added to the divisional set, alongside sign-level D30 treatment.
- **Bhava Bala** (`bhavaBala.ts`) and **planetary dignity** (`dignity.ts`) modules.

#### Brand UI + theming
- Two-layer token system (indigo primary / gold accent → semantic tokens → Tailwind
  utilities), documented in `docs/brand-color-system.md` with mockups under `docs/mockups/`.
- **Light and dark themes** via `next-themes` (`ThemeProvider`, `ThemeToggle`); dark remains
  the hero experience.
- shadcn-style component set under `components/ui/` (accordion, badge, button, card, input,
  select, table) plus `lib/utils.ts` / `lib/brandColors.ts`.
- New `AppNav` + `PageHeader`, a rebuilt `ChartSummaryTab`, and reworked `ChartGrid`,
  `DashaTimeline`, `DashaPeriodPicker`, North/South Indian chart renderers.

---

### Improvements

- **Truncation detection in `engine/llm.ts`** — `finishReason === 'length'` is now flagged
  explicitly (`⚠ TRUNCATED`) instead of logging SUCCESS on a JSON response that cannot parse.
- **Model config headroom** (`prisma/seed.ts`) — DA-1 and the DA1-* domain agents raised to
  32768 max output tokens, DA-3 to 16384, DA-2 to 8192, so reasoning models don't truncate
  mid-JSON. Foundation sub-agents seeded on the Haiku tier.
- **Shared chart creation** — `lib/unified-chart-create.ts` centralises the compute-path
  `UnifiedChart` creator used by `POST /api/unified-charts/from-compute`.
- **`npm run db:migrate-saved`** — promotes legacy `SavedChart` rows into `UnifiedChart`
  (`scripts/migrate-saved-to-unified.ts`).
- **Docker** — entrypoint, compose, and `.dockerignore` updated for the MCP-era layout.
- **Test coverage** — new suites for shadbala, varshaphal, duration foundation, period
  insights, scoring (+ backtest), and the MCP cost guard.

---

### Breaking changes

1. **Home page is now the Chart Compute UI.** `/compute` was removed; `/` serves it directly,
   and its components moved from `app/compute/components/` to `app/components/`.
2. **Legacy `/charts` UI deleted** — `/charts`, `/charts/[id]`, `/charts/[id]/dasha`,
   `/charts/[id]/run`, `/charts/new`, `/charts/newjson`. Chart CRUD lives entirely under
   `/unified-charts`.
3. **Legacy and dormant API routes deleted** — `/api/charts`, `/api/charts/[id]`,
   `/api/charts/[id]/dasha`, `POST /api/runs`, `/api/runs/[id]/rerun`, `/api/compute/save`,
   `/api/compute/charts`, `/api/compute/charts/[id]`, `/api/reports/[id]`. None had a
   remaining UI caller. **`POST /api/unified-charts/[id]/analyze` is now the only way to
   start a pipeline run.**

The legacy `Chart` table still exists — paste-path runs keep a `Chart` row for the
`PipelineRun` FK — but it has no dedicated UI.

---

### Database

One migration: `20260716112936_add_foundation_output` — adds nullable
`DurationAnalysis.foundationOutput` (JSONB). Null on pre-feature rows; no backfill required.

---

### Dependencies & config

- Added: `@radix-ui/react-accordion`, `@radix-ui/react-select`, `@radix-ui/react-slot`,
  `next-themes`, `lucide-react`, `class-variance-authority`, `clsx`, `tailwind-merge`,
  `tailwindcss-animate`.
- New env vars: `VEDICMOJO_BASE_URL` (default `http://localhost:3000`) and optional
  `MCP_TOKEN` for the MCP server — set in the Claude Desktop config, documented in
  `mcp/README.md`. When `MCP_TOKEN` is also set in the app's env it guards `/api/timeline`
  and `/api/knowledge/**`. `.env.example` adds `POSTGRES_DATA_DIR` for the Docker bind mount.

### Upgrade steps

```bash
npm install
npm run db:migrate
npm run db:seed          # re-seeds model_config (new token limits + FOUND-* rows)
cd mcp && npm install && npm run build   # only if using the Claude Desktop path
```

---

### Documentation

Updated in-tree with the code: `docs/HLD.md` (v1.4), `docs/DFD.md` (v1.4), `docs/ERD.md`,
`Agents.md`, `Claude.md`, and `skills/**`. New: `docs/ROADMAP.md`,
`docs/duration-analyser.md`, `docs/mcp-architecture-pattern.md`,
`docs/brand-color-system.md`, `docs/computation_varshaphal.md`,
`docs/computation_chara_dasha.md`, `mcp/README.md`.

### In flight — not in this release

The deterministic **named-yoga catalogue** (`engine/compute/yogas.ts`, the `yogas` column
migration, and the `get_yogas` MCP tool) is on the working tree but **not committed to this
branch**, so it is not part of PR #1. It ships in the next release.
