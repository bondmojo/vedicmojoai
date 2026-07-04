/**
 * engine/compute/arudhaPadas.ts — Arudha Pada computation (Jaimini).
 *
 * Computes A1–A12 (Arudha Pada for each of the 12 houses).
 * Special names:
 *   A1  = Arudha Lagna (AL)
 *   A2  = Dhana Pada
 *   A3  = Vikrama Pada (Bhratri Pada)
 *   A4  = Matri Pada
 *   A5  = Putra Pada (Mantra Pada)
 *   A6  = Roga Pada (Shatru Pada)
 *   A7  = Dara Pada (Upapada context)
 *   A8  = Mrityu Pada
 *   A9  = Pitri Pada (Bhagya Pada)
 *   A10 = Karma Pada (Rajya Pada)
 *   A11 = Labha Pada
 *   A12 = Upapada Lagna (UL) — Vyaya Pada
 *
 * Method (BPHS / Jaimini Sutras):
 *   1. Find the lord of house H (from lagna, whole sign).
 *   2. Count from H to the lord's sign (the "lordCount").
 *   3. Count the same number of signs from the lord's sign.
 *   4. That final sign is the Arudha Pada of H.
 *
 *   Exception rules:
 *   - If the Arudha falls in the same sign as H: use the 10th from H instead.
 *   - If the Arudha falls in the 7th from H: use the 4th from H instead.
 */

// PlanetPosition not needed — we only use the narrower ArudhaPlanetInput type

// ─── Types ──────────────────────────────────────────────────────────

export interface ArudhaPada {
  house: number           // Which house this is the arudha of (1–12)
  name: string            // e.g. "Arudha Lagna", "Dhana Pada"
  abbr: string            // e.g. "AL", "A2"
  signNumber: number
  sign: string
  house_in_chart: number  // Which house the arudha falls in (from lagna)
}

// ─── Constants ──────────────────────────────────────────────────────

const SIGNS = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
]

const SIGN_LORDS: Record<string, string> = {
  Aries: 'Mars', Taurus: 'Venus', Gemini: 'Mercury', Cancer: 'Moon',
  Leo: 'Sun', Virgo: 'Mercury', Libra: 'Venus', Scorpio: 'Mars',
  Sagittarius: 'Jupiter', Capricorn: 'Saturn', Aquarius: 'Saturn', Pisces: 'Jupiter',
}

/**
 * Co-lords per Jaimini / Parashari convention used by Jagannatha Hora:
 *   Aquarius → Rahu (in addition to Saturn)
 *
 * Note: Scorpio has Ketu as a Jaimini co-lord in some schools, but
 * Jagannatha Hora uses Mars as the sole lord for Scorpio arudha computation.
 * Only Aquarius/Rahu substitution is applied here.
 */
const SIGN_CO_LORDS: Partial<Record<string, string>> = {
  Aquarius: 'Rahu',
}

const ARUDHA_NAMES: Record<number, { name: string; abbr: string }> = {
  1:  { name: 'Arudha Lagna',   abbr: 'AL' },
  2:  { name: 'Dhana Pada',     abbr: 'A2' },
  3:  { name: 'Vikrama Pada',   abbr: 'A3' },
  4:  { name: 'Matri Pada',     abbr: 'A4' },
  5:  { name: 'Putra Pada',     abbr: 'A5' },
  6:  { name: 'Roga Pada',      abbr: 'A6' },
  7:  { name: 'Dara Pada',      abbr: 'A7' },
  8:  { name: 'Mrityu Pada',    abbr: 'A8' },
  9:  { name: 'Pitri Pada',     abbr: 'A9' },
  10: { name: 'Karma Pada',     abbr: 'A10' },
  11: { name: 'Labha Pada',     abbr: 'A11' },
  12: { name: 'Upapada Lagna',  abbr: 'UL' },
}

// ─── Core Computation ────────────────────────────────────────────────

/**
 * Computes the raw arudha sign for a given lord position, applying both
 * standard BPHS exception rules.
 */
function arudhaFromLord(
  houseSignNumber: number,
  lordSignNumber: number
): number {
  let lordCount = ((lordSignNumber - houseSignNumber + 12) % 12)
  // BPHS rule: when the lord occupies the same sign as the house (distance = 0),
  // treat it as 12 signs away — not 0. This forces the raw arudha to land on the
  // house sign itself, so exception 1 fires and the 10th-from-house substitute
  // is applied. Without this, lordCount=0 would project to the lord's own sign.
  if (lordCount === 0) lordCount = 12

  let arudha = ((lordSignNumber - 1 + lordCount) % 12) + 1

  // Exception 1: arudha = house itself → use 10th from house
  if (arudha === houseSignNumber) {
    arudha = ((houseSignNumber - 1 + 9) % 12) + 1
  }

  // Exception 2: arudha = 7th from house → use 4th from house
  const seventhFromHouse = ((houseSignNumber - 1 + 6) % 12) + 1
  if (arudha === seventhFromHouse) {
    arudha = ((houseSignNumber - 1 + 3) % 12) + 1
  }

  return arudha
}

/**
 * Computes the Arudha Pada for a single house.
 * When the house sign is Aquarius, Rahu is used as the lord (Jaimini co-lord
 * convention, confirmed to match Jagannatha Hora). Scorpio uses Mars as the
 * sole lord — Ketu co-lordship is intentionally excluded here because the
 * Mars-based results match JHora for all Scorpio-lord arudhas in the test chart.
 *
 * @param houseNumber - The house (1–12) to compute the Arudha of
 * @param lagnaSignNumber - Ascendant sign number (1–12)
 * @param planets - Planet positions (only planet name and signNumber are used)
 */
function computeSingleArudha(
  houseNumber: number,
  lagnaSignNumber: number,
  planets: ArudhaPlanetInput[]
): number {
  // Sign occupied by this house
  const houseSignNumber = ((lagnaSignNumber - 1 + houseNumber - 1) % 12) + 1
  const houseSign = SIGNS[houseSignNumber - 1]

  const getLordSign = (name: string): number | null => {
    const p = planets.find((x) => x.planet === name)
    return p ? p.signNumber : null
  }

  const primaryLordName = SIGN_LORDS[houseSign]
  const coLordName = SIGN_CO_LORDS[houseSign]

  const primarySign = getLordSign(primaryLordName) ?? houseSignNumber
  const coSign = coLordName ? getLordSign(coLordName) : null

  // If no co-lord, just use the primary
  if (coSign === null) {
    return arudhaFromLord(houseSignNumber, primarySign)
  }

  // When a co-lord exists (Scorpio→Ketu, Aquarius→Rahu), Jagannatha Hora
  // always uses the co-lord. This matches the Jaimini convention where the
  // outer/higher-octave lord (Ketu for Scorpio, Rahu for Aquarius) takes
  // precedence over the classical single lord.
  return arudhaFromLord(houseSignNumber, coSign)
}

// ─── Main Export ─────────────────────────────────────────────────────

/**
 * Minimal planet shape required by the arudha computation: sign number to
 * locate the lord, and planet name to look up the lord mapping.
 * Using this narrower type makes the per-varga call site in index.ts
 * type-safe without forcing a full PlanetPosition cast.
 */
export type ArudhaPlanetInput = { planet: string; signNumber: number }

/**
 * Computes all 12 Arudha Padas from the birth chart.
 *
 * @param lagnaSignNumber - Ascendant sign number (1–12)
 * @param planets - Planet positions (only planet name and signNumber are used)
 */
export function computeArudhaPadas(
  lagnaSignNumber: number,
  planets: ArudhaPlanetInput[]
): ArudhaPada[] {
  const results: ArudhaPada[] = []

  for (let h = 1; h <= 12; h++) {
    const arudhaSignNumber = computeSingleArudha(h, lagnaSignNumber, planets)
    const { name, abbr } = ARUDHA_NAMES[h]
    const houseInChart = ((arudhaSignNumber - lagnaSignNumber + 12) % 12) + 1

    results.push({
      house: h,
      name,
      abbr,
      signNumber: arudhaSignNumber,
      sign: SIGNS[arudhaSignNumber - 1],
      house_in_chart: houseInChart,
    })
  }

  return results
}
