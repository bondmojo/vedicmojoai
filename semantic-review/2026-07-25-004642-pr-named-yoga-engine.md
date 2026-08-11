# Deterministic named-yoga engine (F1)

Adds `engine/compute/yogas.ts` — a pure, never-throwing detector suite that scans the geometry `relationships.ts`/`dignity.ts` already computed and emits a chart-wide, evidence-carrying `Yoga[]` catalogue (Pancha Mahapurusha, Gaja Kesari, Raja incl. a distinctly-keyed `raja.dka`, Dhana, Viparita, Neechabhanga, the lunar quartet, Budha-Aditya, Parivartana, Kartari). The catalogue is persisted to a new nullable `UnifiedChart.yogas` JSONB column, injected into the compute-path `wave1_delta` under `1D` for Wave 2A to interpret, exposed read-only via the new `get_yogas` MCP tool, and consumed by the Duration-Analysis slicer — which is refactored from a pair-scoped re-derivation to a catalogue filter with the old logic preserved as the paste-path fallback.

Watch for: two classical-rule bugs in the detectors — (1) **confirmed** Pancha Mahapurusha silently misses the moolatrikona-sign placement of Mars/Jupiter/Venus/Saturn (Ruchaka in Aries, Hamsa in Sagittarius, Malavya in Libra, Sasa in Aquarius all fail to fire), and (2) **confirmed** Kartari emits a false positive when only one of the 2nd/12th houses is occupied. The slicer's string-format compatibility with the scorer is otherwise genuinely preserved, and purity/determinism/paste-path handling are sound.

## High-level view

The engine is wired in as compute Step 15, after relationships, and reads only the already-computed geometry tables — it never re-derives conjunctions, aspects, exchanges, or dignity. That single-source-of-truth discipline holds throughout. Purity and the never-throw guarantee are real: each detector guards missing data and returns `[]`, and `computeYogas` swallows any detector that throws. Output is deterministically sorted by category → key → planet list, with no timestamps in the yoga objects.

Two detectors encode their classical rule incorrectly. Pancha Mahapurusha accepts only the dignity labels `exalted` and `own`, but `getVargaDignityLabel` resolves the moolatrikona sign to the label `moolatrikona` (checked *before* `own`), so the four planets whose moolatrikona sign is also an own sign lose their most common Mahapurusha placement. Kartari never checks that both the 2nd and 12th are occupied, so a single malefic in the 2nd (empty 12th) is reported as Papa Kartari — the "scissors" require hemming on both sides.

A smaller gap: the Raja detector is association-only by construction (`kendraLord === trikonaLord` is skipped), so a single yogakaraka planet owning both a kendra and a trikona produces no Raja yoga. This matches the spec's "linkage between two lords" framing but will surprise practitioners.

The slicer refactor is the load-bearing integration and it is correct. The catalogue is filtered to entries whose participants include the running MD or AD lord, and formatted back into the exact legacy strings the scorer string-matches on — critically, the Neechabhanga entry reproduces `Neechabhanga active — <lord> debilitation cancelled` verbatim, so the dignity-lift in `factorLordDignity` still fires. The compute path uses the catalogue authoritatively (even when empty); paste-path charts (`yogas` null) and pre-migration compute charts (also null) fall back to the pair-scoped re-derivation. One behavioral shift rides along: the catalogue filter is a union over the MD/AD lords across the whole chart, so `factorActivatedYogas` will generally see more entries than the old pair-scoped path and scores will move — intended per the spec, but real.

<details>
<summary>Issues (8)</summary>

1. **Mahapurusha moolatrikona miss** (confirmed, high) — `detectPanchaMahapurusha` accepts only `exalted`/`own`; add `moolatrikona` to the accepted labels or the yoga will not fire for Mars/Aries, Jupiter/Sagittarius, Venus/Libra, Saturn/Aquarius.
2. **Kartari one-sided false positive** (confirmed, medium-high) — require at least one planet in the 2nd *and* one in the 12th before classifying Papa/Shubha Kartari.
3. **Yogakaraka Raja yoga not emitted** (likely, low-medium) — a single planet owning both a kendra and a trikona is skipped (`kendraLord === trikonaLord`); acceptable under the "association" scope but worth an explicit note or a dedicated detector.
4. **Nodes counted in Sunapha/Anapha** (possible, low) — Rahu/Ketu in the 2nd/12th from Moon trigger the lunar yogas; many texts exclude the nodes. Confirm intent.
5. **`findMutualAspect` is one-directional** (confirmed, nit) — the name implies mutual but it matches a single-direction aspect. Correct for association detection; rename for clarity.
6. **Unused `lagnaSignNumber`** (confirmed, nit) — `YogaInput.lagnaSignNumber` is populated but never read (houses are already lagna-relative). Drop it or use it.
7. **`factorActivatedYogas` count inflation** (confirmed, informational) — the catalogue union produces more strings per period than the old pair-scoped derivation, shifting scores. Intended per Requirement 5.1, but flag for backtest expectations.
8. **Pre-migration compute charts read as null** (confirmed, informational) — existing compute-path rows have `yogas = null` until recomputed, so they silently use the paste-path fallback. No backfill is included.

</details>

<details>
<summary>Details</summary>

### Pancha Mahapurusha misses the moolatrikona own-sign

The detector gates on the dignity label:

```ts
const label = getVargaDignityLabel(planetName, p.signNumber, d1Signs)
if (label !== 'exalted' && label !== 'own') continue
```

`getVargaDignityLabel` (dignity.ts) checks moolatrikona *before* own:

```ts
if (MOOLATRIKONA_SIGNS[planet] === vargaSignNumber) return 'moolatrikona'
if (OWN_SIGNS[planet]?.includes(vargaSignNumber)) return 'own'
```

For four of the five Mahapurusha planets, the moolatrikona sign is also an own sign, so the label collapses to `moolatrikona` and the placement is rejected even though it plainly satisfies the spec's "own or exalted" rule (design.md Detector 1, requirements.md §118-119). Confirmed by direct execution:

```
Jupiter/Sagittarius label = moolatrikona   → Hamsa NOT detected (keys = [])
Venus/Libra      label = moolatrikona   → Malavya NOT detected
Saturn/Aquarius  label = moolatrikona   → Sasa NOT detected
Mars/Aries       label = moolatrikona   → Ruchaka NOT detected
```

Only the planet's *secondary* own sign fires (Mars/Scorpio, Jupiter/Pisces, Venus/Taurus, Saturn/Capricorn), and Mercury is unaffected because Virgo resolves to `exalted` first. These moolatrikona placements (Jupiter in Sagittarius, Venus in Libra, Saturn in Aquarius, Mars in Aries) are among the most common Mahapurusha configurations, so the miss is significant. The rest of the engine already treats moolatrikona as a strong dignity — `STRONG_DIGNITY` includes it, and the Raja/Dhana strength grading relies on that — which makes the Mahapurusha exclusion an isolated oversight rather than a deliberate policy. Fix is to accept `moolatrikona` alongside `own` (mapping it to `moderate`, or `strong` if you want to honor its higher rung).

### Kartari fires on one-sided occupancy

Kartari collects planets in the 2nd or 12th from lagna and classifies if they are uniformly benefic or malefic:

```ts
const flanking = planets.filter((p) => p.house === house2 || p.house === house12)
if (flanking.length === 0) return []
...
const allBenefic = classified.every((c) => c.benefic)
const allMalefic = classified.every((c) => !c.benefic)
```

Nothing requires both houses to be occupied. A single malefic in the 2nd with an empty 12th satisfies `allMalefic` and emits Papa Kartari. Confirmed by execution: Saturn in H2, nothing in H12 →

```
kartari keys = [ 'kartari.papa' ]
```

The kartari/scissors definition (design.md Detector 10: "in its 2nd & 12th") requires hemming on both sides. The fix is to gate on `planetsIn2.length > 0 && planetsIn12.length > 0` before classifying, mirroring the Durudhara "both sides" check the lunar detector already does correctly.

### Slicer refactor: string-format compatibility is preserved

This is the risky part of the change and it holds up. `computeActivatedYogas` prefers the catalogue when it is an array and otherwise falls back to the untouched pair-scoped derivation:

```ts
if (Array.isArray(yogasCatalogue)) {
  return filterCatalogueYogas(yogasCatalogue as RawYoga[], mdLord, adLord)
}
return computeActivatedYogasPairScoped(mdLord, adLord, planets, relationships)
```

The scorer has exactly two consumers of these strings. `factorActivatedYogas` only reads `.length`, so it is format-agnostic. `factorLordDignity` string-matches the Neechabhanga marker:

```ts
const neechabhanga = activatedYogas.some(
  (y) => y.startsWith('Neechabhanga active') && y.includes(`${lord} debilitation cancelled`)
)
```

`formatCatalogueYoga` reproduces that string exactly:

```ts
if (yoga.category === 'neechabhanga' && yoga.planets.length > 0) {
  return `Neechabhanga active — ${yoga.planets[0]} debilitation cancelled`
}
```

The lift semantics also survive the filter. `filterCatalogueYogas` includes a Neechabhanga entry only when its planet is the running MD or AD lord, and `factorLordDignity` applies the lift only to the lord named in the string — so the debilitated planet gets lifted iff it is the MD/AD lord, which is exactly what the old pair-scoped path did (it never emitted a PD-lord Neechabhanga either). No behavioral drift for the dignity lift.

One genuine behavioral shift: `filterCatalogueYogas` is a union over `{mdLord, adLord}` against the *whole-chart* catalogue, so it returns every yoga either lord participates in anywhere — generally more entries than the old pair-scoped derivation, which only fired on yogas the two lords formed *together*. Since `factorActivatedYogas` scales with count (capped at 3), compute-path periods will tend to score higher on that factor. This is intended (Requirement 5.1) but will move backtest numbers; the `mojo_wealth_range.json` fixture still carries the old pair-scoped strings, so any test comparing against a freshly-sliced compute chart will diverge.

### Raja detector is association-only (yogakaraka gap)

```ts
if (kendraLord === trikonaLord) continue // same planet owning both — not an association
```

A single planet owning both a kendra and a trikona (a yogakaraka — e.g. Saturn for Taurus lagna owning 9 and 10) is skipped, so no Raja yoga is emitted for it and `raja.dka` also requires `houseLordsD1[9] !== houseLordsD1[10]`. This is consistent with the spec framing Detector 3 as a "linkage between two lords," but the yogakaraka is classically the strongest Raja yoga and its omission is easy to mistake for a bug downstream. Worth either an explicit evidence note or a follow-up detector.

### Purity, determinism, and paste-path handling

The never-throw contract is real: every detector short-circuits on missing input (`if (!planets?.length) return []`, `findPlanet` returns null, node lords carry no dignity), and `computeYogas` wraps each detector in try/catch so one bad detector cannot sink the catalogue. Output is sorted by `(category, key, planets.join(','))` with no timestamps embedded in the yoga objects, and the end-to-end fixture asserts `computeFullChart(...).yogas` is byte-identical across repeated runs. Persistence is clean: the migration adds a nullable `yogas` JSONB, `mapComputedToUnified` writes `chart.yogas` and `mapPastedToUnified` writes `Prisma.JsonNull`, and every read path (`analyze`, GET route, timeline, MCP `resolveChart`) threads it through. The `Array.isArray` guard means paste-path (null) and pre-migration compute charts (also null) both fall back to the pair-scoped derivation, while an *empty* compute-path catalogue (`[]`) is correctly treated as authoritative rather than triggering the fallback.

</details>

<details>
<summary>File map</summary>

- `engine/compute/yogas.ts` — new detector suite + `computeYogas` public API (the two rule bugs live here).
- `engine/compute/yogas.mojo.test.ts` — new end-to-end smoke fixture (passes; does not cover the moolatrikona or one-sided-Kartari cases).
- `engine/compute/types.ts` — new `Yoga`/`YogaEvidence`/`YogaCategory`/`YogaStrength` types; `ComputedChart.yogas` added (required).
- `engine/compute/index.ts` — compute Step 15 wiring + re-exports.
- `engine/durationAnalysis/slicer.ts` — catalogue filter (`filterCatalogueYogas`/`formatCatalogueYoga`) with pair-scoped fallback preserved.
- `engine/durationAnalysis/index.ts` — passes `chart.yogas` into `sliceDashaTree`.
- `lib/chart-mapper.ts` — persists `yogas` (compute) / `Prisma.JsonNull` (paste).
- `mcp/src/chart.ts`, `mcp/src/tools.ts` — `NormalizedChart.yogas` + new `get_yogas` tool.
- `app/api/unified-charts/[id]/analyze/route.ts`, `.../[id]/route.ts`, `app/api/timeline/route.ts` — thread `yogas` into wave1_delta / GET / timeline.
- `prisma/schema.prisma`, `prisma/migrations/20260724184158_add_yogas_column/migration.sql` — nullable `yogas` JSONB column.
- `prompts/agents/wave2_2a_yogas.md` — instructs 2A to interpret (not re-derive) the catalogue.
- `Agents.md`, `Claude.md`, `docs/ERD.md`, `docs/HLD.md`, `skills/*` — documentation sync.

Full diff: `git diff` on branch `ui-improvements` (working tree).

</details>
