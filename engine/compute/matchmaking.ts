/**
 * engine/compute/matchmaking.ts — Pure Ashtakoota (Guna Milan) matching engine.
 *
 * Scores the classical 8-koota, 36-point North Indian marriage-compatibility
 * system from each native's Moon nakshatra/pada alone — no ephemeris, LLM,
 * network, DB, or file I/O. Consumes the static reference tables in
 * `matchmakingTables.ts` (already reviewed — not re-derived here) plus
 * `nakshatras.ts`'s nakshatra-index derivation and `dignity.ts`'s
 * `PERMANENT_FRIENDSHIP` table.
 *
 * PURITY GUARANTEE: pure functions only. Never throws — a koota that hits
 * missing/malformed input reports `status: 'unavailable'` rather than
 * throwing, and `computeAshtakootaMatch` wraps the koota loop so one
 * unexpected scorer error is contained and the rest still run, mirroring
 * `yogas.ts`'s per-detector guard.
 *
 * ROLE-AWARENESS IS STRUCTURAL, NOT POSITIONAL: every scorer signature takes
 * explicitly `bride`/`groom`-named parameters (never `a`/`b`), but — per the
 * "never infer a role from argument order" rule — the parameter NAME is only
 * a calling convention, not the source of truth. Internally, every scorer
 * calls `resolveRoles(bride, groom)`, which looks at each input's OWN `role`
 * field to decide which one actually is the bride and which is the groom,
 * regardless of which argument position it arrived in. This is what makes
 * the module's stated symmetry contract (Requirement 1.3 / 10.4) hold:
 *   - `computeAshtakootaMatch(x, y)` and `computeAshtakootaMatch(y, x)` are
 *     BYTE-FOR-BYTE IDENTICAL whenever `x.role`/`y.role` are left alone —
 *     "swapping the two natives" (argument order) is a no-op, because the
 *     `role` field, not the slot, decides identity.
 *   - The only way to change which data is scored as "the bride" is to
 *     change a `.role` field itself (e.g. force whichever native now sits in
 *     the first slot to `role: 'bride'` regardless of its own prior role) —
 *     that is "swapping positional order WITHOUT swapping roles", and IS
 *     expected to change the directional kootas (Varna, and possibly Gana).
 *   - Two inputs that don't carry exactly one `'bride'` and one `'groom'`
 *     (both bride, both groom, a malformed/missing role) resolve to `null`
 *     and every koota reports `unavailable` — never a guess.
 *
 * HALF-POINTS ARE LOAD-BEARING: `points`/`gunaScore` are `number`, never
 * rounded, floored, or truncated anywhere in this module. Vashya, Graha
 * Maitri, and Tara all legitimately produce `.5` values.
 *
 * This module implements task 3 (the pure Ashtakoota engine) AND task 4
 * (Mangal Dosha + composition: `computeMangalDosha`, `detectMangalCancellation`,
 * `computeMatch`). Mangal Dosha needs Mars's sign, the lagna sign, and
 * aspects from the `planets`/`relationships` JSONB — data only compute-source
 * charts carry — so it degrades to `status: 'unavailable'` independently of
 * the 8 kootas above, which score from Moon nakshatra/pada alone and are
 * available on both paste- and compute-source charts. See the task 4 section
 * near the end of this file for the Mangal Dosha rule, sourced verbatim from
 * `prompts/domains/marriage.md`.
 *
 * Spec: .kiro/specs/marriage-matchmaking/
 */

import type {
  MatchRole,
  KootaKey,
  KootaScore,
  KootaEvidence,
  Cancellation,
  AshtakootaResult,
  MatchVerdict,
  BoundaryRisk,
  MangalDoshaNative,
  MatchResult,
  PlanetPosition,
  AspectEdge,
} from './types'
import { getNakshatraIndex, getPada, getNakshatraLord } from './nakshatras'
import { PERMANENT_FRIENDSHIP, SIGN_LORDS, OWN_SIGNS, EXALTATION_SIGNS } from './dignity'
import { NATURAL_BENEFICS } from './relationships'
import {
  NAKSHATRA_ATTRIBUTES,
  RASHI_ATTRIBUTES,
  VARNA_RANK,
  KOOTA_MAXIMA,
  TOTAL_KOOTA_MAXIMA,
  vashyaPoints,
  taraRemainder,
  isTaraInauspicious,
  isTaraTotalOverride,
  yoniPoints,
  grahaMaitriPoints,
  ganaPoints,
  bhakootPoints,
  nadiPoints,
  MATCHMAKING_TABLES_VERSION,
} from './matchmakingTables'
import type { NaisargikaRelation } from './matchmakingTables'

// ─── Input contract ────────────────────────────────────────────────────
//
// Per design.md's Input Contracts, the 8 kootas take only `(nakshatra, pada,
// role)` per native — exactly PyJHora's own `Ashtakoota` constructor key —
// so the engine is directly comparable to the reference oracle and testable
// without any birth data. `moonLongitude` is NOT part of design.md's
// illustrative `MatchNativeInput` interface; it is added here, optionally,
// so `computeAshtakootaMatch` can populate `AshtakootaResult.boundaryRisk`
// (task 3.12 / Requirement 14) — see the report's uncertainty list for why.

export interface MatchNativeInput {
  /** 1..27. */
  nakshatraNumber: number
  /** 1..4. */
  padaNumber: number
  role: MatchRole
  /**
   * Optional Moon sidereal longitude — used ONLY by `computeBoundaryRisk`
   * (Requirement 14), never by any koota scorer (which read nakshatra/pada
   * directly). Omit when unavailable; boundary risk then reports
   * `atRisk: false` with no `moonLongitude`/`distanceToBoundaryDeg` fields,
   * matching `BoundaryRisk`'s documented "present only when supplied" shape.
   */
  moonLongitude?: number
}

type Scorer = (bride: MatchNativeInput, groom: MatchNativeInput) => KootaScore

// ─── 3.1 Longitude → (nakshatra, pada, rashi) ───────────────────────────

/**
 * A pada is 3°20′ and a rashi is 30°, so 9 padas (27 nakshatras × 4 padas =
 * 108, ÷ 12 rashis = 9) always divide evenly into one rashi — the straddling
 * rashi is therefore fully determined by (nakshatraNumber, padaNumber) alone,
 * no separate longitude arithmetic needed once those two are known.
 */
function rashiFromNakshatraPada(nakshatraNumber: number, padaNumber: number): number {
  const overallPadaIndex = (nakshatraNumber - 1) * 4 + (padaNumber - 1) // 0..107
  return Math.floor(overallPadaIndex / 9) + 1 // 1..12
}

/**
 * Derives `(nakshatraNumber, padaNumber, rashiNumber)` from a Moon sidereal
 * longitude. Reuses `nakshatras.ts`'s `getNakshatraIndex`/`getPada` rather
 * than re-implementing the nakshatra-index arithmetic (Requirement 1.4).
 * Pada resolves the straddled rashi: Krittika (nakshatra 3) pada 1 falls in
 * Aries (rashi 1), padas 2-4 fall in Taurus (rashi 2).
 *
 * Pure arithmetic on `longitude`. Never throws — `getNakshatraIndex`/
 * `getPada` already normalize with `% 360` before use, and this function
 * performs no I/O that could throw.
 */
export function longitudeToNakshatraPadaRashi(longitude: number): {
  nakshatraNumber: number
  padaNumber: number
  rashiNumber: number
} {
  const nakshatraIndex = getNakshatraIndex(longitude) // 0..26
  const padaNumber = getPada(longitude) // 1..4
  const nakshatraNumber = nakshatraIndex + 1
  const rashiNumber = rashiFromNakshatraPada(nakshatraNumber, padaNumber)
  return { nakshatraNumber, padaNumber, rashiNumber }
}

// ─── Shared validation / role-resolution / evidence helpers ────────────

interface ResolvedRoles {
  bride: MatchNativeInput
  groom: MatchNativeInput
}

/**
 * Resolves which of the two supplied natives is the bride and which is the
 * groom by reading each one's OWN `role` field — NEVER by trusting the
 * parameter position (`bride`/`groom`) it was passed into. See the module
 * header for why this is what makes the role-aware symmetry contract hold.
 * Returns `null` (never throws) when the two inputs don't carry exactly one
 * `'bride'` and one `'groom'` role between them.
 */
function resolveRoles(
  nativeA: MatchNativeInput | null | undefined,
  nativeB: MatchNativeInput | null | undefined
): ResolvedRoles | null {
  if (!nativeA || !nativeB) return null
  if (nativeA.role === 'bride' && nativeB.role === 'groom') return { bride: nativeA, groom: nativeB }
  if (nativeB.role === 'bride' && nativeA.role === 'groom') return { bride: nativeB, groom: nativeA }
  return null
}

interface ValidatedNative {
  nakshatraNumber: number
  padaNumber: number
  rashiNumber: number
}

/**
 * Guards a `MatchNativeInput` down to validated, in-range values. Returns
 * `null` (never throws) when `nakshatraNumber`/`padaNumber` are missing,
 * non-integer, or out of range — the caller reports the koota `unavailable`.
 */
function validateNative(input: MatchNativeInput | null | undefined): ValidatedNative | null {
  if (!input) return null
  const { nakshatraNumber, padaNumber } = input
  if (!Number.isInteger(nakshatraNumber) || nakshatraNumber < 1 || nakshatraNumber > 27) return null
  if (!Number.isInteger(padaNumber) || padaNumber < 1 || padaNumber > 4) return null
  return { nakshatraNumber, padaNumber, rashiNumber: rashiFromNakshatraPada(nakshatraNumber, padaNumber) }
}

/** Builds a `status: 'unavailable'` `KootaScore` — never a throw. */
function unavailableKoota(key: KootaKey, name: string, maxPoints: number, reason: string): KootaScore {
  const evidence: KootaEvidence = {
    rule: `${key}.unavailable`,
    bride: {},
    groom: {},
    notes: [reason],
  }
  return { key, name, points: 0, maxPoints, status: 'unavailable', evidence }
}

const NO_VALID_ROLES_REASON = 'Inputs must carry exactly one bride role and one groom role (never inferred from argument order).'
const INVALID_NAKSHATRA_REASON = 'Missing or invalid nakshatra/pada input.'

// ─── 3.2 Varna ───────────────────────────────────────────────────────────
// Directional: 1 point when the GROOM's Varna rank >= the BRIDE's, else 0.

export function scoreVarna(bride: MatchNativeInput, groom: MatchNativeInput): KootaScore {
  const resolved = resolveRoles(bride, groom)
  if (!resolved) return unavailableKoota('varna', 'Varna', KOOTA_MAXIMA.varna, NO_VALID_ROLES_REASON)
  const b = validateNative(resolved.bride)
  const g = validateNative(resolved.groom)
  if (!b || !g) {
    return unavailableKoota('varna', 'Varna', KOOTA_MAXIMA.varna, INVALID_NAKSHATRA_REASON)
  }
  const brideRashi = RASHI_ATTRIBUTES[b.rashiNumber]
  const groomRashi = RASHI_ATTRIBUTES[g.rashiNumber]
  if (!brideRashi || !groomRashi) {
    return unavailableKoota('varna', 'Varna', KOOTA_MAXIMA.varna, 'Rashi attributes not found for the derived rashi.')
  }
  const brideRank = VARNA_RANK[brideRashi.varna]
  const groomRank = VARNA_RANK[groomRashi.varna]
  const points = groomRank >= brideRank ? KOOTA_MAXIMA.varna : 0

  return {
    key: 'varna',
    name: 'Varna',
    points,
    maxPoints: KOOTA_MAXIMA.varna,
    status: 'scored',
    evidence: {
      rule: 'varna.directional_rank',
      bride: { rashiNumber: b.rashiNumber, varna: brideRashi.varna, rank: brideRank },
      groom: { rashiNumber: g.rashiNumber, varna: groomRashi.varna, rank: groomRank },
      notes: [
        `Directional (Requirement 2.1): point awarded when the groom's Varna rank (${groomRank}) is >= the bride's (${brideRank}).`,
      ],
    },
  }
}

// ─── 3.3 Vashya ────────────────────────────────────────────────────────
// Symmetric matrix lookup, 0.5-step values preserved exactly.

export function scoreVashya(bride: MatchNativeInput, groom: MatchNativeInput): KootaScore {
  const resolved = resolveRoles(bride, groom)
  if (!resolved) return unavailableKoota('vashya', 'Vashya', KOOTA_MAXIMA.vashya, NO_VALID_ROLES_REASON)
  const b = validateNative(resolved.bride)
  const g = validateNative(resolved.groom)
  if (!b || !g) {
    return unavailableKoota('vashya', 'Vashya', KOOTA_MAXIMA.vashya, INVALID_NAKSHATRA_REASON)
  }
  const brideRashi = RASHI_ATTRIBUTES[b.rashiNumber]
  const groomRashi = RASHI_ATTRIBUTES[g.rashiNumber]
  if (!brideRashi || !groomRashi) {
    return unavailableKoota('vashya', 'Vashya', KOOTA_MAXIMA.vashya, 'Rashi attributes not found for the derived rashi.')
  }
  const points = vashyaPoints(brideRashi.vashya, groomRashi.vashya)

  return {
    key: 'vashya',
    name: 'Vashya',
    points,
    maxPoints: KOOTA_MAXIMA.vashya,
    status: 'scored',
    evidence: {
      rule: 'vashya.matrix',
      bride: { rashiNumber: b.rashiNumber, vashya: brideRashi.vashya },
      groom: { rashiNumber: g.rashiNumber, vashya: groomRashi.vashya },
    },
  }
}

// ─── 3.4 Tara ────────────────────────────────────────────────────────────
// Bidirectional nakshatra-count mod 9; 1.5 points per favorable direction —
// UNLESS TARA_TOTAL_OVERRIDE_REMAINDERS fires on either direction, in which
// case the whole koota is 0 regardless of the other direction (task 9.3;
// see matchmakingTables.ts's TARA_TOTAL_OVERRIDE_REMAINDERS provenance
// comment for why this can't be modeled as "just another inauspicious
// remainder" in the per-direction sum).

export function scoreTara(bride: MatchNativeInput, groom: MatchNativeInput): KootaScore {
  const resolved = resolveRoles(bride, groom)
  if (!resolved) return unavailableKoota('tara', 'Tara', KOOTA_MAXIMA.tara, NO_VALID_ROLES_REASON)
  const b = validateNative(resolved.bride)
  const g = validateNative(resolved.groom)
  if (!b || !g) {
    return unavailableKoota('tara', 'Tara', KOOTA_MAXIMA.tara, INVALID_NAKSHATRA_REASON)
  }
  const brideToGroomRemainder = taraRemainder(b.nakshatraNumber, g.nakshatraNumber)
  const groomToBrideRemainder = taraRemainder(g.nakshatraNumber, b.nakshatraNumber)
  // Hardcoded, NOT derived from `KOOTA_MAXIMA.tara` — the two are independent
  // by design (see KOOTA_MAXIMA.tara's own doc comment in
  // matchmakingTables.ts): this is the per-direction point value the
  // classical rule actually awards, while KOOTA_MAXIMA.tara is the declared
  // ceiling shown in evidence/UI. Deriving one from the other would make a
  // future correction to either one silently change real scores.
  const perDirection = 1.5
  const totalOverride =
    isTaraTotalOverride(brideToGroomRemainder) || isTaraTotalOverride(groomToBrideRemainder)
  const brideToGroomPoints = totalOverride || isTaraInauspicious(brideToGroomRemainder) ? 0 : perDirection
  const groomToBridePoints = totalOverride || isTaraInauspicious(groomToBrideRemainder) ? 0 : perDirection
  const points = brideToGroomPoints + groomToBridePoints

  const notes = ['Remainders of 3, 5, or 7 are inauspicious; each favorable direction contributes 1.5 points.']
  if (totalOverride) {
    notes.push(
      'Remainder 1 (Janma) or 9 (Parama Mitra) on either direction overrides the whole koota to 0 (task 9.3, oracle-settled).'
    )
  }

  return {
    key: 'tara',
    name: 'Tara',
    points,
    maxPoints: KOOTA_MAXIMA.tara,
    status: 'scored',
    evidence: {
      rule: 'tara.bidirectional_count',
      bride: {
        nakshatraNumber: b.nakshatraNumber,
        toGroomRemainder: brideToGroomRemainder,
        toGroomPoints: brideToGroomPoints,
      },
      groom: {
        nakshatraNumber: g.nakshatraNumber,
        toBrideRemainder: groomToBrideRemainder,
        toBridePoints: groomToBridePoints,
      },
      notes,
    },
  }
}

// ─── 3.5 Yoni ──────────────────────────────────────────────────────────
// Five-tier 14x14 animal-friendship lookup (same=4 ... bitter enemy=0).

export function scoreYoni(bride: MatchNativeInput, groom: MatchNativeInput): KootaScore {
  const resolved = resolveRoles(bride, groom)
  if (!resolved) return unavailableKoota('yoni', 'Yoni', KOOTA_MAXIMA.yoni, NO_VALID_ROLES_REASON)
  const b = validateNative(resolved.bride)
  const g = validateNative(resolved.groom)
  if (!b || !g) {
    return unavailableKoota('yoni', 'Yoni', KOOTA_MAXIMA.yoni, INVALID_NAKSHATRA_REASON)
  }
  const brideNak = NAKSHATRA_ATTRIBUTES[b.nakshatraNumber]
  const groomNak = NAKSHATRA_ATTRIBUTES[g.nakshatraNumber]
  if (!brideNak || !groomNak) {
    return unavailableKoota('yoni', 'Yoni', KOOTA_MAXIMA.yoni, 'Nakshatra attributes not found for the given nakshatra.')
  }
  const points = yoniPoints(brideNak.yoniAnimal, groomNak.yoniAnimal)
  if (points === undefined) {
    return unavailableKoota('yoni', 'Yoni', KOOTA_MAXIMA.yoni, 'Yoni animal pair not found in the compatibility matrix.')
  }

  return {
    key: 'yoni',
    name: 'Yoni',
    points,
    maxPoints: KOOTA_MAXIMA.yoni,
    status: 'scored',
    evidence: {
      rule: 'yoni.matrix',
      bride: { nakshatraNumber: b.nakshatraNumber, yoniAnimal: brideNak.yoniAnimal, yoniGender: brideNak.yoniGender },
      groom: { nakshatraNumber: g.nakshatraNumber, yoniAnimal: groomNak.yoniAnimal, yoniGender: groomNak.yoniGender },
    },
  }
}

// ─── 3.6 Graha Maitri ────────────────────────────────────────────────────
// NAISARGIKA (permanent) friendship ONLY, read directly from dignity.ts's
// exported PERMANENT_FRIENDSHIP table.
//
// This koota deliberately does NOT call `getVargaDignityLabel` (dignity.ts):
// that function blends in TATKALIKA (temporary, position-derived) friendship
// per its own file header, which is the wrong relation for Graha Maitri
// (Requirement 2.5, design.md OD-3). Reading `PERMANENT_FRIENDSHIP` directly
// is the only correct source here.

/**
 * Naisargika relation of `planet` toward `other`, read directly from
 * `PERMANENT_FRIENDSHIP` — NOT `dignity.ts`'s private `permanentRelation`
 * (unexported) and NOT `getVargaDignityLabel` (blends in tatkalika, wrong
 * relation for this koota). Mirrors the same friend/enemy/neutral logic
 * `dignity.ts` uses internally, but implemented locally since that helper
 * isn't exported.
 */
function naisargikaRelation(planet: string, other: string): NaisargikaRelation {
  const row = Object.prototype.hasOwnProperty.call(PERMANENT_FRIENDSHIP, planet)
    ? PERMANENT_FRIENDSHIP[planet]
    : undefined
  if (!row) return 'neutral'
  if (row.friends.includes(other)) return 'friend'
  if (row.enemies.includes(other)) return 'enemy'
  return 'neutral'
}

export function scoreGrahaMaitri(bride: MatchNativeInput, groom: MatchNativeInput): KootaScore {
  const resolved = resolveRoles(bride, groom)
  if (!resolved) return unavailableKoota('grahaMaitri', 'Graha Maitri', KOOTA_MAXIMA.grahaMaitri, NO_VALID_ROLES_REASON)
  const b = validateNative(resolved.bride)
  const g = validateNative(resolved.groom)
  if (!b || !g) {
    return unavailableKoota('grahaMaitri', 'Graha Maitri', KOOTA_MAXIMA.grahaMaitri, INVALID_NAKSHATRA_REASON)
  }
  const brideLord = SIGN_LORDS[b.rashiNumber]
  const groomLord = SIGN_LORDS[g.rashiNumber]
  if (!brideLord || !groomLord) {
    return unavailableKoota('grahaMaitri', 'Graha Maitri', KOOTA_MAXIMA.grahaMaitri, 'Rashi lord not found for the derived rashi.')
  }

  // Same Moon-rashi lord — PERMANENT_FRIENDSHIP has no self-relation entry
  // (a planet is never listed in its own friends/enemies array), so this
  // case is handled explicitly per matchmakingTables.ts's documented rule
  // ("same planet ... -> 5"), rather than falling through to a 'neutral'
  // vs 'neutral' lookup (which would incorrectly yield 3, not 5).
  if (brideLord === groomLord) {
    return {
      key: 'grahaMaitri',
      name: 'Graha Maitri',
      points: KOOTA_MAXIMA.grahaMaitri,
      maxPoints: KOOTA_MAXIMA.grahaMaitri,
      status: 'scored',
      evidence: {
        rule: 'grahaMaitri.same_lord',
        bride: { rashiNumber: b.rashiNumber, lord: brideLord },
        groom: { rashiNumber: g.rashiNumber, lord: groomLord },
        notes: ['Same Moon-rashi lord scores full points (self-relation is not modeled by PERMANENT_FRIENDSHIP).'],
      },
    }
  }

  const brideToGroom = naisargikaRelation(brideLord, groomLord)
  const groomToBride = naisargikaRelation(groomLord, brideLord)
  const points = grahaMaitriPoints(brideToGroom, groomToBride)

  return {
    key: 'grahaMaitri',
    name: 'Graha Maitri',
    points,
    maxPoints: KOOTA_MAXIMA.grahaMaitri,
    status: 'scored',
    evidence: {
      rule: 'grahaMaitri.naisargika_only',
      bride: { rashiNumber: b.rashiNumber, lord: brideLord, relationToGroomLord: brideToGroom },
      groom: { rashiNumber: g.rashiNumber, lord: groomLord, relationToBrideLord: groomToBride },
      notes: ['Naisargika (permanent) friendship only — tatkalika friendship is deliberately excluded (Requirement 2.5).'],
    },
  }
}

// ─── 3.7 Gana ──────────────────────────────────────────────────────────
// Directional matrix lookup: bride is the row, groom the column (per
// matchmakingTables.ts's GANA_MATRIX — directionality pending oracle
// verification, task 9).

export function scoreGana(bride: MatchNativeInput, groom: MatchNativeInput): KootaScore {
  const resolved = resolveRoles(bride, groom)
  if (!resolved) return unavailableKoota('gana', 'Gana', KOOTA_MAXIMA.gana, NO_VALID_ROLES_REASON)
  const b = validateNative(resolved.bride)
  const g = validateNative(resolved.groom)
  if (!b || !g) {
    return unavailableKoota('gana', 'Gana', KOOTA_MAXIMA.gana, INVALID_NAKSHATRA_REASON)
  }
  const brideNak = NAKSHATRA_ATTRIBUTES[b.nakshatraNumber]
  const groomNak = NAKSHATRA_ATTRIBUTES[g.nakshatraNumber]
  if (!brideNak || !groomNak) {
    return unavailableKoota('gana', 'Gana', KOOTA_MAXIMA.gana, 'Nakshatra attributes not found for the given nakshatra.')
  }
  const points = ganaPoints(brideNak.gana, groomNak.gana)

  return {
    key: 'gana',
    name: 'Gana',
    points,
    maxPoints: KOOTA_MAXIMA.gana,
    status: 'scored',
    evidence: {
      rule: 'gana.matrix',
      bride: { nakshatraNumber: b.nakshatraNumber, gana: brideNak.gana },
      groom: { nakshatraNumber: g.nakshatraNumber, gana: groomNak.gana },
      notes: [
        'Directional: bride is the matrix row, groom the column — directionality flagged pending oracle verification (task 9).',
      ],
    },
  }
}

// ─── 3.11 Cancellation (Bhanga) registry ────────────────────────────────
// Nadi and Bhakoot cancellations as named, individually testable detectors.
// Never applied silently — a fired cancellation is recorded in the koota's
// `cancellation` field (and echoed in evidence notes), mirroring how
// yogas.ts records Neechabhanga evidence. Which variants ship in v1 is
// nominally oracle-driven (task 9, not in this task); the detectors below
// implement the specific variants Requirement 4.1 names as examples. Both
// underlying checks (same Nadi / same rashi-lord) are direction-agnostic, but
// each still resolves roles independently so a malformed role pairing is
// never silently guessed at (mirrors every koota scorer above).

/**
 * Nadi Bhanga: fires when both natives share the same Nadi (which would
 * otherwise be Nadi Dosha), their nakshatra lords are the SAME planet, AND
 * they are NOT in the identical nakshatra.
 *
 * DIRECTION CORRECTED IN REVIEW — do not re-invert without oracle evidence.
 * An earlier draft of Requirement 4.1 named this exemption as "same Nadi but
 * *different* nakshatra-lord". That is backwards, and measurably so: swept
 * across the full 11,664-pair space, the different-lord form fires on **76.5%**
 * of all same-Nadi pairs. Nadi is the single most heavily weighted koota (8 of
 * 36) and the classical deal-breaker, so a rule that nullifies it in three
 * cases out of four is a repeal, not an exception. The same-lord form below
 * fires on a small minority of same-Nadi pairs — the shape an exemption should
 * have, and comparable to Bhakoot Bhanga's measured 8.3%. It also matches the
 * commonly published Nadi-dosha exemption ("cancelled when the two nakshatra
 * lords are the same planet"). Requirement 4.1 was corrected to match.
 *
 * IDENTICAL-NAKSHATRA GUARD ADDED IN REVIEW — a same-Nadi pair sharing a
 * nakshatra lord is trivially true whenever the two natives are in the exact
 * same nakshatra (the degenerate case of "same lord": a nakshatra always
 * shares a lord with itself), which without this guard turned the single
 * worst-case Nadi configuration into a false perfect 8/8. The commonly
 * published exemption is intended for two DIFFERENT nakshatras that happen to
 * share a ruling lord (each of the 9 Vimshottari lords rules exactly 3 of the
 * 27 nakshatras, e.g. Ketu rules Ashwini/Magha/Mula) — not the identical
 * nakshatra, which the mainstream classical treatment scores as the dosha
 * standing, not a cancellation (some schools do publish pariharas keyed on a
 * same-nakshatra-different-pada or same-nakshatra-different-rashi
 * configuration specifically — not adopted here; folded into
 * docs/computation_matchmaking.md's open questions rather than asserted away).
 * Any two DIFFERENT same-lord nakshatras are 9 or 18 nakshatras apart (9 in
 * circular distance — each lord rules 3 of the 27, spaced a fixed 9 apart),
 * so this guard's `b.nakshatraNumber === g.nakshatraNumber` check never
 * excludes a genuine different-nakshatra, same-lord match — it only excludes
 * the identical-nakshatra degenerate case. Independently derivable from first
 * principles (not oracle-verified: PyJHora's bare `Ashtakoota` class has no
 * Bhanga/cancellation logic to check this against at all — see
 * docs/computation_matchmaking.md).
 *
 * Whether a fired Bhanga should restore full points (as here) or only
 * annotate the zero remains a documented open question — see
 * docs/computation_matchmaking.md's Summary of Open Questions.
 */
export function detectNadiCancellation(bride: MatchNativeInput, groom: MatchNativeInput): Cancellation | null {
  const resolved = resolveRoles(bride, groom)
  if (!resolved) return null
  const b = validateNative(resolved.bride)
  const g = validateNative(resolved.groom)
  if (!b || !g) return null
  if (b.nakshatraNumber === g.nakshatraNumber) return null // identical nakshatra is never a cancellation
  const brideNak = NAKSHATRA_ATTRIBUTES[b.nakshatraNumber]
  const groomNak = NAKSHATRA_ATTRIBUTES[g.nakshatraNumber]
  if (!brideNak || !groomNak) return null
  if (brideNak.nadi !== groomNak.nadi) return null // no dosha present to cancel

  const brideLord = getNakshatraLord(b.nakshatraNumber - 1)
  const groomLord = getNakshatraLord(g.nakshatraNumber - 1)
  if (brideLord && groomLord && brideLord === groomLord) {
    return {
      rule: 'nadi.same_nadi_same_nakshatra_lord',
      name: 'Nadi Bhanga (same Nadi, same nakshatra lord)',
      condition: `Both natives share ${brideNak.nadi} Nadi and the same nakshatra lord (${brideLord}), in different nakshatras (${b.nakshatraNumber} vs ${g.nakshatraNumber}).`,
    }
  }
  return null
}

/**
 * Bhakoot Bhanga: fires when both natives' Moon-rashi lord is identical —
 * the variant Requirement 4.1 names explicitly ("same Moon-sign lord"). The
 * exalted/own-sign-lord variant Requirement 4.1 also names is NOT
 * implemented here: it needs actual planetary placement (dignity), which
 * this koota-only input (nakshatra/pada/rashi) does not carry — see report.
 */
export function detectBhakootCancellation(bride: MatchNativeInput, groom: MatchNativeInput): Cancellation | null {
  const resolved = resolveRoles(bride, groom)
  if (!resolved) return null
  const b = validateNative(resolved.bride)
  const g = validateNative(resolved.groom)
  if (!b || !g) return null
  if (bhakootPoints(b.rashiNumber, g.rashiNumber) > 0) return null // no dosha present to cancel

  const brideLord = SIGN_LORDS[b.rashiNumber]
  const groomLord = SIGN_LORDS[g.rashiNumber]
  if (brideLord && groomLord && brideLord === groomLord) {
    return {
      rule: 'bhakoot.same_rashi_lord',
      name: 'Bhakoot Bhanga (same Moon-sign lord)',
      condition: `Both natives' Moon-sign lord is ${brideLord}.`,
    }
  }
  return null
}

// ─── 3.8 Bhakoot ─────────────────────────────────────────────────────────
// Rashi-distance rule (0 or 7), wires in detectBhakootCancellation.

export function scoreBhakoot(bride: MatchNativeInput, groom: MatchNativeInput): KootaScore {
  const resolved = resolveRoles(bride, groom)
  if (!resolved) return unavailableKoota('bhakoot', 'Bhakoot', KOOTA_MAXIMA.bhakoot, NO_VALID_ROLES_REASON)
  const b = validateNative(resolved.bride)
  const g = validateNative(resolved.groom)
  if (!b || !g) {
    return unavailableKoota('bhakoot', 'Bhakoot', KOOTA_MAXIMA.bhakoot, INVALID_NAKSHATRA_REASON)
  }
  const basePoints = bhakootPoints(b.rashiNumber, g.rashiNumber)
  const cancellation = basePoints === 0 ? detectBhakootCancellation(resolved.bride, resolved.groom) : null
  const points = cancellation ? KOOTA_MAXIMA.bhakoot : basePoints

  const notes = ['Rashi-distance rule: 2-12, 5-9, 6-8 placements score 0; every other distance scores the full 7.']
  if (cancellation) notes.push(`Bhakoot Dosha present by rashi distance but cancelled: ${cancellation.condition}`)

  const score: KootaScore = {
    key: 'bhakoot',
    name: 'Bhakoot',
    points,
    maxPoints: KOOTA_MAXIMA.bhakoot,
    status: 'scored',
    evidence: {
      rule: 'bhakoot.rashi_distance',
      bride: { rashiNumber: b.rashiNumber },
      groom: { rashiNumber: g.rashiNumber },
      notes,
    },
  }
  if (cancellation) score.cancellation = cancellation
  return score
}

// ─── 3.9 Nadi ────────────────────────────────────────────────────────────
// Same/different Nadi rule (0 or 8), wires in detectNadiCancellation.

export function scoreNadi(bride: MatchNativeInput, groom: MatchNativeInput): KootaScore {
  const resolved = resolveRoles(bride, groom)
  if (!resolved) return unavailableKoota('nadi', 'Nadi', KOOTA_MAXIMA.nadi, NO_VALID_ROLES_REASON)
  const b = validateNative(resolved.bride)
  const g = validateNative(resolved.groom)
  if (!b || !g) {
    return unavailableKoota('nadi', 'Nadi', KOOTA_MAXIMA.nadi, INVALID_NAKSHATRA_REASON)
  }
  const brideNak = NAKSHATRA_ATTRIBUTES[b.nakshatraNumber]
  const groomNak = NAKSHATRA_ATTRIBUTES[g.nakshatraNumber]
  if (!brideNak || !groomNak) {
    return unavailableKoota('nadi', 'Nadi', KOOTA_MAXIMA.nadi, 'Nakshatra attributes not found for the given nakshatra.')
  }
  const basePoints = nadiPoints(brideNak.nadi, groomNak.nadi)
  const cancellation = basePoints === 0 ? detectNadiCancellation(resolved.bride, resolved.groom) : null
  const points = cancellation ? KOOTA_MAXIMA.nadi : basePoints

  const notes = ['Same Nadi scores 0 (Nadi Dosha); different Nadi scores the full 8.']
  if (cancellation) notes.push(`Nadi Dosha present but cancelled: ${cancellation.condition}`)

  const score: KootaScore = {
    key: 'nadi',
    name: 'Nadi',
    points,
    maxPoints: KOOTA_MAXIMA.nadi,
    status: 'scored',
    evidence: {
      rule: 'nadi.same_different',
      bride: { nakshatraNumber: b.nakshatraNumber, nadi: brideNak.nadi },
      groom: { nakshatraNumber: g.nakshatraNumber, nadi: groomNak.nadi },
      notes,
    },
  }
  if (cancellation) score.cancellation = cancellation
  return score
}

// ─── 3.12 Boundary risk (OD-12) ──────────────────────────────────────────

/**
 * Nakshatra-boundary risk threshold, in degrees of Moon longitude
 * (≈2 hours of lunar motion). Exported so it is tunable per design.md OD-12.
 */
export const BOUNDARY_RISK_THRESHOLD_DEG = 1.0

const NAKSHATRA_SPAN_DEG = 360 / 27

/**
 * Per-native distance in degrees to the nearest nakshatra boundary and a
 * derived `atRisk` flag at `BOUNDARY_RISK_THRESHOLD_DEG`. Pure arithmetic on
 * `moonLongitude` — no new astronomical computation (Requirement 14.4).
 * Purely per-native (unlike the koota scorers, there is nothing comparative
 * here), so it reports using `role` exactly as supplied — no role
 * resolution against a partner is needed or performed.
 * When `moonLongitude` is not supplied, reports `atRisk: false` with no
 * `moonLongitude`/`distanceToBoundaryDeg` — never a throw, never a guess.
 */
export function computeBoundaryRisk(role: MatchRole, moonLongitude?: number): BoundaryRisk {
  if (moonLongitude === undefined || moonLongitude === null || !Number.isFinite(moonLongitude)) {
    return { role, atRisk: false }
  }
  const normalized = ((moonLongitude % 360) + 360) % 360
  const posInNakshatra = normalized % NAKSHATRA_SPAN_DEG
  const distanceToBoundaryDeg = Math.min(posInNakshatra, NAKSHATRA_SPAN_DEG - posInNakshatra)
  return {
    role,
    moonLongitude,
    distanceToBoundaryDeg,
    atRisk: distanceToBoundaryDeg <= BOUNDARY_RISK_THRESHOLD_DEG,
  }
}

// ─── 3.10 computeAshtakootaMatch ─────────────────────────────────────────

/** The 8 koota scorers, in fixed scoring order, paired with their static metadata. */
const KOOTA_DEFINITIONS: { key: KootaKey; name: string; maxPoints: number; scorer: Scorer }[] = [
  { key: 'varna', name: 'Varna', maxPoints: KOOTA_MAXIMA.varna, scorer: scoreVarna },
  { key: 'vashya', name: 'Vashya', maxPoints: KOOTA_MAXIMA.vashya, scorer: scoreVashya },
  { key: 'tara', name: 'Tara', maxPoints: KOOTA_MAXIMA.tara, scorer: scoreTara },
  { key: 'yoni', name: 'Yoni', maxPoints: KOOTA_MAXIMA.yoni, scorer: scoreYoni },
  { key: 'grahaMaitri', name: 'Graha Maitri', maxPoints: KOOTA_MAXIMA.grahaMaitri, scorer: scoreGrahaMaitri },
  { key: 'gana', name: 'Gana', maxPoints: KOOTA_MAXIMA.gana, scorer: scoreGana },
  { key: 'bhakoot', name: 'Bhakoot', maxPoints: KOOTA_MAXIMA.bhakoot, scorer: scoreBhakoot },
  { key: 'nadi', name: 'Nadi', maxPoints: KOOTA_MAXIMA.nadi, scorer: scoreNadi },
]

/**
 * Score-band verdict thresholds: `<18` below_average, `18-24` average,
 * `24-32` good, `>=32` excellent. These bands are ALMANAC /
 * COMMERCIAL-SOFTWARE CONVENTION — NOT classical Parashari and NOT PVR
 * Narasimha Rao (NFR-8, Requirement 5.2). No classical source fixes them;
 * the 18.0 lower bound matches PyJHora's own default
 * `minimum_compatibility_score`, the 24/32 upper bounds are presentation-only.
 */
export function deriveVerdict(gunaScore: number): MatchVerdict {
  if (gunaScore < 18) return 'below_average'
  if (gunaScore < 24) return 'average'
  if (gunaScore < 32) return 'good'
  return 'excellent'
}

/**
 * Requirement 5.5 boilerplate: the koota total is never presented as the
 * final word. Rendered by the UI (task 11.2), not decorative.
 */
const MATCH_LIMITATIONS: string[] = [
  'Ashtakoota is a coarse, mechanical first-pass screen, not a determination on its own. The 36-point weighting and its score bands are later almanac and commercial-software convention, not classical Parashari doctrine (NFR-8).',
  "A full compatibility assessment additionally requires each native's own 7th house, Venus, and Jupiter condition, the D9 (Navamsa), and both natives' running dashas — none of which this score incorporates.",
  'Mangal Dosha (Kuja Dosha) compatibility is reported separately, alongside this score, and is never folded into it.',
]

/**
 * Runs the 8 koota scorers in fixed order and sums to `gunaScore`
 * (fractional, never rounded). Wraps the koota loop so one unexpected
 * scorer error is contained and the rest still run, mirroring `yogas.ts`'s
 * per-detector guard — `kootas` always carries exactly 8 entries in fixed
 * order (the `AshtakootaResult` contract), so a failed koota still gets an
 * `unavailable` placeholder rather than being dropped.
 *
 * Role-aware, not positional (see module header): `computeAshtakootaMatch(x,
 * y)` and `computeAshtakootaMatch(y, x)` are identical as long as `x.role`/
 * `y.role` are unchanged — only each native's own `role` field, resolved
 * internally by every scorer via `resolveRoles`, decides who is scored as
 * the bride and who as the groom.
 */
export function computeAshtakootaMatch(bride: MatchNativeInput, groom: MatchNativeInput): AshtakootaResult {
  const kootas: KootaScore[] = KOOTA_DEFINITIONS.map(({ key, name, maxPoints, scorer }) => {
    try {
      return scorer(bride, groom)
    } catch {
      return unavailableKoota(key, name, maxPoints, 'Unexpected error while scoring this koota.')
    }
  })

  const gunaScore = kootas.reduce((sum, k) => sum + k.points, 0)

  // A band derived from a partial sum is worse than no band: an unscored Nadi
  // alone caps the reachable total at (TOTAL_KOOTA_MAXIMA - 8), and a pair
  // that scores nothing at all (e.g. both natives carrying the same role)
  // would otherwise render as a confident `below_average` on a gunaScore of
  // 0 — indistinguishable at a glance from a genuinely poor match. Report
  // `incomplete` instead, and say which kootas are missing in `limitations`
  // (which the UI already renders).
  const unavailable = kootas.filter((k) => k.status === 'unavailable')
  const verdict: MatchVerdict = unavailable.length > 0 ? 'incomplete' : deriveVerdict(gunaScore)
  const limitations = [...MATCH_LIMITATIONS]
  if (unavailable.length > 0) {
    limitations.unshift(
      `INCOMPLETE SCORE — ${unavailable.length} of 8 kootas could not be scored (${unavailable
        .map((k) => k.name)
        .join(', ')}). The ${gunaScore} shown is a partial sum out of a reachable maximum of ${kootas
        .filter((k) => k.status === 'scored')
        .reduce((sum, k) => sum + k.maxPoints, 0)}, not out of ${TOTAL_KOOTA_MAXIMA}, and no score band applies.`
    )
  }

  // Boundary risk is per-native, but `AshtakootaResult` must still be
  // order-invariant overall (Requirement 1.3): resolve roles the same way
  // every koota scorer does, so `computeAshtakootaMatch(x, y)` and
  // `computeAshtakootaMatch(y, x)` stay byte-for-byte identical whenever
  // `x.role`/`y.role` are unchanged. Using the raw positional `bride`/
  // `groom` params here (instead of the resolved pair) would silently
  // reintroduce exactly the argument-order sensitivity the rest of this
  // module is built to avoid. Falls back to the raw params only when the
  // pairing itself is malformed (resolveRoles returns null) — there is no
  // correct resolved identity to report in that case, so each entry echoes
  // its own slot's nominal role label rather than guessing.
  const resolved = resolveRoles(bride, groom)
  const boundaryBride = resolved?.bride ?? bride
  const boundaryGroom = resolved?.groom ?? groom
  const boundaryRisk: BoundaryRisk[] = [
    computeBoundaryRisk(boundaryBride?.role ?? 'bride', boundaryBride?.moonLongitude),
    computeBoundaryRisk(boundaryGroom?.role ?? 'groom', boundaryGroom?.moonLongitude),
  ]

  return {
    gunaScore,
    maxScore: TOTAL_KOOTA_MAXIMA,
    kootas,
    verdict,
    boundaryRisk,
    limitations,
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Task 4 — Mangal Dosha (Kuja Dosha) + composition
// ═══════════════════════════════════════════════════════════════════════
//
// The canonical rule is `prompts/domains/marriage.md`'s Karakas paragraph:
// "Mars (passion — and Kuja Dosha when placed in 1/2/4/7/8/12 from lagna,
// Moon, or Venus, unless cancelled by own/exalted sign, benefic aspect, or
// matching dosha in partner)." The engine below implements exactly that —
// no deviation was needed, so that file is unchanged by this task.
//
// Unlike the 8 kootas above (which need only Moon nakshatra/pada, present on
// every native regardless of chart source), Mangal Dosha needs Mars's sign,
// the lagna sign, and computed aspects — the `planets`/`relationships` JSONB,
// which paste-source `UnifiedChart`s do not carry. Missing/malformed input
// therefore degrades this ONE feature to `status: 'unavailable'` /
// `compatibility: 'unavailable'` without touching the 8-koota score, which is
// computed entirely separately in `computeMatch` below.

// ─── Input contract: Mangal Dosha ───────────────────────────────────────
//
// Per design.md's Input Contracts. Not part of MatchNativeInput/the koota
// path above — Mangal Dosha is deliberately a separate, optional input so
// the cheap koota path is never gated behind it (Requirement 1.5).

export interface MangalNativeInput {
  planets: PlanetPosition[]
  lagnaSignNumber: number
  /** `relationships.aspects` (computeGrahaDrishti output) — never re-derived here (NFR-2). */
  aspects: AspectEdge[]
}

const MANGAL_DOSHA_TRIGGER_HOUSES: ReadonlySet<number> = new Set([1, 2, 4, 7, 8, 12])

const MANGAL_REFERENCE_POINTS = ['lagna', 'moon', 'venus'] as const
type MangalReferencePoint = (typeof MANGAL_REFERENCE_POINTS)[number]

function findPlanet(planets: PlanetPosition[], name: string): PlanetPosition | undefined {
  return planets.find((p) => p?.planet === name)
}

/** House count (1..12) of `targetSign` counted from `referenceSign`, both 1..12 rashi numbers. */
function houseFromSign(referenceSign: number, targetSign: number): number {
  return ((targetSign - referenceSign + 12) % 12) + 1
}

function isValidSignNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 12
}

/** Builds a `status: 'unavailable'` `MangalDoshaNative` — never a throw. */
function unavailableMangalDosha(): MangalDoshaNative {
  return {
    status: 'unavailable',
    triggeredFrom: [],
    marsHouseFrom: { lagna: null, moon: null, venus: null },
    cancellations: [],
  }
}

// ─── 4.2 detectMangalCancellation ───────────────────────────────────────

/**
 * Per-native Mangal Dosha Bhanga (cancellation) checks — the two conditions
 * `prompts/domains/marriage.md` names that are decidable from ONE native's
 * own data: Mars sitting in its own/exaltation sign, and a benefic planet
 * casting a Graha Drishti aspect onto Mars. The third named condition
 * ("matching dosha in partner") is inherently pairwise, not per-native — it
 * is NOT checked here; it surfaces as `compatibility: 'matched'` in
 * `computeMatch` instead (see design.md's Mangal Dosha Design section).
 *
 * Reads dignity from `dignity.ts`'s `OWN_SIGNS`/`EXALTATION_SIGNS` and
 * aspects from the caller-supplied `aspects` (== `relationships.aspects`) —
 * NEVER re-derives either (NFR-2). Returns every cancellation condition that
 * fired (zero, one, or both) — recorded, never applied silently; the caller
 * decides what a non-empty array means for `status`/`compatibility`.
 *
 * Benefic-aspect check uses `relationships.ts`'s static `NATURAL_BENEFICS`
 * (Jupiter, Venus, Mercury, Moon) rather than its combustion/waxing-aware
 * `isNaturalBenefic` — `MangalNativeInput` carries no combustion or
 * waxing/waning state, so the unconditional natural-benefic classification
 * is the best available signal here. See the report's uncertainty list.
 */
export function detectMangalCancellation(
  mars: PlanetPosition | null | undefined,
  aspects: AspectEdge[] | null | undefined
): Cancellation[] {
  if (!mars || !isValidSignNumber(mars.signNumber)) return []
  const cancellations: Cancellation[] = []

  const isExalted = EXALTATION_SIGNS.Mars === mars.signNumber
  const isOwn = !isExalted && (OWN_SIGNS.Mars?.includes(mars.signNumber) ?? false)
  if (isExalted || isOwn) {
    cancellations.push({
      rule: isExalted ? 'mangal.exalted_sign' : 'mangal.own_sign',
      name: isExalted ? 'Mangal Dosha Bhanga (Mars exalted)' : 'Mangal Dosha Bhanga (Mars in own sign)',
      condition: `Mars is placed in sign ${mars.signNumber}, its ${isExalted ? 'exaltation' : 'own'} sign.`,
    })
  }

  if (Array.isArray(aspects)) {
    const beneficAspect = aspects.find(
      (a) => a && NATURAL_BENEFICS.includes(a.from) && Array.isArray(a.toPlanets) && a.toPlanets.includes('Mars')
    )
    if (beneficAspect) {
      cancellations.push({
        rule: 'mangal.benefic_aspect',
        name: 'Mangal Dosha Bhanga (benefic aspect on Mars)',
        condition: `${beneficAspect.from} casts a benefic (${beneficAspect.type}) aspect on Mars.`,
      })
    }
  }

  return cancellations
}

// ─── 4.1 computeMangalDosha ─────────────────────────────────────────────

/**
 * Mars house-from check for lagna/Moon/Venus per
 * `prompts/domains/marriage.md`'s Kuja Dosha rule: Mars in houses
 * 1/2/4/7/8/12 counted from lagna, Moon, or Venus. Records `marsHouseFrom`
 * for all three reference points (provenance, never a bare boolean) and
 * `triggeredFrom` listing which fired.
 *
 * `status` reports the RAW manglik determination — whether any reference
 * point triggered — and is NOT flipped by a fired cancellation
 * (`cancellations` is populated but never applied silently; see the module
 * header and `computeMatch`'s `compatibility` derivation for where a
 * cancellation actually changes the reported outcome).
 *
 * Never throws. Missing/malformed `planets` (no array) or an unresolvable
 * Mars position degrades the WHOLE result to `status: 'unavailable'`. A
 * missing/invalid individual reference point (e.g. Moon absent from
 * `planets`) degrades only that one entry to `null` in `marsHouseFrom` —
 * the other two reference points, and thus the manglik determination, still
 * stand on the data that IS present. If ALL THREE reference points fail to
 * resolve (e.g. lagna unresolvable and both Moon and Venus absent), there is
 * no data left to stand on either — this also degrades the WHOLE result to
 * `status: 'unavailable'`, never a confident `not_manglik`. An unestablished
 * determination must never read as an all-clear (design.md, Mangal Dosha
 * Design; the same principle `deriveMangalDoshaCompatibility` applies one
 * layer up).
 */
export function computeMangalDosha(input: MangalNativeInput | null | undefined): MangalDoshaNative {
  if (!input || !Array.isArray(input.planets)) return unavailableMangalDosha()

  const mars = findPlanet(input.planets, 'Mars')
  if (!mars || !isValidSignNumber(mars.signNumber)) return unavailableMangalDosha()

  const lagnaSign = isValidSignNumber(input.lagnaSignNumber) ? input.lagnaSignNumber : null
  const moon = findPlanet(input.planets, 'Moon')
  const venus = findPlanet(input.planets, 'Venus')
  const moonSign = moon && isValidSignNumber(moon.signNumber) ? moon.signNumber : null
  const venusSign = venus && isValidSignNumber(venus.signNumber) ? venus.signNumber : null

  const marsHouseFrom: Record<MangalReferencePoint, number | null> = {
    lagna: lagnaSign !== null ? houseFromSign(lagnaSign, mars.signNumber) : null,
    moon: moonSign !== null ? houseFromSign(moonSign, mars.signNumber) : null,
    venus: venusSign !== null ? houseFromSign(venusSign, mars.signNumber) : null,
  }

  // No reference point resolved at all (lagna invalid AND Moon/Venus both
  // absent from `planets`) — there is nothing left to determine "not
  // manglik" FROM, so this degrades the whole result to `unavailable` rather
  // than falling through to a confident `not_manglik`. This is the zero-data
  // limit of the per-reference-point degradation documented above: one or
  // two missing points still leave a real determination standing on what IS
  // present, but zero points leave nothing to stand on.
  const hasAnyReferencePoint = MANGAL_REFERENCE_POINTS.some((ref) => marsHouseFrom[ref] !== null)
  if (!hasAnyReferencePoint) return unavailableMangalDosha()

  const triggeredFrom = MANGAL_REFERENCE_POINTS.filter((ref) => {
    const house = marsHouseFrom[ref]
    return house !== null && MANGAL_DOSHA_TRIGGER_HOUSES.has(house)
  })

  if (triggeredFrom.length === 0) {
    return { status: 'not_manglik', triggeredFrom: [], marsHouseFrom, cancellations: [] }
  }

  const cancellations = detectMangalCancellation(mars, input.aspects)
  return { status: 'manglik', triggeredFrom: [...triggeredFrom], marsHouseFrom, cancellations }
}

// ─── 4.3 computeMatch ────────────────────────────────────────────────────

/** One native's koota input plus its optional Mangal Dosha input (design.md's `computeMatch` signature). */
export interface MatchNative {
  koota: MatchNativeInput
  /** Omitted (never a guess) when the chart lacks `planets` (paste-source) — degrades Mangal Dosha only. */
  mangal?: MangalNativeInput
}

/**
 * Resolves which of the two supplied `MatchNative`s is the bride and which
 * is the groom by reading each one's `koota.role` field — the same
 * role-by-value discipline `resolveRoles` applies to bare `MatchNativeInput`s
 * (see module header). `computeAshtakootaMatch(bride.koota, groom.koota)`
 * already does this resolution internally for the koota score; this mirror
 * is needed so the Mangal Dosha halves of `MatchResult` (which native's
 * `.mangal` lands under `mangalDosha.bride` vs `.groom`) stay equally
 * order-invariant. Returns `null` when the pairing is malformed.
 */
function resolveMatchRoles(
  nativeA: MatchNative | null | undefined,
  nativeB: MatchNative | null | undefined
): { bride: MatchNative; groom: MatchNative } | null {
  if (!nativeA || !nativeB) return null
  const roleA = nativeA.koota?.role
  const roleB = nativeB.koota?.role
  if (roleA === 'bride' && roleB === 'groom') return { bride: nativeA, groom: nativeB }
  if (roleB === 'bride' && roleA === 'groom') return { bride: nativeB, groom: nativeA }
  return null
}

/**
 * Pairwise Mangal Dosha compatibility verdict (Requirement 3.3/3.4).
 *
 * Requirement 3.3 is explicit that the two natives are compared on their
 * **post-cancellation** Manglik status: "matched (both Manglik or both
 * non-Manglik), mismatched (only one Manglik, uncancelled), cancelled (a dosha
 * was present but nullified by 3.2)". So `cancellations` is not a fourth,
 * higher-precedence outcome that short-circuits the comparison — it changes
 * what each native's status *is* for the purpose of comparing, and `'cancelled'`
 * is then the more specific label for an agreement that a Bhanga produced.
 *
 * CORRECTED IN REVIEW — do not reorder this back to a cancellation-first
 * precedence. Doing so mislabels the single riskiest configuration: a bride
 * who is Manglik-but-cancelled paired with a groom who is Manglik-and-NOT-
 * cancelled is, post-cancellation, non-Manglik against Manglik — a genuine
 * `'mismatched'`. A cancellation-first rule reports that pair as `'cancelled'`,
 * which is the most reassuring word in the enum attached to the case that
 * most warrants a flag.
 *
 * Order of evaluation:
 *   1. `'unavailable'` — either native's Mangal Dosha is `'unavailable'`
 *      (missing/malformed `mangal` input). NEVER `'matched'`, even when the
 *      other native is `not_manglik`: an unestablished result is not an
 *      all-clear (design.md, Mangal Dosha Design).
 *   2. `'mismatched'` — effective statuses disagree, i.e. exactly one native
 *      is Manglik with no Bhanga fired.
 *   3. `'cancelled'` — effective statuses agree AND at least one native's
 *      dosha was present but nullified. A more specific `'matched'`.
 *   4. `'matched'` — effective statuses agree with no cancellation involved:
 *      both Manglik ("matching dosha in partner", marriage.md's third
 *      condition) or both non-Manglik.
 */
function deriveMangalDoshaCompatibility(
  bride: MangalDoshaNative,
  groom: MangalDoshaNative
): MatchResult['mangalDosha']['compatibility'] {
  if (bride.status === 'unavailable' || groom.status === 'unavailable') return 'unavailable'

  const brideCancelled = bride.status === 'manglik' && bride.cancellations.length > 0
  const groomCancelled = groom.status === 'manglik' && groom.cancellations.length > 0

  // Post-cancellation ("effective") Manglik status — what Requirement 3.3
  // compares. A native whose Bhanga fired is effectively non-Manglik.
  const brideEffectiveManglik = bride.status === 'manglik' && !brideCancelled
  const groomEffectiveManglik = groom.status === 'manglik' && !groomCancelled

  if (brideEffectiveManglik !== groomEffectiveManglik) return 'mismatched'
  if (brideCancelled || groomCancelled) return 'cancelled'
  return 'matched'
}

/**
 * Composes `computeAshtakootaMatch` + `computeMangalDosha` per native into
 * one `MatchResult`, derives the pairwise `mangalDoshaCompatibility` verdict,
 * and stamps `tablesVersion` (Requirement 5.1). Mangal Dosha is reported
 * BESIDE `gunaScore` — never folded into the 36-point total (Requirement 3.4).
 *
 * Role-aware, not positional, exactly like `computeAshtakootaMatch`:
 * `computeMatch(x, y)` and `computeMatch(y, x)` are byte-for-byte identical
 * as long as `x.koota.role`/`y.koota.role` are unchanged.
 *
 * Never throws — a native with no `.mangal` input degrades ONLY that
 * native's Mangal Dosha (and the pairwise `compatibility`) to `'unavailable'`
 * while `ashtakoota` still scores all 8 kootas from `.koota` alone.
 */
export function computeMatch(bride: MatchNative, groom: MatchNative): MatchResult {
  const ashtakoota = computeAshtakootaMatch(bride?.koota, groom?.koota)

  // A malformed pairing (not exactly one bride and one groom) makes every
  // koota `unavailable` above — so Mangal Dosha must refuse to guess too.
  // Falling back to argument position here would let a pair the engine just
  // declared unscorable still emit an affirmative `compatibility: 'matched'`,
  // which is precisely the "unestablished result reported as an all-clear"
  // failure mode design.md calls the worst one available.
  const resolved = resolveMatchRoles(bride, groom)
  const brideMangal = resolved?.bride?.mangal
    ? computeMangalDosha(resolved.bride.mangal)
    : unavailableMangalDosha()
  const groomMangal = resolved?.groom?.mangal
    ? computeMangalDosha(resolved.groom.mangal)
    : unavailableMangalDosha()

  const compatibility = deriveMangalDoshaCompatibility(brideMangal, groomMangal)

  return {
    ashtakoota,
    mangalDosha: { bride: brideMangal, groom: groomMangal, compatibility },
    tablesVersion: MATCHMAKING_TABLES_VERSION,
  }
}
