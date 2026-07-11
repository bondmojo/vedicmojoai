# Compute Engine (`engine/compute/`)

Deterministic astronomical calculations (Swiss Ephemeris):

| Module | Purpose |
|---|---|
| `planets.ts` | Planet longitudes, signs, houses |
| `nakshatras.ts` | Nakshatra, pada, sublord |
| `divisional.ts` | Divisional charts incl. D2, D3, D12 (added for Shadbala/Vimsopaka) + D4/D7/D9/D10/D30 |
| `ashtakavarga.ts` | Bindhu scores per planet per house |
| `karakas.ts` | Jaimini karaka assignments |
| `arudhaPadas.ts` | Arudha pada calculations |
| `specialLagnas.ts` | Hora, Ghati, Sree Lagna etc. |
| `pindaStrength.ts` | Rashi/Graha/Drishti Pinda |
| `transits.ts` | Current transit positions |
| `upagrahas.ts` | Sub-planets (Gulika, Mandi etc.) |
| `shadbala.ts` | **Full 6-component Shadbala — deterministic replacement for LLM agent 1C** |
| `relationships.ts` | **Conjunctions, graha/rashi drishti, yuddha, parivartana, combustion, avastha… — deterministic replacement for LLM agent 1D** |
| `nakshatraRelationships.ts` | Sub-lords, depositor chains, nakshatra parivartana, clusters, Rahu/Ketu axis |
| `jaimini.ts` | Argala/Virodha Argala, Yogi/Avayogi points, special-lagna aspects, lord relationship map |
| `bhavaBala.ts` | Bhavadhipati / Bhava Dig / Bhava Drishti bala |

**Rules:**
- Pure functions — no DB, no side effects
- All use `swisseph-v2` for ephemeris calculations
- Types defined in `engine/compute/types.ts`
- `computeFullChart()` (index.ts) orchestrates every module and returns `ComputedChart`
- Called by the compute API and the unified-chart ingestion routes — never by LLM agents

## Deterministic Wave 1 (compute path)

Charts with `source="compute"` **skip LLM Wave 1**. The foundation data that agents
1C (Shadbala) and 1D (Relationship Geometry) would produce is computed
deterministically by the modules above and stored in `UnifiedChart` domain columns.

In `/api/unified-charts/[id]/analyze`:
- `resolvePlan()` runs, then all Wave 1 (`'1'`-prefixed) agents are stripped and
  wave 1 is marked skipped.
- `wave1_delta` is assembled from the chart's domain columns (`planets`,
  `nakshatras`, `shadbala`, `bhavaBala`, `relationships`, `jaimini`, `ashtakavarga`)
  shaped as `1A`/`1B`/`1C`/`1D` deltas.
- `executePipeline()` is called with `wave1Source: "compute"`.

The legacy `Chart` / `source="paste"` path still runs LLM Wave 1 (agents 1A–1D
remain in `AGENT_CATALOGUE` and `ALWAYS_RUN_FIRST_QUERY`).
