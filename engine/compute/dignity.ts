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

/**
 * Classical moolatrikona degree span within the moolatrikona sign, as
 * [fromDeg, toDeg) degrees-in-sign. Outside the span the placement falls
 * through to the own-sign test (BPHS / PVR Narasimha Rao). `MOOLATRIKONA_SIGNS`
 * remains the sign gate; this table only refines it when a usable degree is
 * supplied.
 */
export const MOOLATRIKONA_RANGES: Record<string, { fromDeg: number; toDeg: number }> = {
  Sun:     { fromDeg: 0,  toDeg: 20 },  // Leo
  Moon:    { fromDeg: 4,  toDeg: 30 },  // Taurus
  Mars:    { fromDeg: 0,  toDeg: 12 },  // Aries
  Mercury: { fromDeg: 16, toDeg: 20 },  // Virgo
  Jupiter: { fromDeg: 0,  toDeg: 10 },  // Sagittarius
  Venus:   { fromDeg: 0,  toDeg: 15 },  // Libra
  Saturn:  { fromDeg: 0,  toDeg: 20 },  // Aquarius
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

/**
 * OWN-property lookup into `PERMANENT_FRIENDSHIP`, the gate both public functions
 * use to decide whether a name is a classical planet at all.
 *
 * A bare `PERMANENT_FRIENDSHIP[planet]` also resolves *inherited* Object.prototype
 * members — `'__proto__'`, `'toString'`, `'valueOf'`, `'constructor'`, … — so those
 * names would pass a truthiness guard and then crash on `OWN_SIGNS[planet].includes`
 * (Object.prototype has no `includes`). Only own keys count as planets.
 */
function friendshipRow(planet: string): { friends: string[]; enemies: string[] } | undefined {
  return Object.prototype.hasOwnProperty.call(PERMANENT_FRIENDSHIP, planet)
    ? PERMANENT_FRIENDSHIP[planet]
    : undefined
}

/** Permanent (naisargika) relation of `planet` toward `other`. */
function permanentRelation(planet: string, other: string): PermRelation {
  const rel = friendshipRow(planet)
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
 * @param degreeInSign     Degree within `vargaSignNumber`, 0–30. Supply ONLY when
 *                         the placement genuinely carries a degree in that sign
 *                         (i.e. D1). Omitted, non-finite or out of `[0, 30)` is
 *                         treated as "no degree supplied", so the moolatrikona
 *                         test falls back to the whole-sign rule.
 * @returns One of DignityLabel, or `undefined` for planets without classical
 *          friendship dignity (Rahu/Ketu).
 */
export function getVargaDignityLabel(
  planet: string,
  vargaSignNumber: number,
  d1SignByPlanet: Record<string, number>,
  degreeInSign?: number
): DignityLabel | undefined {
  // Nodes (and anything without a friendship row) carry no classical dignity.
  if (!friendshipRow(planet)) return undefined

  if (EXALTATION_SIGNS[planet] === vargaSignNumber) return 'exalted'
  if (DEBILITATION_SIGNS[planet] === vargaSignNumber) return 'debilitated'
  if (MOOLATRIKONA_SIGNS[planet] === vargaSignNumber) {
    const degreeUsable =
      Number.isFinite(degreeInSign) && (degreeInSign as number) >= 0 && (degreeInSign as number) < 30
    if (!degreeUsable) return 'moolatrikona'
    const range = MOOLATRIKONA_RANGES[planet]
    const inRange = !!range && (degreeInSign as number) >= range.fromDeg && (degreeInSign as number) < range.toDeg
    if (inRange) return 'moolatrikona'
    // Usable degree, but outside the range → fall through to the own test.
  }
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

// ─── Dignity reason ──────────────────────────────────────────────────

/** Zodiac sign names, 1-indexed via `SIGN_NAMES[signNumber - 1]`. */
const SIGN_NAMES: readonly string[] = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
]

/** Which classical rule produced a Dignity_Label. Mirrors getVargaDignityLabel's precedence. */
export type DignityRule =
  | 'exaltation'
  | 'debilitation'
  | 'moolatrikona'           // sign matched AND the degree fell inside MOOLATRIKONA_RANGES
  | 'moolatrikona_sign_only' // sign matched, no usable degree was supplied
  | 'own'
  | 'maitri'                 // permanent + temporary combined
  | 'maitri_permanent_only'  // a D1 sign was missing for the planet or the sign lord

export interface DignityReason {
  rule: DignityRule
  /** The label this reason explains — always equals getVargaDignityLabel for the same inputs. */
  label: DignityLabel
  /** Single plain-text sentence, ≤160 characters, no markup. */
  text: string
  /** Lord of the occupied sign — set only on the two maitri rules. */
  signLord?: string
  permanentRelation?: PermRelation
  /** Absent on 'maitri_permanent_only'. */
  temporaryRelation?: 'friend' | 'enemy'
}

/** "the Sun"/"the Moon" for the two luminaries, otherwise the bare planet name. */
function planetSubject(planet: string, capitalizeFirst: boolean): string {
  const subject = planet === 'Sun' || planet === 'Moon' ? `the ${planet}` : planet
  if (!capitalizeFirst) return subject
  return subject.charAt(0).toUpperCase() + subject.slice(1)
}

/** Possessive form of `planetSubject`, e.g. "the Sun's" / "Venus's". */
function planetPossessive(planet: string): string {
  return `${planetSubject(planet, false)}'s`
}

/** Compound-maitri label rendered as words, e.g. `great_friend` → "great friend". */
function labelWords(label: DignityLabel): string {
  return label.replace(/_/g, ' ')
}

/**
 * Human-readable reason for the dignity LABEL of `planet` in `vargaSignNumber`.
 *
 * Selects exactly ONE rule using the same precedence as `getVargaDignityLabel`:
 * exaltation → debilitation → moolatrikona → own → compound maitri.
 *
 * Must be called with the SAME `degreeInSign` argument as the label it explains
 * — see `getVargaDignityLabel`'s docs for "usable degree" semantics — otherwise
 * the reason and the label can disagree.
 *
 * @returns `undefined` when the planet carries no classical dignity (Rahu/Ketu —
 *          absent from `PERMANENT_FRIENDSHIP`), or when `vargaSignNumber` is not
 *          an integer 1–12.
 */
export function getVargaDignityReason(
  planet: string,
  vargaSignNumber: number,
  d1SignByPlanet: Record<string, number>,
  degreeInSign?: number
): DignityReason | undefined {
  // Nodes (and anything without a friendship row) carry no classical dignity.
  if (!friendshipRow(planet)) return undefined
  if (!Number.isInteger(vargaSignNumber) || vargaSignNumber < 1 || vargaSignNumber > 12) return undefined

  const sign = SIGN_NAMES[vargaSignNumber - 1]

  if (EXALTATION_SIGNS[planet] === vargaSignNumber) {
    return {
      rule: 'exaltation',
      label: 'exalted',
      text: `${sign} is ${planetPossessive(planet)} exaltation sign.`,
    }
  }

  if (DEBILITATION_SIGNS[planet] === vargaSignNumber) {
    return {
      rule: 'debilitation',
      label: 'debilitated',
      text: `${sign} is ${planetPossessive(planet)} debilitation sign.`,
    }
  }

  if (MOOLATRIKONA_SIGNS[planet] === vargaSignNumber) {
    const degreeUsable =
      Number.isFinite(degreeInSign) && (degreeInSign as number) >= 0 && (degreeInSign as number) < 30
    if (!degreeUsable) {
      return {
        rule: 'moolatrikona_sign_only',
        label: 'moolatrikona',
        text: `${sign} is ${planetPossessive(planet)} moolatrikona sign; no degree was available, so the sign alone was used.`,
      }
    }
    const range = MOOLATRIKONA_RANGES[planet]
    const inRange = !!range && (degreeInSign as number) >= range.fromDeg && (degreeInSign as number) < range.toDeg
    if (inRange) {
      return {
        rule: 'moolatrikona',
        label: 'moolatrikona',
        text: `${planetSubject(planet, true)} at ${(degreeInSign as number).toFixed(1)}° of ${sign} falls in its moolatrikona range ${range!.fromDeg}°–${range!.toDeg}°.`,
      }
    }
    // Usable degree, but outside the range → fall through to the own test.
  }

  if (OWN_SIGNS[planet]?.includes(vargaSignNumber)) {
    return {
      rule: 'own',
      label: 'own',
      text: `${sign} is ${planetPossessive(planet)} own sign.`,
    }
  }

  const lord = SIGN_LORDS[vargaSignNumber]
  const perm = permanentRelation(planet, lord)

  const planetD1 = d1SignByPlanet[planet]
  const lordD1 = d1SignByPlanet[lord]
  if (planetD1 == null || lordD1 == null) {
    const label: DignityLabel = perm === 'friend' ? 'friend' : perm === 'enemy' ? 'enemy' : 'neutral'
    return {
      rule: 'maitri_permanent_only',
      label,
      signLord: lord,
      permanentRelation: perm,
      text: `${sign} is ruled by ${lord}, ${planetPossessive(planet)} permanent ${perm}; no rasi positions were available for the temporary relation.`,
    }
  }

  const temp = temporaryRelation(planetD1, lordD1)
  const label = combineToLabel(perm, temp)
  return {
    rule: 'maitri',
    label,
    signLord: lord,
    permanentRelation: perm,
    temporaryRelation: temp,
    text: `${sign} is ruled by ${lord}, ${planetPossessive(planet)} permanent ${perm} and temporary ${temp} — compound maitri gives ${labelWords(label)}.`,
  }
}
