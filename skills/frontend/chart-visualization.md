# Chart Visualization Components

Located in `app/components/` (moved here from `app/compute/components/` in v1.3,
when the Chart Compute UI became the home page):

> **`KarakaTable.tsx` was deleted** (`chart-ui-enhancements` spec). The home tab strip
> now has **10** tabs — Planets + Nakshatras + Karakas merged into one **Grahas** tab,
> and a new **Yogas** tab after Ashtakavarga. `PlanetTable.tsx` and `NakshatraTable.tsx`
> survive as embedded-only components (`DurationComputationResults`), so do not delete
> them alongside.

| Component | Purpose |
|---|---|
| `NorthIndianChart.tsx` | Diamond-style Rashi chart |
| `SouthIndianChart.tsx` | South Indian square chart |
| `ChartGrid.tsx` | Multi-chart grid (D1–D60) |
| `DashaTimeline.tsx` | Visual dasha period timeline |
| `GrahasTable.tsx` | **Grahas tab** — one row per graha, 14 columns (sign, degree, house, retro, D1 dignity, nakshatra/pada/lord/sub-lord, karaka, speed, longitude). Merges the former Planets / Nakshatras / Karakas tabs; the karaka cell is a hover/focus disclosure, not a column |
| `PlanetTable.tsx` | Planet positions/dignities table — **no longer on the home tab strip**; kept because `DurationComputationResults` still consumes it |
| `NakshatraTable.tsx` | Nakshatra analysis view — same: embedded-only, kept for `DurationComputationResults` |
| `AshtakavargaView.tsx` | Bindhu scores — renders all 7 BAV diagrams + SAV simultaneously (no graha selector) plus the numeric tables, with internal `indexMode` (house/sign) and `diagramStyle` (N/S) state. Props unchanged: `{ data: AshtakavargaResult }` |
| `BinduChart.tsx` | Single bindu series as a North/South Indian diagram. Deliberately **not** a variant of `NorthIndianChart`/`SouthIndianChart` — a bindu cell is one integer + one label, not a glyph list — but reuses their geometry from `chartGeometry.ts` |
| `BinduLegend.tsx` | Static always-visible band key (swatch + marker glyph + inclusive range + label). Exactly one entry per band `bandsFor(reckoning)` returns — SAV 3, BAV 4 |
| `YogasView.tsx` | **Yogas tab** — the deterministic `chart.yogas` catalogue grouped by category; evidence behind a native `<details>`, not the Radix `Accordion` |
| `KeyDignitiesPanel.tsx` | Summary-tab "Key Dignities" card (extracted from `ChartSummaryTab.tsx`) — dignity, vargottama and combustion chips, each a `<button aria-describedby>` disclosure carrying a `getVargaDignityReason` sentence |
| `SadeSatiPanel.tsx` | Both Sade Sati readings (sign-based + degree-based) as two separately labelled groups with different row shapes; extracted from `TransitsView`'s `sadesati` sub-tab |
| `PindaStrengthView.tsx` | Pinda/Bala strength bars |
| `TransitsView.tsx` | Current transits overlay |
| `VarshaphalView.tsx` | Tajika annual solar-return chart (year picker + results) |
| `SectionUnavailable.tsx` | Shared `SectionUnavailable` message (`role="status"`) + `SectionBoundary` client error boundary — one fixed wording for absent/malformed/throwing sections, never an exception type, stack or field path |

**Shared modules in the same directory** (not components — no React import):

| Module | Purpose |
|---|---|
| `chartTypes.ts` | Chart prop/data types |
| `chartGeometry.ts` | SVG layout constants for both layouts (`NORTH_LINES`, `NORTH_CELL`, `NORTH_SIGN_POS`, `SOUTH_LAYOUT`, `CELL_SIZE`, `GRID_SIZE`, `CANVAS`) — extracted verbatim from `NorthIndianChart`/`SouthIndianChart`, one source of truth, also used by `BinduChart` |
| `sectionGuards.ts` | `SectionState<T>` + `guardSection()` and the narrow shape predicates (`isArrayOfLength`, `isNonEmptyArray`, `hasNumberArrays`, `isPlainObject`) that decide render-vs-`SectionUnavailable`. Never throws |
| `yogaGrouping.ts` | Pure category grouping + ordering for `YogasView` (fixed nine-category order, unknown categories preserved in a trailing group) |

**Rules for chart components:**
- Accept typed props — no `any` or loose objects
- Use SVG for chart diagrams (not canvas)
- All chart types defined in `chartTypes.ts`
- Responsive: work at 300px–800px widths
- A section whose data is absent or malformed renders `<SectionUnavailable section="…" />`
  rather than throwing or rendering a partial diagram — guard with `sectionGuards.ts`
- **The guard is two layers, and both are wired.** `guardSection` at the top of a pane checks the
  *container* it was handed (absent, null, a primitive, an array where an object is expected, the
  wrong entry count) and returns the message; `<SectionBoundary section="…">` — which wraps every
  pane in `app/page.tsx` — catches whatever a well-shaped container's *contents* do at render
  time. Panes deliberately do **not** deep-validate every field of every row: the engine emits
  well-formed rows, and the boundary already contains the blast radius to one pane. When a pane
  calls hooks, run `guardSection` before them but put the early `return` after, or the hook count
  varies between renders. Coverage: `app/components/sectionGuards.test.tsx`
