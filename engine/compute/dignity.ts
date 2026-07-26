/**
 * engine/compute/dignity.ts — Canonical planetary dignity classifier.
 *
 * Single source of truth for the exaltation / debilitation / moolatrikona /
 * own-sign / friendship tables and the Panchadha (five-fold) maitri dignity
 * LABEL for a planet sitting in a given (divisional) sign.
 *
 * This mirrors the score-based classification already used by
 * `shadbala.ts` (`dignityScoreForVarga`, Saptavargaja Bala) and the private
 * `getDignityLabel` in `durationAnalysis/scoring.ts` — but returns the human
 * label instead of a virupa score, so divisional placements can carry a
 * dignity the LLM no longer has to derive by hand.
 *
 * Classical convention: exaltation/debilitation/moolatrikona/own are decided by
 * the sign being evaluated (the varga sign). Compound friendship with the
 * sign's lord uses PERMANENT (naisargika) maitri combined with TEMPORARY
 * (tatkalika) maitri drawn from the D1 (rasi) positions — the same rule
 * shadbala's Saptavargaja Bala uses.
 *
 * Pure, dependency-free (no ephemeris, no other compute modules) so it stays a
 * leaf import for `divisional.ts` and anywhere else that needs dignity labels.
 */

// ─── Canonical dignity / friendship tables (BPHS) ────────────────────

/** Exaltation sign number (1–12) per planet. */
export const EXALTATION_SIGNS: Record<string, number> = {
  Sun: 1, Moon: 2, Mars: 10, Mercury: 6, Jupiter: 4, Venus: 12, Saturn: 7,
}

/** Debilitation sign number (opposite the exaltation sign). */
export const DEBILITATION_SIGNS: Record<string, number> = {
  Sun: 7, Moon: 8, Mars: 4, Mercury: 12, Jupiter: 10, Venus: 6, Saturn: 1,
}

/** Moolatrikona sign per planet. */
export const MOOLATRIKONA_SIGNS: Record<string, number> = {
  Sun: 5, Moon: 2, Mars: 1, Mercury: 6, Jupiter: 9, Venus: 7, Saturn: 11,
}

/** Own signs per planet. */
export const OWN_SIGNS: Record<string, number[]> = {
  Sun: [5], Moon: [4], Mars: [1, 8], Mercury: [3, 6],
  Jupiter: [9, 12], Venus: [2, 7], Saturn: [10, 11],
}

/** Single classical lord of each sign (1=Aries … 12=Pisces). */
export const SIGN_LORDS: Record<number, string> = {
  1: 'Mars', 2: 'Venus', 3: 'Mercury', 4: 'Moon', 5: 'Sun', 6: 'Mercury',
  7: 'Venus', 8: 'Mars', 9: 'Jupiter', 10: 'Saturn', 11: 'Saturn', 12: 'Jupiter',
}

/**
 * Permanent (naisargika) maitri. `neutral` is implied by absence from both
 * lists. Nodes (Rahu/Ketu) are intentionally absent — they carry no
 * friendship dignity, so any planet not present here returns `undefined`.
 */
export const PERMANENT_FRIENDSHIP: Record<string, { friends: string[]; enemies: string[] }> = {
  Sun:     { friends: ['Moon', 'Mars', 'Jupiter'], enemies: ['Venus', 'Saturn'] },
  Moon:    { friends: ['Sun', 'Mercury'], enemies: [] },
  Mars:    { friends: ['Sun', 'Moon', 'Jupiter'], enemies: ['Mercury'] },
  Mercury: { friends: ['Sun', 'Venus'], enemies: ['Moon'] },
  Jupiter: { friends: ['Sun', 'Moon', 'Mars'], enemies: ['Mercury', 'Venus'] },
  Venus:   { friends: ['Mercury', 'Saturn'], enemies: ['Sun', 'Moon'] },
  Saturn:  { friends: ['Mercury', 'Venus'], enemies: ['Sun', 'Moon', 'Mars'] },
}

// ─── Dignity label ───────────────────────────────────────────────────

export type DignityLabel =
  | 'exalted'
  | 'debilitated'
  | 'moolatrikona'
  | 'own'
  | 'great_friend'
  | 'friend'
  | 'neutral'
  | 'enemy'
  | 'great_enemy'

type PermRelation = 'friend' | 'enemy' | 'neutral'

/** Permanent (naisargika) relation of `planet` toward `other`. */
function permanentRelation(planet: string, other: string): PermRelation {
  const rel = PERMANENT_FRIENDSHIP[planet]
  if (!rel) return 'neutral'
  if (rel.friends.includes(other)) return 'friend'
  if (rel.enemies.includes(other)) return 'enemy'
  return 'neutral'
}

/**
 * Tatkalika (temporary) maitri from the rasi (D1) chart: `other` is a temporary
 * FRIEND of `planet` when it sits in the 2,3,4,10,11,12 houses counted from
 * `planet`; otherwise a temporary enemy.
 */
function temporaryRelation(planetSign: number, otherSign: number): 'friend' | 'enemy' {
  const count = ((otherSign - planetSign + 12) % 12) + 1 // 1..12
  return [2, 3, 4, 10, 11, 12].includes(count) ? 'friend' : 'enemy'
}

/**
 * Panchadha (five-fold) compound maitri → label:
 *   perm Friend  + temp Friend → great_friend (Adhimitra)
 *   perm Friend  + temp Enemy  → neutral      (Sama)
 *   perm Neutral + temp Friend → friend       (Mitra)
 *   perm Neutral + temp Enemy  → enemy        (Shatru)
 *   perm Enemy   + temp Friend → neutral      (Sama)
 *   perm Enemy   + temp Enemy  → great_enemy  (Adhishatru)
 * (Mirrors shadbala's `combineRelationshipScore`.)
 */
function combineToLabel(perm: PermRelation, temp: 'friend' | 'enemy'): DignityLabel {
  if (perm === 'friend') return temp === 'friend' ? 'great_friend' : 'neutral'
  if (perm === 'neutral') return temp === 'friend' ? 'friend' : 'enemy'
  // perm === 'enemy'
  return temp === 'friend' ? 'neutral' : 'great_enemy'
}

/**
 * Dignity LABEL of `planet` sitting in `vargaSignNumber`.
 *
 * @param planet           Planet name (Sun … Saturn). Rahu/Ketu → undefined.
 * @param vargaSignNumber  Sign number (1–12) the planet occupies in the varga
 *                         being evaluated (for D1 this is the natal sign).
 * @param d1SignByPlanet   Map of planet → D1 (rasi) sign number, used for the
 *                         tatkalika friendship with the varga sign's lord.
 * @returns One of DignityLabel, or `undefined` for planets without classical
 *          friendship dignity (Rahu/Ketu).
 */
export function getVargaDignityLabel(
  planet: string,
  vargaSignNumber: number,
  d1SignByPlanet: Record<string, number>
): DignityLabel | undefined {
  // Nodes (and anything without a friendship row) carry no classical dignity.
  if (!PERMANENT_FRIENDSHIP[planet]) return undefined

  if (EXALTATION_SIGNS[planet] === vargaSignNumber) return 'exalted'
  if (DEBILITATION_SIGNS[planet] === vargaSignNumber) return 'debilitated'
  if (MOOLATRIKONA_SIGNS[planet] === vargaSignNumber) return 'moolatrikona'
  if (OWN_SIGNS[planet]?.includes(vargaSignNumber)) return 'own'

  const lord = SIGN_LORDS[vargaSignNumber]
  const perm = permanentRelation(planet, lord)

  const planetD1 = d1SignByPlanet[planet]
  const lordD1 = d1SignByPlanet[lord]
  if (planetD1 == null || lordD1 == null) {
    // No positional data → score on permanent relationship alone.
    if (perm === 'friend') return 'friend'
    if (perm === 'enemy') return 'enemy'
    return 'neutral'
  }

  const temp = temporaryRelation(planetD1, lordD1)
  return combineToLabel(perm, temp)
}
