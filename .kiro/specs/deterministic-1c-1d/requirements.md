# Requirements: Deterministic Shadbala (1C) + Relationship Geometry (1D)

> **Cross-reference (2026-07):** Named-yoga detection — previously an LLM-only Wave
> 2A concern layered on top of this spec's 1D geometry — is now ALSO deterministic.
> See `.kiro/specs/named-yoga-engine/` (`engine/compute/yogas.ts`): it consumes the
> `RelationshipGeometry` tables this spec produces (aspects, conjunctions, mutual
> reception, combustion, house lordships) plus `dignity.ts`, and is injected into
> `wave1_delta` under `1D` alongside `relationships`/`jaimini`/`ashtakavarga`. Wave 2A
> now validates/interprets the supplied catalogue instead of re-deriving formation.

## Overview

Replace LLM agents 1C and 1D with deterministic TypeScript engine modules.
These modules will be added to `engine/compute/` and their output will be part
of `ComputedChart`, feeding Wave 2/3 agents directly with structured, exact data
instead of LLM-derived arithmetic (which is error-prone and costs tokens per run).

---

## Background

Wave 1C currently asks an LLM to compute Shadbala (a purely mathematical
planetary strength system from BPHS). Wave 1D asks an LLM to compute
inter-planetary geometry (conjunctions, aspects, mutual reception, etc.).
Both are 100% deterministic given the planet positions already computed by
the Swiss Ephemeris engine. Replacing them eliminates:
- 4 LLM calls per first run (~$0.06–0.10 saved)
- ~20–30 seconds of latency
- Risk of hallucinated or incorrect numerical outputs

---

## Requirements

### REQ-1: Full Shadbala (`engine/compute/shadbala.ts`)

Implement the complete 6-component classical Shadbala system (BPHS Ch. 27–28)
for all 7 classical planets (Sun, Moon, Mars, Mercury, Jupiter, Venus, Saturn).
Rahu and Ketu receive only partial bala (noted where applicable).

#### REQ-1.1 — Sthana Bala (Positional Strength)
Five sub-components, each with exact formula:

**1.1a Uccha Bala** (already in pindaStrength.ts — reuse/move here)
- Each planet has an exact exaltation longitude. At exact exaltation: 60 shashtiamsas. At exact debilitation (180° away): 0. Linear interpolation.
- Formula: `ucchaBala = (180 - arcDist(planet.longitude, exaltLon)) / 3`
- Must handle wraparound (modulo 360).

**1.1b Sapta Varga Bala** (already partial in pindaStrength.ts — extend)
- Dignity score in 7 vargas: D1, D2 (Hora), D3 (Drekkana), D7 (Saptamsa), D9 (Navamsa), D12 (Dwadasamsa), D30 (Trimshamsa)
- Per-varga dignity scores (shashtiamsas):
  - Exalted: 30 | Moolatrikona: 22.5 | Own sign: 15 | Great friend: 11.25 | Friend: 7.5 | Neutral: 3.75 | Enemy: 1.875 | Great enemy: 0.9375 | Debilitated: 0
- Natural friendship table (7×7 matrix, permanent friendships only):
  - Sun: friends=Moon,Mars,Jupiter; enemies=Venus,Saturn; neutral=Mercury
  - Moon: friends=Sun,Mercury; enemies=none; neutral=Mars,Jupiter,Venus,Saturn
  - Mars: friends=Sun,Moon,Jupiter; enemies=Mercury; neutral=Venus,Saturn
  - Mercury: friends=Sun,Venus; enemies=Moon; neutral=Mars,Jupiter,Saturn
  - Jupiter: friends=Sun,Moon,Mars; enemies=Mercury,Venus; neutral=Saturn
  - Venus: friends=Mercury,Saturn; enemies=Sun,Moon; neutral=Mars,Jupiter
  - Saturn: friends=Mercury,Venus; enemies=Sun,Moon,Mars; neutral=Jupiter
- Temporary friendship (Tatkalika Maitri): if a planet is in signs 2,3,4,10,11,12 from another planet → temporarily friendly; otherwise temporarily enemy. Combined relationship = permanent + temporary.
- Combined friendship scoring matrix (5 levels):
  - PermFriend + TempFriend = Great Friend (Adhimitra): 11.25
  - PermFriend + TempEnemy = Friend (Mitra): 7.5
  - PermNeutral + TempFriend = Friend (Mitra): 7.5
  - PermNeutral + TempEnemy = Enemy (Shatru): 1.875
  - PermEnemy + TempFriend = Enemy (Shatru): 1.875
  - PermEnemy + TempEnemy = Great Enemy (Atishatru): 0.9375
  - Own sign: 15 (overrides friendship)
  - Moolatrikona: 22.5 (overrides own)
  - Exalted: 30 (highest)
  - Debilitated: 0 (lowest)

**1.1c Ojha Yugma Bala** (already in pindaStrength.ts — reuse)
- Odd/even sign placement (malefics prefer odd, benefics prefer even)
- Score: 15 if preferred parity, 0 otherwise

**1.1d Kendradi Bala** (already in pindaStrength.ts — reuse)
- Kendra (1,4,7,10): 60 shashtiamsas
- Panapara (2,5,8,11): 30 shashtiamsas
- Apoklima (3,6,9,12): 15 shashtiamsas

**1.1e Drekkana Bala**
- First drekkana (0–10°) of any sign:
  - Male planets (Sun, Mars, Jupiter): 15
  - Female planets (Moon, Venus): 0
  - Neuter (Mercury, Saturn): 7.5
- Second drekkana (10–20°):
  - Female planets: 15
  - Neuter (Mercury, Saturn): 7.5
  - Male: 0
- Third drekkana (20–30°):
  - Neuter: 15
  - Male: 0
  - Female: 0

**Total Sthana Bala = sum of 1.1a + 1.1b + 1.1c + 1.1d + 1.1e**

#### REQ-1.2 — Dig Bala (Directional Strength)
- Each planet has a house of maximum strength (dig bala):
  - Sun: H10 (South/midheaven)
  - Moon: H4 (North/nadir)
  - Mars: H10
  - Mercury: H1 (East/ascendant)
  - Jupiter: H1
  - Venus: H4
  - Saturn: H7 (West/descendant)
  - Rahu/Ketu: 0 (no dig bala)
- The planet's dig bala house corresponds to a specific longitude point (the cusp of that house in the sidereal zodiac).
- Formula: house of max strength = lagna + offset. Distance from that point = `arcDist(planet.longitude, strengthPoint)`.
- Score: `digBala = (180 - arcDist) / 3` — same linear scale as uccha bala (0–60 shashtiamsas).

#### REQ-1.3 — Kaala Bala (Temporal Strength)
Seven sub-components:

**1.3a Natonnata Bala** (Day/Night)
- Sun, Jupiter, Venus are stronger during the day (Diurnal)
- Moon, Mars, Saturn are stronger at night (Nocturnal)
- Mercury is always strong (both)
- Daytime = between sunrise and sunset
- Score: 60 if in preferred period, 30 if Mercury, 0 otherwise. (BPHS: "60 when strong, else the balance")
- Requires: birthDate, birthTime, sunriseTime (already computed in index.ts)

**1.3b Paksha Bala** (Lunar Phase)
- Based on tithi (lunar day) from Moon's longitude relative to Sun
- Tithi = floor((moonLon - sunLon + 360) % 360 / 12) + 1 (1–30)
- Moon increases from New Moon to Full Moon:
  - Tithi 1–15 (Shukla/waxing): pakshabala = tithi × 4 (max 60 at tithi 15)
  - Tithi 16–30 (Krishna/waning): pakshabala = (30 - tithi + 1) × 4 (decreasing)
- Benefics (Moon, Mercury, Jupiter, Venus): get this paksha bala
- Malefics (Sun, Mars, Saturn): get the inverse — `60 - pakshabala`
- Rahu/Ketu: 30 (neutral)

**1.3c Tribhaga Bala** (Three-part temporal strength)
- Day is divided into 3 parts; night into 3 parts
- Each part is ruled by a planet
- Day parts: 1st=Mercury, 2nd=Sun, 3rd=Saturn
- Night parts: 1st=Moon, 2nd=Venus, 3rd=Mars
- Jupiter always has tribhaga bala
- Score: 60 for the ruling planet of the current third, 0 for others (Jupiter always 60)

**1.3d Abda Bala** (Year lord)
- The lord of the year (Samvatsara) gets 15 shashtiamsas
- Year lord = lord of the day on which the Vedic new year starts (Sun's entry into Aries)
- Use a fixed yearly cycle: Sun enters Aries around March 21; weekday determines year lord
- Approximate: year lord = weekday of birth year's Aries ingress (use a lookup or compute)
- Score: 15 for the year lord, 0 for others

**1.3e Masa Bala** (Month lord)
- Lord of the lunar month in which birth occurs
- Each lunar month has a presiding lord; score: 30 for the month lord, 0 others
- 12 lunar months in order: Chaitra(Mars), Vaishakha(Venus), Jyeshtha(Mercury), Ashadha(Moon), Shravana(Sun), Bhadrapada(Mercury), Ashvina(Venus), Kartika(Mars), Margashirsha(Jupiter), Pausha(Saturn), Magha(Jupiter), Phalguna(Saturn)

**1.3f Vara Bala** (Weekday lord)
- The lord of the weekday of birth gets 45 shashtiamsas
- Sun=Sunday, Moon=Monday, Mars=Tuesday, Mercury=Wednesday, Jupiter=Thursday, Venus=Friday, Saturn=Saturday
- Score: 45 for weekday lord, 0 for others

**1.3g Hora Bala** (Hora/Hour lord)
- Each hora (1-hour period) is ruled by a planet in sequence
- Sequence from sunrise: Sun, Venus, Mercury, Moon, Saturn, Jupiter, Mars (repeat)
- The hora lord at birth moment gets 60 shashtiamsas
- Requires: birth time, sunrise time

**Total Kaala Bala = 1.3a + 1.3b + 1.3c + 1.3d + 1.3e + 1.3f + 1.3g**

#### REQ-1.4 — Cheshta Bala (Motional Strength)
- This is the most complex. It measures a planet's motional vigor.
- For outer planets (Mars, Jupiter, Saturn) and inner planets (Mercury, Venus):
  - The speed of the planet relative to its mean motion determines Cheshta.
  - The engine already has `planet.speed` (degrees/day from Swiss Ephemeris) — use this directly.
- Mean daily motions (degrees/day):
  - Sun: 0.9856° | Moon: 13.1764° | Mars: 0.5240° | Mercury: 1.3833° | Jupiter: 0.0831° | Venus: 1.2° | Saturn: 0.0339°
- Formula: `cheshtaBala = min(60, (|speed| / meanMotion) × 60)` — capped at 60
- Retrograde planets: Cheshta is based on elongation from Sun. High elongation = high Cheshta.
- For retrograde planets, use: `cheshtaBala = (elongation / 180) × 60` where elongation = angular distance from Sun
- Combustion reduces Cheshta: if planet is within combustion range of Sun (see below), multiply by 0.5
- Rahu/Ketu: 30 (no Cheshta variation used in classical BPHS, though some texts allow 60 for retrograde nodes)
- Special: Sun and Moon do not have Cheshta Bala in the traditional sense — they use Natonnata Bala from Kaala Bala instead. Some texts assign fixed values: Sun=30, Moon=40.

#### REQ-1.5 — Naisargika Bala (Natural/Permanent Strength)
Fixed hierarchy, always the same regardless of chart:
- Saturn: 1 | Mars: 2 | Mercury: 3 | Jupiter: 4.5 | Venus: 5.5 | Moon: 8.5 | Sun: 10
- Rahu/Ketu: not applicable (0 or omitted)
- These are in shashtiamsas (the official values from BPHS Ch.28)

#### REQ-1.6 — Drik Bala (Aspectual Strength)
- Sum of benefic and malefic aspects received by the planet.
- For each planet being evaluated:
  - For each aspecting planet: apply the aspect geometry from REQ-2.2 (Graha Drishti)
  - If aspecting planet is a natural benefic (Jupiter, Venus, waxing Moon, Mercury not combust): +benefic points
  - If aspecting planet is a natural malefic (Sun, Mars, Saturn, Rahu, Ketu, waning Moon): -malefic points
  - Aspect strength by type (in shashtiamsas):
    - Full aspect (7th house): 60
    - 3/4 aspect (Saturn 3rd/10th, Mars 4th/8th): 45
    - 1/4 aspect (Jupiter 5th/9th): 15
    - Special aspect from Jupiter to 5th/9th: 30 (some texts use 30 for ¾ instead)
  - Note: Use BPHS standard: Jupiter's 5th/9th = 30 shas; Mars's 4th/8th = 30; Saturn's 3rd/10th = 30.
  - Drik Bala = (sum of benefic aspect scores - sum of malefic aspect scores) / 4

#### REQ-1.7 — Ishta & Kashta Phala
- Ishta Phala: benefic output capability = √(ucchaBala × cheshtaBala)
- Kashta Phala: malefic output capability = √((60 - ucchaBala) × (60 - cheshtaBala))
- Both scored 0–60. Scale up if the product exceeds 60.

#### REQ-1.8 — Vimsopaka Bala (Varga Dignity Score, 0–20)
- Based on dignity in 16 vargas (D1, D2, D3, D4, D7, D9, D10, D12, D16, D20, D24, D27, D30, D40, D45, D60)
- We currently compute D1, D4, D7, D9, D10, D30 — score these 6 only, with weights:
  - D1: 3 | D9: 1.5 | D4: 0.5 | D7: 0.5 | D10: 0.5 | D30: 0.5 = 6.5 max for our vargas
- Normalize to 0–20 proportionally
- Dignity at each varga → same scoring as Sapta Varga (5 levels: Exalted/MT/Own/Friend/Neutral/Enemy/Debilitated → 3/2.5/2/1.5/1/0.5/0 per varga weight)

#### REQ-1.9 — Total Shadbala (Composite)
```
Total Shadbala = StthanaBala + DigBala + KaalaBala + CheshtaBala + NaisargikaBala + DrikBala
```
- Minimum required Shadbala (in virupas = shashtiamsas/60):
  - Sun: 390 | Moon: 360 | Mars: 300 | Mercury: 420 | Jupiter: 390 | Venus: 330 | Saturn: 300
- Strength ratio: `ratio = totalVirupas / requiredVirupas`
- Grade: ratio ≥ 1.0 → Strong; ratio ≥ 0.75 → Average; ratio < 0.75 → Weak
- Retro effect classification: see 1C prompt for the 5-level classification table

---

### REQ-2: Relationship Geometry (`engine/compute/relationships.ts`)

Implement all inter-planetary and sign-to-sign relationship geometry.

#### REQ-2.1 — Conjunctions
- Two planets in same sign = conjunction.
- For each pair of 9 planets: check signNumber equality.
- 36 unique pairs (C(9,2) = 36).
- For each conjunction:
  - `planets`: planet names array
  - `sign`, `signNumber`, `house` (from lagna)
  - `orb`: minimum degree separation among all pairs in the conjunction
- If 3+ planets share a sign, emit one conjunction entry with all planets listed.
- Also detect near-conjunctions: planets in adjacent signs within 1° of sign boundary (Sandhi conjunctions) — flag separately.

#### REQ-2.2 — Graha Drishti (Planetary Aspects)
Full classical Parashari aspect system. Every planet casts a **full 7th-house aspect** plus special aspects:

**Special aspect offsets (houses from planet's house):**
- Mars: 4th and 8th
- Jupiter: 5th and 9th
- Saturn: 3rd and 10th
- Rahu/Ketu (optional school): 5th and 9th (mark with `school: "jaimini_optional"`)

**Aspect strength by type (quarter-aspect system):**
- 7th house (all planets): Full (100%) — 60 shashtiamsas
- Mars 4th/8th: Three-quarter (75%) — 45 shashtiamsas
- Saturn 3rd/10th: Three-quarter (75%) — 45 shashtiamsas
- Jupiter 5th/9th: Half (50%) — 30 shashtiamsas

**For each aspect edge:**
- `from`: aspecting planet
- `fromHouse`: planet's house
- `toHouse`: target house number
- `toSign`: sign number of target house
- `toPlanets`: planets in the aspected house (may be empty)
- `type`: "7th" / "mars_4th" / "mars_8th" / "jupiter_5th" / "jupiter_9th" / "saturn_3rd" / "saturn_10th"
- `strength`: strength in shashtiamsas (60/45/30)
- `school`: "parashari" (default) or "jaimini_optional"

**Total aspect edges**: max 9 × 9 = 81 (many fewer in practice)

#### REQ-2.3 — Rashi Drishti (Sign Aspects — Jaimini)
Sign-to-sign aspects, independent of which planets occupy the signs.

**Rules:**
- Movable signs (Aries=1, Cancer=4, Libra=7, Capricorn=10) aspect all Fixed signs **except the adjacent one**:
  - Aries aspects Taurus(no), Leo(yes), Scorpio(yes), Aquarius(yes)
  - Cancer aspects Leo(no), Scorpio(yes), Aquarius(yes), Taurus(yes)
  - Libra aspects Scorpio(no), Aquarius(yes), Taurus(yes), Leo(yes)
  - Capricorn aspects Aquarius(no), Taurus(yes), Leo(yes), Scorpio(yes)
- Fixed signs (Taurus=2, Leo=5, Scorpio=8, Aquarius=11) aspect all Movable signs except adjacent:
  - Taurus aspects Aries(no), Cancer(yes), Libra(yes), Capricorn(yes)
  - Leo aspects Cancer(no), Libra(yes), Capricorn(yes), Aries(yes)
  - Scorpio aspects Libra(no), Capricorn(yes), Aries(yes), Cancer(yes)
  - Aquarius aspects Capricorn(no), Aries(yes), Cancer(yes), Libra(yes)
- Dual signs (Gemini=3, Virgo=6, Sagittarius=9, Pisces=12) aspect all other Dual signs:
  - Gemini aspects Virgo, Sagittarius, Pisces (all 3)
  - Virgo aspects Gemini, Sagittarius, Pisces
  - Sagittarius aspects Gemini, Virgo, Pisces
  - Pisces aspects Gemini, Virgo, Sagittarius

**Total rashi aspect relationships**: 48 directional edges (each sign aspects exactly 3 others)

**For each rashi aspect:**
- `fromSign`, `fromSignNumber`, `fromHouse`
- `toSign`, `toSignNumber`, `toHouse`
- `toPlanets`: planets in aspected sign
- `type`: "movable_to_fixed" / "fixed_to_movable" / "dual_to_dual"
- `strength`: "full" (Rashi drishti is always full)

#### REQ-2.4 — Graha Yuddha (Planetary War)
War occurs between two non-luminary, non-nodal planets within 1°.
Eligible planets: Mars, Mercury, Jupiter, Venus, Saturn (5 planets = 10 pairs).

**For each pair within 1°:**
- `planets`: [planet_A, planet_B]
- `separation_deg`: exact separation (2 decimal places)
- `winner`: planet with **lower** degree within sign (closer to sign start = winner, classical rule)
- `loser`: the other planet
- `effect`: "winner gains strength, loser loses strength in affected domains"

**Additional rule (BPHS):** If the two planets are within 0.5°, it is an intense war (flag `intense: true`).

#### REQ-2.5 — Mutual Reception (Parivartana Yoga)
Two planets each occupying the other's owned sign.

**Sign lordship table** (classical, single lords):
- Aries→Mars, Taurus→Venus, Gemini→Mercury, Cancer→Moon, Leo→Sun, Virgo→Mercury
- Libra→Venus, Scorpio→Mars, Sagittarius→Jupiter, Capricorn→Saturn, Aquarius→Saturn, Pisces→Jupiter

**For each unique pair of 9 planets:** check if lord(A.sign) === B AND lord(B.sign) === A.
36 pairs to check.

**For each mutual reception found:**
- `planet_a`, `sign_a`, `house_a`
- `planet_b`, `sign_b`, `house_b`
- `exchange_type`:
  - `"maha"`: both signs in kendras (1,4,7,10) or trines (1,5,9) — Maha Parivartana (powerful Raja/Dhana yoga)
  - `"kahala"`: one sign is a dusthana (6,8,12) — Kahala Parivartana (aggressive, delayed results)
  - `"dainya"`: at least one sign in 6th, 8th, OR 12th — Dainya Parivartana (malefic outcome)
  - `"simple"`: neither kendra/trikona nor dusthana
  - Note: priority = maha > dainya > kahala > simple. Apply dainya if any dusthana is involved.

#### REQ-2.6 — Stellium Detection
Three or more planets in the same sign.

**For each sign occupied by 3+ planets:**
- `sign`, `signNumber`, `house`
- `planets`: array of planet names
- `count`
- `nakshatra_lord`: nakshatra lord of the sign (using the sign's first nakshatra's lord as an approximation)
- `stellium_strength`: "strong" (if lord of sign also occupies same sign), "normal" otherwise

#### REQ-2.7 — Combustion Detection
A planet within its combustion range of the Sun is "combust" (asta).

**Classical combustion ranges (degrees, Sun as center):**
- Moon: 12° (or 8° if applying strict rule — flag both)
- Mars: 17°
- Mercury: 14° direct, 12° retrograde
- Jupiter: 11°
- Venus: 10° direct, 8° retrograde
- Saturn: 15°

**For each planet:**
- `planet`, `degreeFromSun`: exact angular separation from Sun
- `combust`: true/false
- `threshold`: the applicable threshold used
- `retrograde`: whether retrograde threshold was applied
- `nearCombust`: true if within 1.5× the threshold (approaching combustion zone)

**Special:** Cazimi = within 0°17' (17 arc-minutes) of the Sun's exact degree. Flag separately:
- `cazimi`: true if within 0.283°
- Cazimi planets are actually strengthened (in the heart of the king), not weakened.

#### REQ-2.8 — House Lordships for All Divisions
Compute the lord of each house for D1, D4, D7, D9, D10, D30 using each chart's lagna sign.

**For each divisional chart:**
- For house H (1–12): signNumber of house H = ((lagnaSignNumber - 1 + H - 1) % 12) + 1
- Lord = SIGN_LORDS[signNumber]
- Output: `houseLords[division][house] = planetName`

#### REQ-2.9 — Avastha Classification
The life-stage (Balaadi Avastha) for each planet based on degree in sign.

**Classical Balaadi Avastha (5 stages per sign, 6° each):**
For odd signs (1,3,5,7,9,11): Bala(0–6°), Kumara(6–12°), Yuva(12–18°), Vriddha(18–24°), Mrita(24–30°)
For even signs (2,4,6,8,10,12): Mrita(0–6°), Vriddha(6–12°), Yuva(12–18°), Kumara(18–24°), Bala(24–30°)

**For each planet:**
- `avastha`: "Bala" | "Kumara" | "Yuva" | "Vriddha" | "Mrita"
- `avasthaStrength`: Yuva=Strong, Kumara/Bala=Moderate, Vriddha=Weak, Mrita=Very Weak

#### REQ-2.10 — Gandanta Detection
A planet within 0°48' (0.8°) of a water→fire junction.

**Gandanta junctions (end of water signs → start of fire signs):**
- End of Cancer (29°12'–30°00') / Start of Leo (0°00'–0°48')
- End of Scorpio (29°12'–30°00') / Start of Sagittarius (0°00'–0°48')
- End of Pisces (29°12'–30°00') / Start of Aries (0°00'–0°48')

**For each planet:**
- `gandanta`: true/false
- `junctionPoint`: the specific junction (e.g., "Cancer-Leo")
- `degreesFromJunction`: distance from the exact junction point

#### REQ-2.11 — Sandhi Detection
A planet within 1° of ANY sign boundary.

**For each planet:**
- `sandhi`: true/false — degreeInSign < 1° OR degreeInSign > 29°
- `type`: "ingress" (0–1°) | "egress" (29–30°)

---

### REQ-3: Integration into ComputedChart

- Add `RelationshipGeometry` and `ShadbalResult` to `ComputedChart` type
- Both are computed in `computeFullChart()` (engine/compute/index.ts) after existing steps
- Add to `Wave1Cache`: the relationship geometry and shadbala result are cached alongside `wave1_delta`
- The orchestrator's `wave1Delta` context object is extended to include these two computed results instead of running 1C/1D as LLM agents
- Agents 1C and 1D are removed from `ALWAYS_RUN_FIRST_QUERY` in constants.ts
- `chartSummary.ts` is updated to read from `ComputedChart` instead of `ChartInputV1` for the data now available from the compute engine

---

### REQ-4: Output Contract for Wave 2 Consumers

The `wave1_delta` object passed to Wave 2 agents must include structured versions of what 1C and 1D previously produced, so that:
- Wave 2A (`wave2_2a_yogas.md`) can read `geometry.conjunctions`, `geometry.aspects`, `geometry.mutualReception` directly
- Wave 2E (`wave2_2e_health.md`) can read `geometry.aspects` to find malefics aspecting H1/H6/H8
- All agents can read `shadbala.planets[].grade`, `shadbala.planets[].totalVirupas`, etc.

The structured keys must match what the Wave 2 prompts reference. Wave 2 prompt templates will be updated to use `{{computed_geometry}}` and `{{computed_shadbala}}` instead of `{{wave1_output}}` for the geometry/bala sections.
## SCOPE FINALIZED (Retire ALL Wave 1 + Scope B + Scope C-cheap + Bhava Bala)

Confirmed decisions:
- Retire ALL of Wave 1 (agents 1A, 1B, 1C, 1D). Wave 1 becomes a pure deterministic block; the LLM pipeline starts at Wave 2.
- Deterministic engine modules to build: shadbala.ts, relationships.ts, nakshatraRelationships.ts, jaimini.ts, bhavaBala.ts.
- Upagrahas (Gulika, Mandi + 5 solar-derived) participate in conjunctions (as pairs) and as aspect TARGETS (they do not cast graha drishti).
- Nakshatra relationships module: sub-lords (add subLord to NakshatraInfo), depositor chains (3 levels), nakshatra parivartana, clusters, Rahu/Ketu axis, nakshatra-lord sympathy groups.
- Jaimini module (jaimini.ts): Argala/Virodha Argala, Yogi/Avayogi points, special-lagna participation in aspects/conjunctions, lord-to-lord kendra/trikona Raja-Yoga substrate map.
- Bhava Bala module (bhavaBala.ts): Bhavadhipati Bala (= house lord's total Shadbala), Bhava Digbala, Bhava Drishti Bala.
- Wave 2 consumes computed_shadbala, computed_bhavabala, computed_geometry, computed_nakshatra, computed_jaimini as structured data (pure interpretation, zero geometry derivation).

## REQUIREMENTS CORRECTIONS ADDENDUM (Senior Astrologer Review)

Supersedes conflicting values in REQ-1. Where this addendum and the original body disagree, THIS addendum is authoritative.

### REQ-0 (PREREQUISITE): Add D2, D3, D12 to the divisional engine
Saptavargaja Bala and Vimsopaka Bala require the seven Parashari vargas D1, D2, D3, D7, D9, D12, D30. The engine currently computes D1, D4, D7, D9, D10, D30 and is MISSING D2, D3, D12. Add to divisional.ts:
- D2 Hora: odd sign 0-15deg -> Leo (Sun-hora), 15-30deg -> Cancer (Moon-hora); even sign reversed.
- D3 Drekkana: 0-10deg -> same sign; 10-20deg -> 5th from it; 20-30deg -> 9th from it.
- D12 Dwadasamsa: 2.5deg each, 12 parts starting from the sign itself, counted forward.
Without D2/D3/D12, Saptavarga and Vimsopaka cannot be computed classically.

### FIX-1 - Saptavargaja Bala dignity values (replaces REQ-1.1b table)
Virupas (a virupa = a shashtiamsa): Moolatrikona 45, Own 30, Great Friend (Adhimitra) 22.5, Friend (Mitra) 15, Neutral (Sama) 7.5, Enemy (Shatru) 3.75, Great Enemy (Adhishatru) 1.875. Do NOT include a separate "Exalted" row (captured by Uccha Bala; double-counts otherwise). Adhimitra/Mitra/Sama/Shatru/Adhishatru determined by COMBINED (permanent + tatkalika) relationship. Score 7 vargas and sum (max 7x45=315).

### FIX-2 - Naisargika Bala values (replaces REQ-1.5)
Virupas: Sun 60.00, Moon 51.43, Venus 42.86, Jupiter 34.29, Mercury 25.71, Mars 17.14, Saturn 8.57 (= 60 x n/7). Rahu/Ketu 0. Prior 0-10 scale was a unit error.

### FIX-3 - Ojha-Yugma Bala (replaces REQ-1.1c)
TWO components: rasi (D1) parity + navamsa (D9) parity, each 15 -> max 30. Moon and Venus strong in EVEN (Yugma) signs. Sun, Mars, Mercury, Jupiter, Saturn strong in ODD (Ojha) signs (Mercury is a benefic but prefers ODD). 15 per component if in preferred parity, else 0.

### FIX-4 - Drekkana Bala (replaces REQ-1.1e)
Binary 15 or 0 (no 7.5 partials): 1st drekkana (0-10deg) male Sun/Mars/Jupiter ->15; 2nd drekkana (10-20deg) neuter Mercury/Saturn ->15; 3rd drekkana (20-30deg) female Moon/Venus ->15; else 0. Saturn is NEUTER, not male.

### FIX-5 - Virupa/Rupa terminology (replaces REQ-1.9 units)
1 Rupa = 60 Virupas; a Virupa IS a shashtiamsa. Sum balas in virupas, divide by 60 -> RUPAS. Required Shadbala (RUPAS): Sun 6.5, Moon 6, Mars 5, Mercury 7, Jupiter 6.5, Venus 5.5, Saturn 5. strengthRatio = totalRupas/requiredRupas.

### FIX-6 - Natonnata Bala proportional (replaces REQ-1.3a)
Diurnal (Sun, Jupiter, Venus): bala = 60 x (1 - |timeFromNoon|/12h). Nocturnal (Moon, Mars, Saturn): bala = 60 x (1 - |timeFromMidnight|/12h). Mercury always 60.

### FIX-7 - Cheshta Bala (documented approximation, refines REQ-1.4)
Classical = Cheshta-Kendra/3 (epicyclic); we use |speed|/mean-motion proxy - DOCUMENT as JHora-divergence. Sun's Cheshta = its Ayana Bala (not flat 30). Moon's Cheshta = its Paksha Bala in FULL (not halved). Combustion passed in from REQ-2.7 (single source), not recomputed.

### FIX-8 - Vimsopaka Bala true Shadvarga (replaces REQ-1.8)
With D2/D3/D12 available (REQ-0): weights D1=6, D2=2, D3=4, D9=5, D12=2, D30=1 (total 20). Dignity per varga scaled to weight; sum -> 0-20.

### FIX-9 - Drik Bala full graded aspect scheme (replaces REQ-1.6)
Every planet casts graded aspects (differs from yoga-geometry aspects which use only special full aspects): 3rd/10th = 1/4 = 15 virupas; 5th/9th = 1/2 = 30; 4th/8th = 3/4 = 45; 7th = full = 60. Then SPECIAL aspects upgrade to full (60): Jupiter 5th/9th, Mars 4th/8th, Saturn 3rd/10th. Benefic aspects add, malefic subtract; DrikBala = (benefic - malefic)/4. Combust benefics (Mercury, Jupiter, Venus) and waning Moon count as malefic.

### DECISIONS TO DOCUMENT (multiple valid schools)
- FIX-10 Graha Yuddha winner by lower longitude (our convention); classical also uses latitude/brightness - note in comments.
- FIX-11 Parivartana: Khala = involves 3rd house; Dainya = involves 6/8/12; Maha = all other combinations. (Corrects prior "kahala = any dusthana" conflation.)
- FIX-12 Avastha: Baladi only; Jagradadi/Deeptadi/Lajjitadi/Shayanadi deferred.
- FIX-13 Combustion: emit both Moon 12deg (standard) and 8deg (strict) flags.


---

## JHORA-ALIGNMENT ADDENDUM (2026-07) — supersedes earlier FIX-5/FIX-7/FIX-A

Reconciliation against JHora (Jagannatha Hora) Varshaphal + natal Shadbala screens
for the Mojo chart established the following corrections. These OVERRIDE the older
FIX-5 (required rupas) and FIX-7/FIX-A (Sun/Moon Cheshta) rules. Full evidence and
the remaining backlog live in `docs/computation_varshaphal.md` §4–6.

- **Sun required Shadbala = 5.0 rupas (300 virupas)**, not 6.5/390. Confirmed by
  two independent JHora screens. All other planets unchanged.
- **Ayana Bala is now a Kaala Bala sub-component for all seven planets**
  (declination-based; north-preferring Sun/Mars/Jupiter/Venus use +δ,
  south-preferring Moon/Saturn use −δ, Mercury uses +|δ|; the **Sun's value is
  doubled**). This reverses the earlier decision to omit Ayana from Kaala.
- **Both luminaries' Cheshta Bala = 0** (Sun and Moon). The Sun's declination
  strength is now booked as Ayana inside Kaala; the Moon's Paksha is already a
  Kaala term. This reverses FIX-7's "Moon Cheshta = Paksha in full" and FIX-A's
  "Sun Cheshta = Ayana."

### Remaining divergences (NOT yet implemented — spec-gated Tier B)

- Cheshta Bala uncapped epicyclic Cheshta-Kendra (we still use the clamped
  speed/mean-motion proxy).
- Dig Bala on true bhava (Sripati) cusps, unclamped (we use equal-house, 0–60).
- Ishta/Kashta Phala complementary (Ishta + Kashta = 60).
- Yuddha (planetary-war) Bala — signed term that lets Kaala go negative in JHora.
