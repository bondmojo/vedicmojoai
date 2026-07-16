# Entity-Relationship Diagram (ERD) — VedicMojoAI

**Version:** 1.2
**Last updated:** 2026-07-07
**Status:** Draft

> **Maintenance rule:** Whenever the data model changes (new table, column, index,
> relation, or ingestion path), update this ERD **and** the AI Skills, HLD, and DFD
> in the same change. See `Agents.md → Documentation Maintenance`.

## What changed in v1.1

- Added the **`UnifiedChart`** table.
- `PipelineRun` links to both `Chart` and `UnifiedChart`.
- New deterministic domain columns on `UnifiedChart`.

## What changed in v1.2

- Added **`DurationAnalysis`** and **`DurationMessage`** tables — the new Duration Analysis feature's own 3-agent pipeline, separate from the 18-agent wave pipeline.
- `DurationAnalysis` links to `UnifiedChart` (foreign key) and has its own agent output columns (JSONB), error tracking (`errorMessage`), and override flag.
- `UnifiedChart` gains a `durationAnalyses` reverse relation.
- Vimshottari dasha tree now stores **all 729 PD entries** (9 MD × 9 AD × 9 PD) instead of only current + next MD. `AntarDasha.pratyantardashas` is now a required field (non-optional array).

## Complete ERD

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         PostgreSQL Database                              │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────────────────┐       1:N       ┌──────────────────────────┐
│       Chart          │────────────────▶│     PipelineRun          │
│ (Analysis Input)     │                 │ (AI Analysis Execution)  │
├──────────────────────┤                 ├──────────────────────────┤
│ PK id          UUID  │                 │ PK id            UUID    │
│    clientName  TEXT   │                 │ FK chartId       UUID    │
│    lagna       TEXT   │                 │    runType       TEXT    │
│    yogakaraka  TEXT?  │                 │    queryTypes    TEXT[]  │
│    chartJson   JSONB  │◀─ Full         │    userQuery     TEXT?   │
│    chartHash   TEXT   │   ChartInputV1 │    isFollowup    BOOL   │
│    moonLongitude DEC  │   (raw input)  │ FK parentRunId   UUID?  │
│    birthDatetime TSTZ │                 │    plannerOutput JSONB?  │
│    createdAt   TSTZ   │                 │    status        TEXT    │
└──────────────────────┘                 │    reportPath    TEXT?   │
                                          │    totalTokenIn   INT    │
                                          │    totalTokenOut  INT    │
                                          │    totalCostUsd   DEC    │
                                          │    haltReason    JSONB?  │
                                          │    overrideApplied BOOL  │
                                          │    createdAt     TSTZ    │
                                          │    completedAt   TSTZ?   │
                                          └──────────────────────────┘
                                                    │ 1:N         │ 1:N
                                                    ▼             ▼
                                          ┌──────────────┐  ┌──────────────┐
                                          │  WaveOutput  │  │  RunMessage  │
                                          ├──────────────┤  ├──────────────┤
                                          │ PK id   UUID │  │ PK id   UUID │
                                          │ FK runId UUID│  │ FK runId UUID│
                                          │ agentId TEXT │  │ role     TEXT│
                                          │ waveNumber INT│  │ content  TEXT│
                                          │ domain   TEXT│  │ agentId TEXT?│
                                          │ outputJson J?│  │ createdAt TSZ│
                                          │ factSummary? │  └──────────────┘
                                          │ promptVersion│
                                          │ modelId  TEXT│
                                          │ provider TEXT│
                                          │ tokenIn  INT │
                                          │ tokenOut INT │
                                          │ costUsd  DEC │
                                          │ status   TEXT│
                                          │ errorMsg TEXT?│
                                          │ startedAt TSZ│
                                          │ completedAt? │
                                          └──────────────┘

┌──────────────────────┐                  ┌──────────────────────────┐
│    Wave1Cache        │                  │      SavedChart          │
│ (Compute Cache)      │                  │ (Saved Computed Charts)  │
├──────────────────────┤                  ├──────────────────────────┤
│ PK id       UUID     │                  │ PK id            UUID    │
│    chartHash TEXT (U) │                  │    name          TEXT    │
│    chartSummary TEXT  │                  │    birthDate     TEXT    │
│    wave1Delta JSONB   │                  │    birthTime     TEXT    │
│    dashaTree  JSONB   │                  │    timezone      DEC     │
│    createdAt  TSTZ    │                  │    latitude      DEC     │
│    updatedAt  TSTZ    │                  │    longitude     DEC     │
└──────────────────────┘                  │    sunriseMode   TEXT    │
                                          │    lagna         TEXT    │
┌──────────────────────┐                  │    lagnaLongitude DEC    │
│    ModelConfig       │                  │    moonLongitude DEC     │
├──────────────────────┤                  │    ayanamsa      DEC     │
│ PK id       UUID     │                  │    chartData     JSONB ◀─┐
│    waveId   TEXT (U)  │                  │    dashaTree     JSONB?  │
│    modelId  TEXT      │                  │    inputHash     TEXT(U) │
│    provider TEXT      │                  │    createdAt     TSTZ    │
│    temperature DEC    │                  │    updatedAt     TSTZ    │
│    maxTokens  INT     │                  └──────────────────────────┘
│    promptVersion TEXT │                            ▲
│    updatedAt  TSTZ    │                            │
└──────────────────────┘                     Full ComputedChart
                                             JSON blob (see below)
```

---

## UnifiedChart (Generate Chart + AI Analysis backbone)

`UnifiedChart` is the current canonical chart store. A single table holds all
chart data regardless of how it was ingested, using **one JSONB column per
domain**. This lets the AI pipeline read exactly the domain it needs and lets the
compute path skip LLM Wave 1 entirely.

```
┌───────────────────────────────────────────────┐    1:N (nullable)   ┌──────────────────────┐
│              UnifiedChart                      │────────────────────▶│     PipelineRun      │
│  (column-per-domain chart store)              │  unifiedChartId FK  │  "UnifiedChartRuns"  │
├───────────────────────────────────────────────┤                     └──────────────────────┘
│ PK id                UUID                      │
│    name              TEXT   (idx)              │
│    source            TEXT   "compute"|"paste" (idx) │
│    birthInput        JSONB? (BirthInput | ChartMeta)│
│ ── scalar index fields ──                      │
│    lagna             TEXT   (idx)              │
│    lagnaLongitude    DEC                       │
│    moonLongitude     DEC                       │
│    ayanamsa          DEC                       │
│    birthDatetime     TSTZ                      │
│ ── domain JSONB columns (compute engine) ──    │
│    planets           JSONB?  PlanetPosition[]  │
│    nakshatras        JSONB?  NakshatraInfo[]   │
│    divisionalCharts  JSONB?  DivisionalChart[] │
│    karakas           JSONB?  CharaKaraka[]     │
│    ashtakavarga      JSONB?  AshtakavargaResult│
│    upagrahas         JSONB?  Upagraha[]        │
│    specialLagnas     JSONB?  SpecialLagna[]    │
│    arudhaPadas       JSONB?  ArudhaPada[]      │
│    relationships     JSONB?  RelationshipGeometry (1D) │
│    shadbala          JSONB?  ShadbalResult (1C)│
│    jaimini           JSONB?  JaiminiGeometry   │
│    bhavaBala         JSONB?  BhavaBalaResult   │
│    transits          JSONB?  TransitAnalysis   │
│    pindaStrength     JSONB?  PindaStrengthEntry[] │
│    dashaTree         JSONB?  Serialized DashaTree │
│ ── AI pipeline input ──                        │
│    chartInputV1      JSONB?  ChartInputV1      │
│ ── dedup & provenance ──                       │
│    chartHash         TEXT (U) SHA-256          │
│    sunriseMode       TEXT   default "precise"  │
│    createdAt         TSTZ                      │
│    updatedAt         TSTZ                      │
└───────────────────────────────────────────────┘
```

### Two ingestion paths (the `source` column)

| Source | Origin | Domain columns | `chartInputV1` | Wave 1 on AI Analysis |
|---|---|---|---|---|
| `compute` | Birth data → deterministic Swiss Ephemeris engine (Path A) | Fully populated | `null` (synthesized on demand) | **Skipped** — `wave1_delta` built from domain columns |
| `paste` | Practitioner-supplied `ChartInputV1` JSON (Path B) | `null` | Full pasted input | **Full Wave 1–4** LLM pipeline |

- Deduplication: `chartHash` is SHA-256 of the canonical input (birth params for
  compute, full JSON for paste). Duplicate submissions return the existing record.
- Format mapping lives in `lib/chart-mapper.ts`
  (`mapComputedToUnified`, `mapPastedToUnified`, `buildChartInputV1FromUnified`).
- `relationships`, `shadbala`, `jaimini`, `bhavaBala` are produced by the
  deterministic engine modules and stand in for the LLM Wave 1 agents (1C/1D)
  on the compute path.

---

## Where is D1, D4 Planet Chart Data Stored?

Divisional chart data (D1, D2, D3, D4, D5, D6, D7, D9, D10, D12, D24, D30) is stored **inside the `chartData` JSONB column** of the `saved_chart` table (and similarly inside `chartJson` of the `chart` table for analysis-input charts).

### Path within `chartData` JSON:

```
chartData.divisionalCharts[] → Array of DivisionalChart objects
```

Each `DivisionalChart` object has:

```json
{
  "division": 1,              // D1=1, D4=4, D7=7, D9=9, D10=10, D30=30
  "name": "Rashi",            // Human-readable name
  "shortName": "D1",
  "lagna": "Taurus",          // Varga lagna sign
  "lagnaSignNumber": 2,
  "lagnaDegreee": 15.23,
  "planets": [                // ◀── D1/D4 planet placements
    {
      "planet": "Sun",
      "sign": "Taurus",
      "signNumber": 2,
      "house": 1,
      "retrograde": false
    },
    ...
  ],
  "arudhaPadas": [...],       // A1–A12 for this varga
  "specialLagnas": [...],     // HL, GL, BL etc. projected into this varga
  "upagrahas": [...]          // Dhuma, Gulika etc. projected into this varga
}
```

### Access pattern:
- **D1 planets**: `chartData.divisionalCharts.find(c => c.division === 1).planets`
- **D4 planets**: `chartData.divisionalCharts.find(c => c.division === 4).planets`
- **D9 planets**: `chartData.divisionalCharts.find(c => c.division === 9).planets`

---

## Where is Upagraha Data Stored?

Upagrahas are stored at **two levels**:

### 1. Top-level (D1 positions with full longitude):
```
chartData.upagrahas[] → Array of Upagraha objects
```

```json
{
  "name": "Gulika",
  "abbr": "Gu",
  "longitude": 245.67,       // Absolute sidereal longitude
  "sign": "Sagittarius",
  "signNumber": 9,
  "degreeInSign": 5.67,
  "house": 8                 // House from lagna
}
```

Includes: Dhuma, Vyatipata, Parivesh, Indrachapa, Upaketu, Gulika, Mandi

### 2. Per-varga projected positions:
```
chartData.divisionalCharts[n].upagrahas[] → Array of ChartPointMark
```

```json
{
  "abbr": "Gu",
  "signNumber": 3,          // Sign in that specific varga
  "house": 2                // House from that varga's lagna
}
```

---

## Where is Lagna (Ascendant) Data Stored?

### Top-level lagna (natal D1):
```
chartData.lagna            → "Taurus" (sign name)
chartData.lagnaSignNumber  → 2
chartData.lagnaLongitude   → 45.23 (absolute sidereal degrees)
chartData.lagnaDegreeInSign → 15.23 (degrees within sign)
```

### Per-varga lagnas:
```
chartData.divisionalCharts[n].lagna           → sign name in that varga
chartData.divisionalCharts[n].lagnaSignNumber  → sign number in that varga
chartData.divisionalCharts[n].lagnaDegreee     → degree within lagna sign
```

### Special Lagnas (HL, GL, BL, SL, VL, IL, KL, BBL, KS, PL):
```
chartData.specialLagnas[] → Array of SpecialLagna objects
```

```json
{
  "name": "Hora Lagna",
  "abbr": "HL",
  "longitude": 67.89,
  "sign": "Gemini",
  "signNumber": 3,
  "degreeInSign": 7.89,
  "house": 2
}
```

Also projected per-varga: `chartData.divisionalCharts[n].specialLagnas[]`

---

## Complete Data Hierarchy (chartData JSONB structure)

```
ComputedChart (root)
├── input: BirthInput
│   ├── date, time, timezone
│   ├── latitude, longitude
│   └── sunriseMode
├── lagna, lagnaSignNumber, lagnaLongitude, lagnaDegreeInSign
├── ayanamsa, julianDay, sunriseMode, sunriseFallback
├── planets[]: PlanetPosition[]              ← 9 grahas (Sun–Ketu)
│   ├── planet, longitude, latitude, speed
│   ├── retrograde, sign, signNumber
│   ├── degreeInSign, house
├── nakshatras[]: NakshatraInfo[]
│   ├── planet, nakshatra, nakshatraIndex
│   ├── pada, nakshatraLord, degreeInNakshatra
├── divisionalCharts[]: DivisionalChart[]    ← D1, D2, D3, D4, D5, D6, D7, D9, D10, D12, D24, D30
│   ├── division, name, shortName
│   ├── lagna, lagnaSignNumber, lagnaDegreee
│   ├── planets[]: DivisionalPlacement[]     ← planet positions in this varga
│   ├── arudhaPadas[]: ChartArudhaMark[]     ← A1–A12 in this varga
│   ├── specialLagnas[]: ChartPointMark[]    ← projected special lagnas
│   └── upagrahas[]: ChartPointMark[]        ← projected upagrahas
├── charaKarakas[]: CharaKaraka[]            ← AK, AmK, BK, etc.
├── ashtakavarga: AshtakavargaResult
│   ├── bav: Record<planet, number[12]>
│   ├── sav: number[12]
│   └── savTotal: number
├── upagrahas[]: Upagraha[]                  ← D1 positions with full longitude
├── specialLagnas[]: SpecialLagna[]          ← D1 positions with full longitude
├── arudhaPadas[]: ArudhaPada[]              ← A1–A12 from natal lagna
├── pindaStrength[]: PindaStrengthEntry[]
└── transits: TransitAnalysis
    ├── transits[]: TransitPlanet[]
    ├── sadeSati: SadeSatiInfo
    ├── moonTransits[]: MoonTransitPeriod[]
    └── ascendantTransits[]: AscendantTransitPeriod[]
```

---

## Duration Analysis Tables (v1.2)

Two new tables back the **Duration Analysis** feature — a focused 3-agent pipeline
separate from the 18-agent wave pipeline.

```
┌───────────────────────────────────────────────────────────┐       ┌──────────────────────┐
│              DurationAnalysis                              │  1:N  │   DurationMessage    │
│  (3-agent sequential pipeline run)                        │──────►│  (conversation log)  │
├───────────────────────────────────────────────────────────┤       ├──────────────────────┤
│ PK id              UUID                                    │       │ PK id       UUID     │
│ FK unifiedChartId  UUID  → unified_chart                  │       │ FK analysisId  UUID  │
│    dateFrom        TSTZ                                    │       │    role     TEXT      │
│    dateTo          TSTZ                                    │       │    content  TEXT      │
│    category        TEXT  health|career|wealth|marriage|    │       │    agentId  TEXT?     │
│                          property|cashflow                │       │    focusPeriod TEXT?  │
│    userQuestion    TEXT?                                   │       │    tokenIn  INT       │
│    symptoms        TEXT?                                   │       │    tokenOut INT       │
│    status          TEXT  queued|running|symptom_unmatched  │       │    createdAt TSTZ     │
│                          |done|failed|cancelled           │       └──────────────────────┘
│    periodSlice     JSONB? DashaSlice[] — Step 0a output   │
│    transitOverlay  JSONB? TransitOverlay[] — Step 0b output│
│    contextSummary  TEXT?  ~500-token follow-up summary    │
│    errorMessage    TEXT?  failure reason (when failed)    │
│    overrideApplied BOOL   true if symptom gate bypassed   │
│    da1Output       JSONB? DA1Output (Domain Analyser)     │
│    da2Output       JSONB? DA2Output (Symptom Validator)   │
│    da3Output       JSONB? DA3Output (Future Analyser)     │
│    totalTokenIn    INT                                     │
│    totalTokenOut   INT                                     │
│    totalCostUsd    DEC(10,6)                               │
│    createdAt       TSTZ                                    │
│    updatedAt       TSTZ                                    │
│                                                            │
│ IDX: unifiedChartId, status                               │
│ MAP: duration_analysis                                     │
└───────────────────────────────────────────────────────────┘
```

**Key design decisions:**
- `periodSlice` stores the output of the deterministic `sliceDashaTree()` with full
  lord annotations and yoga activations baked in — computed before any LLM call.
- `transitOverlay` stores Saturn/Jupiter/Rahu/Ketu positions at each AD boundary in
  the requested window, plus BAV scores, Sade Sati phase, and ashtamaShani flags.
- `da1Output` is enriched post-LLM with `transitContext` and `lordAnnotations` merged
  back onto each `period_analysis` entry (pipeline-side join, not LLM responsibility).
- `errorMessage` enables the SSE route to surface the real failure reason without
  the client having to infer it from status alone.
- `ModelConfig` entries `DA-1`, `DA-2`, `DA-3` control model/temperature per agent.

---

## Table Relationships Summary

| Relationship | Type | Description |
|---|---|---|
| Chart → PipelineRun | 1:N | Each chart can have multiple analysis runs |
| PipelineRun → WaveOutput | 1:N | Each run produces outputs from multiple AI agents |
| PipelineRun → RunMessage | 1:N | Each run has a conversation log |
| PipelineRun → PipelineRun | 1:N (self) | Follow-up runs chain to parent |
| UnifiedChart → PipelineRun | 1:N (nullable) | Each unified chart can back multiple AI analysis runs (`unifiedChartId`) |
| UnifiedChart → DurationAnalysis | 1:N | Each unified chart can have multiple Duration Analysis runs |
| DurationAnalysis → DurationMessage | 1:N | Each analysis has a conversation log |
| SavedChart (standalone) | — | Legacy independent computed chart storage — READ-ONLY since the compute page moved to UnifiedChart; existing rows promoted via `npm run db:migrate-saved` |
| Wave1Cache (standalone) | — | Caches expensive Wave 1 computations by chartHash |
| ModelConfig (standalone) | — | AI model configuration per wave/agent — including DA-1, DA-2, DA-3 |

> **Note:** `PipelineRun` keeps its original required `chartId` FK to the legacy
> `Chart` table for backward compatibility. When AI Analysis is triggered from a
> `UnifiedChart`, the analyze route ensures a matching legacy `Chart` row exists
> (by `chartHash`) and sets `unifiedChartId` on the run as well.
