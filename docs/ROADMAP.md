# VedicMojoAI — Product Roadmap

**Version:** 1.0
**Last updated:** 2026-07-12
**Status:** Active
**Owner:** Product

> Strategic direction: mature the **Duration Analysis (DA)** pipeline into the primary
> product, deprecate the legacy 4-wave pipeline, and move interpretation to a
> **compute-first, LLM-narrates** architecture. See `Agents.md` for current system state.

---

## Status Legend

| Status | Meaning |
|---|---|
| ✅ Done | Shipped |
| 🟡 In Progress | Actively being specced or built |
| ⏳ Planned | Agreed, not started |
| 💤 Backlog | Later / not yet committed |

---

## Phase Summary

| Phase | Theme | Status | Spec |
|---|---|---|---|
| **Phase 1** | Deepen the DA astrological core | ✅ Done | `duration-analysis-scoring` |
| **Phase 2** | Multi-technique confirmation + QA layer | ⏳ Planned | — |
| **Phase 3** | New domain agents + taxonomy + wave sunset | ⏳ Planned | — |
| **Phase 4** | Productization + trust infrastructure | 💤 Backlog | — |

---

## Phase 1 — Deepen the DA Astrological Core

**Status:** ✅ Done — shipped in this session
**Spec:** `.kiro/specs/duration-analysis-scoring/`

**Goal:** Move period favorability from LLM judgment to a deterministic, auditable scoring
engine, and wire already-computed astrological data into the DA context. Establish the
compute-first, LLM-narrates contract.

**Key items**
- Deterministic Period Scoring Engine (`engine/durationAnalysis/scoring.ts`) → 0–100 score,
  intensity band, favorable flag, persisted score breakdown.
- Deterministic peak stress / peak favorable identification (ranked by score, not LLM).
- Karaka role tagging in period lord annotations (AK/AmK/DK…).
- Inject nakshatra relationships (depositor chains, sub-lords, parivartana, clusters).
- Inject Bhava Bala and Ishta/Kashta phala.
- Inject per-domain special points (Upapada, Arudha, Special Lagnas HL/GL/SL, upagrahas).
- `DOMAIN_SCORING_WEIGHTS` table (per-domain benefic/malefic houses, karakas, factor weights).
- Compute-first contract: DA-1 narrates only; pipeline overwrites any LLM-emitted verdict.
- Backward compatibility: paste-path / pre-migration charts scored with reduced-confidence flag.
- Confidence weighting refinement: primary vs secondary factor omissions weighted differently;
  reduced-confidence surfaced through to the verdict and UI, not just the data structure.

**Out of scope (tracked as Open Decision):** Surya Siddhanta computational basis — see below.

---

## Phase 2 — Multi-Technique Confirmation + QA Layer

**Status:** ⏳ Planned

**Goal:** Raise trust by confirming timing across independent techniques and adding the
QA layer the wave pipeline had (4A/4B) but DA dropped.

**Key items**
- Second dasha lens (Jaimini Chara Dasha and/or Yogini) as confirmatory timing.
- DA validation/confidence agent: cross-verify DA-1 against transits, ashtakavarga, and the
  second dasha; emit a confidence score and flag contradictions.
- Sub-period (Sookshma) drill-down → trigger dates for narrow high-interest windows.
- Event-backtest mode: generalize DA-2 beyond symptoms to validate past life events across
  domains → builds trust and calibration data.

---

## Phase 3 — New Domain Agents + Taxonomy + Wave Sunset

**Status:** ⏳ Planned

**Goal:** Broaden "specific area of life" coverage and retire the legacy wave pipeline
after migrating its unique strengths.

**Key items**
- New domain agents via the registry: education/children (H5), spirituality/moksha,
  foreign/relocation, litigation, family, longevity.
- Migrate wave-pipeline strengths into DA: cross-domain synthesis (3C), whole-life overview,
  polished HTML report.
- Deprecate and retire Wave 1–4 orchestrator and prompts (Wave-1 LLM agents can go earlier,
  since compute already replaces them on the compute path).
- Shared report renderer to bring DA output to report parity.

---

## Phase 4 — Productization + Trust Infrastructure

**Status:** 💤 Backlog

**Goal:** Turn the internal tool into a client-facing product with measurable accuracy.

**Key items**
- Client-facing reports (PDF / share links / white-label), auth + multi-user.
- Accuracy feedback loop, golden-chart regression suite, calibration dashboard.
- Remedies agent (gemstones, mantras, remedial timing).
- Cost/perf: deterministic pre-scoring to cut LLM calls; intelligent long-window strategy to
  remove the silent 200-period truncation cap.

---

## Open Decisions

| ID | Decision | Impact | Status |
|---|---|---|---|
| **OD-1** | Surya Siddhanta computational basis (vs current Swiss Ephemeris + Lahiri + True Node + Whole Sign) | Foundational — changes Moon longitude → Vimshottari boundaries → every period score. Ripples through the whole pipeline. | Open — out of scope for Phase 1 |
