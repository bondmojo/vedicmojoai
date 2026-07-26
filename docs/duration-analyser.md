# Duration Analyser — deterministic period computation (UI + MCP)

**Version:** 1.0
**Last updated:** 2026-07-17

This document explains the **Duration Analyser** — the deterministic, no-LLM period
computation feature — and, importantly, **how the exact same computation is exposed to
two very different consumers**: the web UI and Claude Desktop (via MCP). If you are
wondering "is this data already computed / already sent to MCP?", this is the doc.

> Not to be confused with **Duration Analysis** (the paid 3-agent LLM pipeline,
> `POST /api/duration-analysis`, `skills/backend/duration-analysis.md`). The Analyser is
> the free, deterministic sibling.

---

## One backbone, two consumers

Both consumers call the **same deterministic route** — `POST /api/timeline` — which runs
the compute-first pre-steps of the duration pipeline (period slice → transit overlay →
category extraction → 0–100 scoring → peak identification) and returns JSON. **No LLM is
invoked. Nothing here is billed to the API.**

```
                         engine/durationAnalysis/  (pure, deterministic)
                         slicer → transitOverlay → extractor → scoring → periodInsights
                                            │
                                            ▼
                                   POST /api/timeline
                                   (no LLM, no cost)
                                            │
                 ┌──────────────────────────┴───────────────────────────┐
                 ▼                                                        ▼
        MCP  get_domain_dataset                              UI  /duration-computation
        get_timeline_periods                                 (DurationComputationResults)
                 │                                                        │
      returns the RAW payload verbatim                       NO LLM available — so the
                 │                                            deterministic `insights`
                 ▼                                            digest does the selection
      Claude Desktop's LLM reads the raw                      + labeling for the screen
      relationship arrays and INTERPRETS                                  │
      ("Jupiter aspects your 10th → career")                             ▼
                 │                                            renders drivers directly
                 ▼
      reasoning billed to the Desktop
      subscription, $0 API
```

The key asymmetry:

| | **MCP path** | **UI path** |
|---|---|---|
| Entry | `get_domain_dataset`, `get_timeline_periods` (`mcp/src/tools.ts`) | `/duration-computation` page |
| Backbone | `POST /api/timeline` | `POST /api/timeline` (identical) |
| Interpreter | **Claude Desktop's LLM** reads the raw arrays | **none** — no LLM in the tab |
| So it needs… | nothing extra — the LLM narrates the raw data | a deterministic **selection + labeling** layer |
| That layer | (not needed) | `engine/durationAnalysis/periodInsights.ts` → `insights` |

This is why the UI needed the `periodInsights` digest and MCP did not: **the raw drishti /
nakshatra / argala data was already computed and already in the payload** — the MCP path
just hands it to an LLM to interpret, while the deterministic tab has to do that selection
itself.

---

## What's already in the payload (nothing new is computed)

`extractCategoryData` (`engine/durationAnalysis/extractor.ts`) returns `categoryData`, and
`/api/timeline` returns it verbatim. It already contains, for every category:

| Astrological driver | Field | Shape |
|---|---|---|
| **Graha Drishti** (planetary aspects) | `categoryData.relationships.aspects` | `AspectEdge[]` — `from`, `toHouse`, `toSign`, `toPlanets`, `type` (7th, saturn_10th, jupiter_5th, …) |
| **Rashi Drishti** (Jaimini sign aspects) | `categoryData.relationships.rashiAspects` | `RashiAspectEdge[]` |
| **Conjunction / Parivartana** | `categoryData.relationships.conjunctions`, `.mutualReception` | — |
| **Nakshatra threads** | `categoryData.nakshatraRelationships` | `depositorChains`, `nakshatraParivartana`, `clusters`, `subLords`, `rahuKetuAxis` |
| **Argala** (Jaimini leverage) | `categoryData.jaimini.argala` | `ArgalaEntry[]` (career/wealth/marriage only — those carry `jaimini` in `extraColumns`) |
| **Control** (D1 house ownership) | `periods[].lordAnnotations.{md,ad,pd}Lord.ownsHouses` | number[] (lagna-relative) |
| **Varga control + drishti** (D9/D10 for career, D6/D9 for health, …) | `categoryData.divisionalCharts` | `DivisionalChart[]` — each carries its OWN `lagnaSignNumber` + per-planet `house`/`sign` within that varga |
| **Balas / BAV** | `categoryData.bhavaBala`, `categoryData.ashtakavarga` | — |

A live `get_domain_dataset` for one career window returned **19 graha-drishti edges, 36
rashi-drishti edges, 9 nakshatra depositor chains, 24 argala entries** — all already there.

---

## The deterministic digest (UI only) — `periodInsights.ts`

`buildPeriodInsights(slice, categoryData, domainWeights)` is a **pure SELECTION + LABELING
pass** over the fields above — **no new astrology**. For each MD/AD/PD lord it selects:

- **Condition** — dignity (from `scoreBreakdown.factors`), retrograde/combust/cazimi.
- **Control** — `ownsHouses` + occupancy, each **tagged by domain role** (primary / benefic /
  malefic / neutral) and shown with its sign. **D1 only.**
- **Drishti** — `relationships.aspects` filtered by `from` (cast) and `toPlanets` (received);
  Jaimini rashi-drishti onto domain houses (from the `rashiDrishti` factor). **D1 only.**
- **Vargas** — the SAME control + drishti computed **within every other divisional chart the
  domain uses** (e.g. D9 + D10 for career, D6 + D9 for health — exactly `registry.ts`'s
  `divisions` list minus D1). House ownership is derived from each varga's own
  `lagnaSignNumber` (`houseToSign` + `SIGN_LORDS`, no lookup table needed); drishti reuses
  `computeGrahaDrishti` directly on that varga's own planet placements — the SAME aspect
  function D1 uses, just fed varga-relative positions. Classical convention: the Nth house of
  a varga carries the Nth house's significance (10th of D10 = career, same as 10th of D1).
- **Nakshatra** — star-lord, sub-lord, `depositorChains`, `nakshatraParivartana`.
- **Association** — `conjunctions` + `mutualReception`.

Plus a **domain-house focus** block per key house (lord, occupants, aspecting planets,
argala, Bhava Bala, SAV — D1). It reuses the compute-layer helpers (`houseToSign`,
`SIGN_LORDS`, `NATURAL_BENEFICS/MALEFICS`, `getSignName`, `computeGrahaDrishti`) so it cannot
drift from the engine, and degrades gracefully when a facet is absent (paste-path charts, node
lords, a varga with no planet placements).

The digest is attached to each period as `insights`, alongside a compact `domainContext`
(the domain's houses / varga / karakas from `DOMAIN_SCORING_WEIGHTS`). Both are **additive**
to the response — the MCP path simply carries them along (a harmless bonus for Claude
Desktop); no MCP behavior changes and the cost guard is untouched.

---

## Per-domain model (single source of truth)

The domain → houses / varga / karakas mapping lives **only** in `DOMAIN_SCORING_WEIGHTS`
(`engine/durationAnalysis/scoringWeights.ts`) — surfaced to the UI/MCP as `domainContext`.

| Domain | Primary houses | Primary varga | Karakas |
|---|---|---|---|
| career | 10 | D10 | AmK; Sun/Saturn/Mercury |
| wealth | 2, 11 | D2 | Jupiter/Venus |
| health | 1, 6, 8 | D30 | AK; Sun/Moon/Saturn |
| cashflow (Money) | 2, 11 | D2 | Mercury/Venus |
| marriage | 7 | D9 | DK; Venus/Jupiter |
| property | 4 | D4 | Mars/Venus/Saturn |
| family | 2, 4 | D4 | Moon/Jupiter |

`family` is **UI-only** — it is deliberately absent from the MCP `CATEGORY` enum
(`mcp/src/tools.ts`) and from the paid `/api/duration-analysis` category list, so it has no
prompt file or `model_config` row. See `engine/durationAnalysis/registry.ts`.

---

## Files

| Concern | File |
|---|---|
| Deterministic backbone route | `app/api/timeline/route.ts` |
| Period slice / transit / extract / score | `engine/durationAnalysis/{slicer,transitOverlay,extractor,scoring,scoringWeights}.ts` |
| **Driver digest (UI selection layer)** | `engine/durationAnalysis/periodInsights.ts` |
| UI page + results | `app/duration-computation/page.tsx`, `app/components/DurationComputationResults.tsx`, `app/components/DashaPeriodPicker.tsx` |
| MCP tools (raw payload → Claude Desktop) | `mcp/src/tools.ts` (`get_timeline_periods`, `get_domain_dataset`) |
| Digest + domainContext types | `lib/durationTypes.ts` (`PeriodInsights`, `LordDriver`, `DomainHouseFocus`, `DomainContext`) |
| Tests | `tests/duration-period-insights.test.ts`, `tests/duration-extractor.test.ts` |
