# Entity-Relationship Diagram (ERD) — VedicMojoAI

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

## Where is D1, D4 Planet Chart Data Stored?

Divisional chart data (D1, D4, D7, D9, D10, D30) is stored **inside the `chartData` JSONB column** of the `saved_chart` table (and similarly inside `chartJson` of the `chart` table for analysis-input charts).

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
├── divisionalCharts[]: DivisionalChart[]    ← D1, D4, D7, D9, D10, D30
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

## Table Relationships Summary

| Relationship | Type | Description |
|---|---|---|
| Chart → PipelineRun | 1:N | Each chart can have multiple analysis runs |
| PipelineRun → WaveOutput | 1:N | Each run produces outputs from multiple AI agents |
| PipelineRun → RunMessage | 1:N | Each run has a conversation log |
| PipelineRun → PipelineRun | 1:N (self) | Follow-up runs chain to parent |
| SavedChart (standalone) | — | Independent computed chart storage |
| Wave1Cache (standalone) | — | Caches expensive Wave 1 computations by chartHash |
| ModelConfig (standalone) | — | AI model configuration per wave/agent |
