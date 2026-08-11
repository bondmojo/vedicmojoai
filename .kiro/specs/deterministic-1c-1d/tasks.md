# Tasks: Deterministic Shadbala (1C) + Relationship Geometry (1D)

## Task 1 — Type Definitions

**File:** `engine/compute/types.ts`

Add the following new interfaces to the types file:

- `ShadbalComponent` (6 components + total)
- `ShadbalPlanet` (per-planet full shadbala with all sub-components)
- `ShadbalResult` (array of ShadbalPlanet + ranking)
- `Conjunction` (conjunct planet group)
- `AspectEdge` (single graha drishti edge)
- `RashiAspectEdge` (single rashi drishti edge)
- `PlanetaryWar` (graha yuddha result)
- `Parivartana` (mutual reception result)
- `Stellium` (3+ planets in one sign)
- `CombustionResult` (per-planet combustion check)
- `AvasthaResult` (per-planet life-stage)
- `GandantaResult` (per-planet gandanta check)
- `SandhiResult` (per-planet sandhi check)
- `HouseLordships` (indexed by division and house)
- `RelationshipGeometry` (root type combining all geometry outputs)

Extend `ComputedChart` to include:
```typescript
relationships: RelationshipGeometry
shadbala: ShadbalResult
```

---

## Task 2 — Shadbala Module: Constants & Helpers

**File:** `engine/compute/shadbala.ts` (new file)

Implement all constant tables and shared helpers:

- `EXALTATION_LONGITUDES`: absolute sidereal degrees for 9 planets
- `DEBILITATION_LONGITUDES`: exaltation + 180 (mod 360)
- `EXALTATION_SIGNS` / `DEBILITATION_SIGNS` / `MOOLATRIKONA` / `OWN_SIGNS`: sign number lookups
- `PERMANENT_FRIENDS` / `PERMANENT_ENEMIES` / `PERMANENT_NEUTRALS`: natural friendship matrix (7×7)
- `DIG_BALA_HOUSE`: house of max directional strength per planet
- `REQUIRED_VIRUPAS`: minimum Shadbala required per planet
- `NAISARGIKA_SCORES`: fixed natural strength scores
- `MEAN_DAILY_MOTION`: degrees/day per planet
- `COMBUSTION_THRESHOLDS`: per planet, direct and retrograde
- `WEEKDAY_LORDS`: Sun=0(Sunday) through Saturn=6
- `LUNAR_MONTH_LORDS`: 12 months in order
- Helper: `arcDist(a, b)` — shortest arc between two longitudes (always ≤ 180)
- Helper: `normLon(lon)` — normalize to 0–360
- Helper: `getTatkalikaMaitri(planet, other, allPlanets)` — check if `other` is in signs 2,3,4,10,11,12 from `planet`
- Helper: `getCombinedFriendship(perm, tatkalika)` — returns combined dignity level (5 levels)

---

## Task 3 — Sthana Bala (Positional Strength)

**File:** `engine/compute/shadbala.ts`

Implement `computeSthanaBala(planet, divisionalCharts)`:

1. **`computeUcchaBala(planet, longitude)`**
   - `arcDist(longitude, EXALTATION_LONGITUDES[planet])` → `(180 - dist) / 3`
   - Range: 0–60 shashtiamsas

2. **`computeSaptaVargaBala(planet, allPlanets, divisionalCharts)`**
   - Get planet's sign in each of D1, D2, D3, D7, D9, D12, D30
   - D2/D3/D12 not in standard chart set — derive or fallback to D1 for now (document this)
   - For each varga: compute `signLord`, then `getTatkalikaMaitri`, then `getCombinedFriendship`
   - Map combined friendship to shashtiamsas per dignity level table
   - Sum all vargas

3. **`computeOjhaYugmaBala(planet, signNumber)`**
   - Malefic in odd sign OR benefic in even sign → 15; else 0

4. **`computeKendradiBala(house)`**
   - Kendra(1,4,7,10)→60; Panapara(2,5,8,11)→30; Apoklima(3,6,9,12)→15

5. **`computeDrekkanaBala(planet, signNumber, degreeInSign)`**
   - Decan = floor(degreeInSign / 10) + 1 (1/2/3)
   - Male planets (Sun,Mars,Jupiter,Saturn): decan 1 → 15, decan 2 → 0, decan 3 → 0 (for odd signs; reverse for even)
   - Female planets (Moon,Venus): decan 1 → 0, decan 2 → 15, decan 3 → 0
   - Mercury (neuter): 7.5 in all decans
   - Note: full classical rule is sign-modality dependent; implement exactly per REQ-1.1e

6. Return `sthanaBala = uccha + saptaVarga + ojhaYugma + kendradi + drekkana`

---

## Task 4 — Dig Bala (Directional Strength)

**File:** `engine/compute/shadbala.ts`

Implement `computeDigBala(planet, planetLongitude, lagnaLongitude)`:

- Strength point = longitude of the dig bala house cusp
  - H1 cusp = `lagnaLongitude`
  - H4 cusp = `(lagnaLongitude + 90) % 360`
  - H7 cusp = `(lagnaLongitude + 180) % 360`
  - H10 cusp = `(lagnaLongitude + 270) % 360`
- `digBala = (180 - arcDist(planetLongitude, strengthPoint)) / 3`
- Rahu/Ketu: return 0
- Range: 0–60

---

## Task 5 — Kaala Bala (Temporal Strength)

**File:** `engine/compute/shadbala.ts`

Implement `computeKaalaBala(planet, planets, birthDate, birthTimeSeconds, sunriseSecs)`:

1. **`computeNatonnata(planet, birthTimeSeconds, sunriseSecs)`**
   - Determine if birth is daytime (between sunrise and sunrise+43200)
   - Diurnal planets (Sun,Jupiter,Venus): 60 if day, 0 if night
   - Nocturnal (Moon,Mars,Saturn): 60 if night, 0 if day
   - Mercury: always 60

2. **`computePakshaBala(planet, moonLon, sunLon)`**
   - Tithi = floor(((moonLon - sunLon + 360) % 360) / 12) + 1
   - Moon bala (ascending from tithi 1): tithi ≤ 15 → `tithi × 4`; tithi > 15 → `(30 - tithi + 1) × 4`
   - Benefics (Moon,Mercury,Jupiter,Venus): use moon bala
   - Malefics (Sun,Mars,Saturn,Rahu,Ketu): use `60 - moon_bala`

3. **`computeTribhagaBala(planet, birthTimeSeconds, sunriseSecs)`**
   - Day = sunrise to sunset (approximate sunset = sunrise + 43200)
   - Day 3rds: [sunrise, sunrise+14400] → Mercury; [+14400,+28800] → Sun; [+28800,sunset] → Saturn
   - Night 3rds: [sunset, sunset+14400] → Moon; [+14400,+28800] → Venus; [+28800,nextSunrise] → Mars
   - Jupiter always gets tribhaga bala
   - Score: 60 for the period lord (+ Jupiter always 60), 0 for others

4. **`computeAbdaBala(planet, birthDate)`**
   - Year lord = lord of the day of the week of Sun's entry into Aries of that Vedic year
   - Approximate: use Julian Day of Aries ingress for the year, compute weekday
   - Helper: `getSunAriesIngress(year)` → approximate Date (around March 21)
   - Score: 15 for year lord, 0 for others

5. **`computeMasaBala(planet, moonLon, sunLon)`**
   - Lunar month = floor(((sunLon - 0 + 360) % 360) / 30) maps to one of 12 months
   - Alternatively: use Sun's sign to determine the masa (Chaitra=Aries month, etc.)
   - Lord of current masa → 30 if match, else 0

6. **`computeVaraBala(planet, birthDate)`**
   - Weekday lord: `birthDate.getDay()` → WEEKDAY_LORDS[weekday]
   - Score: 45 for weekday lord, 0 for others

7. **`computeHoraBala(planet, birthDate, birthTimeSeconds, sunriseSecs)`**
   - Hora sequence starting from weekday lord: Sun,Venus,Mercury,Moon,Saturn,Jupiter,Mars (repeat)
   - Weekday lord starts first hora at sunrise
   - Hora = floor((birthTimeSeconds - sunriseSecs) / 3600) % 24
   - Index into sequence from weekday lord position
   - Score: 60 for hora lord, 0 for others

8. Return `kaalaBala = sum of all 7 sub-components`

---

## Task 6 — Cheshta Bala (Motional Strength)

**File:** `engine/compute/shadbala.ts`

Implement `computeCheshta Bala(planet, planetPos, sunPos, allPlanets)`:

- Sun: uses natonnata value (handled in Kaala Bala — return 30 here as fixed)
- Moon: use `pakshabala / 2` (Moon's cheshta tracks lunar phase)
- Rahu/Ketu: return 30 (neutral fixed)
- Other planets:
  - If retrograde:
    - Compute elongation from Sun: `arcDist(planet.longitude, sun.longitude)`
    - `cheshtaBala = (elongation / 180) × 60`
  - If direct:
    - `cheshtaBala = min(60, (|planet.speed| / MEAN_DAILY_MOTION[planet]) × 60)`
  - Near combustion: if planet is combust (within threshold), multiply by 0.5
  - Cap at 60

---

## Task 7 — Naisargika & Drik Bala

**File:** `engine/compute/shadbala.ts`

**`computeNaisargikaBala(planet)`:**
- Fixed lookup table (shashtiamsas):
  - Saturn:1, Mars:2, Mercury:3, Jupiter:4.5, Venus:5.5, Moon:8.5, Sun:10
  - Rahu/Ketu: 0

**`computeDrikBala(planet, allPlanets, lagnaSignNumber)`:**
- Build aspect edges (Graha Drishti only) for all 9 planets (reuse REQ-2.2 logic)
- For each edge that targets the planet being evaluated:
  - Get the aspecting planet's nature: natural benefic or malefic
  - Waxing Moon (paksha bala > 30) = benefic; waning Moon = malefic
  - Mercury not combust = benefic; Mercury combust = malefic
  - Apply strength: full(60) / three-quarter(45) / half(30) based on aspect type
  - Add to beneficScore or maleficScore
- `drikBala = (beneficScore - maleficScore) / 4`

---

## Task 8 — Ishta/Kashta Phala & Vimsopaka Bala

**File:** `engine/compute/shadbala.ts`

**Ishta/Kashta:**
```typescript
const ishtaPhala = Math.sqrt(ucchaBala × cheshtaBala)    // 0–60
const kashtaPhala = Math.sqrt((60 - ucchaBala) × (60 - cheshtaBala))
const beneficRatio = ishtaPhala / (ishtaPhala + kashtaPhala)
```

**Vimsopaka Bala** (0–20):
- Weight the available 6 vargas: D1:3, D9:1.5, D4:0.5, D7:0.5, D10:0.5, D30:0.5 (max=6.5)
- Dignity in each → use COMBINED friendship (with tatkalika) scaled to 3/2.5/2/1.5/1/0.5/0
- Multiply dignity score × varga weight, sum all, normalize to 0–20

**Retro Effect:**
```typescript
// Classify based on speed and cheshta
if (!planet.retrograde) return 'direct_normal'
if (cheshtaBala < 5) return 'near_combustion_exception'  // combust, not retro
if (|speed| < 0.01) return 'stationary'
if (cheshtaBala > 45) return 'brightening'
return 'internalised'
```

---

## Task 9 — Full Shadbala Assembly & Ranking

**File:** `engine/compute/shadbala.ts`

Implement `computeShadbala(planets, divisionalCharts, birthDate, birthTimeSeconds, sunriseSecs, lagnaLongitude)`:

For each of 7 classical planets + Rahu + Ketu:
1. Call all component functions
2. Sum to get total shashtiamsas
3. Convert to virupas: `totalVirupas = totalShashtiamsas / 60`
4. Compute `strengthRatio = totalVirupas / REQUIRED_VIRUPAS[planet]`
5. Assign grade: ratio ≥ 1.0 → Strong; ≥ 0.75 → Average; < 0.75 → Weak
6. Compute Ishta/Kashta
7. Compute Vimsopaka
8. Classify retro effect
9. Build `ShadbalPlanet` object

After all planets:
- Build `strengthRanking[]`: sort by `strengthRatio` descending, assign ranks 1–9

Export `computeShadbala(...)` returning `ShadbalResult`.

---

## Task 10 — Relationship Geometry Module

**File:** `engine/compute/relationships.ts` (new file)

Implement all constants and helpers:

- `SIGN_LORDS`: sign number → planet name (1–12)
- `ASPECT_HOUSES`: planet → array of aspect offsets (house counts forward)
- `ASPECT_STRENGTH`: aspect type → shashtiamsas score
- `SIGN_MODALITY`: sign number → 'movable' | 'fixed' | 'dual'
- `RASHI_ASPECT_MATRIX`: precomputed via `buildRashiAspectMatrix()` at module load
- `COMBUSTION_THRESHOLDS`: same as in shadbala.ts (share or re-export)
- Helper: `getPlanetsInHouse(house, planets)` → planet names in that house
- Helper: `getPlanetsInSign(signNumber, planets)` → planet names in that sign
- Helper: `houseToSign(house, lagnaSignNumber)` → sign number

---

## Task 11 — Conjunctions, Stelliums, Graha Yuddha

**File:** `engine/compute/relationships.ts`

**`computeConjunctions(planets, lagnaSignNumber)`:**
- Group planets by `signNumber`
- For groups of 2+: create `Conjunction` object
- Compute `orb` = min pairwise `arcDist` within the group
- Check sandhi: any planet in group has `degreeInSign < 1 || > 29` → `isSandhi = true`
- Include single-planet groups? No — only 2+ planets.
- For groups of 3+: also emit as Stellium

**`computeStelliums(planets, lagnaSignNumber)`:**
- Groups of 3+: emit `Stellium` with `isStrong` = sign lord also in group

**`computeGrahaYuddha(planets)`:**
- Loop over eligible pairs: Mars, Mercury, Jupiter, Venus, Saturn
- `arcDist(A.longitude, B.longitude) ≤ 1.0` → war
- Winner = lower `degreeInSign`
- `intense = separation < 0.5`

---

## Task 12 — Graha Drishti & Rashi Drishti

**File:** `engine/compute/relationships.ts`

**`computeGrahaDrishti(planets, lagnaSignNumber)`:**
- For each planet, for each aspect offset in `ASPECT_HOUSES[planet]`:
  - `targetHouse = ((planet.house - 1 + offset - 1) % 12) + 1`
  - `targetSign = houseToSign(targetHouse, lagnaSignNumber)`
  - `toPlanets = getPlanetsInHouse(targetHouse, planets)`
  - Emit `AspectEdge` with strength from `ASPECT_STRENGTH[type]`
- Total: 9 planets × up to 3 aspect offsets = ≤27 "from-planet" entries → ≤81 edges

**`computeRashiDrishti(planets, lagnaSignNumber)`:**
- For sign 1–12: look up `RASHI_ASPECT_MATRIX[signNumber]`
- For each aspected sign: `toPlanets = getPlanetsInSign(toSignNumber, planets)`
- Compute `fromHouse`, `toHouse` from lagna
- Emit `RashiAspectEdge`
- Always emit all 48 edges (even with empty `toPlanets`)

---

## Task 13 — Mutual Reception, Combustion, Avastha, Gandanta, Sandhi

**File:** `engine/compute/relationships.ts`

**`computeMutualReception(planets, lagnaSignNumber)`:**
- 36 unique pairs
- For each pair (A, B): check `SIGN_LORDS[A.signNumber] === B.planet && SIGN_LORDS[B.signNumber] === A.planet`
- Classify `exchange_type`:
  - Houses of both planets in kendras/trines → 'maha'
  - Any house is dusthana (6/8/12) → 'dainya' (higher priority than kahala)
  - One house is dusthana → 'kahala'
  - Neither → 'simple'

**`computeCombustion(planets)`:**
- Find Sun in planets array
- For each planet (excluding Sun): compute `degreeFromSun = arcDist(planet.longitude, sun.longitude)`
- Apply retrograde threshold if planet.retrograde
- `cazimi = degreeFromSun < 0.283`
- `combust = degreeFromSun < threshold && !cazimi` (cazimi overrides combust)
- `nearCombust = degreeFromSun < threshold × 1.5 && !combust`

**`computeAvastha(planets)`:**
- For each planet: `decanBand = floor(degreeInSign / 6)`
- Odd sign: bands [Bala, Kumara, Yuva, Vriddha, Mrita] at indices 0–4
- Even sign: reverse order [Mrita, Vriddha, Yuva, Kumara, Bala]
- `avasthaStrength`: Yuva→Strong, Kumara→Moderate, Bala→Moderate, Vriddha→Weak, Mrita→VeryWeak

**`computeGandanta(planets)`:**
- Junction longitudes (sidereal): Cancer/Leo = 120°, Scorpio/Sagittarius = 240°, Pisces/Aries = 0° (and 360°)
- Gandanta zone = within 0.8° on either side
- `degreesFromJunction = min(arcDist to each junction)`

**`computeSandhi(planets)`:**
- `sandhi = degreeInSign < 1.0 || degreeInSign > 29.0`
- `type = degreeInSign < 1.0 ? 'ingress' : 'egress'`

---

## Task 14 — House Lordships

**File:** `engine/compute/relationships.ts`

**`computeHouseLordships(divisionalCharts)`:**
- For each divisional chart (D1, D4, D7, D9, D10, D30):
  - Get `lagnaSignNumber`
  - For house H (1–12): `signNumber = ((lagnaSignNumber - 1 + H - 1) % 12) + 1`
  - `lord = SIGN_LORDS[signNumber]`
  - Build `HouseLordships[division][house] = lord`
- Return complete map

---

## Task 15 — Root Assembly Function

**File:** `engine/compute/relationships.ts`

**`computeRelationshipGeometry(planets, lagnaSignNumber, divisionalCharts)`:**

Call all sub-functions and assemble the `RelationshipGeometry` object:
```typescript
return {
  conjunctions: computeConjunctions(planets, lagnaSignNumber),
  aspects: computeGrahaDrishti(planets, lagnaSignNumber),
  rashiAspects: computeRashiDrishti(planets, lagnaSignNumber),
  grahaYuddha: computeGrahaYuddha(planets),
  mutualReception: computeMutualReception(planets, lagnaSignNumber),
  stelliums: computeStelliums(planets, lagnaSignNumber),
  combustion: computeCombustion(planets),
  avastha: computeAvastha(planets),
  gandanta: computeGandanta(planets),
  sandhi: computeSandhi(planets),
  houseLords: computeHouseLordships(divisionalCharts),
  computedAt: new Date().toISOString(),
}
```

Export `computeRelationshipGeometry` as the public API.

---

## Task 16 — Wire into `computeFullChart()`

**File:** `engine/compute/index.ts`

After Step 11b (per-varga arudhas), add Steps 12b and 12c:

```typescript
// Step 12b: Relationship Geometry (replaces Wave 1D LLM)
const relationships = computeRelationshipGeometry(
  planets, ascendant.signNumber, divisionalCharts
)

// Step 12c: Full Shadbala (replaces Wave 1C LLM)
const sunriseSecods = /* compute from sunriseJulianDay vs date */
const shadbala = computeShadbala(
  planets, divisionalCharts, birthDateLocal,
  birthTimeSeconds, sunriseSeconds, ascendant.longitude
)
```

Add `relationships` and `shadbala` to the returned `ComputedChart` object.

Update the re-exports at the top of `index.ts` to include new types.

---

## Task 17 — Update Wave1Cache & Orchestrator

**Files:** `engine/orchestrator.ts`, `engine/waves/wave1.ts`

1. Remove `'1C'` and `'1D'` from `ALWAYS_RUN_FIRST_QUERY` array in `engine/constants.ts`
2. In `cacheWave1()`: include `computed_geometry` and `computed_shadbala` in the `wave1Delta`
3. In `executePipeline()`: when building `wave1Delta` context, merge in the computed fields:
   ```typescript
   context.wave1Delta = {
     ...llmWave1Results,
     computed_geometry: savedChart.chartData.relationships,
     computed_shadbala: savedChart.chartData.shadbala,
   }
   ```
4. The Wave 2 agents will receive these as part of their context JSON.

---

## Task 18 — Update Wave 2 Prompt References

**Files:** `prompts/agents/wave2_2a_yogas.md`, `prompts/agents/wave2_2e_health.md` (and others)

Update the "Consume Wave 1-D geometry" instructions to reference the new structured keys:
- Replace: "Wave 1-D already computed ALL inter-planetary geometry"
- With: "The `computed_geometry` block contains all pre-computed inter-planetary geometry"
- Update variable references from `{{wave1_output}}` geometry section to `{{computed_geometry}}`
- Update Shadbala references to use `{{computed_shadbala}}` for numerical bala data

---

## Task 19 — TypeScript Compilation Verification

Run `npx tsc --noEmit --skipLibCheck` and confirm zero errors across:
- `engine/compute/shadbala.ts`
- `engine/compute/relationships.ts`
- `engine/compute/types.ts`
- `engine/compute/index.ts`
- `engine/orchestrator.ts`

---

## Task 20 — Spot Verification Against Reference Chart

Using the `data/sample/djma.json` chart (birth data already in `app/compute/page.tsx` defaults):

1. Call `POST /api/compute` with the Mojo birth data
2. Verify `shadbala.planets` contains 7+ entries with non-zero totals
3. Verify `relationships.conjunctions` contains known conjunctions for that chart
4. Verify `relationships.grahaYuddha` is empty or contains expected pairs
5. Verify `relationships.rashiAspects` contains all 48 edges
6. Verify `relationships.combustion` correctly flags any combust planets
7. Log comparison to Jagannatha Hora output if available

---

## Dependency Order

```
Task 1  (types)
  → Task 2  (shadbala constants)
  → Task 3  (sthana bala)
  → Task 4  (dig bala)
  → Task 5  (kaala bala)
  → Task 6  (cheshta bala)
  → Task 7  (naisargika + drik bala)
  → Task 8  (ishta/kashta + vimsopaka)
  → Task 9  (full shadbala assembly)

Task 10 (relationships constants)
  → Task 11 (conjunctions + stelliums + yuddha)
  → Task 12 (graha + rashi drishti)
  → Task 13 (reception + combustion + avastha + gandanta + sandhi)
  → Task 14 (house lordships)
  → Task 15 (root assembly)

Task 9 + Task 15 → Task 16 (wire into index.ts)
Task 16 → Task 17 (orchestrator)
Task 17 → Task 18 (prompt updates)
Task 18 → Task 19 (compilation check)
Task 19 → Task 20 (spot verification)
```

---

## Acceptance Criteria

- [ ] `npx tsc --noEmit` exits 0
- [ ] `GET /api/compute` returns `chart.shadbala` and `chart.relationships` in response
- [ ] `shadbala.planets` has exactly 9 entries (7 classical + Rahu + Ketu)
- [ ] `relationships.aspects` has at least 9 entries (every planet casts minimum 1 aspect)
- [ ] `relationships.rashiAspects` has exactly 48 entries
- [ ] `relationships.combustion` has 8 entries (all planets except Sun)
- [ ] `relationships.avastha` has 9 entries (all planets)
- [ ] `relationships.houseLords` has keys for D1, D4, D7, D9, D10, D30
- [ ] Agents 1C and 1D removed from `ALWAYS_RUN_FIRST_QUERY`
- [ ] Wave 2 prompts reference `computed_geometry` and `computed_shadbala`
## SCOPE-FINAL TASKS

### Task 0 (PREREQUISITE) - Add D2, D3, D12 vargas
File: engine/compute/divisional.ts. Add computeD2Sign (Hora), computeD3Sign (Drekkana), computeD12Sign (Dwadasamsa) to VARGA_DEFINITIONS. Required by Saptavarga + Vimsopaka.

### Task 21 - Extend NakshatraInfo + sub-lord
Files: engine/compute/types.ts, engine/compute/nakshatras.ts. Add subLord; implement computeSubLord(longitude) via Vimshottari dasha-year proportions (Ketu7 Venus20 Sun6 Moon10 Mars7 Rahu18 Jupiter16 Saturn19 Mercury17, total120) starting from the nakshatra's own lord. Compute for all planets + lagna.

### Task 22 - nakshatraRelationships.ts (new)
Implement depositor chains (3 levels + loop detection), nakshatra parivartana (36-pair), clusters (group by nakshatraIndex, 2+), rahuKetuAxis, nakshatraLordGroups, root computeNakshatraRelationships().

### Task 23 - Upagraha participation in relationships.ts
Extend computeConjunctions + computeGrahaDrishti to accept upagrahas; add involvesUpagraha/gulikaAffliction, toUpagrahas[], upagrahaPlacements.

### Task 24 - Shadbala correctness fixes
File: engine/compute/shadbala.ts. Apply FIX-1..FIX-9 constants/rules; add documentation comments for FIX-6/7 approximations; combust benefic->malefic for Mercury/Jupiter/Venus + waning Moon in Drik.

### Task 25 - jaimini.ts (new)
Implement Argala (planets in 2/4/11 from a sign), Virodha Argala (counter from 12/10/3), Yogi/Avayogi points (from Sun+Moon longitude + nakshatra), special-lagna aspect/conjunction participation, lord-to-lord kendra/trikona Raja-Yoga substrate map. Root computeJaimini().

### Task 26 - bhavaBala.ts (new)
Bhavadhipati Bala (lookup house lord's Shadbala total), Bhava Digbala, Bhava Drishti Bala (net benefic-malefic aspect on the house from relationships aspects). Root computeBhavaBala(shadbala, relationships, lagnaSignNumber).

### Task 27 - Wire all into computeFullChart + retire Wave 1
File: engine/compute/index.ts, engine/constants.ts, engine/orchestrator.ts. Steps 12b-12f; remove 1A/1B/1C/1D from ALWAYS_RUN_FIRST_QUERY; merge computed_* into wave1Delta context.

### Task 28 - Update Wave 2 prompts
Reference computed_geometry, computed_shadbala, computed_bhavabala, computed_nakshatra, computed_jaimini instead of {{wave1_output}}.

### Updated Acceptance Criteria (append)
- divisionalCharts include D2, D3, D12.
- shadbala uses corrected constants; totals in rupas; grades correct.
- computedNakshatra present with subLords (planets + lagna) and depositorChains (9).
- computedJaimini present with argala/yogi/avayogi.
- bhavaBala present with 12 houses.
- relationships.conjunctions include upagraha conjunctions when present.
- agents 1A/1B/1C/1D all removed from ALWAYS_RUN_FIRST_QUERY.
