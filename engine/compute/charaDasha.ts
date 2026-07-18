/**
 * engine/compute/charaDasha.ts — Jaimini Chara Dasha (sign/rasi-based dasha).
 *
 * Deterministic, pure function. Unlike Vimshottari (nakshatra/Moon-based, planet
 * mahadashas), Chara Dasha is a RASI dasha: every mahadasha is a SIGN, and the
 * sequence + durations are derived from the D1 sign positions of the sign-lords.
 *
 * METHOD: Parasara / PVR Chara Dasha — the variant Jagannatha Hora produces by
 * default. Calibrated and verified end-to-end (all 24 mahadashas of both cycles)
 * against JHora for the Mojo chart (Taurus lagna). Rules:
 *
 *   1. First dasha = Lagna sign.
 *
 *   2. SEQUENCE DIRECTION is fixed by the NINTH sign from the lagna:
 *        - if the 9th sign is EVEN-FOOTED (Sama-pada) → dashas run REVERSE
 *          (anti-zodiacal) from the lagna;
 *        - otherwise → FORWARD (zodiacal).
 *      Even-footed (Sama-pada): Cancer, Leo, Virgo, Capricorn, Aquarius, Pisces
 *      {4,5,6,10,11,12}. Odd-footed (Vishama-pada): Aries, Taurus, Gemini, Libra,
 *      Scorpio, Sagittarius {1,2,3,7,8,9}.
 *
 *   3. SIGN LORD (drives the duration):
 *        - single-lord signs → the classical owner;
 *        - Scorpio (Mars/Ketu) and Aquarius (Saturn/Rahu) are DUAL-lord signs:
 *          use the NODE (Ketu for Scorpio, Rahu for Aquarius) UNLESS that node
 *          occupies the sign itself, in which case use the planet (Mars/Saturn).
 *      (Verified on the Mojo chart: Scorpio → Mars because Ketu is IN Scorpio;
 *       Aquarius → Rahu because Rahu is NOT in Aquarius.)
 *
 *   4. DURATION of a sign's dasha = count from the sign to the sign occupied by
 *      its lord, MINUS 1:
 *        - odd-footed sign  → count FORWARD (zodiacal) sign → lord;
 *        - even-footed sign → count REVERSE (anti-zodiacal) sign → lord.
 *      If count − 1 ≤ 0 (lord in the sign itself) → 12 years. NO exaltation/
 *      debilitation adjustment (that is the KN Rao variant, which JHora's default
 *      does NOT apply).
 *
 *   5. TWO CYCLES (Parasara): the 12 signs run twice. In the SECOND cycle each
 *      sign's duration = 12 − (its first-cycle duration). Consequently a 12-year
 *      first-cycle sign has a 0-year second-cycle period (kept for parity with
 *      JHora, which lists it as "0d"). Every chart therefore totals 12×12 = 144
 *      years across the two cycles.
 *
 *   6. ANTARDASHA: each mahadasha is split into 12 EQUAL sub-periods. The order is
 *      the SAME for every mahadasha — the 12-sign progression with the LAGNA moved
 *      to the end (2nd maha sign first, cycling in the dasha direction, lagna
 *      last). Verified on the Mojo chart: Sagittarius MD → Ari, Pis, Aqu, Cap,
 *      Sag, Sco, Lib, Vir, Leo, Can, Gem, Tau.
 *
 * Source: PVR Narasimha Rao / Parasara Chara Dasa; calibrated against Jagannatha
 * Hora output. See docs/computation_chara_dasha.md. NOTE: JHora's strength-based
 * progression SEED (stronger of asc-/sun-/moon-lord) is approximated here by the
 * LAGNA seed — correct whenever the seed resolves to the lagna (as on the Mojo
 * chart). See the validation note in the docs.
 */

import type { CharaDashaResult, CharaDashaPeriod, CharaAntardasha, PlanetPosition } from './types'
import { getSignName } from './planets'
import { SIGN_LORDS } from './dignity'
import { YEAR_DAYS } from '../constants'

/** Vishama-pada (odd-footed) signs: Aries, Taurus, Gemini, Libra, Scorpio, Sagittarius. */
const ODD_FOOTED = new Set([1, 2, 3, 7, 8, 9])
/** Sama-pada (even-footed) signs: Cancer, Leo, Virgo, Capricorn, Aquarius, Pisces. */
const EVEN_FOOTED = new Set([4, 5, 6, 10, 11, 12])

const SCORPIO = 8
const AQUARIUS = 11

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

/**
 * Chara Dasha lord of a sign. For the dual-lord signs (Scorpio, Aquarius) the
 * NODE is the lord unless the node occupies that very sign, in which case the
 * classical planet is used.
 */
function charaLord(sign: number, signPositions: Record<string, number>): string {
  if (sign === SCORPIO) return signPositions['Ketu'] === SCORPIO ? 'Mars' : 'Ketu'
  if (sign === AQUARIUS) return signPositions['Rahu'] === AQUARIUS ? 'Saturn' : 'Rahu'
  return SIGN_LORDS[sign]
}

/** First-cycle duration (years) of one sign's Chara mahadasha (Parasara method). */
function charaDashaYears(sign: number, signPositions: Record<string, number>): {
  years: number
  lord: string
  lordSignNumber: number
} {
  const lord = charaLord(sign, signPositions)
  const lordSignNumber = signPositions[lord] ?? sign

  // Count sign → lord: forward for odd-footed, reverse for even-footed signs.
  const count = ODD_FOOTED.has(sign)
    ? countForward(sign, lordSignNumber)
    : countForward(lordSignNumber, sign) // reverse sign→lord == forward lord→sign

  let years = count - 1
  if (years <= 0) years = 12 // lord in the sign itself
  return { years, lord, lordSignNumber }
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
 * Computes the Jaimini Chara Dasha (Parasara / PVR method, JHora-matching).
 *
 * @param planets         D1 planet positions (classical + nodes, with signs).
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
  // Sign occupied by each planet/node.
  const signPositions: Record<string, number> = {}
  for (const p of planets) signPositions[p.planet] = p.signNumber

  // Sequence direction from the 9th sign from the lagna.
  const ninthSignNumber = signNFrom(lagnaSignNumber, 9)
  const direction: 'forward' | 'reverse' = EVEN_FOOTED.has(ninthSignNumber) ? 'reverse' : 'forward'

  // One full cycle of 12 sign-dashas from the lagna in the chosen direction.
  const cycleSigns: number[] = []
  for (let i = 0; i < 12; i++) {
    cycleSigns.push(
      direction === 'forward'
        ? signNFrom(lagnaSignNumber, i + 1)
        : ((lagnaSignNumber - 1 - i + 120) % 12) + 1
    )
  }

  const cycleDurations = cycleSigns.map((s) => charaDashaYears(s, signPositions))
  const cycleYears = cycleDurations.reduce((sum, d) => sum + d.years, 0)

  // Antardasha order (Parasara / JHora): the maha progression with the lagna
  // moved to the end — the same 12-sign sequence for every mahadasha.
  const antardashaOrder = [...cycleSigns.slice(1), cycleSigns[0]]

  // TWO cycles. Second-cycle duration for each sign = 12 − first-cycle duration.
  const periods: CharaDashaPeriod[] = []
  let cursor = new Date(birthDate.getTime())
  for (let cycle = 0; cycle < 2; cycle++) {
    for (let i = 0; i < 12; i++) {
      const sign = cycleSigns[i]
      const { lord, lordSignNumber, years: firstYears } = cycleDurations[i]
      const years = cycle === 0 ? firstYears : 12 - firstYears
      const start = new Date(cursor.getTime())
      const end = addYears(start, years)
      periods.push({
        sign: getSignName(sign),
        signNumber: sign,
        lord,
        lordSignNumber,
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
    method: 'Parasara / PVR (JHora-matching, 2-cycle)',
    lagnaSignNumber,
    ninthSignNumber,
    direction,
    cycleYears,
    periods,
  }
}
