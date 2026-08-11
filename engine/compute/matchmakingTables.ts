/**
 * engine/compute/matchmakingTables.ts — Static reference tables for the
 * Ashtakoota (Guna Milan) marriage-matching engine (`matchmaking.ts`).
 *
 * PURITY GUARANTEE: pure data + pure lookup functions. No ephemeris, LLM,
 * network, DB, or file I/O. Nothing here throws.
 *
 * PROVENANCE: every table below is hand-transcribed from published classical /
 * secondary Vedic-astrology reference works (the standard Ashtakoota tables
 * reproduced in most Hindu marriage-matching manuals and Muhurta texts — e.g.
 * the nakshatra Gana/Yoni/Nadi assignment and the 36-point koota scheme as
 * popularised by 20th-century almanac ("Panchang") compilers). Per
 * `.kiro/specs/marriage-matchmaking/design.md` (Requirement 12.5 / OD-13),
 * NONE of this was copied from PyJHora's Python source or CSV output —
 * PyJHora is used only as an external, local, never-vendored oracle in a
 * later task to VERIFY these tables, not to supply them. Cells this author
 * was not fully confident transcribing are flagged inline with `UNCERTAIN:`
 * comments and are called out again in the implementation report — they are
 * exactly the cells the task 9 oracle sweep should target first.
 *
 * Spec: .kiro/specs/marriage-matchmaking/
 */

// ─── Small enums (local to this module — not shared cross-domain types) ──

export type Gana = 'Deva' | 'Manushya' | 'Rakshasa'
export type Nadi = 'Aadi' | 'Madhya' | 'Antya'
export type Varna = 'Brahmin' | 'Kshatriya' | 'Vaishya' | 'Shudra'
export type VashyaGroup = 'Manav' | 'Vanachar' | 'Chatushpad' | 'Jalachar' | 'Keet'
export type YoniGender = 'M' | 'F'

export interface NakshatraAttributes {
  nakshatraNumber: number // 1..27
  name: string
  gana: Gana
  yoniAnimal: string
  yoniGender: YoniGender
  nadi: Nadi
}

export interface RashiAttributes {
  rashiNumber: number // 1..12
  name: string
  varna: Varna
  vashya: VashyaGroup
}

// ─── 1.1 Per-nakshatra attribute table (27 entries) ──────────────────────
//
// PROVENANCE: Gana / Yoni(animal+gender) / Nadi assignment as transcribed
// from the standard Ashtakoota nakshatra table reproduced across classical
// marriage-matching compilations (the same 27-row Deva/Manushya/Rakshasa,
// 14-animal Yoni, and Aadi/Madhya/Antya Nadi assignment used in Muhurta
// Chintamani-derived Panchang tables and B.V. Raman's "Hindu Predictive
// Astrology" Ashtakoota chapter). NOT transcribed from PyJHora.
//
// Internal consistency check performed while transcribing: the Nadi column
// below follows the clean repeating period-6 zigzag pattern
// Aadi,Madhya,Antya,Antya,Madhya,Aadi (4x, then a final partial Aadi,Madhya,
// Antya for nakshatras 25-27) that the classical assignment is known to
// follow — this internal regularity is itself the check that the transcribed
// values line up, independent of any external source.
//
// Yoni note: 14 animals cannot divide evenly across 27 nakshatras (14x2=28
// slots for a 2-per-animal split would need 28, not 27) — Mongoose (Nakula,
// nakshatra 21, Uttara Ashadha) is the classical singleton, used once rather
// than twice. This is arithmetic, not a transcription gap; see the
// completeness test's "singleton" assertion.
export const NAKSHATRA_ATTRIBUTES: Record<number, NakshatraAttributes> = {
  1:  { nakshatraNumber: 1,  name: 'Ashwini',           gana: 'Deva',     yoniAnimal: 'Horse',     yoniGender: 'M', nadi: 'Aadi' },
  2:  { nakshatraNumber: 2,  name: 'Bharani',           gana: 'Manushya', yoniAnimal: 'Elephant',  yoniGender: 'M', nadi: 'Madhya' },
  3:  { nakshatraNumber: 3,  name: 'Krittika',          gana: 'Rakshasa', yoniAnimal: 'Sheep',     yoniGender: 'F', nadi: 'Antya' },
  4:  { nakshatraNumber: 4,  name: 'Rohini',            gana: 'Manushya', yoniAnimal: 'Serpent',   yoniGender: 'M', nadi: 'Antya' },
  5:  { nakshatraNumber: 5,  name: 'Mrigashira',        gana: 'Deva',     yoniAnimal: 'Serpent',   yoniGender: 'F', nadi: 'Madhya' },
  6:  { nakshatraNumber: 6,  name: 'Ardra',             gana: 'Manushya', yoniAnimal: 'Dog',       yoniGender: 'F', nadi: 'Aadi' },
  7:  { nakshatraNumber: 7,  name: 'Punarvasu',         gana: 'Deva',     yoniAnimal: 'Cat',       yoniGender: 'F', nadi: 'Aadi' },
  8:  { nakshatraNumber: 8,  name: 'Pushya',            gana: 'Deva',     yoniAnimal: 'Sheep',     yoniGender: 'M', nadi: 'Madhya' },
  9:  { nakshatraNumber: 9,  name: 'Ashlesha',          gana: 'Rakshasa', yoniAnimal: 'Cat',       yoniGender: 'M', nadi: 'Antya' },
  10: { nakshatraNumber: 10, name: 'Magha',             gana: 'Rakshasa', yoniAnimal: 'Rat',       yoniGender: 'M', nadi: 'Antya' },
  11: { nakshatraNumber: 11, name: 'Purva Phalguni',    gana: 'Manushya', yoniAnimal: 'Rat',       yoniGender: 'F', nadi: 'Madhya' },
  12: { nakshatraNumber: 12, name: 'Uttara Phalguni',   gana: 'Manushya', yoniAnimal: 'Cow',       yoniGender: 'M', nadi: 'Aadi' },
  13: { nakshatraNumber: 13, name: 'Hasta',             gana: 'Deva',     yoniAnimal: 'Buffalo',   yoniGender: 'F', nadi: 'Aadi' },
  14: { nakshatraNumber: 14, name: 'Chitra',            gana: 'Rakshasa', yoniAnimal: 'Tiger',     yoniGender: 'F', nadi: 'Madhya' },
  15: { nakshatraNumber: 15, name: 'Swati',             gana: 'Deva',     yoniAnimal: 'Buffalo',   yoniGender: 'M', nadi: 'Antya' },
  16: { nakshatraNumber: 16, name: 'Vishakha',          gana: 'Rakshasa', yoniAnimal: 'Tiger',     yoniGender: 'M', nadi: 'Antya' },
  17: { nakshatraNumber: 17, name: 'Anuradha',          gana: 'Deva',     yoniAnimal: 'Deer',      yoniGender: 'F', nadi: 'Madhya' },
  18: { nakshatraNumber: 18, name: 'Jyeshtha',          gana: 'Rakshasa', yoniAnimal: 'Deer',      yoniGender: 'M', nadi: 'Aadi' },
  19: { nakshatraNumber: 19, name: 'Mula',              gana: 'Rakshasa', yoniAnimal: 'Dog',       yoniGender: 'M', nadi: 'Aadi' },
  20: { nakshatraNumber: 20, name: 'Purva Ashadha',     gana: 'Manushya', yoniAnimal: 'Monkey',    yoniGender: 'M', nadi: 'Madhya' },
  21: { nakshatraNumber: 21, name: 'Uttara Ashadha',    gana: 'Manushya', yoniAnimal: 'Mongoose',  yoniGender: 'M', nadi: 'Antya' },
  22: { nakshatraNumber: 22, name: 'Shravana',          gana: 'Deva',     yoniAnimal: 'Monkey',    yoniGender: 'F', nadi: 'Antya' },
  23: { nakshatraNumber: 23, name: 'Dhanishtha',        gana: 'Rakshasa', yoniAnimal: 'Lion',      yoniGender: 'F', nadi: 'Madhya' },
  // UNCERTAIN: Shatabhisha's Yoni animal/gender (Horse, F) is transcribed
  // from memory of the standard table and not cross-checked against a primary
  // text in this pass — flagged for the task 9 oracle sweep.
  24: { nakshatraNumber: 24, name: 'Shatabhisha',       gana: 'Rakshasa', yoniAnimal: 'Horse',     yoniGender: 'F', nadi: 'Aadi' },
  25: { nakshatraNumber: 25, name: 'Purva Bhadrapada',  gana: 'Manushya', yoniAnimal: 'Lion',      yoniGender: 'M', nadi: 'Aadi' },
  26: { nakshatraNumber: 26, name: 'Uttara Bhadrapada', gana: 'Manushya', yoniAnimal: 'Cow',       yoniGender: 'F', nadi: 'Madhya' },
  27: { nakshatraNumber: 27, name: 'Revati',            gana: 'Deva',     yoniAnimal: 'Elephant',  yoniGender: 'F', nadi: 'Antya' },
}

// ─── 1.2 Per-rashi attribute table (12 entries) ──────────────────────────
//
// PROVENANCE: Varna is the standard element-based assignment (water→Brahmin,
// fire→Kshatriya, earth→Vaishya, air→Shudra) given in every classical
// Ashtakoota treatment (matches design.md's Koota Specifications table).
// Vashya is the standard single-rashi-per-group simplification used by
// almanac-style guna-milan tables (as opposed to the half-sign-split
// treatment some texts give Sagittarius/Capricorn — see UNCERTAIN notes).
export const VARNA_RANK: Record<Varna, number> = {
  Brahmin: 4,
  Kshatriya: 3,
  Vaishya: 2,
  Shudra: 1,
}

export const RASHI_ATTRIBUTES: Record<number, RashiAttributes> = {
  1:  { rashiNumber: 1,  name: 'Aries',       varna: 'Kshatriya', vashya: 'Chatushpad' },
  2:  { rashiNumber: 2,  name: 'Taurus',      varna: 'Vaishya',   vashya: 'Chatushpad' },
  3:  { rashiNumber: 3,  name: 'Gemini',      varna: 'Shudra',    vashya: 'Manav' },
  4:  { rashiNumber: 4,  name: 'Cancer',      varna: 'Brahmin',   vashya: 'Jalachar' },
  5:  { rashiNumber: 5,  name: 'Leo',         varna: 'Kshatriya', vashya: 'Vanachar' },
  6:  { rashiNumber: 6,  name: 'Virgo',       varna: 'Vaishya',   vashya: 'Manav' },
  7:  { rashiNumber: 7,  name: 'Libra',       varna: 'Shudra',    vashya: 'Manav' },
  8:  { rashiNumber: 8,  name: 'Scorpio',     varna: 'Brahmin',   vashya: 'Keet' },
  // UNCERTAIN (task 9.3 investigated, unresolved — see VASHYA_MATRIX's
  // provenance comment): Sagittarius is classically a dual (half-human/
  // half-animal) sign; some texts split its Vashya as Manav (front half) /
  // Chatushpad (back half) rather than assigning one group to the whole
  // rashi. The oracle sweep confirms PyJHora does NOT use this single-group
  // simplification, but its actual sub-pattern isn't attributable to any
  // classical source this project has access to. 'Manav' remains the
  // common single-rashi simplification used here.
  9:  { rashiNumber: 9,  name: 'Sagittarius', varna: 'Kshatriya', vashya: 'Manav' },
  // UNCERTAIN (task 9.3 investigated, unresolved — see VASHYA_MATRIX's
  // provenance comment): Capricorn is likewise dual (goat-fronted, fish/
  // crocodile-tailed makara); some texts split it Chatushpad (front) /
  // Jalachar (back) rather than assigning one group to the whole rashi.
  // 'Chatushpad' remains the common single-rashi simplification used here.
  10: { rashiNumber: 10, name: 'Capricorn',   varna: 'Vaishya',   vashya: 'Chatushpad' },
  11: { rashiNumber: 11, name: 'Aquarius',    varna: 'Shudra',    vashya: 'Manav' },
  12: { rashiNumber: 12, name: 'Pisces',      varna: 'Brahmin',   vashya: 'Jalachar' },
}

// ─── 1.3 Pairwise scoring matrices ────────────────────────────────────────

/**
 * Varna compatibility (max 1). Directional per design.md's Koota
 * Specifications #1: 1 point when the GROOM's Varna rank >= the BRIDE's,
 * else 0. Implemented as a rank comparison (VARNA_RANK above), not a matrix,
 * since the rule is a simple inequality, not a lookup table with independent
 * cells.
 *
 * TASK 9.3 — checked against the PyJHora/JHora oracle sweep: 14 of the 16
 * ordered varna pairs matched exactly (87.5%; the Brahmin/Kshatriya/
 * Shudra relationships to everything are all confirmed correct). The two
 * mismatches are both the same adjacent pair, inverted: PyJHora scores
 * bride=Shudra/groom=Vaishya as 0 (we score 1) and bride=Vaishya/
 * groom=Shudra as 1 (we score 0) — as if Vaishya and Shudra were swapped in
 * VARNA_RANK, while Brahmin and Kshatriya stay exactly where classical
 * sources universally put them. DELIBERATELY NOT ADOPTED: swapping
 * Vaishya/Shudra would contradict the single most universally taught
 * Ashtakoota ordering (Brahmin > Kshatriya > Vaishya > Shudra, sourced
 * independently of PyJHora), for a change that affects only 1 of 36 points
 * in one specific adjacent pairing — the shape of an isolated
 * implementation quirk, not a documented alternate convention. Recorded as
 * a known, un-adopted divergence in docs/computation_matchmaking.md.
 */

/**
 * Vashya compatibility matrix (max 2). PROVENANCE (task 9.3, settled against
 * the PyJHora/JHora oracle — see scripts/oracle/README.md): this module's
 * original hand-transcription assumed a SYMMETRIC 5-group matrix. A full
 * 11,664-combination oracle sweep (scripts/oracle/analyze_vashya.ts) proved
 * that assumption wrong in two ways:
 *
 *   1. NOT fully symmetric — Keet (Scorpio) scores DIRECTIONALLY against
 *      Chatushpad and Jalachar: bride=Chatushpad/groom=Keet scores 2, but
 *      bride=Keet/groom=Chatushpad scores only 1 (same pattern for
 *      Jalachar). `vashyaPoints(a, b)` is therefore NOT interchangeable with
 *      `vashyaPoints(b, a)` — callers must pass (bride, groom) in that
 *      order, exactly as `scoreVashya` already does.
 *   2. Every other off-diagonal cell (10 of the 12 rashis — everything
 *      except Sagittarius/Capricorn) IS cleanly group-based: every rashi
 *      within one VashyaGroup produced byte-identical oracle rows, verified
 *      with 81-1296 samples per cell and zero internal inconsistency.
 *
 * UNRESOLVED (deliberately NOT modeled here): Sagittarius and Capricorn are
 * classically dual (dwiswabhava) signs, and the oracle confirms PyJHora does
 * NOT use the single-group simplification below for them — but the actual
 * sub-pattern found (scripts/oracle/derive_dual_split.ts) does not reduce to
 * a simple contiguous front-half/back-half degree split: within a single
 * nakshatra of Sagittarius, consecutive pada-pairs alternate between the
 * Manav-equivalent and Chatushpad-equivalent rows in a way no classical
 * source this project has access to documents. Reverse-engineering an
 * undocumented tool's internal degree logic and presenting it as sourced
 * classical fact would be worse than the existing simplification, so
 * Sagittarius/Capricorn keep the single-VashyaGroup treatment from
 * RASHI_ATTRIBUTES (see its own UNCERTAIN notes) until a real primary source
 * settles it. See docs/computation_matchmaking.md's KNOWN DIVERGENCE table.
 */
export const VASHYA_GROUPS: VashyaGroup[] = ['Manav', 'Vanachar', 'Chatushpad', 'Jalachar', 'Keet']

export const VASHYA_MATRIX: Record<VashyaGroup, Record<VashyaGroup, number>> = {
  Manav:      { Manav: 2, Vanachar: 0, Chatushpad: 0.5, Jalachar: 0, Keet: 0 },
  Vanachar:   { Manav: 0, Vanachar: 2, Chatushpad: 0,   Jalachar: 2, Keet: 0 },
  Chatushpad: { Manav: 0.5, Vanachar: 0, Chatushpad: 2, Jalachar: 1, Keet: 2 },
  Jalachar:   { Manav: 0, Vanachar: 2, Chatushpad: 1,   Jalachar: 2, Keet: 2 },
  Keet:       { Manav: 0, Vanachar: 0, Chatushpad: 1,   Jalachar: 1, Keet: 2 },
}

/**
 * Lookup helper — NOT symmetric (see PROVENANCE above): `a` must be the
 * bride's group and `b` the groom's group, matching every call site in
 * `matchmaking.ts`'s `scoreVashya`.
 */
export function vashyaPoints(a: VashyaGroup, b: VashyaGroup): number {
  return VASHYA_MATRIX[a][b]
}

/**
 * Tara koota (max 3). PROVENANCE: the standard 9-tara (Janma/Sampat/
 * Vipat/Kshema/Pratyak/Sadhana/Naidhana/Mitra/Parama-Mitra) cycle used in
 * every classical Ashtakoota treatment — remainders 3 (Vipat), 5 (Pratyak),
 * and 7 (Naidhana/Vadha) are inauspicious; the rest are auspicious.
 * 1.5 points are awarded per favorable direction (bride→groom,
 * groom→bride), for a max of 3 — but see `TARA_TOTAL_OVERRIDE_REMAINDERS`
 * below for an exception that pre-empts this per-direction split entirely.
 */
export const TARA_INAUSPICIOUS_REMAINDERS: ReadonlySet<number> = new Set([3, 5, 7])

/**
 * TASK 9.3: an ADDITIONAL, WHOLE-SCORE override, distinct from the
 * per-direction `TARA_INAUSPICIOUS_REMAINDERS` check above — settled
 * against the PyJHora/JHora oracle sweep (scripts/oracle/analyze_oracle.ts
 * Step 4 + scripts/oracle/verify_tara2.ts), 100% match across all 11,664
 * combinations. When EITHER direction's remainder is 1 (Janma — same
 * nakshatra) or 9 (Parama Mitra), the koota scores 0 TOTAL — not "0 for that
 * direction, 1.5 for the other" the way a same-nakshatra-only or
 * Parama-Mitra-only case would under the ordinary per-direction rule.
 * (Confirmed NOT equivalent to simply adding 1 and 9 to
 * TARA_INAUSPICIOUS_REMAINDERS and reusing the per-direction sum — that
 * cheaper-looking fix was tried first and verified WRONG: it computes 1.5
 * for the (remainder 2, remainder 9) case, where the oracle shows a uniform,
 * unconditional 0.) This is a genuine departure from the single most
 * commonly taught version of Tara koota (the {3,5,7}-only rule) — adopted
 * here because JHora is the best available second opinion for this project
 * (PyJHora explicitly ports PVR Narasimha Rao's own JHora software; neither
 * his textbook nor JHora's own site documents this table in prose to
 * cross-check against). See docs/computation_matchmaking.md's KNOWN
 * DIVERGENCE table and `scoreTara` in matchmaking.ts for where this is
 * applied.
 */
export const TARA_TOTAL_OVERRIDE_REMAINDERS: ReadonlySet<number> = new Set([1, 9])

/**
 * Count nakshatras from `fromNakshatra` to `toNakshatra` inclusive (1-27),
 * wrapping mod 27, then reduced mod 9 (a remainder of 0 is treated as 9 —
 * the 9th/final tara in the cycle, not "no distance"). Pure arithmetic.
 */
export function taraRemainder(fromNakshatra: number, toNakshatra: number): number {
  const count = (((toNakshatra - fromNakshatra + 27) % 27) + 1) // 1..27
  const remainder = count % 9
  return remainder === 0 ? 9 : remainder
}

/** True when a Tara remainder (1-9) is one of the three inauspicious taras. */
export function isTaraInauspicious(remainder: number): boolean {
  return TARA_INAUSPICIOUS_REMAINDERS.has(remainder)
}

/** True when a Tara remainder (1-9) triggers the whole-score override — see TARA_TOTAL_OVERRIDE_REMAINDERS. */
export function isTaraTotalOverride(remainder: number): boolean {
  return TARA_TOTAL_OVERRIDE_REMAINDERS.has(remainder)
}

/**
 * Yoni koota (max 4), five tiers. PROVENANCE: the 14 classical Yoni animals
 * (Ashwa/Gaja/Mesha/Sarpa/Shwan/Marjara/Mushaka/Gau/Mahisha/Vyaghra/Mriga/
 * Vanara/Nakula/Simha) and the 7 canonical "Vaira" (bitter-enemy) pairs
 * (Horse-Buffalo, Elephant-Lion, Sheep-Monkey, Serpent-Mongoose, Dog-Deer,
 * Cat-Rat, Tiger-Cow) are the most consistently reproduced part of the
 * classical Yoni table across sources — HIGH confidence.
 *
 * TASK 9.3 — the graded "friendly" (3) / "neutral" (2) / "enemy, not
 * bitter" (1) classification for the ~77 off-diagonal pairs is now settled
 * against the PyJHora/JHora oracle sweep (scripts/oracle/derive_yoni.ts):
 * fully symmetric (0 of 91 unique pairs directional) and fully consistent
 * (every one of the 91 pairs a single constant value, 64-128 samples each,
 * zero noise). The 7 canonical Vaira (bitter-enemy, 0) pairs were already
 * exactly correct — confirmed unchanged. The enemy(1)/friendly(3) lists
 * below are a full replacement of the original hand-picked predator/prey
 * heuristic (which covered only 6 pairs each); the oracle found 27 enemy(1)
 * pairs and 14 friendly(3) pairs. Everything not listed in any tier
 * defaults to neutral (2), unchanged.
 */
export const YONI_ANIMALS: readonly string[] = [
  'Horse', 'Elephant', 'Sheep', 'Serpent', 'Dog', 'Cat', 'Rat',
  'Cow', 'Buffalo', 'Tiger', 'Deer', 'Monkey', 'Mongoose', 'Lion',
]

/** The 7 canonical bitter-enemy (Vaira) pairs — HIGH confidence. */
const YONI_VAIRA_PAIRS: [string, string][] = [
  ['Horse', 'Buffalo'],
  ['Elephant', 'Lion'],
  ['Sheep', 'Monkey'],
  ['Serpent', 'Mongoose'],
  ['Dog', 'Deer'],
  ['Cat', 'Rat'],
  ['Tiger', 'Cow'],
]

/** Pairs graded "enemy" (1) — settled against the oracle sweep, see PROVENANCE above. */
const YONI_ENEMY_PAIRS: [string, string][] = [
  ['Cow', 'Horse'],
  ['Horse', 'Tiger'],
  ['Deer', 'Horse'],
  ['Horse', 'Lion'],
  ['Elephant', 'Tiger'],
  ['Dog', 'Sheep'],
  ['Rat', 'Sheep'],
  ['Sheep', 'Tiger'],
  ['Lion', 'Sheep'],
  ['Cat', 'Serpent'],
  ['Rat', 'Serpent'],
  ['Cow', 'Serpent'],
  ['Buffalo', 'Serpent'],
  ['Dog', 'Rat'],
  ['Dog', 'Tiger'],
  ['Dog', 'Mongoose'],
  ['Dog', 'Lion'],
  ['Cat', 'Tiger'],
  ['Cat', 'Lion'],
  ['Mongoose', 'Rat'],
  ['Cow', 'Lion'],
  ['Buffalo', 'Tiger'],
  ['Buffalo', 'Lion'],
  ['Deer', 'Tiger'],
  ['Monkey', 'Tiger'],
  ['Lion', 'Tiger'],
  ['Deer', 'Lion'],
]

/** Pairs graded "friendly" (3) — settled against the oracle sweep, see PROVENANCE above. */
const YONI_FRIEND_PAIRS: [string, string][] = [
  ['Horse', 'Serpent'],
  ['Horse', 'Monkey'],
  ['Elephant', 'Sheep'],
  ['Elephant', 'Serpent'],
  ['Buffalo', 'Elephant'],
  ['Elephant', 'Monkey'],
  ['Cow', 'Sheep'],
  ['Buffalo', 'Sheep'],
  ['Mongoose', 'Sheep'],
  ['Cat', 'Deer'],
  ['Cat', 'Monkey'],
  ['Buffalo', 'Cow'],
  ['Cow', 'Deer'],
  ['Mongoose', 'Monkey'],
]

function pairKey(a: string, b: string): string {
  return [a, b].sort().join('/')
}

function buildYoniMatrix(): Record<string, Record<string, number>> {
  const vaira = new Set(YONI_VAIRA_PAIRS.map(([a, b]) => pairKey(a, b)))
  const enemy = new Set(YONI_ENEMY_PAIRS.map(([a, b]) => pairKey(a, b)))
  const friend = new Set(YONI_FRIEND_PAIRS.map(([a, b]) => pairKey(a, b)))

  const matrix: Record<string, Record<string, number>> = {}
  for (const a of YONI_ANIMALS) {
    matrix[a] = {}
    for (const b of YONI_ANIMALS) {
      if (a === b) {
        matrix[a][b] = 4 // same yoni
        continue
      }
      const key = pairKey(a, b)
      if (vaira.has(key)) matrix[a][b] = 0
      else if (enemy.has(key)) matrix[a][b] = 1
      else if (friend.has(key)) matrix[a][b] = 3
      else matrix[a][b] = 2 // neutral default
    }
  }
  return matrix
}

/** 14x14 Yoni compatibility matrix, built once at module load. */
export const YONI_MATRIX: Record<string, Record<string, number>> = buildYoniMatrix()

/** Lookup helper — symmetric by construction. */
export function yoniPoints(a: string, b: string): number | undefined {
  return YONI_MATRIX[a]?.[b]
}

/**
 * Graha Maitri koota (max 5), naisargika-only. PROVENANCE: the standard
 * compound-relationship points table published for Graha Maitri koota —
 * same planet (both Moon-rashi lords identical) → 5; mutual friends → 5;
 * friend+neutral (either order) → 4; mutual neutral → 3; neutral+enemy
 * (either order) → 0.5; friend+enemy (either order) → 1; mutual enemy → 0.
 *
 * TASK 9.3 — settled against the PyJHora/JHora oracle sweep
 * (scripts/oracle/analyze_oracle.ts): the friend/neutral (4) and
 * neutral/neutral (3) bands matched the original transcription exactly (the
 * "shift the whole scale down a band" alternative design.md flagged as
 * possible was tested and REFUTED — those cells are correct as originally
 * transcribed). The only correction is WHERE the single 0.5 exception sits:
 * originally placed at friend+enemy, but the oracle (2,754/2,754 friend+
 * friend, 1,620/1,620 neutral+enemy, 162/162 friend+enemy samples, zero
 * noise) shows it belongs at neutral+enemy instead — friend+enemy scores a
 * full 1, not 0.5.
 */
export type NaisargikaRelation = 'friend' | 'neutral' | 'enemy'

const GRAHA_MAITRI_POINTS: Record<NaisargikaRelation, Record<NaisargikaRelation, number>> = {
  friend:  { friend: 5, neutral: 4, enemy: 1 },
  neutral: { friend: 4, neutral: 3, enemy: 0.5 },
  enemy:   { friend: 1, neutral: 0.5, enemy: 0 },
}

/** Lookup helper for the combined (perspective A→B, perspective B→A) relation pair. */
export function grahaMaitriPoints(relAtoB: NaisargikaRelation, relBtoA: NaisargikaRelation): number {
  return GRAHA_MAITRI_POINTS[relAtoB][relBtoA]
}

/**
 * Gana koota (max 6), directional (bride-row / groom-column). PROVENANCE:
 * TASK 9.3 — settled against the PyJHora/JHora oracle sweep
 * (scripts/oracle/analyze_oracle.ts), 1,296 samples per cell, zero internal
 * noise. Four of the nine cells differed from the original hand-transcription
 * (including, but not limited to, the `Rakshasa→Deva` cell already flagged
 * UNCERTAIN in review — the oracle settles it at 1, not the original table's
 * anomalous 3, and NOT the commonly-guessed alternative of 0 either):
 *   - Deva→Manushya:     6 (was 5)
 *   - Deva→Rakshasa:     0 (was 1)
 *   - Manushya→Deva:     5 (was 6)
 *   - Rakshasa→Deva:     1 (was 3)
 * Deva→Deva, Manushya→Manushya, Manushya→Rakshasa, Rakshasa→Manushya, and
 * Rakshasa→Rakshasa were already correct and are unchanged.
 */
export const GANA_MATRIX: Record<Gana, Record<Gana, number>> = {
  Deva:     { Deva: 6, Manushya: 6, Rakshasa: 0 },
  Manushya: { Deva: 5, Manushya: 6, Rakshasa: 0 },
  Rakshasa: { Deva: 1, Manushya: 0, Rakshasa: 6 },
}

/** Lookup helper — directional: `bride` is the row, `groom` the column. */
export function ganaPoints(brideGana: Gana, groomGana: Gana): number {
  return GANA_MATRIX[brideGana][groomGana]
}

// ─── 1.4 Bhakoot (rashi-distance) and Nadi (same/different) rules ────────

/**
 * Bhakoot koota (max 7). PROVENANCE: the classical rashi-distance rule —
 * when the count from one Moon-rashi to the other (either direction, 1-12)
 * lands on 2, 5, 6, 8, 9, or 12, the pairing is Bhakoot-dosha (0 points);
 * every other distance scores the full 7. (2↔12, 5↔9, and 6↔8 are always
 * reciprocal pairs of the same underlying rashi relationship, so checking
 * one direction's count against this set is sufficient — see the code
 * comment in `bhakootPoints`.)
 *
 * TASK 9.3 / REVIEW — checked against the PyJHora/JHora oracle sweep: 11,583
 * of 11,664 combinations matched exactly (99.3%). All 81 mismatches are the
 * SAME single rashi pair: bride=Aquarius/groom=Cancer (count 6, this module
 * scores 0; the oracle scores 7). DELIBERATELY NOT ADOPTED: this classical
 * rule is provably self-reciprocal by construction — for any two distinct
 * rashis, the bride→groom and groom→bride counts always sum to 14, so
 * whenever one direction's count lands in the dosha set {2,5,6,8,9,12}, the
 * OTHER direction's count is forced into the set too (6↔8, 2↔12, 5↔9 are
 * exactly the reciprocal pairs). The reverse direction of this exact pair
 * (bride=Cancer/groom=Aquarius, count 8) DOES agree with the oracle at 0 —
 * so the oracle's own output is asymmetric for one specific pair where the
 * underlying classical rule mathematically cannot be. That is the shape of
 * an isolated PyJHora implementation quirk (same reasoning as the Varna
 * Shudra/Vaishya non-adoption above), not a genuine alternate classical
 * convention worth breaking the rule's symmetry for. See
 * docs/computation_matchmaking.md's KNOWN DIVERGENCE table.
 */
const BHAKOOT_DOSHA_COUNTS: ReadonlySet<number> = new Set([2, 5, 6, 8, 9, 12])

/**
 * Points for the Bhakoot koota from a bride/groom Moon-rashi pair (1-12
 * each). Counts the distance bride→groom (1-12, wrapping); dosha counts
 * {2,5,6,8,9,12} always co-occur with their 14-minus-count reciprocal
 * (e.g. a count of 2 one way is always a count of 12 the other way), so a
 * single-direction check is sufficient — no need to also check groom→bride.
 */
export function bhakootPoints(brideRashi: number, groomRashi: number): number {
  const count = ((groomRashi - brideRashi + 12) % 12) + 1 // 1..12
  return BHAKOOT_DOSHA_COUNTS.has(count) ? 0 : 7
}

/**
 * Nadi koota (max 8). PROVENANCE: the classical same/different Nadi rule —
 * same Nadi (Aadi/Aadi, Madhya/Madhya, Antya/Antya) → 0 (Nadi Dosha, the
 * most heavily weighted classical dosha); different Nadi → the full 8.
 */
export function nadiPoints(brideNadi: Nadi, groomNadi: Nadi): number {
  return brideNadi === groomNadi ? 0 : 8
}

// ─── Koota maxima (Requirement 1.5 / non-negotiable constraint #6) ───────

/**
 * The 8 koota DECLARED maxima — the classical, nominal per-koota ceiling,
 * summing to the classical framework's fixed 36. This is a DISPLAY
 * CONVENTION, not a claim that every koota's max is reachable by every pair
 * — JHora/PyJHora (this engine's own oracle) shows every match's
 * Compatibility Score as a fixed "X / 36" regardless of whether that
 * specific pair could theoretically reach it, and this engine matches that
 * convention rather than computing a per-pair or per-implementation
 * "corrected" denominator. Varna is capped at 1 (NOT 3; PyJHora's own README
 * describes Varna as "0-3 points" in prose while its code uses a max of 1 —
 * only 1 makes the classical 36-point framework add up, per design.md's
 * Guiding Principle).
 *
 * Tara is a case worth understanding even though its declared max stays the
 * classical 3: `taraRemainder(bride, groom)` and `taraRemainder(groom,
 * bride)`'s raw pre-remap values always sum to 29 for two distinct
 * nakshatras (`(to-from+27)%27+1` in each direction is complementary over
 * the 27-nakshatra circle) — so at most ONE of the two directions can ever
 * be a plain-auspicious remainder, and Tara can in practice only ever
 * contribute 1.5 of its own declared 3 for any pair. This is a real,
 * documented fact about the classical rule (see
 * docs/computation_matchmaking.md's koota table) — it does not change
 * `KOOTA_MAXIMA.tara` itself, exactly as JHora's own fixed-36 display
 * doesn't adjust for it either. `scoreTara`'s `perDirection` constant is
 * hardcoded to 1.5 independently of this value, so a future edit to the
 * declared maxima here can never silently change what a real pair scores.
 */
export const KOOTA_MAXIMA = {
  varna: 1,
  vashya: 2,
  tara: 3,
  yoni: 4,
  grahaMaitri: 5,
  gana: 6,
  bhakoot: 7,
  nadi: 8,
} as const

/**
 * The classical, fixed `AshtakootaResult.maxScore` denominator — 36, always
 * — computed as the sum of `KOOTA_MAXIMA` rather than a second hardcoded
 * literal so the two can never drift apart, matching JHora's own fixed "X /
 * 36" Compatibility Score display (see `KOOTA_MAXIMA`'s doc comment for why
 * this is a deliberate convention, not a per-pair reachable ceiling).
 */
export const TOTAL_KOOTA_MAXIMA: number = Object.values(KOOTA_MAXIMA).reduce((sum, v) => sum + v, 0)

// ─── Versioning ────────────────────────────────────────────────────────

/**
 * Bumped whenever any table in this module changes (nakshatra/rashi
 * attributes, any scoring matrix, the Bhakoot/Nadi rules, or the koota
 * maxima). Stamped onto every `MatchResult` (task 4.3) and persisted on
 * every `CompatibilityMatch` row (task 6.1) so a stored snapshot always
 * records which version of these tables produced it — mirrors
 * `WEIGHTS_VERSION` in the scorer.
 */
export const MATCHMAKING_TABLES_VERSION = 'matchmaking-tables-v1.1-nadi-bhanga-fix'

/**
 * TASK 9.3 REVIEW NOTE: bumped from `v0-provisional` to `v1-oracle-verified`.
 * Every `CompatibilityMatch` row persisted under `v0-provisional` was scored
 * against the tables as they stood BEFORE this oracle-verification pass — a
 * caller reading old rows should treat `Gana`, `Graha Maitri`, `Vashya`,
 * `Yoni`, and `Tara` scores as potentially different under the current
 * tables. This module's own base tables for Varna and Bhakoot were unaffected
 * by that pass — Bhakoot's one documented, deliberately-not-adopted base-rule
 * divergence (bride=Aquarius/groom=Cancer) is unchanged from before task 9.3.
 *
 * BUMPED AGAIN to `v1.1-nadi-bhanga-fix` for a post-review fix to
 * `matchmaking.ts`'s `detectNadiCancellation` (excluding the identical-
 * nakshatra degenerate case, which previously turned the worst-case Nadi
 * result into a false 8/8 — see docs/computation_matchmaking.md's KNOWN
 * DIVERGENCE #4). This changes the Nadi score for a small subset of inputs
 * (any same-nakshatra, same-Nadi pair) even though `nadiPoints` itself — the
 * table this module owns — did not change; the cancellation LOGIC that reads
 * it, in matchmaking.ts, did. Bumped anyway because the stamp's whole purpose
 * is "which scoring behavior produced this row," and this is a real,
 * user-visible scoring change. See scripts/oracle/README.md for how the
 * sweep was run and docs/computation_matchmaking.md's KNOWN DIVERGENCE table
 * for what remains open.
 *
 * SETTLED against the PyJHora/JHora oracle (11,664-combination sweep, zero
 * internal noise per cell unless noted):
 *   - GANA_MATRIX: 4 of 9 cells corrected (Deva→Manushya, Deva→Rakshasa,
 *     Manushya→Deva, Rakshasa→Deva — including the previously-flagged
 *     Rakshasa→Deva anomaly, settled at 1, not the original 3)
 *   - GRAHA_MAITRI_POINTS: the 0.5 exception moved from friend↔enemy to
 *     neutral↔enemy; friend/neutral=4 and neutral/neutral=3 confirmed
 *     correct as originally transcribed (the "shift down a band"
 *     alternative was tested and refuted)
 *   - YONI_ENEMY_PAIRS / YONI_FRIEND_PAIRS: full replacement (27 + 14 pairs,
 *     up from 6 + 6) — the 7 Vaira pairs and same-animal diagonal were
 *     already exactly correct, confirmed unchanged
 *   - TARA_TOTAL_OVERRIDE_REMAINDERS (new): remainder 1 or 9 on either
 *     direction overrides the whole koota to 0 — not modeled as an ordinary
 *     per-direction inauspicious remainder (see its own provenance comment
 *     for why the obvious-looking simpler fix is wrong)
 *   - VASHYA_MATRIX: corrected for the 10 non-dual rashis, including a
 *     genuinely directional Keet relationship (`vashyaPoints` is no longer
 *     symmetric — see its own provenance comment)
 *
 * DELIBERATELY NOT ADOPTED (investigated, evidence recorded, judgment
 * call made against blindly following the oracle):
 *   - Varna's isolated Shudra/Vaishya inversion — contradicts the
 *     universally-taught varna hierarchy for a 1-point edge case; reads as
 *     an implementation quirk, not a documented alternate convention
 *   - Bhakoot's isolated bride=Aquarius/groom=Cancer inversion — the
 *     classical rashi-distance rule is provably self-reciprocal (both
 *     directions of any dosha-distance pair must agree), so an oracle output
 *     that disagrees only in one direction of one pair cannot be a genuine
 *     alternate classical rule; see `bhakootPoints`'s own provenance comment
 *
 * POST-REVIEW FIX (not part of the original oracle sweep — found in code
 * review, verified independently since PyJHora's bare `Ashtakoota` class has
 * no Bhanga/cancellation logic to oracle-check this against at all):
 *   - `matchmaking.ts`'s `detectNadiCancellation` no longer fires for the
 *     identical nakshatra (previously: any same-Nadi pair sharing a
 *     nakshatra lord fired the cancellation, which is trivially true when
 *     the two natives are in the exact same nakshatra — turning the worst
 *     possible Nadi result into a false full 8/8)
 *
 * STILL UNRESOLVED (investigated at length, no confident answer found):
 *   - Sagittarius/Capricorn's Vashya sub-pattern does not reduce to a
 *     simple front-half/back-half degree split; PyJHora's actual rule for
 *     these two dual signs is not attributable to any classical source this
 *     project has access to. RASHI_ATTRIBUTES keeps the single-group
 *     simplification pending a real primary source.
 *
 * PROVENANCE OF THE ORACLE ITSELF: neither PVR Narasimha Rao's textbook
 * ("Vedic Astrology: An Integrated Approach" — confirmed, via full-text
 * search of its 515 pages, to contain NO Ashtakoota/Guna Milan chapter at
 * all) nor JHora's own public site documents these tables in prose.
 * PyJHora's own README states it ports PVR Narasimha Rao's JHora software
 * directly, and JHora's UI itself uses "bride"/"bridegroom" terminology
 * (independently corroborating this module's boy=groom/girl=bride
 * calibration) — so this oracle sweep is treated as the best available
 * second opinion for this project, not as unquestionable ground truth
 * (hence the Varna non-adoption above).
 */
