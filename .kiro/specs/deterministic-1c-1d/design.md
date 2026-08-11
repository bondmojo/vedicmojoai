# Design: Deterministic Shadbala (1C) + Relationship Geometry (1D)

## Architecture

Two new engine modules, each pure TypeScript with no external dependencies beyond
the existing `PlanetPosition` / `DivisionalChart` types already in `engine/compute/types.ts`.

```
engine/compute/
├── shadbala.ts          ← NEW: Full 6-component Shadbala
├── relationships.ts     ← NEW: All relationship geometry
├── types.ts             ← MODIFIED: add ShadbalResult, RelationshipGeometry
├── index.ts             ← MODIFIED: call both in computeFullChart()
└── pindaStrength.ts     ← MODIFIED: refactor to reuse shadbala sub-functions
```

---

## Module 1: `engine/compute/shadbala.ts`

### Data Flow

```
Input:
  planets: PlanetPosition[]          ← from computePlanetPositions()
  divisionalCharts: DivisionalChart[] ← from computeDivisionalCharts()
  birthDate: Date                    ← from BirthInput
  birthTimeSeconds: number           ← seconds from midnight
  sunriseSecs: number                ← from computeSunrise()
  sunsetSecs: number                 ← approximated or computed

Output:
  ShadbalResult
```

### Type Definitions

```typescript
// Added to engine/compute/types.ts

export interface ShadbalComponent {
  sthana: number    // Positional (uccha+saptaVarga+ojhaYugma+kendradi+drekkana)
  dig: number       // Directional
  kaala: number     // Temporal (natonnata+paksha+tribhaga+abda+masa+vara+hora)
  cheshta: number   // Motional
  naisargika: number // Natural/permanent
  drik: number      // Aspectual
  total: number     // Sum of all 6
}

export interface ShadbalPlanet {
  planet: string
  components: ShadbalComponent

  // Sub-components for transparency
  ucchaBala: number
  saptaVargaBala: number
  ojhaYugmaBala: number
  kendradiBala: number
  drekkanaBalal: number

  natonnata: number
  pakshabala: number
  tribhagaBala: number
  abdaBala: number
  masaBala: number
  varaBala: number
  horaBala: number

  cheshtaBala: number
  naisargikaBala: number
  drikBala: number

  // Derived
  totalVirupas: number       // total shashtiamsas / 60
  requiredVirupas: number    // minimum required
  strengthRatio: number      // totalVirupas / requiredVirupas
  grade: 'Strong' | 'Average' | 'Weak'
  gradePct: number           // strengthRatio * 100

  // Ishta/Kashta
  ishtaPhala: number         // √(uccha × cheshta)
  kashtaPhala: number        // √((60-uccha) × (60-cheshta))
  beneficRatio: number       // ishta / (ishta + kashta)

  // Vimsopaka
  vimsopakaScore: number     // 0–20, normalized from 6 available vargas

  // Retro effect classification (from 1C prompt)
  retroEffect: 'brightening' | 'stationary' | 'internalised' | 'direct_normal' | 'near_combustion_exception'
}

export interface ShadbalResult {
  planets: ShadbalPlanet[]
  strengthRanking: { rank: number; planet: string; score: number }[]
  computedAt: string  // ISO timestamp
}
```

### Computation Graph

```
computeShadbala(planets, divisionalCharts, birthDate, birthTimeSeconds, sunriseSecs)
  │
  ├─ computeSthanaBala(p, divisionalCharts)
  │   ├─ computeUcchaBala(p.longitude)               → 0–60
  │   ├─ computeSaptaVargaBala(p, divisionalCharts)  → 0–max
  │   │   ├─ getVargaSign(division, planet)
  │   │   ├─ getPermanentFriendship(planet, signLord)
  │   │   ├─ getTatkalikaMaitri(planet, otherPlanet, allPlanets)
  │   │   └─ getCombinedDignity(permanent, tatkalika)
  │   ├─ computeOjhaYugmaBala(p.signNumber)          → 0 or 15
  │   ├─ computeKendradiBala(p.house)                → 15/30/60
  │   └─ computeDrekkanaBala(p, p.degreeInSign)      → 0/7.5/15
  │
  ├─ computeDigBala(p, lagnaLongitude)               → 0–60
  │   └─ arcDist(p.longitude, strengthPoint)
  │
  ├─ computeKaalaBala(p, birthDate, birthTimeSeconds, sunriseSecs, sunLon, moonLon)
  │   ├─ computeNatonnata(p, birthTimeSeconds, sunriseSecs)
  │   ├─ computePakshaBala(p, moonLon, sunLon)
  │   ├─ computeTribhagaBala(p, birthTimeSeconds, sunriseSecs)
  │   ├─ computeAbdaBala(p, birthDate)
  │   ├─ computeMasaBala(p, moonLon, sunLon)
  │   ├─ computeVaraBala(p, birthDate)
  │   └─ computeHoraBala(p, birthDate, birthTimeSeconds, sunriseSecs)
  │
  ├─ computeCheshta Bala(p, sunLon)                  → 0–60
  │   ├─ case: Sun → natonnata value
  │   ├─ case: Moon → paksha-based
  │   ├─ case: retrograde → elongation-based
  │   └─ case: direct → speed / meanMotion × 60
  │
  ├─ computeNaisargikaBala(p)                        → fixed lookup
  │
  └─ computeDrikBala(p, allPlanets, allAspects)      → sum of received aspects
      ├─ for each planet that aspects p:
      │   determine if natural benefic or malefic
      │   apply aspect strength (60/45/30)
      └─ drikBala = (beneficScore - maleficScore) / 4
```

### Key Constants

```typescript
// Exaltation longitudes (absolute sidereal degrees)
Sun:10, Moon:33, Mars:298, Mercury:165, Jupiter:95, Venus:357, Saturn:200

// Debilitation = exaltation + 180
Sun:190, Moon:213, Mars:118, Mercury:345, Jupiter:275, Venus:177, Saturn:20

// Dig bala strength houses
Sun:10, Moon:4, Mars:10, Mercury:1, Jupiter:1, Venus:4, Saturn:7

// Required Shadbala (in virupas = shashtiamsas/60)
Sun:390, Moon:360, Mars:300, Mercury:420, Jupiter:390, Venus:330, Saturn:300

// Naisargika Bala (shashtiamsas)
Saturn:1, Mars:2, Mercury:3, Jupiter:4.5, Venus:5.5, Moon:8.5, Sun:10

// Mean daily motions (degrees/day)
Sun:0.9856, Moon:13.1764, Mars:0.524, Mercury:1.3833, Jupiter:0.0831, Venus:1.2, Saturn:0.0339

// Combustion thresholds (degrees from Sun)
Moon:{direct:12,retro:12}, Mars:{direct:17,retro:17},
Mercury:{direct:14,retro:12}, Jupiter:{direct:11,retro:11},
Venus:{direct:10,retro:8}, Saturn:{direct:15,retro:15}
```

---

## Module 2: `engine/compute/relationships.ts`

### Data Flow

```
Input:
  planets: PlanetPosition[]
  lagnaSignNumber: number
  divisionalCharts: DivisionalChart[]

Output:
  RelationshipGeometry
```

### Type Definitions

```typescript
// Added to engine/compute/types.ts

export interface Conjunction {
  planets: string[]
  sign: string
  signNumber: number
  house: number
  orb: number           // minimum separation in degrees among all pairs
  isSandhi?: boolean    // true if within 1° of sign boundary
}

export interface AspectEdge {
  from: string
  fromHouse: number
  toHouse: number
  toSign: number
  toPlanets: string[]
  type: string          // "7th" | "mars_4th" | etc.
  strength: number      // 60 | 45 | 30 (shashtiamsas)
  school: 'parashari' | 'jaimini_optional'
}

export interface RashiAspectEdge {
  fromSign: string
  fromSignNumber: number
  fromHouse: number
  toSign: string
  toSignNumber: number
  toHouse: number
  toPlanets: string[]
  type: 'movable_to_fixed' | 'fixed_to_movable' | 'dual_to_dual'
}

export interface PlanetaryWar {
  planet_a: string
  planet_b: string
  separation_deg: number
  winner: string
  loser: string
  intense: boolean      // separation < 0.5°
}

export interface Parivartana {
  planet_a: string
  sign_a: string
  house_a: number
  planet_b: string
  sign_b: string
  house_b: number
  exchange_type: 'maha' | 'dainya' | 'kahala' | 'simple'
}

export interface Stellium {
  sign: string
  signNumber: number
  house: number
  planets: string[]
  count: number
  isStrong: boolean     // true if sign lord also in same sign
}

export interface CombustionResult {
  planet: string
  degreeFromSun: number
  combust: boolean
  cazimi: boolean
  nearCombust: boolean
  threshold: number
  retrogradeThresholdApplied: boolean
}

export interface AvasthaResult {
  planet: string
  avastha: 'Bala' | 'Kumara' | 'Yuva' | 'Vriddha' | 'Mrita'
  avasthaStrength: 'VeryWeak' | 'Weak' | 'Moderate' | 'Strong'
}

export interface GandantaResult {
  planet: string
  gandanta: boolean
  junctionPoint?: string     // e.g. "Cancer-Leo"
  degreesFromJunction?: number
}

export interface SandhiResult {
  planet: string
  sandhi: boolean
  type?: 'ingress' | 'egress'
  degreeInSign: number
}

export interface HouseLordships {
  [division: number]: {
    [house: number]: string   // planet name
  }
}

export interface RelationshipGeometry {
  conjunctions: Conjunction[]
  aspects: AspectEdge[]            // Graha Drishti
  rashiAspects: RashiAspectEdge[]  // Rashi Drishti (Jaimini)
  grahaYuddha: PlanetaryWar[]
  mutualReception: Parivartana[]
  stelliums: Stellium[]
  combustion: CombustionResult[]
  avastha: AvasthaResult[]
  gandanta: GandantaResult[]
  sandhi: SandhiResult[]
  houseLords: HouseLordships       // D1, D4, D7, D9, D10, D30
  computedAt: string
}
```

### Computation Graph

```
computeRelationshipGeometry(planets, lagnaSignNumber, divisionalCharts)
  │
  ├─ computeConjunctions(planets)                → 36 pair checks
  │   Group by signNumber, identify clusters
  │   Check sandhi (orb near sign boundary)
  │
  ├─ computeGrahaDrishti(planets, lagnaSignNumber)  → ≤81 edges
  │   ASPECT_TABLE lookup per planet
  │   targetHouse = ((planet.house - 1 + offset) % 12) + 1
  │   toPlanets = planets.filter(p => p.house === targetHouse)
  │
  ├─ computeRashiDrishti(planets, lagnaSignNumber)  → 48 edges
  │   RASHI_ASPECT_MATRIX lookup (precomputed 12×12 bool matrix)
  │   For each aspecting sign, find aspected signs
  │   Resolve planets in those signs
  │
  ├─ computeGrahaYuddha(planets)                 → ≤10 pair checks
  │   Only Mars/Mercury/Jupiter/Venus/Saturn
  │   |lon_A - lon_B| ≤ 1° → war
  │   winner = lower degreeInSign
  │
  ├─ computeMutualReception(planets)             → 36 pair checks
  │   LORD_OF_SIGN lookup
  │   (lord(A.sign) === B.planet) && (lord(B.sign) === A.planet)
  │   Classify by house types
  │
  ├─ computeStelliums(planets, lagnaSignNumber)  → 12 bin check
  │   Group by signNumber, filter count ≥ 3
  │
  ├─ computeCombustion(planets)                  → 8 planet checks
  │   Exclude Sun itself
  │   arcDist(planet.lon, sun.lon) vs thresholds
  │
  ├─ computeAvastha(planets)                     → 9 planets
  │   Determine oddness of sign
  │   Compute 6° band index
  │
  ├─ computeGandanta(planets)                    → 9 planets
  │   Check proximity to 3 junction points
  │
  ├─ computeSandhi(planets)                      → 9 planets
  │   degreeInSign < 1 || degreeInSign > 29
  │
  └─ computeHouseLordships(divisionalCharts)     → for D1,D4,D7,D9,D10,D30
      For each chart: lagna → house 1 sign → compute house 1–12 signs → lookup lord
```

### Rashi Aspect Precomputed Matrix

```typescript
// RASHI_ASPECTS[signNumber] = array of signNumbers it aspects
// Signs are 1-indexed (1=Aries…12=Pisces)
// Modality: Movable=1,4,7,10; Fixed=2,5,8,11; Dual=3,6,9,12

const SIGN_MODALITY: Record<number, 'movable' | 'fixed' | 'dual'> = {
  1:'movable', 2:'fixed', 3:'dual', 4:'movable', 5:'fixed', 6:'dual',
  7:'movable', 8:'fixed', 9:'dual', 10:'movable', 11:'fixed', 12:'dual'
}

// Adjacent sign exception: movable/fixed signs don't aspect their adjacent sign
// Adjacency: (fromSign % 12) + 1 === toSign (circular)

function buildRashiAspectMatrix(): Record<number, number[]> {
  const matrix: Record<number, number[]> = {}
  for (let from = 1; from <= 12; from++) {
    const mod = SIGN_MODALITY[from]
    const adjacent = (from % 12) + 1
    if (mod === 'dual') {
      // Aspect all other dual signs
      matrix[from] = [3, 6, 9, 12].filter(s => s !== from)
    } else if (mod === 'movable') {
      // Aspect all fixed signs except adjacent
      matrix[from] = [2, 5, 8, 11].filter(s => s !== adjacent)
    } else { // fixed
      // Aspect all movable signs except adjacent
      matrix[from] = [1, 4, 7, 10].filter(s => s !== adjacent)
    }
  }
  return matrix
}
```

---

## Integration: `engine/compute/index.ts`

```typescript
// After Step 11b (per-varga arudhas), add:

// Step 12b: Relationship Geometry (deterministic 1D replacement)
const relationshipGeometry = computeRelationshipGeometry(
  planets,
  ascendant.signNumber,
  divisionalCharts
)

// Step 12c: Full Shadbala (deterministic 1C replacement)
const [h2, m2, s2] = input.time.split(':').map(Number)
const bts = h2 * 3600 + m2 * 60 + (s2 || 0)
const sunPlanet = planets.find(p => p.planet === 'Sun')!
const moonPlanet = planets.find(p => p.planet === 'Moon')!
const shadbalResult = computeShadbala(
  planets,
  divisionalCharts,
  birthDateLocal,
  bts,
  /* sunriseSecs = */ (sunriseJulianDay - Math.floor(sunriseJulianDay)) * 86400,
  /* sunsetSecs  = */ ((sunriseJulianDay - Math.floor(sunriseJulianDay)) * 86400) + 43200
)
```

### Updated `ComputedChart`

```typescript
export interface ComputedChart {
  // ... existing fields ...
  relationships: RelationshipGeometry   // NEW
  shadbala: ShadbalResult               // NEW
}
```

---

## Integration: Orchestrator

The orchestrator currently runs agents 1A–1D as LLM calls. After this change:

```typescript
// Before: wave1Agents = ['1A', '1B', '1C', '1D']
// After:  wave1Agents = ['1A', '1B']   (1C and 1D removed)

// The wave1Delta now includes:
const wave1Delta = {
  '1A': llmOutput_1A,   // still LLM
  '1B': llmOutput_1B,   // still LLM
  computed_geometry: computedChart.relationships,  // deterministic 1D
  computed_shadbala: computedChart.shadbala,       // deterministic 1C
}
```

### Wave 2 Prompt Template Changes

Wave 2 prompts currently use `{{wave1_output}}` as a blob. They will be updated
to reference specific keys:
- `{{computed_geometry}}` → `wave1Delta.computed_geometry`
- `{{computed_shadbala}}` → `wave1Delta.computed_shadbala`
- `{{wave1_extraction}}` → `wave1Delta['1A']`
- `{{wave1_nakshatra}}` → `wave1Delta['1B']`

---

## Testing Strategy

Each sub-function will be tested against a known reference chart (the existing
Mojo chart in `data/sample/djma.json`) using Jagannatha Hora's published values
as the reference standard.

Key test cases:
1. Uccha Bala: Sun at 10° Aries = 60, Sun at 190° Libra = 0
2. Graha Yuddha: if Mars at 15.3° Aries and Mercury at 15.8° Aries → war, orb=0.5°
3. Rashi Drishti: Aries (movable) aspects Leo, Scorpio, Aquarius but NOT Taurus
4. Mutual Reception: verify exchange_type classification for all 4 types
5. Combust: Mercury direct within 14° of Sun = combust
6. Cazimi: planet within 0.283° of Sun = cazimi (not combust)
7. Gandanta: Moon at 29.5° Cancer = gandanta (0.5° from Cancer-Leo junction)
8. Total Shadbala: sun total > 390 virupas → grade "Strong"
## SCOPE-FINAL DESIGN ADDITIONS

New modules: engine/compute/nakshatraRelationships.ts, engine/compute/jaimini.ts, engine/compute/bhavaBala.ts. Extend engine/compute/divisional.ts with D2 (Hora), D3 (Drekkana), D12 (Dwadasamsa).

Type additions to engine/compute/types.ts:
- Extend NakshatraInfo with subLord: string.
- NakshatraRelationships { subLords[], depositorChains[], nakshatraParivartana[], clusters[], rahuKetuAxis{rahu,ketu}, nakshatraLordGroups } and NakshatraAxisEntry.
- JaiminiGeometry { argala[], virodhaArgala[], yogiPoint, avayogiPoint, specialLagnaAspects[], lordRelationshipMap[] }.
- BhavaBalaResult { houses: { house, bhavadhipatiBala, bhavaDigBala, bhavaDrishtiBala, total, rupas }[] }.
- Extend Conjunction with involvesUpagraha?, upagrahaAbbrs?, gulikaAffliction?.
- Extend AspectEdge with toUpagrahas: string[].
- Add upagrahaPlacements to RelationshipGeometry.
- Add computedNakshatra, computedJaimini, bhavaBala, and (corrected) shadbala + relationships to ComputedChart.

Shadbala constant corrections (replace design "Key Constants" values with the FIX tables): Saptavarga dignity 45/30/22.5/15/7.5/3.75/1.875 (no exalted row); Naisargika 60/51.43/42.86/34.29/25.71/17.14/8.57; Ojha-Yugma two-part max 30 with Moon/Venus=even; Drekkana binary male-1st/neuter-2nd/female-3rd; required strength in RUPAS 6.5/6/5/7/6.5/5.5/5.

Integration (index.ts): add D2/D3/D12 to computeDivisionalCharts; then Step 12b relationships (pass upagrahas), 12c shadbala (corrected, pass combustion), 12d nakshatraRelationships, 12e jaimini, 12f bhavaBala. Add all to returned ComputedChart.

Orchestrator: remove 1A/1B/1C/1D from ALWAYS_RUN_FIRST_QUERY; wave1Delta carries computed_shadbala, computed_bhavabala, computed_geometry, computed_nakshatra, computed_jaimini.
