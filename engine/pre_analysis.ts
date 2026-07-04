/**
 * engine/pre_analysis.ts — Deterministic pre-analysis rule engine.
 *
 * Runs 11 rules against ChartInputV1 to produce alerts[] that every
 * downstream agent receives. No LLM calls — purely computational.
 */

import type { ChartInputV1, Planet, PreAnalysisAlert } from '@/lib/types'
import { SIGN_NUMBER, YOGAKARAKA } from './constants'

// ─── Helper Functions ───────────────────────────────────────────────

/** Get planet house from natal_nakshatras. */
function getPlanetHouse(chart: ChartInputV1, planet: Planet): number | undefined {
  return chart.natal_nakshatras.find((p) => p.body === planet)?.house
}

/** Get planet sign from natal_nakshatras. */
function getPlanetSign(chart: ChartInputV1, planet: Planet): string | undefined {
  return chart.natal_nakshatras.find((p) => p.body === planet)?.sign
}

/** Check if planet is retrograde (from notes field). */
function isRetrograde(chart: ChartInputV1, planet: Planet): boolean {
  const entry = chart.natal_nakshatras.find((p) => p.body === planet)
  return entry?.notes?.includes('R') ?? false
}

/** Get shadbala grade for a planet. */
function getShadbalaGrade(chart: ChartInputV1, planet: Planet): string | null {
  const entry = chart.shadbala.find(
    (s) => (s.planet || s.body) === planet
  )
  return entry?.grade ?? null
}

/** Planets that own each sign. */
const SIGN_LORDS: Record<string, Planet> = {
  Aries: 'Mars', Taurus: 'Venus', Gemini: 'Mercury', Cancer: 'Moon',
  Leo: 'Sun', Virgo: 'Mercury', Libra: 'Venus', Scorpio: 'Mars',
  Sagittarius: 'Jupiter', Capricorn: 'Saturn', Aquarius: 'Saturn', Pisces: 'Jupiter',
}

/** Exaltation signs for classical planets. */
const EXALTATION_SIGNS: Partial<Record<Planet, string>> = {
  Sun: 'Aries', Moon: 'Taurus', Mars: 'Capricorn', Mercury: 'Virgo',
  Jupiter: 'Cancer', Venus: 'Pisces', Saturn: 'Libra',
}

/** Debilitation signs for classical planets. */
const DEBILITATION_SIGNS: Partial<Record<Planet, string>> = {
  Sun: 'Libra', Moon: 'Scorpio', Mars: 'Cancer', Mercury: 'Pisces',
  Jupiter: 'Capricorn', Venus: 'Virgo', Saturn: 'Aries',
}

/** Natural benefics. */
const NATURAL_BENEFICS: Planet[] = ['Jupiter', 'Venus', 'Mercury', 'Moon']

/** Natural malefics. */
const NATURAL_MALEFICS: Planet[] = ['Sun', 'Mars', 'Saturn', 'Rahu', 'Ketu']

// ─── Rule Engine ────────────────────────────────────────────────────

/**
 * Runs all 11 pre-analysis rules and returns the alerts array.
 *
 * @param chart - Validated ChartInputV1 data.
 * @returns Array of alerts for downstream agent consumption.
 */
export function runPreAnalysis(chart: ChartInputV1): PreAnalysisAlert[] {
  const alerts: PreAnalysisAlert[] = []

  alerts.push(...rule1_Dignity(chart))
  alerts.push(...rule2_LagnaLord(chart))
  alerts.push(...rule3_FunctionalBeneficMalefic(chart))
  alerts.push(...rule4_Yogakaraka(chart))
  alerts.push(...rule5_NeechaBhanga(chart))
  alerts.push(...rule6_StrengthFlags(chart))
  alerts.push(...rule7_YogaGate(chart))
  alerts.push(...rule8_DashaFilter(chart))
  alerts.push(...rule9_SadeSati(chart))
  alerts.push(...rule10_AtmaKaraka(chart))
  alerts.push(...rule11_CrossChannel(chart))

  return alerts
}

// ─── Individual Rules ───────────────────────────────────────────────

/** Rule 1: Flag exalted and debilitated planets. */
function rule1_Dignity(chart: ChartInputV1): PreAnalysisAlert[] {
  const alerts: PreAnalysisAlert[] = []
  const classicalPlanets: Planet[] = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn']

  for (const planet of classicalPlanets) {
    const sign = getPlanetSign(chart, planet)
    if (!sign) continue

    if (EXALTATION_SIGNS[planet] === sign) {
      alerts.push({
        rule_id: 1,
        rule_name: 'Dignity Check',
        severity: 'info',
        message: `${planet} is exalted in ${sign}`,
        affected_planets: [planet],
      })
    }

    if (DEBILITATION_SIGNS[planet] === sign) {
      alerts.push({
        rule_id: 1,
        rule_name: 'Dignity Check',
        severity: 'warning',
        message: `${planet} is debilitated in ${sign}`,
        affected_planets: [planet],
      })
    }
  }

  return alerts
}

/** Rule 2: Check lagna lord placement and strength. */
function rule2_LagnaLord(chart: ChartInputV1): PreAnalysisAlert[] {
  const alerts: PreAnalysisAlert[] = []
  const lagnaSign = chart.meta.lagna_sign
  const lagnaLord = SIGN_LORDS[lagnaSign]

  if (!lagnaLord) return alerts

  const house = getPlanetHouse(chart, lagnaLord)
  const grade = getShadbalaGrade(chart, lagnaLord)

  // Flag if lagna lord is in dusthana (6, 8, 12)
  if (house && [6, 8, 12].includes(house)) {
    alerts.push({
      rule_id: 2,
      rule_name: 'Lagna Lord Placement',
      severity: 'warning',
      message: `Lagna lord ${lagnaLord} placed in house ${house} (dusthana)`,
      affected_planets: [lagnaLord],
      affected_houses: [house, 1],
    })
  }

  // Flag if lagna lord is weak
  if (grade === 'Weak') {
    alerts.push({
      rule_id: 2,
      rule_name: 'Lagna Lord Strength',
      severity: 'warning',
      message: `Lagna lord ${lagnaLord} has weak Shadbala`,
      affected_planets: [lagnaLord],
    })
  }

  // Flag if lagna lord is debilitated
  const sign = getPlanetSign(chart, lagnaLord)
  if (sign && DEBILITATION_SIGNS[lagnaLord] === sign) {
    alerts.push({
      rule_id: 2,
      rule_name: 'Lagna Lord Debilitated',
      severity: 'warning',
      message: `Lagna lord ${lagnaLord} is debilitated in ${sign} — 3D agent may need to run`,
      affected_planets: [lagnaLord],
    })
  }

  return alerts
}

/** Rule 3: Classify functional benefics and malefics for the lagna. */
function rule3_FunctionalBeneficMalefic(chart: ChartInputV1): PreAnalysisAlert[] {
  const alerts: PreAnalysisAlert[] = []
  const lagnaSign = chart.meta.lagna_sign
  const lagnaNo = SIGN_NUMBER[lagnaSign]

  if (!lagnaNo) return alerts

  // Trikona lords (1, 5, 9) are functional benefics
  // Trik lords (6, 8, 12) are functional malefics
  const trikonaHouses = [1, 5, 9]
  const trikHouses = [6, 8, 12]

  const functionalBenefics: Planet[] = []
  const functionalMalefics: Planet[] = []

  for (const [sign, lord] of Object.entries(SIGN_LORDS)) {
    const signNo = SIGN_NUMBER[sign]
    if (!signNo) continue
    // House from lagna = (signNo - lagnaNo + 12) % 12 + 1
    const house = ((signNo - lagnaNo + 12) % 12) + 1

    if (trikonaHouses.includes(house)) {
      if (!functionalBenefics.includes(lord)) functionalBenefics.push(lord)
    }
    if (trikHouses.includes(house)) {
      if (!functionalMalefics.includes(lord)) functionalMalefics.push(lord)
    }
  }

  alerts.push({
    rule_id: 3,
    rule_name: 'Functional Classification',
    severity: 'info',
    message: `Functional benefics for ${lagnaSign}: ${functionalBenefics.join(', ')}. Functional malefics: ${functionalMalefics.join(', ')}`,
    affected_planets: [...functionalBenefics, ...functionalMalefics],
  })

  return alerts
}

/** Rule 4: Identify yogakaraka for the lagna (if applicable). */
function rule4_Yogakaraka(chart: ChartInputV1): PreAnalysisAlert[] {
  const alerts: PreAnalysisAlert[] = []
  const lagnaSign = chart.meta.lagna_sign
  const yk = YOGAKARAKA[lagnaSign]

  if (yk) {
    const house = getPlanetHouse(chart, yk)
    const grade = getShadbalaGrade(chart, yk)

    alerts.push({
      rule_id: 4,
      rule_name: 'Yogakaraka Identification',
      severity: 'info',
      message: `Yogakaraka for ${lagnaSign} is ${yk} (house ${house ?? '?'}, strength: ${grade ?? 'unknown'})`,
      affected_planets: [yk],
      affected_houses: house ? [house] : undefined,
    })
  } else {
    alerts.push({
      rule_id: 4,
      rule_name: 'Yogakaraka Identification',
      severity: 'info',
      message: `No yogakaraka exists for ${lagnaSign} lagna`,
    })
  }

  return alerts
}

/** Rule 5: Check for neecha bhanga (cancellation of debilitation). */
function rule5_NeechaBhanga(chart: ChartInputV1): PreAnalysisAlert[] {
  const alerts: PreAnalysisAlert[] = []
  const classicalPlanets: Planet[] = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn']

  for (const planet of classicalPlanets) {
    const sign = getPlanetSign(chart, planet)
    if (!sign || DEBILITATION_SIGNS[planet] !== sign) continue

    // Check basic neecha bhanga conditions
    // Condition 1: Lord of debilitation sign is in kendra from lagna
    const debSignLord = SIGN_LORDS[sign]
    const lordHouse = getPlanetHouse(chart, debSignLord)
    const kendras = [1, 4, 7, 10]

    if (lordHouse && kendras.includes(lordHouse)) {
      alerts.push({
        rule_id: 5,
        rule_name: 'Neecha Bhanga Raja Yoga',
        severity: 'info',
        message: `${planet} debilitated in ${sign} but neecha bhanga possible: dispositor ${debSignLord} in kendra (H${lordHouse})`,
        affected_planets: [planet, debSignLord],
      })
    }

    // Condition 2: Exaltation lord in kendra from lagna
    const exaltSign = Object.entries(EXALTATION_SIGNS).find(([, s]) => s === sign)?.[0] as Planet | undefined
    if (exaltSign) {
      const exaltHouse = getPlanetHouse(chart, exaltSign)
      if (exaltHouse && kendras.includes(exaltHouse)) {
        alerts.push({
          rule_id: 5,
          rule_name: 'Neecha Bhanga Raja Yoga',
          severity: 'info',
          message: `${planet} debilitated — neecha bhanga: ${exaltSign} (exalted in same sign) in kendra (H${exaltHouse})`,
          affected_planets: [planet, exaltSign],
        })
      }
    }
  }

  return alerts
}

/** Rule 6: Flag planets with extreme strength (very strong or very weak). */
function rule6_StrengthFlags(chart: ChartInputV1): PreAnalysisAlert[] {
  const alerts: PreAnalysisAlert[] = []

  for (const entry of chart.shadbala) {
    const planet = (entry.planet || entry.body) as Planet | undefined
    if (!planet) continue

    const total = entry.total_shadbala_virupas ?? entry.total
    const required = entry.required ?? entry.required_virupas

    if (total == null || required == null) continue

    const ratio = total / required

    if (ratio < 0.7) {
      alerts.push({
        rule_id: 6,
        rule_name: 'Strength Flag',
        severity: 'warning',
        message: `${planet} has critically low Shadbala (${(ratio * 100).toFixed(0)}% of required)`,
        affected_planets: [planet],
      })
    } else if (ratio > 2.0) {
      alerts.push({
        rule_id: 6,
        rule_name: 'Strength Flag',
        severity: 'info',
        message: `${planet} has exceptionally high Shadbala (${(ratio * 100).toFixed(0)}% of required)`,
        affected_planets: [planet],
      })
    }
  }

  return alerts
}

/** Rule 7: Gate check for yoga applicability (yogakaraka classified correctly). */
function rule7_YogaGate(chart: ChartInputV1): PreAnalysisAlert[] {
  const alerts: PreAnalysisAlert[] = []
  const lagnaSign = chart.meta.lagna_sign
  const yk = YOGAKARAKA[lagnaSign]

  if (!yk) return alerts

  // If yogakaraka is in a trik house, it may underperform
  const house = getPlanetHouse(chart, yk)
  if (house && [6, 8, 12].includes(house)) {
    alerts.push({
      rule_id: 7,
      rule_name: 'Yoga Gate',
      severity: 'warning',
      message: `Yogakaraka ${yk} is placed in trik house ${house} — yoga delivery may be delayed or obstructed`,
      affected_planets: [yk],
      affected_houses: [house],
    })
  }

  return alerts
}

/** Rule 8: Flag dasha periods of interest for downstream filtering. */
function rule8_DashaFilter(chart: ChartInputV1): PreAnalysisAlert[] {
  const alerts: PreAnalysisAlert[] = []
  const lagnaSign = chart.meta.lagna_sign
  const lagnaLord = SIGN_LORDS[lagnaSign]

  // Flag if any planet is both retrograde and debilitated
  const classicalPlanets: Planet[] = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn']
  for (const planet of classicalPlanets) {
    const sign = getPlanetSign(chart, planet)
    if (!sign) continue
    if (DEBILITATION_SIGNS[planet] === sign && isRetrograde(chart, planet)) {
      alerts.push({
        rule_id: 8,
        rule_name: 'Dasha Filter',
        severity: 'info',
        message: `${planet} is retrograde AND debilitated — its dasha periods need careful analysis (may act as exalted per some schools)`,
        affected_planets: [planet],
      })
    }
  }

  return alerts
}

/** Rule 9: Check Sade Sati status from saturn_transits if available. */
function rule9_SadeSati(chart: ChartInputV1): PreAnalysisAlert[] {
  const alerts: PreAnalysisAlert[] = []

  if (!chart.saturn_transits) return alerts

  const transits = chart.saturn_transits as Record<string, unknown>
  const sadeSati = transits.sade_sati as { active?: boolean; current_phase?: string } | undefined

  if (sadeSati?.active) {
    alerts.push({
      rule_id: 9,
      rule_name: 'Sade Sati Active',
      severity: 'warning',
      message: `Sade Sati is currently active${sadeSati.current_phase ? ` (${sadeSati.current_phase} phase)` : ''}`,
      affected_planets: ['Saturn', 'Moon'],
    })
  }

  return alerts
}

/** Rule 10: Identify Atma Karaka (planet with highest degree). */
function rule10_AtmaKaraka(chart: ChartInputV1): PreAnalysisAlert[] {
  const alerts: PreAnalysisAlert[] = []

  // AK = planet with highest degree_decimal (excluding Rahu/Ketu in some systems)
  const candidates = chart.natal_nakshatras.filter(
    (p) => !['Rahu', 'Ketu'].includes(p.body)
  )

  if (candidates.length === 0) return alerts

  const ak = candidates.reduce((highest, current) =>
    current.degree_decimal > highest.degree_decimal ? current : highest
  )

  alerts.push({
    rule_id: 10,
    rule_name: 'Atma Karaka',
    severity: 'info',
    message: `Atma Karaka (AK) is ${ak.body} at ${ak.degree_decimal.toFixed(2)}° in ${ak.sign} (H${ak.house})`,
    affected_planets: [ak.body],
    affected_houses: [ak.house],
  })

  return alerts
}

/** Rule 11: Cross-channel flags for inter-domain correlations. */
function rule11_CrossChannel(chart: ChartInputV1): PreAnalysisAlert[] {
  const alerts: PreAnalysisAlert[] = []
  const lagnaSign = chart.meta.lagna_sign

  // Check if 2nd lord and 11th lord are connected (wealth correlation)
  const lagnaNo = SIGN_NUMBER[lagnaSign]
  if (!lagnaNo) return alerts

  const h2SignNo = ((lagnaNo - 1 + 1) % 12) + 1  // 2nd house sign number
  const h11SignNo = ((lagnaNo - 1 + 10) % 12) + 1 // 11th house sign number

  const h2Sign = Object.entries(SIGN_NUMBER).find(([, n]) => n === h2SignNo)?.[0]
  const h11Sign = Object.entries(SIGN_NUMBER).find(([, n]) => n === h11SignNo)?.[0]

  if (h2Sign && h11Sign) {
    const h2Lord = SIGN_LORDS[h2Sign]
    const h11Lord = SIGN_LORDS[h11Sign]

    if (h2Lord && h11Lord) {
      const h2LordHouse = getPlanetHouse(chart, h2Lord)
      const h11LordHouse = getPlanetHouse(chart, h11Lord)

      // Check if they're in each other's houses (mutual exchange)
      if (h2LordHouse && h11LordHouse) {
        // Check if H2 lord is in H11 and H11 lord is in H2
        if (h2LordHouse === 11 && h11LordHouse === 2) {
          alerts.push({
            rule_id: 11,
            rule_name: 'Cross-Channel',
            severity: 'info',
            message: `Parivartana Yoga between H2 lord (${h2Lord}) and H11 lord (${h11Lord}) — strong wealth indicator`,
            affected_planets: [h2Lord, h11Lord],
            affected_houses: [2, 11],
          })
        }
      }
    }
  }

  return alerts
}
