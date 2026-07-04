# ChartInputV1 — JSON Schema Definition

**Version:** 1.0
**Last updated:** 2026-07-04
**Status:** Draft
**Derived from:** `data/sample/sample.json`, `data/sample/djma.json`, `data/sample/vedic_chart_FINAL.json`

---

## Design Principles

1. **Required fields** = data that at least one agent CANNOT function without.
2. **Optional fields** = data that enriches analysis but agents can still produce partial output if absent.
3. **Computed fields** (not in input) = data the engine computes deterministically (e.g., Vimshottari dasha tree).
4. **Schema is the validation contract** — if a field is required and missing, chart submission fails with a field-level error.

---

## Field Presence Across Samples

| Section | sample.json | djma.json | vedic_chart_FINAL.json | Required? |
|---|---|---|---|---|
| `meta` | ✓ | ✓ | ✓ | **Required** |
| `meta.client_name` | ✗ | ✗ | ✗ | **Required** (new — practitioner supplies) |
| `meta.birth_datetime` | ✗ | ✗ | ✗ | **Required** (new — needed for dasha engine) |
| `meta.birth_place` | ✗ | ✗ | ✗ | Optional (for report display only) |
| `meta.gender` | ✗ | ✗ | ✗ | Optional (needed for 2G marriage karaka selection) |
| `meta.system` | ✓ | ✓ | ✓ | Required |
| `meta.ascendant/lagna_sign` | ✓ | ✓ | ✓ | Required |
| `meta.lagna_degree` | ✓ (decimal) | ✓ (string+decimal) | ✓ (decimal) | Required (decimal) |
| `meta.lagna_nakshatra` | ✗ | ✓ | ✗ | Optional |
| `meta.lagna_pada` | ✗ | ✓ | ✗ | Optional |
| `natal_nakshatras` | ✓ (9 planets) | ✓ (9 planets) | ✓ (9 planets) | **Required** |
| `divisional_charts.D1_Rasi` | ✓ | ✓ | ✓ | **Required** |
| `divisional_charts.D4_Chaturthamsa` | ✓ | ✓ | ✓ | **Required** |
| `divisional_charts.D9_Navamsa` | ✓ | ✓ | ✓ | **Required** |
| `divisional_charts.D10_Dasamsa` | ✓ | ✓ | ✓ | **Required** |
| `divisional_charts.D30_Trimshamsa` | ✓ | ✓ | ✓ | **Required** |
| `divisional_charts.D7_Saptamsa` | ✗ | ✗ | ✗ | Optional (Phase 2 for progeny) |
| `shadbala` | ✓ (7 planets) | ✓ (9 incl nodes) | ✓ (7 planets) | **Required** (7 classical) |
| `ashtakavarga` | ✓ | ✓ | ✓ | **Required** |
| `ashtakavarga.individual_planet_av` | ✓ | ✗ (noted as illegible) | ✓ | Optional |
| `vimshottari_dasha` | ✓ | ✓ | ✓ | Optional (legacy — engine computes from Moon) |
| `special_lagnas` | ✓ | ✓ (22 items) | ✓ (1 item) | Optional |
| `karakas` | ✓ | ✓ | ✓ | Optional (useful but 1A can derive AK from degrees) |
| `karakas_chara` | ✗ | ✓ | ✗ | Optional |
| `upagrahas` | ✗ | ✓ | ✗ | Optional |
| `nakshatra_disha` | ✓ | ✗ | ✓ | Optional |
| `saturn_transits` | ✓ | ✓ | ✓ | Optional |
| `varna_charts` | ✗ | ✓ | ✗ | Optional |
| `outer_planets_note` | ✗ | ✓ | ✗ | Optional |

---

## Formal Schema (TypeScript Interface)

```typescript
/**
 * ChartInputV1 — the validated contract for chart submission.
 * All agents consume data derived from this structure.
 * The engine computes the Vimshottari dasha tree from meta.birth_datetime
 * + the Moon's natal_nakshatras entry — it is NOT required as input.
 */

// ─── Enums / Literals ───────────────────────────────────────────────

type Sign =
  | 'Aries' | 'Taurus' | 'Gemini' | 'Cancer' | 'Leo' | 'Virgo'
  | 'Libra' | 'Scorpio' | 'Sagittarius' | 'Capricorn' | 'Aquarius' | 'Pisces'

type Planet = 'Sun' | 'Moon' | 'Mars' | 'Mercury' | 'Jupiter' | 'Venus' | 'Saturn' | 'Rahu' | 'Ketu'

type Gender = 'male' | 'female' | 'other'

type DivisionalChartKey = 'D1_Rasi' | 'D4_Chaturthamsa' | 'D9_Navamsa' | 'D10_Dasamsa' | 'D30_Trimshamsa' | 'D7_Saptamsa'

// ─── Meta ───────────────────────────────────────────────────────────

interface ChartMeta {
  /** Display name for the client. Used in report filenames and UI. */
  client_name: string                         // REQUIRED

  /** ISO 8601 datetime with timezone. Anchors the computed dasha tree. */
  birth_datetime: string                      // REQUIRED — e.g. "1990-04-15T06:30:00+05:30"

  /** Free-text birth location. For report display; not used in computation. */
  birth_place?: string                        // OPTIONAL

  /** Gender affects karaka selection in marriage agent (Venus vs Jupiter). */
  gender?: Gender                             // OPTIONAL — defaults to 'male' if absent

  /** Must always be "Vedic (Jyotish) — Lahiri Ayanamsha" for V1. */
  system: string                              // REQUIRED

  /** The ascendant sign name. */
  lagna_sign: Sign                            // REQUIRED

  /** Lagna degree within its sign (0–30, decimal). */
  lagna_degree_decimal: number                // REQUIRED

  /** Lagna nakshatra name. */
  lagna_nakshatra?: string                    // OPTIONAL

  /** Lagna pada (1–4). */
  lagna_pada?: number                         // OPTIONAL

  /** Source description for provenance tracking. */
  source?: string                             // OPTIONAL
}

// ─── Natal Nakshatras (Planet Positions) ────────────────────────────

interface NatalPlanet {
  /** Planet name. All 9 classical bodies required. */
  body: Planet                                // REQUIRED

  /** Sign the planet occupies in D1. */
  sign: Sign                                  // REQUIRED

  /** Sign number (1=Aries … 12=Pisces). */
  sign_no: number                             // REQUIRED (1–12)

  /** House number from lagna (1–12). */
  house: number                               // REQUIRED (1–12)

  /** Degree in DMS string format, e.g. "14°12'". */
  degree: string                              // REQUIRED

  /** Degree as decimal within sign (0–30). Critical for dasha computation (Moon). */
  degree_decimal: number                      // REQUIRED

  /** Nakshatra name. */
  nakshatra: string                           // REQUIRED

  /** Nakshatra pada (1–4). */
  pada: number                                // REQUIRED (1–4)

  /** Free-text notes: "R" for retrograde, karaka labels, dignity notes. */
  notes?: string                              // OPTIONAL
}

// ─── Divisional Charts ──────────────────────────────────────────────

interface DivisionalHouse {
  house: number                               // 1–12
  sign: Sign
  occupants: string[]                         // Planet names (may include "As" for lagna marker)
}

interface DivisionalChart {
  name: string                                // e.g. "D9 Navamsa"
  lagna?: Sign                                // Divisional chart lagna (optional for D1 — derived from meta)
  lagna_sign_no?: number                      // 1–12
  houses: DivisionalHouse[]                   // Exactly 12 entries
}

// ─── Shadbala ───────────────────────────────────────────────────────

interface ShadbalaSixComponents {
  sthana: number
  dig: number
  kala: number
  cheshta: number
  naisargika: number
  drig: number
}

interface ShadbalaEntry {
  /** Planet name. 7 classical planets required; Rahu/Ketu optional (null totals). */
  planet?: string                             // Legacy: some samples use "body"
  body?: string                               // Alias — schema accepts either

  /** Total Shadbala in virupas. Null for Rahu/Ketu. */
  total_shadbala_virupas?: number | null
  total?: number | null                       // Alias (vedic_chart_FINAL uses "total")

  /** Required minimum virupas for this planet. */
  required?: number | null
  required_virupas?: number | null            // Alias

  /** Percentage of required (e.g. "142.3%" or numeric). */
  percent?: string | null
  ratio?: number | null                       // Alias (djma uses "ratio")

  /** Grade classification. */
  grade?: string | null                       // "Strong" | "Weak" | null (for nodes)

  /** The six strength components. */
  six_balas?: ShadbalaSixComponents
  components?: ShadbalaSixComponents          // Alias (djma uses "components")

  /** Ishta Phala (0–60). */
  ishta?: number | null
  /** Kashta Phala (0–60). */
  kashta?: number | null

  /** Pinda strength summary. */
  pinda_strength?: { strength_pct: string } | null

  /** Vimsopaka Bala. Flexible structure — varies between samples. */
  vimsopaka?: Record<string, any> | null
  vimsopaka_bala?: Record<string, any> | null // Alias

  /** Vaiseshikamsa. */
  vaiseshikamsa?: Record<string, any> | null
  vaiseshikamsa_bala?: Record<string, any> | null // Alias

  /** Additional balas (harsha, pancha vargeeya, etc.). */
  other_balas?: Record<string, any> | null

  /** Retrograde notes derived from Cheshta Bala. */
  retro_note?: string | null

  /** Catch-all notes for nodes. */
  notes?: string | null
}

// ─── Ashtakavarga ───────────────────────────────────────────────────

interface SignBindu {
  sign_no: number                             // 1–12
  sign: Sign
  points: number                              // 0–8 for BAV; 0–56 for SAV
}

/** SAV can be keyed by sign or by house depending on sample format. */
interface SarvashtakavargaBySign {
  total: number                               // Should be ~337 (theoretical max 56×12=672)
  by_sign: SignBindu[]                        // 12 entries
}

interface SarvashtakavargaByHouse {
  /** House-indexed variant (djma uses this). */
  house: number
  sign: Sign
  bindus: number
}

interface PlanetAV {
  planet: string
  by_sign: SignBindu[]                        // 12 entries
}

interface PindaStrengthEntry {
  body: string
  rasi_pinda: number
  graha_pinda: number
  sodhya_pinda: number
  strength_pct: number
}

interface Ashtakavarga {
  /** SAV — at least one of these formats required. */
  sarvashtakavarga?: SarvashtakavargaBySign
  sarvashtakavarga_by_house?: SarvashtakavargaByHouse[]
  sav_total?: number

  /** Individual planet BAV — optional (sometimes not legible from screenshots). */
  individual_planet_av?: PlanetAV[]

  /** Pinda strength — optional. */
  pinda_strength?: PindaStrengthEntry[]

  /** Shadbala cross-reference summary — optional. */
  shadbala_summary?: Record<string, any>
}

// ─── Vimshottari Dasha (legacy input — optional) ────────────────────

/**
 * IMPORTANT: This block is OPTIONAL in ChartInputV1. The engine computes
 * the authoritative dasha tree from meta.birth_datetime + Moon's degree_decimal.
 * If present, it is stored for audit comparison but IGNORED by all agents.
 */
interface VimshottariDashaInput {
  current_maha?: string
  current_maha_start?: string
  current_maha_end?: string
  current_antar?: string
  current_antar_start?: string
  current_antar_end?: string
  current_pratyantar?: string
  current_pratyantar_start?: string
  current_pratyantar_end?: string
  tree?: any                                  // Flexible — legacy format varies
}

// ─── Special Lagnas ─────────────────────────────────────────────────

interface SpecialLagna {
  name: string                                // e.g. "Sree Lagna", "Hora Lagna", "Upapada Lagna (UL)"
  sign: Sign
  sign_no?: number
  house?: number
  degree?: string | null
  degree_decimal?: number | null
  notes?: string
}

// ─── Karakas ────────────────────────────────────────────────────────

interface Karaka {
  type?: string                               // e.g. "Atma Karaka" (sample/vedic_chart format)
  role?: string                               // e.g. "Atma Karaka (AK)" (djma format)
  planet: string
  degree?: string | null
  degree_decimal?: number | null
  sign?: Sign | null
  signification?: string | null
  notes?: string | null
}

interface CharaKarakaSequence {
  rank: number
  role: string
  planet: string
  degree_in_sign: number
  note?: string
}

// ─── Upagrahas ──────────────────────────────────────────────────────

interface Upagraha {
  name: string
  sign: Sign
  sign_no: number
  degree?: string
  degree_decimal?: number
  house?: number
}

// ─── Nakshatra Disha ────────────────────────────────────────────────

interface NakshatraDisha {
  body: string
  nakshatra: string
  direction: string                           // "North" | "South" | "East" | "West"
}

// ─── Saturn Transits ────────────────────────────────────────────────

interface SadeSati {
  active: boolean
  percent_complete?: number
  start?: string
  end?: string
  current_phase?: string
  notes?: string
}

interface SaturnTransitEntry {
  period_label?: string
  type?: string
  start_date?: string
  end_date?: string
  description?: string
  active?: boolean
  notes?: string
}

interface SaturnTransits {
  sade_sati?: SadeSati
  sade_sati_note?: string
  current_status_2026_07_02?: string
  ashtama_shani?: { active: boolean; notes?: string }
  kantaka_shani?: { active: boolean; notes?: string }
  moon_based_transits?: SaturnTransitEntry[]
  ascendant_based_transits?: SaturnTransitEntry[]
}

// ─── Varna Charts (D2, D3, D7 lagna signs) ─────────────────────────

interface VarnaChart {
  varga: string                               // e.g. "V5 (Saptamsa / D7)"
  signification: string
  lagna_sign: Sign
  note?: string
}

// ─── Root Schema ────────────────────────────────────────────────────

interface ChartInputV1 {
  /** ─── REQUIRED SECTIONS ─── */

  meta: ChartMeta
  natal_nakshatras: NatalPlanet[]             // Exactly 9 entries (Sun–Ketu)

  divisional_charts: {
    D1_Rasi: DivisionalChart                  // REQUIRED
    D4_Chaturthamsa: DivisionalChart          // REQUIRED
    D9_Navamsa: DivisionalChart               // REQUIRED
    D10_Dasamsa: DivisionalChart              // REQUIRED
    D30_Trimshamsa: DivisionalChart           // REQUIRED
    D7_Saptamsa?: DivisionalChart             // OPTIONAL (Phase 2 — progeny analysis)
  }

  shadbala: ShadbalaEntry[]                   // Min 7 entries (classical planets)

  ashtakavarga: Ashtakavarga                  // REQUIRED (SAV minimum)

  /** ─── OPTIONAL SECTIONS ─── */

  vimshottari_dasha?: VimshottariDashaInput   // Legacy — stored for audit, IGNORED by agents
  special_lagnas?: SpecialLagna[]             // Enriches wealth (Sree/Hora) and marriage (UL) analysis
  karakas?: Karaka[]                          // AK/AmK/etc. — can be derived from degrees if absent
  karakas_chara?: { sequence: CharaKarakaSequence[]; note?: string }
  upagrahas?: Upagraha[]                      // Sub-planets (Gulika, Maandi, etc.)
  nakshatra_disha?: NakshatraDisha[]          // Directional analysis
  saturn_transits?: SaturnTransits            // Transit data (time-dependent — may be stale)
  varna_charts?: VarnaChart[]                 // D2/D3/D7 lagna signs from panel
  outer_planets_note?: Record<string, any>    // Uranus/Neptune/Pluto notes (non-classical)
}
```

---

## Validation Rules (Applied at Submission)

### Hard failures (reject the chart)
| Rule | Description |
|---|---|
| V1 | `meta.client_name` must be non-empty string |
| V2 | `meta.birth_datetime` must be valid ISO 8601 with timezone |
| V3 | `meta.lagna_sign` must be one of the 12 zodiac signs |
| V4 | `meta.lagna_degree_decimal` must be 0–30 |
| V5 | `natal_nakshatras` must contain exactly 9 entries, one for each classical planet |
| V6 | Each `natal_nakshatras[].degree_decimal` must be 0–30 |
| V7 | Each `natal_nakshatras[].house` must be 1–12 |
| V8 | Each `natal_nakshatras[].sign_no` must be 1–12 and match the named sign |
| V9 | Each `natal_nakshatras[].pada` must be 1–4 |
| V10 | `divisional_charts.D1_Rasi.houses` must have exactly 12 entries |
| V11 | All required divisional charts (D1, D4, D9, D10, D30) must be present |
| V12 | Each divisional chart `.houses` must have exactly 12 entries with unique house numbers 1–12 |
| V13 | `shadbala` must contain at least 7 entries covering Sun through Saturn |
| V14 | `ashtakavarga` must have SAV data (either `sarvashtakavarga` or `sarvashtakavarga_by_house`) |
| V15 | Moon entry in `natal_nakshatras` must exist (required for dasha computation) |

### Soft warnings (accept but flag)
| Rule | Description |
|---|---|
| W1 | If `vimshottari_dasha` is present, note it will be ignored (engine computes) |
| W2 | If `meta.gender` is absent, default to 'male' for karaka assignment in 2G |
| W3 | If `saturn_transits` present, warn data may be stale (time-dependent) |
| W4 | If `special_lagnas` absent, UL-based marriage analysis in 2G will be limited |
| W5 | If `D7_Saptamsa` absent, progeny analysis in 2G will be unavailable |
| W6 | If `individual_planet_av` absent in ashtakavarga, per-planet house strength unavailable for 2B |

### Consistency checks (accept but flag)
| Rule | Description |
|---|---|
| C1 | For each planet, `sign` + `house` must be consistent with `meta.lagna_sign` (sign_no - lagna_sign_no + 1 mod 12 = house) |
| C2 | Rahu and Ketu must be exactly 180° apart (same degree, signs 6 apart) |
| C3 | Planet occupants in `D1_Rasi.houses` must match planets listed in `natal_nakshatras` |

---

## Key Decisions Documented

| Decision | Choice | Rationale |
|---|---|---|
| `birth_datetime` required | Yes | Sole anchor for deterministic dasha computation (365.2425 days/year) |
| `client_name` required | Yes | Used in report filenames, UI display, and client management |
| `vimshottari_dasha` optional | Yes — stored for audit, ignored by agents | Engine computes authoritative tree; legacy input may have arithmetic errors |
| `gender` optional with default | Default 'male' | Affects only 2G marriage karaka selection (Venus vs Jupiter as spouse indicator) |
| `D7_Saptamsa` optional | Yes (Phase 2) | Not present in any current sample; needed for progeny analysis |
| `saturn_transits` optional | Yes | Time-dependent data that goes stale; engine should eventually compute from ephemeris |
| Shadbala `planet` vs `body` | Accept both | Samples are inconsistent; normalise in the validation layer |
| SAV format variants | Accept both (by_sign and by_house) | djma uses house-indexed, others use sign-indexed; normalise on load |
| `karakas` optional | Yes | Can be derived from `natal_nakshatras[].degree_decimal` (highest = AK, etc.) |

---

## Migration Notes

### `djma.json` → ChartInputV1
- Add `meta.client_name` (must be supplied by practitioner)
- Add `meta.birth_datetime` (must be supplied by practitioner — not in screenshots)
- Rename `meta.ascendant` → keep as-is, but ensure `meta.lagna_sign` is populated
- `meta.lagna_degree` is string `"6°48'"` — extract `lagna_degree_decimal: 6.8`
- `shadbala[].body` → normalise to `planet` field (or accept both)
- `ashtakavarga.sarvashtakavarga_by_house` → normalise to `sarvashtakavarga.by_sign` format
- `vimshottari_dasha` → keep in input for audit, mark as ignored

### `vedic_chart_FINAL.json` → ChartInputV1
- Add `meta.client_name`
- Add `meta.birth_datetime`
- Already uses `lagna_degree` as decimal — rename to `lagna_degree_decimal`
- Shadbala uses `planet` + `total` — map `total` → `total_shadbala_virupas` or accept alias

### `sample.json` → ChartInputV1
- Add `meta.client_name`
- Add `meta.birth_datetime`
- `meta.lagna_degree: 15.5` → rename to `lagna_degree_decimal`
- Already clean format; minimal changes needed
