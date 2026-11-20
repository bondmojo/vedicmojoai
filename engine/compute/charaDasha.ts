/**
 * engine/compute/charaDasha.ts — Jaimini Chara Dasha (sign/rasi-based dasha).
 *
 * Deterministic, pure function. Unlike Vimshottari (nakshatra/Moon-based, planet
 * mahadashas), Chara Dasha is a RASI dasha: every mahadasha is a SIGN, and the
 * sequence + durations are derived from the D1 sign positions of the sign-lords.
 *
 * METHOD: Parasara / PVR Chara Dasha, as written up by P.V.R. Narasimha Rao
 * (vedicastrologer.org/articles/pp_chara_dasa.pdf) and produced by Jagannatha
 * Hora. Verified mahadasha-for-mahadasha against Jagannatha Hora on two charts:
 * a Taurus-lagna chart whose seed is the lagna, and an Aquarius-lagna chart
 * whose seed is the Moon sign (Cancer). Rules:
 *
 *   1. SEED (first dasha) = whichever of the signs holding the LAGNA, MOON and
 *      SUN has the strongest lord. Tests, in order, until one sign is left:
 *        (a) lord in exaltation, moolatrikona or own sign;
 *        (b) lord joined by more planets;
 *        (c) lord in a trine (1/5/9) from the sign;
 *        (d) lord in a quadrant (1/4/7/10) from the sign;
 *        (e) lord more advanced in the sign it occupies (nodes: 30° − degree);
 *        (g) if the remaining signs share one lord: the sign whose oddity differs
 *            from that of the sign the lord occupies.
 *      Still tied → lagna, then Moon, then Sun (never reached by real charts:
 *      two different lords are tied on (e) only at identical degrees).
 *      NOT IMPLEMENTED: the paper's exception (f) — a lord deeply combust,
 *      defeated in planetary war, in deep gandanta or deep debilitation counts as
 *      weak. The paper gives no thresholds for "deep".
 *
 *   2. SEQUENCE DIRECTION is fixed by the NINTH sign from the SEED:
 *        - 9th sign EVEN-FOOTED (Sama-pada) → REVERSE (anti-zodiacal);
 *        - otherwise → FORWARD (zodiacal).
 *      Even-footed: Cancer, Leo, Virgo, Capricorn, Aquarius, Pisces {4,5,6,10,11,12}.
 *      Odd-footed:  Aries, Taurus, Gemini, Libra, Scorpio, Sagittarius {1,2,3,7,8,9}.
 *
 *   3. SIGN LORD (drives the duration): single-lord signs → the classical owner.
 *      Scorpio (Mars/Ketu) and Aquarius (Saturn/Rahu) take the STRONGER co-lord:
 *        - both co-lords in the sign → 12 years;
 *        - one in the sign → the OTHER one;
 *        - neither → in order: joined by more planets; more of Jupiter, Mercury
 *          and its dispositor conjoining or rasi-aspecting it; exalted (nodes:
 *          Rahu in Ta/Ge, Ketu in Sc/Sg); sign type dual > fixed > movable; more
 *          advanced in its sign (nodes: 30° − degree).
 *      This is Jagannatha Hora's co-lord strength order (as ported by PyJHora's
 *      house.stronger_planet_from_planet_positions). It is NOT the paper's own
 *      list, whose "movable > fixed > dual" step picks Rahu for the Aquarius-lagna
 *      reference chart where Jagannatha Hora uses Saturn.
 *
 *   4. DURATION = count from the sign to the sign occupied by its lord, MINUS 1
 *      (odd-footed sign → count forward, even-footed → count reverse). Lord in
 *      the sign itself → 12 years. NO exaltation/debilitation adjustment (that
 *      is the KN Rao variant; the paper rejects it).
 *
 *   5. TWO CYCLES: the 12 signs run twice; second-cycle duration = 12 − the
 *      first-cycle duration (a 12-year sign gets a 0-year second period, kept for
 *      parity with Jagannatha Hora's "0d" row). Total 144 years.
 *
 *   6. ANTARDASHA: 12 EQUAL sub-periods per mahadasha, in the SAME order for every
 *      mahadasha — the mahadasha progression with the seed moved to the end.
 *      Verified only on a lagna-seeded chart (Sagittarius MD → Ari, Pis, Aqu,
 *      Cap, Sag, Sco, Lib, Vir, Leo, Can, Gem, Tau); unverified when the seed is
 *      the Moon or Sun sign.
 *
 * See docs/computation_chara_dasha.md.
 */

import type {
  CharaDashaResult,
  CharaDashaPeriod,
  CharaAntardasha,
  CharaSeedReference,
  PlanetPosition,
} from './types'
import { getSignName } from './planets'
import { SIGN_LORDS, EXALTATION_SIGNS, getVargaDignityLabel } from './dignity'
import { SIGN_MODALITY, RASHI_ASPECT_MATRIX } from './relationships'
import { YEAR_DAYS } from '../constants'

/** Vishama-pada (odd-footed) signs: Aries, Taurus, Gemini, Libra, Scorpio, Sagittarius. */
const ODD_FOOTED = new Set([1, 2, 3, 7, 8, 9])
/** Sama-pada (even-footed) signs: Cancer, Leo, Virgo, Capricorn, Aquarius, Pisces. */
const EVEN_FOOTED = new Set([4, 5, 6, 10, 11, 12])

const SCORPIO = 8
const AQUARIUS = 11

/** Dual-lord signs → [classical planet, node]. */
const CO_LORDS: Record<number, [string, string]> = {
  [SCORPIO]: ['Mars', 'Ketu'],
  [AQUARIUS]: ['Saturn', 'Rahu'],
}

const NODES = new Set(['Rahu', 'Ketu'])
/** Node exaltation signs as Jagannatha Hora uses them (Rahu Ta/Ge, Ketu Sc/Sg). */
const NODE_EXALTATION: Record<string, number[]> = { Rahu: [2, 3], Ketu: [8, 9] }
/** Node own signs (the dual-lord signs they co-own). */
const NODE_OWN: Record<string, number> = { Rahu: AQUARIUS, Ketu: SCORPIO }

/** Natural strength of the sign a co-lord occupies: dual > fixed > movable. */
const MODALITY_RANK = { dual: 3, fixed: 2, movable: 1 } as const

/** Seed references in tie-break order. */
const SEED_ORDER: CharaSeedReference[] = ['lagna', 'moon', 'sun']
const SEED_LABEL: Record<CharaSeedReference, string> = { lagna: 'Lagna', moon: 'Moon', sun: 'Sun' }

/** Where each planet sits, by name. */
interface ChartIndex {
  sign: Record<string, number>
  degree: Record<string, number>
}

/** Sign that is `nth` (1-based) zodiacal from a base sign (wraps 1–12). */
function signNFrom(baseSign: number, nth: number): number {
  return ((baseSign - 1 + (nth - 1)) % 12) + 1
}

/** Forward (zodiacal) inclusive count of signs from `from` to `to` (1–12). */
function countForward(from: number, to: number): number {
  return ((to - from + 12) % 12) + 1
}

/** Add fractional years to a date (never mutates the input). */
function addYears(date: Date, years: number): Date {
  return new Date(date.getTime() + years * YEAR_DAYS * 24 * 60 * 60 * 1000)
}

/** How far a planet has travelled through its sign; nodes move backwards. */
function advancement(planet: string, idx: ChartIndex): number {
  const d = idx.degree[planet] ?? 0
  return NODES.has(planet) ? 30 - d : d
}

/** Other planets sharing `planet`'s sign. */
function companions(planet: string, idx: ChartIndex): number {
  const s = idx.sign[planet]
  return Object.entries(idx.sign).filter(([p, sign]) => p !== planet && sign === s).length
}

function isExalted(planet: string, sign: number): boolean {
  return NODES.has(planet)
    ? (NODE_EXALTATION[planet] ?? []).includes(sign)
    : EXALTATION_SIGNS[planet] === sign
}

/**
 * Count of Jupiter, Mercury and `planet`'s dispositor that sit with it or cast a
 * rasi (sign) aspect on it. A helper that fills two roles (e.g. Jupiter as the
 * dispositor) counts twice, as in Jagannatha Hora; a planet is never its own helper.
 */
function supportCount(planet: string, idx: ChartIndex): number {
  const s = idx.sign[planet]
  let n = 0
  for (const helper of ['Jupiter', 'Mercury', SIGN_LORDS[s]]) {
    if (helper === planet) continue
    const hs = idx.sign[helper]
    if (hs == null) continue
    if (hs === s || RASHI_ASPECT_MATRIX[hs]?.includes(s)) n++
  }
  return n
}

/**
 * The lord used for a sign's duration (and its strength in the seed test). For
 * Scorpio/Aquarius this is the stronger co-lord; `rule` says which test chose it.
 */
function charaLord(sign: number, idx: ChartIndex): { lord: string; rule?: string } {
  const pair = CO_LORDS[sign]
  if (!pair) return { lord: SIGN_LORDS[sign] }

  const [planet, node] = pair
  const signName = getSignName(sign)
  // Defensive: a chart without node positions falls back to the classical lord.
  if (idx.sign[node] == null) return { lord: planet, rule: `${node} position unavailable` }
  if (idx.sign[planet] == null) return { lord: node, rule: `${planet} position unavailable` }

  const planetIn = idx.sign[planet] === sign
  const nodeIn = idx.sign[node] === sign
  if (planetIn && nodeIn) return { lord: planet, rule: `both co-lords occupy ${signName}` }
  if (planetIn) return { lord: node, rule: `${planet} occupies ${signName}, so ${node} counts` }
  if (nodeIn) return { lord: planet, rule: `${node} occupies ${signName}, so ${planet} counts` }

  const tests: Array<[string, (p: string) => number]> = [
    ['joined by more planets', (p) => companions(p, idx)],
    ['more of Jupiter, Mercury and its dispositor join or aspect it', (p) => supportCount(p, idx)],
    ['exalted', (p) => (isExalted(p, idx.sign[p]) ? 1 : 0)],
    ['in a stronger sign type (dual > fixed > movable)', (p) => MODALITY_RANK[SIGN_MODALITY[idx.sign[p]]]],
    ['more advanced in its sign', (p) => advancement(p, idx)],
  ]
  for (const [label, score] of tests) {
    const a = score(planet)
    const b = score(node)
    if (a !== b) {
      const lord = a > b ? planet : node
      return { lord, rule: `${lord} is stronger: ${label}` }
    }
  }
  return { lord: node, rule: `co-lords tied on every test; ${node} used` }
}

type StrongDignity = 'exalted' | 'moolatrikona' | 'own'
const DIGNITY_PHRASE: Record<StrongDignity, string> = {
  exalted: 'exalted',
  moolatrikona: 'in moolatrikona',
  own: 'in its own sign',
}

/** The lord's dignity when it is exaltation, moolatrikona or own sign; else null. */
function strongDignity(lord: string, idx: ChartIndex): StrongDignity | null {
  const s = idx.sign[lord]
  if (s == null) return null
  if (NODES.has(lord)) return isExalted(lord, s) ? 'exalted' : NODE_OWN[lord] === s ? 'own' : null
  const label = getVargaDignityLabel(lord, s, idx.sign, idx.degree[lord])
  return label === 'exalted' || label === 'moolatrikona' || label === 'own' ? label : null
}

/**
 * Picks the seed sign: the sign of the lagna, Moon or Sun whose lord is
 * strongest, using the paper's tests (a)–(e) then (g) in order.
 */
function pickSeed(
  lagnaSignNumber: number,
  idx: ChartIndex
): { sign: number; references: CharaSeedReference[]; rule: string } {
  const refSign: Record<CharaSeedReference, number | undefined> = {
    lagna: lagnaSignNumber,
    moon: idx.sign['Moon'],
    sun: idx.sign['Sun'],
  }

  // One candidate per distinct sign, keeping lagna → Moon → Sun order.
  interface Candidate { sign: number; references: CharaSeedReference[]; lord: string }
  const candidates: Candidate[] = []
  for (const ref of SEED_ORDER) {
    const sign = refSign[ref]
    if (sign == null) continue
    const existing = candidates.find((c) => c.sign === sign)
    if (existing) existing.references.push(ref)
    else candidates.push({ sign, references: [ref], lord: charaLord(sign, idx).lord })
  }

  const describe = (c: Candidate) =>
    `${getSignName(c.sign)} (${c.references.map((r) => SEED_LABEL[r]).join('/')})`
  const lordAt = (c: Candidate) => idx.sign[c.lord] ?? c.sign

  if (candidates.length === 1) {
    const c = candidates[0]
    return { sign: c.sign, references: c.references, rule: `Lagna, Moon and Sun share ${getSignName(c.sign)}` }
  }

  const tests: Array<{ label: (c: Candidate) => string; score: (c: Candidate) => number; when?: (r: Candidate[]) => boolean }> = [
    {
      label: (c) => `its lord ${c.lord} is ${DIGNITY_PHRASE[strongDignity(c.lord, idx) as StrongDignity]}`,
      score: (c) => (strongDignity(c.lord, idx) ? 1 : 0),
    },
    { label: (c) => `its lord ${c.lord} is joined by more planets`, score: (c) => companions(c.lord, idx) },
    { label: (c) => `its lord ${c.lord} is in a trine from it`, score: (c) => ([1, 5, 9].includes(countForward(c.sign, lordAt(c))) ? 1 : 0) },
    { label: (c) => `its lord ${c.lord} is in a quadrant from it`, score: (c) => ([1, 4, 7, 10].includes(countForward(c.sign, lordAt(c))) ? 1 : 0) },
    { label: (c) => `its lord ${c.lord} is more advanced in its sign`, score: (c) => advancement(c.lord, idx) },
    {
      label: (c) => `its oddity differs from the sign its lord ${c.lord} occupies`,
      score: (c) => (c.sign % 2 !== lordAt(c) % 2 ? 1 : 0),
      when: (r) => r.every((c) => c.lord === r[0].lord),
    },
  ]

  let remaining = candidates
  for (const test of tests) {
    if (test.when && !test.when(remaining)) continue
    const scores = remaining.map(test.score)
    const best = Math.max(...scores)
    const next = remaining.filter((_, i) => scores[i] === best)
    if (next.length === 1) {
      const w = next[0]
      return { sign: w.sign, references: w.references, rule: `${describe(w)} is strongest: ${test.label(w)}` }
    }
    remaining = next
  }

  const w = remaining[0]
  return { sign: w.sign, references: w.references, rule: `${describe(w)}: strength tests tied; earliest of Lagna, Moon, Sun used` }
}

/** First-cycle duration (years) of one sign's Chara mahadasha (Parasara method). */
function charaDashaYears(sign: number, idx: ChartIndex): {
  years: number
  lord: string
  lordSignNumber: number
  lordRule?: string
} {
  const { lord, rule } = charaLord(sign, idx)
  const lordSignNumber = idx.sign[lord] ?? sign

  // Count sign → lord: forward for odd-footed, reverse for even-footed signs.
  const count = ODD_FOOTED.has(sign)
    ? countForward(sign, lordSignNumber)
    : countForward(lordSignNumber, sign) // reverse sign→lord == forward lord→sign

  let years = count - 1
  if (years <= 0) years = 12 // lord in the sign itself (also: both co-lords in it)
  return { years, lord, lordSignNumber, lordRule: rule }
}

/** Build the 12 equal antardashas of a mahadasha in the shared `antardashaOrder`. */
function buildAntardashas(
  antardashaOrder: number[],
  mahaYears: number,
  mahaStart: Date
): CharaAntardasha[] {
  const antardashas: CharaAntardasha[] = []
  const each = mahaYears / 12
  let cursor = new Date(mahaStart.getTime())
  for (const signNumber of antardashaOrder) {
    const start = new Date(cursor.getTime())
    const end = addYears(start, each)
    antardashas.push({
      sign: getSignName(signNumber),
      signNumber,
      start: start.toISOString(),
      end: end.toISOString(),
      durationYears: each,
    })
    cursor = end
  }
  return antardashas
}

/**
 * Computes the Jaimini Chara Dasha (Parasara / PVR method, Jagannatha Hora-matching).
 *
 * @param planets         D1 planet positions (classical + nodes, with signs and degrees).
 * @param lagnaSignNumber Ascendant sign (1–12).
 * @param birthDate       Birth instant (UTC) — anchors absolute start/end dates.
 * @returns CharaDashaResult with two cycles of dated sign mahadashas (144 years
 *          total) + 12 equal antardashas each.
 */
export function computeCharaDasha(
  planets: PlanetPosition[],
  lagnaSignNumber: number,
  birthDate: Date
): CharaDashaResult {
  const idx: ChartIndex = { sign: {}, degree: {} }
  for (const p of planets) {
    idx.sign[p.planet] = p.signNumber
    idx.degree[p.planet] = p.degreeInSign
  }

  const seed = pickSeed(lagnaSignNumber, idx)

  // Sequence direction from the 9th sign from the seed.
  const ninthSignNumber = signNFrom(seed.sign, 9)
  const direction: 'forward' | 'reverse' = EVEN_FOOTED.has(ninthSignNumber) ? 'reverse' : 'forward'

  // One full cycle of 12 sign-dashas from the seed in the chosen direction.
  const cycleSigns: number[] = []
  for (let i = 0; i < 12; i++) {
    cycleSigns.push(
      direction === 'forward'
        ? signNFrom(seed.sign, i + 1)
        : ((seed.sign - 1 - i + 120) % 12) + 1
    )
  }

  const cycleDurations = cycleSigns.map((s) => charaDashaYears(s, idx))
  const cycleYears = cycleDurations.reduce((sum, d) => sum + d.years, 0)

  // Antardasha order: the maha progression with the seed moved to the end —
  // the same 12-sign sequence for every mahadasha.
  const antardashaOrder = [...cycleSigns.slice(1), cycleSigns[0]]

  // TWO cycles. Second-cycle duration for each sign = 12 − first-cycle duration.
  const periods: CharaDashaPeriod[] = []
  let cursor = new Date(birthDate.getTime())
  for (let cycle = 0; cycle < 2; cycle++) {
    for (let i = 0; i < 12; i++) {
      const sign = cycleSigns[i]
      const { lord, lordSignNumber, lordRule, years: firstYears } = cycleDurations[i]
      const years = cycle === 0 ? firstYears : 12 - firstYears
      const start = new Date(cursor.getTime())
      const end = addYears(start, years)
      periods.push({
        sign: getSignName(sign),
        signNumber: sign,
        lord,
        lordSignNumber,
        ...(lordRule ? { lordRule } : {}),
        durationYears: years,
        cycle: cycle + 1,
        start: start.toISOString(),
        end: end.toISOString(),
        // A 0-year (second-cycle) period has no meaningful sub-periods.
        antardashas: years > 0 ? buildAntardashas(antardashaOrder, years, start) : [],
      })
      cursor = end
    }
  }

  return {
    method: 'Parasara / PVR (strongest of Lagna/Moon/Sun seed, 2-cycle)',
    lagnaSignNumber,
    seedSignNumber: seed.sign,
    seedReferences: seed.references,
    seedRule: seed.rule,
    ninthSignNumber,
    direction,
    cycleYears,
    periods,
  }
}
