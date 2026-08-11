# Requirements Document: Deterministic Named-Yoga Engine (F1)

## Introduction

Named-yoga detection is currently **not** a deterministic capability. The compute
engine (`engine/compute/*`) produces every geometric primitive a yoga rests on —
planetary positions with dignity (`planets`, `divisionalCharts[].dignity`), house
lordships (`relationships.houseLords`), graha aspects (`relationships.aspects`),
rashi aspects (`relationships.rashiAspects`), conjunctions
(`relationships.conjunctions`), mutual reception (`relationships.mutualReception`),
and combustion (`relationships.combustion`) — but nothing consumes those primitives
to emit a chart-wide catalogue of *named yogas*. There is no `yogas[]` field on
`ComputedChart` or `UnifiedChart`.

Today two partial substitutes exist and neither is a general engine:

1. **Pair-scoped substrate detection** in `engine/durationAnalysis/slicer.ts`
   (`computeActivatedYogas`) detects Parivartana, Conjunction, a Raja-yoga
   substrate, a Dhana-yoga substrate, and Neechabhanga — but **only for the running
   MD/AD lord pair** of a dasha period, not across the whole chart, and only for a
   handful of forms.
2. **LLM detection** in `prompts/agents/wave2_2a_yogas.md` (Wave 2A) asks a Sonnet
   agent to detect "Raja, Dhana, Viparita, Pancha Mahapurusha, etc." from the Wave 1
   geometry. This is non-deterministic, unauditable, costs tokens, and is
   re-derived on every run.

This feature builds a **pure, deterministic named-yoga engine** — a new
`engine/compute/yogas.ts` module and a `yogas` domain on the chart — that scans the
existing geometry once and emits a stable, evidence-carrying `Yoga[]` catalogue.

**Why this is the keystone.** Three other build-list items depend on it:
- **F3 (Combustion→Grahan promotion)** is a thin consumer: a Grahan yoga (luminary
  conjunct/aspected by a node) is one detector in this engine, and the "promotion"
  reads existing combustion.
- **F4 (Dusthana/Viparita & Dhana analyzer)** — Viparita (Harsha/Sarala/Vimala) and
  Dhana yogas are detectors in this engine; F4 becomes an analyzer *over* the
  catalogue.
- **F5 (Dharma-Karmadhipati / Raja-yoga substrate labeler)** — the chart-wide Raja
  detector with explicit DKA labeling lives here.

**Guiding principle — classical Parashari (PVR Narasimha Rao) grounding.** Where a
modeling choice arises, detection follows the classical Parashari treatment as taught
by P.V.R. Narasimha Rao (Jagannatha Hora), consistent with the existing
`scorer-dynamic-range` and `deterministic-1c-1d` specs. In particular: yoga formation
rests on the geometry already computed in `relationships.ts` and dignity from
`dignity.ts` — a detector MUST NOT independently re-scan planet pairs for
conjunctions/aspects/exchanges; it consumes the `RelationshipGeometry` tables as the
single source of truth (the same rule Wave 1D imposes on Wave 2A).

## Non-Goals

Explicitly **out of scope** for this feature:

- **Yoga activation-period timing.** Mapping a yoga onto the dasha tree (which
  MD/AD/PD activates it, and when) stays with the slicer / duration engine. This
  engine emits the yoga and its constituent planets; downstream code maps planets to
  periods. It MAY emit an `activatingPlanets[]` hint, but computes no dates.
- **Yoga strength *calibration*.** A coarse `strength` grade (strong/moderate/weak)
  from formation quality is in scope; calibrated numeric scoring against real
  outcomes is not (same provisional posture as `WEIGHTS_VERSION`).
- **LLM narrative / interpretation.** Prose about what a yoga *means* stays in the
  Wave 2A prompt and domain markdown. This engine emits structured facts only.
- **Exhaustive classical catalogue.** Hundreds of named yogas exist. v1 targets a
  defined, high-value, unambiguously-computable set (Requirement 2); the schema and
  registry are extensible for later additions.
- **Nabhasa yogas** (Yoga/Dala/Aakriti/Sankhya families) and **varga-internal yoga
  detection** (which depends on F2's varga aspects) are deferred.
- **Scoring-weight integration changes.** Re-tuning `scoringWeights.ts` for the new
  catalogue is a follow-up; this feature only makes the catalogue *available* to the
  `activatedYogas` factor.

## Glossary

- **Yoga_Engine** — the new pure module `engine/compute/yogas.ts` and its
  `computeYogas()` entry point.
- **Yoga_Catalogue** — the `Yoga[]` array emitted for one chart.
- **Detector** — a pure function that recognizes one yoga family from the geometry.
- **Yoga_Registry** — the static table of detectors run by `computeYogas()`.
- **Evidence** — the structured provenance on each `Yoga` recording which rule fired
  and which planets/houses/aspects/exchanges satisfied it.
- **Dusthana** — houses 6, 8, 12. **Kendra** — 1, 4, 7, 10. **Trikona** — 1, 5, 9.
- **PVR_Treatment** — the classical Parashari convention per P.V.R. Narasimha Rao,
  as already referenced by the `scorer-dynamic-range` spec.

## Requirements

### Requirement 1 — Pure, deterministic engine with a stable contract

**User story:** As an engine maintainer, I want yoga detection to be a pure function
over already-computed geometry, so that it is deterministic, auditable, cheap, and
consistent with the `engine/compute/` purity guarantee.

**Acceptance criteria:**
1. WHEN `computeYogas()` is called with a chart's `planets`, `divisionalCharts`,
   `relationships` (incl. `houseLords`, `aspects`, `rashiAspects`, `conjunctions`,
   `mutualReception`, `combustion`), and `lagnaSignNumber`, THEN it SHALL return a
   `Yoga[]` catalogue and SHALL perform no LLM call, no network, no DB, and no file
   I/O.
2. WHEN the same inputs are supplied twice, THEN the output SHALL be byte-for-byte
   identical (deterministic ordering, no timestamps inside individual `Yoga`
   entries).
3. WHEN a required input table is missing or malformed for a given detector, THEN
   that detector SHALL be skipped gracefully (emit nothing) and SHALL NOT throw; the
   remaining detectors SHALL still run (mirrors the scorer's degrade-don't-throw
   contract).
4. The engine SHALL reuse `engine/compute/dignity.ts`
   (`getVargaDignityLabel`, `EXALTATION_SIGNS`, `OWN_SIGNS`, `SIGN_LORDS`) and the
   `RelationshipGeometry` tables from `relationships.ts`. It SHALL NOT re-implement
   dignity, aspect, conjunction, or lordship logic.

### Requirement 2 — v1 detector set

**User story:** As a practitioner, I want the deterministically-unambiguous,
high-value yogas detected, so that the catalogue is trustworthy and covers what the
domain agents and F3/F4/F5 need.

**Acceptance criteria — the following families SHALL be detected in v1:**
1. **Pancha Mahapurusha** (Ruchaka/Bhadra/Hamsa/Malavya/Sasa): Mars/Mercury/Jupiter/
   Venus/Saturn in own OR exaltation sign AND in a kendra (1/4/7/10) from lagna.
2. **Gaja Kesari:** Jupiter in a kendra (1/4/7/10) from the Moon. (School note: from
   Moon is primary; a `fromLagna` variant MAY be flagged in evidence.)
3. **Raja Yoga (kendra-trikona association):** a kendra lord and a trikona lord
   linked by conjunction, mutual graha aspect, or parivartana. Each detected yoga
   SHALL name the kendra lord, the trikona lord, and the linkage type. **DKA
   (Dharma-Karmadhipati)** — the specific 9th-lord + 10th-lord case — SHALL be
   labeled distinctly (satisfies F5).
4. **Dhana Yoga:** association (conjunction / mutual aspect / parivartana) among the
   lords of the wealth houses {2, 5, 9, 11} and the lagna lord (satisfies part of
   F4).
5. **Viparita Raja Yoga (Harsha/Sarala/Vimala):** the lord of 6/8/12 placed in a
   (possibly different) 6/8/12 house — Harsha = 6th lord in 6/8/12, Sarala = 8th
   lord, Vimala = 12th lord (satisfies part of F4).
6. **Neechabhanga Raja Yoga:** a debilitated planet whose debilitation is cancelled
   by the documented conditions (dispositor or exalted-planet in a kendra from lagna
   or Moon) — the same rule already in `slicer.ts`, lifted to the chart level and
   made the single source of truth.
7. **Lunar yogas:** Sunapha / Anapha / Durudhara (planets other than the Sun in
   2nd / 12th / both from the Moon) and Kemadruma (none of the above and no planet
   with the Moon).
8. **Budha-Aditya:** Sun and Mercury conjunct (non-combust distinction recorded in
   evidence).
9. **Parivartana (exchange) yogas:** surfaced from `relationships.mutualReception`
   with its existing `exchange_type` (maha / dainya / kahala / simple) — a projection,
   not a re-derivation.
10. **Kartari yogas** (Papa / Shubha): a house or the lagna hemmed between malefics
    (Papa) or benefics (Shubha) in the 2nd and 12th from it. Benefic/malefic
    classification SHALL reuse `isNaturalBenefic` from `relationships.ts`.

**Deferred (schema-ready, not implemented in v1):** Nabhasa families, Amala, Chamara,
Parvata, Lakshmi, Saraswati, Kalanidhi, and all varga-internal yogas.

### Requirement 3 — Yoga record schema and evidence

**User story:** As a downstream consumer (scorer, slicer, Wave 2A, MCP), I want each
yoga to carry structured, self-describing evidence, so that I can filter, map to
dasha lords, and audit *why* it was detected without re-deriving anything.

**Acceptance criteria:**
1. Each `Yoga` SHALL include at minimum: a stable `key` (machine id, e.g.
   `pancha_mahapurusha.sasa`), a human `name`, a `category`
   (`raja` | `dhana` | `mahapurusha` | `viparita` | `lunar` | `neechabhanga` |
   `parivartana` | `kartari` | `combination`), `planets: string[]`,
   `houses: number[]`, a `benefic: boolean`, a coarse `strength`
   (`strong` | `moderate` | `weak`), and an `evidence` object naming the rule and the
   satisfying linkage (aspect edge / conjunction / exchange / dignity + house).
2. A `Yoga` MAY include `activatingPlanets: string[]` — the planets whose dashas are
   classically taken to fire the yoga — as a hint for the slicer. It SHALL NOT
   include dates.
3. Cancellation / affliction context (e.g. a Raja-yoga planet that is combust, or a
   Neechabhanga cancellation source) SHALL be recorded in `evidence`, not silently
   dropped — this is the seam F3 reads.
4. The catalogue SHALL be emitted in a deterministic order (by category, then key,
   then the sorted planet list).
5. The new types SHALL live in `engine/compute/types.ts` and be re-exported from
   `engine/compute/index.ts` alongside the other domain result types.

### Requirement 4 — Integration into the compute pipeline and storage

**User story:** As the AI pipeline, I want yogas computed once at chart creation and
stored, so that every consumer reads one authoritative catalogue.

**Acceptance criteria:**
1. `computeFullChart()` (`engine/compute/index.ts`) SHALL call `computeYogas()` after
   `relationships` is available and attach the result as `yogas` on `ComputedChart`.
2. `UnifiedChart` SHALL gain a nullable `yogas Json?` column (Prisma migration), and
   the compute-path persistence (`lib/unified-chart-create.ts` mapper) SHALL write
   it.
3. For `source="paste"` charts (no computed geometry), `yogas` SHALL be `null` and
   every consumer SHALL degrade gracefully (no throw), consistent with how paste
   charts already lack `shadbala` / `divisionalCharts`.
4. The compute-path `wave1_delta` assembly in
   `app/api/unified-charts/[id]/analyze/route.ts` SHALL include the yoga catalogue so
   Wave 2A consumes it instead of re-deriving. The Wave 2A prompt
   (`wave2_2a_yogas.md`) SHALL be updated to treat the supplied catalogue as the
   single source of truth (validate/interpret, don't re-derive) — mirroring the 1D→2A
   contract already documented in that prompt.

### Requirement 5 — Duration-engine and scorer consumption

**User story:** As the deterministic period scorer, I want the chart-wide catalogue
available, so that `activatedYogas` and the future F4/F5 factors read one source.

**Acceptance criteria:**
1. `slicer.ts`'s `computeActivatedYogas` SHALL be refactored to derive a period's
   activated yogas by **filtering the chart-wide catalogue** to yogas whose
   `planets` (or `activatingPlanets`) include the running MD/AD (and where relevant
   PD) lord, replacing the bespoke pair-scoped re-derivation. Existing
   `activatedYogas` string outputs consumed by
   `scoring.ts` (`factorActivatedYogas`, and the Neechabhanga lift in
   `factorLordDignity`) SHALL remain behavior-compatible or be updated in the same
   change with re-baselined fixtures.
2. WHEN the catalogue is unavailable (paste path), THEN the slicer SHALL fall back to
   its current pair-scoped logic OR emit no yogas, without throwing (decision
   recorded in design).
3. No `WEIGHTS_VERSION` re-tuning is required by this feature; if the
   `activatedYogas` factor's inputs change materially, the version SHALL be bumped and
   backtest fixtures re-baselined per the `scorer-dynamic-range` precedent.

### Requirement 6 — MCP exposure

**User story:** As a Claude Desktop user on the free MCP path, I want to read the
computed yogas, so that the same deterministic catalogue is available without a paid
run.

**Acceptance criteria:**
1. The MCP server (`mcp/src/tools.ts`) SHALL expose the catalogue as a deterministic,
   read-only tool (e.g. `get_yogas`) that is a thin wrapper over an existing/added
   HTTP route — consistent with the other `get_*` tools and the cost-guard boundary
   (it MUST NOT call `/analyze` or `/duration-analysis`).
2. For paste charts without a catalogue, the tool SHALL return the standard
   "paste-source, no computed domain" guidance already used by `extractOrGuide`.

### Requirement 7 — Verification

**User story:** As a maintainer, I want fixture-based tests, so that detection is
pinned and regressions are caught.

**Acceptance criteria:**
1. Unit tests SHALL cover each v1 detector with at least one positive and one
   negative case, using deterministic hand-built geometry fixtures.
2. At least one end-to-end fixture SHALL run `computeYogas()` over a real computed
   chart (e.g. the "Mojo" Taurus-lagna chart already used by the scorer backtests)
   and assert the expected named yogas — including the known combust-Venus and
   exalted-Saturn-in-H6 (Harsha Viparita candidate) features of that chart.
3. Tests SHALL assert the purity/degradation contract: missing tables → skipped
   detector, never a throw; identical inputs → identical output.

### Requirement 8 — Documentation sync

**User story:** As per `AGENTS.md`, I want the architecture docs updated in the same
change, so the reference never drifts.

**Acceptance criteria:**
1. WHEN this feature merges, THEN `docs/ERD.md` (new `yogas` column), `docs/HLD.md`
   (new compute domain + wave1_delta content), the relevant `.kiro/skills/*`
   (compute-engine / engine-pipeline), and `Agents.md` / `Claude.md` SHALL be updated
   in the same change.
2. The `deterministic-1c-1d` cross-reference SHALL be extended to note that named-yoga
   detection is now deterministic (previously an LLM-only Wave 2A concern).

## Dependency Map (informational)

```
F1 Named-Yoga Engine (this spec)
   ├── unblocks F3  — Grahan detector is one detector here; promotion reads combustion
   ├── unblocks F4  — Viparita + Dhana are detectors here; F4 = analyzer over catalogue
   └── unblocks F5  — chart-wide Raja detector + explicit DKA label emitted here
```
