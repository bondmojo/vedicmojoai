/**
 * engine/compute/__fixtures__/frozenWholeSignDignity.ts — Frozen reference implementation.
 *
 * A verbatim transcription of `getVargaDignityLabel`'s PRE-CHANGE body (before task 2.1
 * added `MOOLATRIKONA_RANGES` and the optional `degreeInSign` parameter), including its own
 * local copies of every table it reads. This module is intentionally self-contained and
 * dependency-free — it must NOT import from `engine/compute/dignity.ts` — so that later edits
 * to the live classifier can never accidentally alter what this fixture asserts against.
 *
 * Consumed by:
 *   - Property 4 (task 2.4): degree-omitted parity with today's sign-only label
 *   - The 9×12 table-driven regression test (task 2.5)
 *
 * Both migrations are checked against this OLD (whole-sign-only moolatrikona) behaviour
 * rather than against the current implementation of itself.
 *
 * DO NOT EDIT to match future changes in `dignity.ts` — this file is a historical snapshot.
 */

// ─── Frozen copies of the dignity / friendship tables (BPHS) ─────────
// Transcribed verbatim from dignity.ts's current tables. These tables themselves were NOT
// changed by task 2.1 — only the moolatrikona branch in the function body changed — so an
// exact copy here is a faithful pre-change snapshot.

/** Exaltation sign number (1–12) per planet. */
const EXALTATION_SIGNS: Record<string, number> = {
  Sun: 1, Moon: 2, Mars: 10, Mercury: 6, Jupiter: 4, Venus: 12, Saturn: 7,
}

/** Debilitation sign number (opposite the exaltation sign). */
const DEBILITATION_SIGNS: Record<string, number> = {
  Sun: 7, Moon: 8, Mars: 4, Mercury: 12, Jupiter: 10, Venus: 6, Saturn: 1,
}

/** Moolatrikona sign per planet. */
const MOOLATRIKONA_SIGNS: Record<string, number> = {
  Sun: 5, Moon: 2, Mars: 1, Mercury: 6, Jupiter: 9, Venus: 7, Saturn: 11,
}

/** Own signs per planet. */
const OWN_SIGNS: Record<string, number[]> = {
  Sun: [5], Moon: [4], Mars: [1, 8], Mercury: [3, 6],
  Jupiter: [9, 12], Venus: [2, 7], Saturn: [10, 11],
}

/** Single classical lord of each sign (1=Aries … 12=Pisces). */
const SIGN_LORDS: Record<number, string> = {
  1: 'Mars', 2: 'Venus', 3: 'Mercury', 4: 'Moon', 5: 'Sun', 6: 'Mercury',
  7: 'Venus', 8: 'Mars', 9: 'Jupiter', 10: 'Saturn', 11: 'Saturn', 12: 'Jupiter',
}

/**
 * Permanent (naisargika) maitri. `neutral` is implied by absence from both
 * lists. Nodes (Rahu/Ketu) are intentionally absent — they carry no
 * friendship dignity, so any planet not present here returns `undefined`.
 */
const PERMANENT_FRIENDSHIP: Record<string, { friends: string[]; enemies: string[] }> = {
  Sun:     { friends: ['Moon', 'Mars', 'Jupiter'], enemies: ['Venus', 'Saturn'] },
  Moon:    { friends: ['Sun', 'Mercury'], enemies: [] },
  Mars:    { friends: ['Sun', 'Moon', 'Jupiter'], enemies: ['Mercury'] },
  Mercury: { friends: ['Sun', 'Venus'], enemies: ['Moon'] },
  Jupiter: { friends: ['Sun', 'Moon', 'Mars'], enemies: ['Mercury', 'Venus'] },
  Venus:   { friends: ['Mercury', 'Saturn'], enemies: ['Sun', 'Moon'] },
  Saturn:  { friends: ['Mercury', 'Venus'], enemies: ['Sun', 'Moon', 'Mars'] },
}

// ─── Frozen dignity label type ───────────────────────────────────────

export type FrozenDignityLabel =
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
 */
function combineToLabel(perm: PermRelation, temp: 'friend' | 'enemy'): FrozenDignityLabel {
  if (perm === 'friend') return temp === 'friend' ? 'great_friend' : 'neutral'
  if (perm === 'neutral') return temp === 'friend' ? 'friend' : 'enemy'
  // perm === 'enemy'
  return temp === 'friend' ? 'neutral' : 'great_enemy'
}

/**
 * Frozen pre-2.1 dignity LABEL of `planet` sitting in `vargaSignNumber`.
 *
 * This is a verbatim transcription of `getVargaDignityLabel`'s body as it existed BEFORE
 * task 2.1 introduced `MOOLATRIKONA_RANGES` and the optional `degreeInSign` parameter: the
 * moolatrikona test is whole-sign-only (`MOOLATRIKONA_SIGNS[planet] === vargaSignNumber`),
 * with no degree logic whatsoever. Precedence is unchanged: exaltation → debilitation →
 * moolatrikona (sign-only) → own → maitri.
 *
 * @param planet           Planet name (Sun … Saturn). Rahu/Ketu → undefined.
 * @param vargaSignNumber  Sign number (1–12) the planet occupies in the varga being evaluated.
 * @param d1SignByPlanet   Map of planet → D1 (rasi) sign number, used for the tatkalika
 *                         friendship with the varga sign's lord.
 * @returns One of FrozenDignityLabel, or `undefined` for planets without classical friendship
 *          dignity (Rahu/Ketu).
 */
export function frozenWholeSignDignityLabel(
  planet: string,
  vargaSignNumber: number,
  d1SignByPlanet: Record<string, number>
): FrozenDignityLabel | undefined {
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
