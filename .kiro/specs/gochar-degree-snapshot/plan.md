# Plan — Degree-aware Gochar (snapshot, events, stations) + MCP ergonomics + Sade Sati overlay fix

**Status:** DRAFT v2 — revised after independent Opus review (findings verified against code; see §9).
**Date:** 2026-10-11.
**Origin:** a real reading session (Devendra's Sun Mahadasha + Oct 2026 transits) exposed that the MCP/Gochar surface returns sign-level data only, so exact-degree questions could not be answered.

> **Supersedes** `.kiro/specs/gochar-feature/requirements.md` Non-Goals (lines ~35-38): "planetary station dates, transit aspects to natal planets, transit-over-natal conjunction analysis" and "changes to the existing `get_transits` MCP tool". Those were deliberate exclusions for v1 of Gochar; this plan reverses them for the new endpoints only. **Needs owner sign-off before Phase 2+.** The existing `get_transits` tool is left unchanged (we add a sibling tool instead).

---

## 1. Problem (evidence from code)

| # | Finding | Where |
|---|---|---|
| P1 | `computeGocharRange` samples exact longitude + speed per step but emits only sign/house/start/end. Degrees are discarded. | `engine/compute/gochar.ts:234` (`getSiderealLongitude`, exported), `:579-587` (`emitIntervals`) |
| P2 | `get_transits` returns the stored `chart.transits` (sky at chart computation time); no `asOf`. `computeTransits()` already accepts `asOfDate`, but only `durationAnalysis/transitOverlay.ts` passes one other than "now" (`engine/compute/index.ts:237-245` passes `new Date()`). | `mcp/src/tools.ts:156`, `engine/compute/transits.ts:653` |
| P3 | No transit→natal relationship output (conjunction/drishti onto natal planets) and no per-day Moon indicators (Tara Bala, Chandrashtama). | — |
| P4 | MCP drops validation `details`: a >1096-day Gochar range surfaces as `Invalid input (HTTP 400)`. `ApiError.body` already holds the full response; `guard()` discards it. | `mcp/src/http.ts:40-46`, `mcp/src/tools.ts:39`, limit at `lib/gocharRange.ts:219-229` |
| P5 | Oversized MCP payloads (`get_dasha_tree` ≈179k chars, `get_timeline_periods` ≈1.4–1.6M chars for a 6-year window). Note: `get_client_chart` already supports a `sections` filter (`mcp/src/tools.ts:88-106`); the 334k-char result came from calling it unfiltered — so the fix there is discoverability, not a new parameter. | observed |
| **P6 (confirmed bug)** | `transitOverlay` takes Saturn's sign from live `computeTransits()` at AD start but throws away the live Sade Sati phase that call already computes (`transits.ts:696-700`) and instead matches the AD start against stored, month-granular, retrograde-merged `sadeSati.allPeriods` (`transitOverlay.ts:60-100,189`), parsing "Mon YYYY" with local-tz `new Date()`. Adjacent periods overlap by a month and first-match wins ⇒ phase can disagree with Saturn's sign. Repo evidence: `engine/durationAnalysis/__fixtures__/mojo_wealth_range.json` (natal Moon Pisces) has an AD at 2023-01-02 with Saturn in Capricorn yet `sadeSatiActive:true, phase:"rising"`. The overlay header's stated reason ("no re-scan") is false — `computeTransits` runs the scan on every call (`transits.ts:702`). | `engine/durationAnalysis/transitOverlay.ts` |
| P7 | No Sun–Rahu / Moon–Rahu (Grahan) entry in the yoga catalogue. | `engine/compute/yogas.ts` — **out of scope** (belongs to `named-yoga-engine`) |

## 2. Goals / non-goals

**Goals**
1. Fix P6 and P4 first (small, high-value, independent).
2. Deterministic, no-LLM, read-only **transit snapshot at an arbitrary instant**: degrees, nakshatra, retrograde, transit-basis dignity, combustion, houses, Ashtakavarga score of the transit sign, natal hits, Moon-day indicators.
3. **Transit→natal events** scan (exact conjunction dates), built *after* the snapshot is validated.
4. **Opt-in** stations on Gochar.
5. MCP payload ergonomics, MCP-layer only.

**Non-goals**
- No LLM, no DB writes, no schema change (`docs/ERD.md` untouched).
- No change to default `POST /api/gochar` behavior, its call into `computeGocharRange`, or the home-page Gochar UI.
- No new yoga detectors (P7); no D9-on-D1 overlay helper (follow-ups).
- No interpretation text.

## 3. Design

### 3.1 Contracts in a client-safe leaf
`lib/gocharSnapshot.ts` — types + pure parsing only. **Self-contained:** the hygiene scan follows `import type` edges (`gocharRange.test.ts:~304`), and `relationships.ts:28 → planets.ts:9 → swisseph`. So this leaf imports **nothing** from `engine/compute/*` (define its own interfaces; the engine imports from the leaf, not the reverse). Same hygiene test pattern as `lib/gocharRange.ts`.

### 3.2 `computeTransitSnapshot` (pure engine function)
`engine/compute/transitSnapshot.ts`

```ts
computeTransitSnapshot({
  asOf: Date,
  natal: {
    lagnaSignNumber: number; lagnaLongitude: number;
    moonSignNumber: number;  moonLongitude: number;
    planets?: PlanetPosition[];          // absent on paste charts
    ashtakavarga?: AshtakavargaResult;   // absent on paste charts
  },
  includeMoon = true,
  conjunctionOrbDeg = 5,
}): TransitSnapshot
```
Positions come from the **existing exported `getSiderealLongitude()`** (never re-derive the sidereal setup; a tropical read is ~24° off and invisible to structural tests — `gochar.sidereal.test.ts`). Rahu uses **SE_TRUE_NODE (id 11)** like the rest of the engine (`planets.ts:52`, `gochar.ts:133`, `transits.ts:134`); Ketu = Rahu + 180°.

Per graha:
- `longitude`, `sign`, `signNumber`, `degreeInSign`, `dms`, `speed`, `retrograde` (`speed < 0`; Ketu inherits Rahu's speed — note the engine is internally inconsistent here: `planets.ts:205` hard-codes Ketu retrograde, `transits.ts:686` uses speed; the snapshot follows speed).
- `nakshatra {nakshatra, nakshatraIndex, pada, nakshatraLord, subLord}` — field names as returned by `computeNakshatraForLongitude` (`nakshatras.ts:121`).
- `houseFromLagna`, `houseFromMoon` (whole-sign: `((sign − natalSign + 12) % 12) + 1`).
- `dignity`: `getVargaDignityLabel(planet, signNumber, {}, degreeInSign)` — **empty tatkalika map, transit-only basis**, matching `durationAnalysis/scoring.ts:405-418` so snapshot and Duration Analysis never disagree. Degree is passed (moolatrikona span applies, as in D1). Nodes → `undefined`.
- `combust`/`nearCombust`/`cazimi` via `computeCombustion` over the transit planet set (thresholds `relationships.ts:66-73`; nodes skipped).
- `ashtakavarga`: `{ bav: natal.ashtakavarga.bav[graha][signNumber − 1], sav: sav[signNumber − 1] }` for the seven classical grahas; `null` for nodes or when natal AV is absent. (BAV array is sign-indexed, 0 = Aries — `ashtakavarga.ts:128-151`.) Kakshya (degree-level AV) is deferred.
- `natalHits[]`, every entry tagged with `basis`:
  - `'sign'` conjunction — same sign as a natal planet/Lagna (the primary Vedic notion);
  - `'degree'` conjunction — `arcDist(transitLon, natalLon) ≤ conjunctionOrbDeg`, with `orbDeg` and `applying`;
  - `'drishti'` — Parashari aspects from the transit planet's whole-sign house via the **already-exported** `ASPECT_HOUSES` (`relationships.ts:96`; **no helper extraction needed**), landing on natal planets in the aspected house. Each hit carries the table's `school` so Rahu/Ketu 5th/9th (`jaimini_optional`) are not presented as Parashari.
  - **Applying/separating:** with natal point fixed, let `f = wrap(transitLon − natalLon)` to (−180,180]; **applying ⇔ sign(f) · speed < 0** (retrograde transit flips it correctly).
  - Natal planets' `house` is **recomputed from sign** vs natal lagna, not trusted from stored JSON.

`moonDay` (when Moon included):
- `nakshatra` as above.
- **Tara Bala:** `n = ((t − j + 27) % 27) + 1` (inclusive count, `j` = natal Moon nakshatra index, `t` = transit Moon's); `tara = ((n − 1) % 9) + 1`; names `1 Janma, 2 Sampat, 3 Vipat, 4 Kshema, 5 Pratyak, 6 Sadhana, 7 Naidhana, 8 Mitra, 9 Parama Mitra`; also return `cycle = ⌈n / 9⌉`. v1 computes it for the Moon only (per-graha tara deferred).
- `chandrashtama`: transit Moon `houseFromMoon === 8`.

### 3.3 `POST /api/gochar/snapshot`
Mirror `app/api/gochar/route.ts`: `resolveRequestUser` → 401; Zod, exactly one of `unifiedChartId | birthData`; ownership mismatch → **404**; read-only, no persistence.
- Body: `{ asOf, includeMoon?: boolean = true, conjunctionOrbDeg?: 0.5..10 (default 5), unifiedChartId | birthData }`.
- **`asOf` rule:** full ISO instant must end in `Z` (used verbatim); a bare `YYYY-MM-DD` resolves to **12:00:00Z** of that date (aligns with `get_active_dasha`/`get_chara_dasha`, `tools.ts:~261,~283`; the Moon moves ≈6.5° in 12 h so midnight-vs-noon changes tara/Chandrashtama — echo the resolved instant). `parseOneBound` is private (`gocharRange.ts:~130`); add a small exported `parseSnapshotInstant` to the leaf rather than exporting internals.
- **Saved chart:** `select { planets, ashtakavarga, lagnaLongitude, moonLongitude, userId }`; `lagnaLongitude`/`moonLongitude` are `Decimal` → `Number()`.
- **Paste-source chart:** `moonLongitude`/`lagnaLongitude` *are* stored (`lib/chart-mapper.ts:172-189`) — only the JSONB columns are null (`:197-212`). So return full positions, `moonDay`, and Moon/Lagna natal hits; set `natalHits` for other planets and `ashtakavarga` to partial/`null` with a `note`. **Caveat to surface in `note`:** paste charts store `ayanamsa = 0` (`chart-mapper.ts:190`), so natal degrees may not be Lahiri; hits against them are only as good as that input.
- **Unsaved `birthData`:** `birthInputToJulianDay → computeAscendant → computePlanetPositions → computeAshtakavarga` (light path; not `computeFullChart`).

### 3.4 Stations (opt-in, separate pass)
`POST /api/gochar` gains optional `includeStations?: boolean`. **Zod must not add a default**: when absent/false the route calls `computeGocharRange` with **exactly** the current argument object (`tests/gochar-api.test.ts:186-192` asserts it with `toHaveBeenCalledWith`) and the response is byte-identical. When true, a **separate** `computeGocharStations(start, end, grahas)` runs afterwards using the generic `scanGocharStateChange` with state = `speed < 0` (the existing scanner returns at first change and its sample count is asserted by `gochar.cuspProximity.test.ts:~298-302`, so it is not modified). **Scope: Mercury, Venus, Mars, Jupiter, Saturn only** — the true node can station repeatedly and would emit spurious events; Sun/Moon never station. Output `stations[] = { graha, at, type:'retrograde'|'direct', longitude }`. (Per-interval start/end longitudes dropped — they are ≈ k·30° by construction.)

### 3.5 `POST /api/gochar/events` (Phase 3 — only after the snapshot is validated)
`computeTransitNatalEvents({ natal, start, end, includeMoon })` — exact **conjunction** dates between each transiting graha and each natal planet + Lagna.
- Needs helpers private to `gochar.ts` today (`COARSE_STEPS :442`, `toJD :163`, `jdToDate :194`): implement in `gochar.ts` (or export them deliberately).
- **Station-safe scanning (blocker from review):** a cross-and-return near a station is invisible to sign-change-at-step-ends checks (already documented in `gochar-feature/design.md:~170-185`). Zero-crossings of `f` have the same failure, worst for Jupiter/Saturn/Rahu at 5-day steps. Add an `f`-analogue of `stepIsSafe`: subdivide when `|f| ≤ |relSpeed|·step·2`, down to `MIN_STEP_DAYS`. A "triple retrograde pass ⇒ 3 events" test is only meaningful with this guard.
- Detect zero-crossings of `f` that do **not** cross ±180 (wrap); bisect to ms. Sample each graha once per step and evaluate **all** natal targets from that sample.
- **Node dedupe:** Ketu-conjunct-X ≡ Rahu-opposite-X. v1 emits **conjunctions only**; for nodes, emit Rahu and Ketu conjunctions (they are distinct events), and no oppositions anywhere in v1 (open question Q2).
- Span caps = Gochar's (366 d with Moon / 1096 d without); `maxEvents` (e.g. 500) applied **after** the global sort by `exactAt`, with `truncated: true`. Output `{ transit, target, kind:'conjunction', exactAt, transitLongitude, transitRetrograde }[]`.
- Add a **timing test** (1096 d, no Moon, all natal targets). Estimated ≈10–15k ephemeris calls; unverified against Vercel `maxDuration` — set an explicit `maxDuration` on the route like the other long routes.

### 3.6 MCP surface
- Add `get_transit_snapshot` (Phase 2) and `get_transit_events` (Phase 3) to `mcp/src/tools.ts` (same `chartRefShape` / `guard()` pattern as `get_gochar`). **Update `ALLOWED_POST_ROUTES` in `tests/mcp-cost-guard.test.ts`** for `/api/gochar/snapshot` and `/api/gochar/events`; the guard fails closed on unlisted routes.
- `get_gochar` gains pass-through `includeStations`.
- Check any test that asserts tool count / names (`tests/mcp-gochar.test.ts`, MCP smoke test).

### 3.7 Track B — payload ergonomics (MCP layer only)
`/api/timeline` also serves the Duration Analyser UI, so **do not change the API**.
- **P4:** in `guard()` (`tools.ts:39`), when `err.body?.details` exists, append a compact rendering to the message (keep `error` as prefix). `ApiError.body` is already populated.
- `get_dasha_tree`: optional `level: 'md'|'ad'|'pd'` and `dateFrom/dateTo`, applied to the API result in the tool (default = unchanged).
- `get_timeline_periods`: optional `granularity: 'pd'|'ad'` — collapse PD rows to AD in the tool before returning (default unchanged).
- `get_client_chart`: update the description to steer callers to `sections`; no new param.

### 3.8 Track C — fix P6 (confirmed)
1. Add failing tests in `engine/durationAnalysis` for a Pisces natal Moon: (a) an AD starting ingress + 1 day; (b) an AD starting inside a retrograde re-entry gap; (c) the `mojo_wealth_range` 2023-01-02 case. Assert `sadeSatiActive/Phase` agree with `saturn.houseFromMoon` (12 → rising, 1 → peak, 2 → setting).
2. Fix: take `{active, phase}` from `transitAnalysis.sadeSati` (already computed at `adStart`); drop `getSadeSatiPhaseFromStored` and the false header claim.
3. `scoring.backtest.test.ts` embeds static `TransitOverlay` JSON (`:179-183`), so it cannot break; **regenerate `mojo_wealth_range.json` on purpose** and note the expected score changes in the PR. Mention in release notes that Duration Analysis scores can shift for ADs near Saturn sign changes.

## 4. Phasing

| Phase | Deliverable | Depends on |
|---|---|---|
| 0a | Track C: P6 tests + fix | — |
| 0b | Track B: error details in `guard()` (+test) | — |
| 1 | `lib/gocharSnapshot.ts` + `transitSnapshot.ts` + route (no `moonDay` yet) | owner sign-off (supersession) |
| 2 | `moonDay` (Tara/Chandrashtama) + `get_transit_snapshot` MCP tool + cost-guard update | 1 |
| 3 | `includeStations` on `/api/gochar` | 1 not required |
| 4 | `/api/gochar/events` + MCP tool (only after Phase 2 validated against a practitioner) | 2 |
| 5 | Track B payload params | 0b |

0a, 0b, 1 and 3 are independent and can run in parallel.

## 5. Tests (vitest; mirror `gochar.*.test.ts`, `tests/gochar-api.test.ts`, `tests/mcp-gochar.test.ts`)
- **Oracle/sanity:** snapshot at 2026-10-26T12:00Z → Sun in Libra ≈ 8.7–9.1° (consistent with an ingress near 2026-10-17T14:21Z at ~1°/day — *an estimate from tool output, verify against a direct `swe_calc_ut`*); Saturn in Pisces; cross-check degrees against a direct ephemeris call in the test (guards the sidereal setup).
- **Single source of truth:** for random instants, snapshot sign/house == containing interval from `computeGocharRange`.
- **Hits:** orb edge (4.99/5.01°), `applying` for direct and retrograde, `basis` labels, `school` carried, natal `house` recomputed.
- **moonDay:** hand-computed Tara cases incl. wrap (t < j), cycle 1/2/3.
- **Events:** re-sampling each `exactAt` gives `|f| < ε`; no spurious event across ±180; station-adjacent triple pass; node dedupe; `maxEvents` after sort; timing.
- **Stations:** excludes nodes; matches speed zero-crossing; absent flag ⇒ identical request/response (assert `computeGocharRange` args unchanged).
- **Contracts:** leaf import-hygiene test; API 401/400/404 (ownership → 404); paste-chart partial path; MCP registration; `mcp-cost-guard`.
- **Regression:** default `/api/gochar` byte-identical; `computeGrahaDrishti` unchanged (it is not touched).

## 6. Docs (same change, per CLAUDE.md)
`docs/HLD.md` (route table ~l.333 + §3.9 MCP list), `docs/DFD.md` (~l.214-226), `docs/computation_transits_sadesati.md` (snapshot/events/Tara logic for teacher validation), `.kiro/skills/gochar.md`, `mcp/README.md`, `CLAUDE.md`, `Agents.md` if it lists MCP tools, and an addendum in `.kiro/specs/gochar-feature/requirements.md` recording the superseded non-goals. `docs/ERD.md`: no change.

## 7. Risks
- **True node** (id 11) can go direct/station; the engine and docs must say "true node" everywhere (earlier draft wrongly said mean node). Ketu retrograde convention is inconsistent across the engine (see 3.2).
- **Client-bundle leak:** `lib/` leaf must stay self-contained (hygiene follows type imports).
- **Basis confusion:** sign vs degree vs drishti — mitigated by `basis`/`school` tags.
- **Orb semantics:** one orb (5°) ≈ 9 h for the Moon but weeks for Saturn; tune per-graha defaults after practitioner feedback (Q1).
- **Duration Analysis score drift** from the P6 fix — deliberate, called out in release notes.
- **Paste-chart ayanamsa** may not be Lahiri (stored 0).
- **UTC only:** local-date boundaries (e.g. IST) can shift a Moon-sign day; document (Q3).

## 8. Open questions (owner decisions)
1. Default orb: single 5°, or per-graha (e.g. Moon 3°, fast 5°, slow 8°)? Add degree-based (angular) drishti in v1 or keep sign-based only?
2. Events: conjunction-only in v1 (recommended) or include oppositions with node dedupe?
3. Add display-only `timezone` offset to the snapshot, or stay UTC-only?
4. Bare `asOf` date → 12:00Z (recommended, matches dasha tools) or require full instants?
5. Ketu retrograde convention: follow speed (recommended) or the engine's hard-coded `true`?
6. Approve superseding the `gochar-feature` non-goals (needed for Phase 1+).
7. Track B: stay strictly opt-in (recommended) or also shrink defaults (breaking for saved prompts)?

## 9. Review log (Opus, 2026-10-11)
Verified-and-applied: true-node correction; `ASPECT_HOUSES` already exported (helper extraction dropped); `gochar-api.test.ts:186-192` exact-args assertion ⇒ no Zod default for new flag; paste charts keep Moon/Lagna longitudes; applying-formula fix; transit-only dignity basis; bare-date = 12:00Z; node dedupe; stations exclude nodes + separate pass; leaf-import trap; `get_client_chart.sections` already exists; P6 confirmed as real (mechanism + fixture evidence); supersession of old non-goals recorded; station-safe scan guard added to events (blocker). Not independently verified by me: the Vercel runtime estimate and the exact `gocharRange.test.ts:~304` hygiene-scan edge-following (both flagged in the text).
