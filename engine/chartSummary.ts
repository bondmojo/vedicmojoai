/**
 * engine/chartSummary.ts — Generates the compact ~2KB chart summary.
 *
 * This summary is the shared prefix injected into every agent's context.
 * It replaces the raw ~30KB ChartInputV1 JSON, saving tokens on every call.
 *
 * Generated once per chart during pre-analysis and cached in Wave1Cache.
 */

import type { ChartInputV1, DashaTree, Planet, PreAnalysisAlert } from '@/lib/types'
import { SIGN_NUMBER, YOGAKARAKA } from './constants'

/** Sign lords for quick reference. */
const SIGN_LORDS: Record<string, Planet> = {
  Aries: 'Mars', Taurus: 'Venus', Gemini: 'Mercury', Cancer: 'Moon',
  Leo: 'Sun', Virgo: 'Mercury', Libra: 'Venus', Scorpio: 'Mars',
  Sagittarius: 'Jupiter', Capricorn: 'Saturn', Aquarius: 'Saturn', Pisces: 'Jupiter',
}

/**
 * Builds a compact text summary of the chart suitable for LLM context injection.
 *
 * @param chart - Validated ChartInputV1.
 * @param alerts - Pre-analysis alerts array.
 * @param dashaTree - Computed Vimshottari dasha tree.
 * @returns A compact string (~2KB) summarizing the chart.
 */
export function buildChartSummary(
  chart: ChartInputV1,
  alerts: PreAnalysisAlert[],
  dashaTree: DashaTree
): string {
  const lines: string[] = []

  // ─── Header ─────────────────────────────────────────────────────
  lines.push('=== CHART SUMMARY ===')
  lines.push(`Client: ${chart.meta.client_name}`)
  lines.push(`Birth: ${chart.meta.birth_datetime}${chart.meta.birth_place ? ` at ${chart.meta.birth_place}` : ''}`)
  lines.push(`Gender: ${chart.meta.gender ?? 'male'}`)
  lines.push(`Lagna: ${chart.meta.lagna_sign} (${chart.meta.lagna_degree_decimal.toFixed(1)}°)`)

  // Yogakaraka
  const yk = YOGAKARAKA[chart.meta.lagna_sign]
  lines.push(`Yogakaraka: ${yk ?? 'None for this lagna'}`)

  // Lagna lord
  const lagnaLord = SIGN_LORDS[chart.meta.lagna_sign]
  const lagnaLordEntry = chart.natal_nakshatras.find((p) => p.body === lagnaLord)
  if (lagnaLordEntry) {
    lines.push(`Lagna Lord: ${lagnaLord} in ${lagnaLordEntry.sign} (H${lagnaLordEntry.house})`)
  }

  lines.push('')

  // ─── Planet Positions (compact) ─────────────────────────────────
  lines.push('--- PLANETS ---')
  for (const p of chart.natal_nakshatras) {
    const retro = p.notes?.includes('R') ? ' [R]' : ''
    lines.push(`${p.body}: ${p.sign} H${p.house} ${p.degree_decimal.toFixed(1)}° ${p.nakshatra} P${p.pada}${retro}`)
  }

  lines.push('')

  // ─── Shadbala Summary (compact) ─────────────────────────────────
  lines.push('--- STRENGTH ---')
  for (const s of chart.shadbala) {
    const planet = s.planet || s.body
    if (!planet) continue
    const total = s.total_shadbala_virupas ?? s.total
    const required = s.required ?? s.required_virupas
    const grade = s.grade ?? ''
    if (total != null && required != null) {
      const pct = ((total / required) * 100).toFixed(0)
      lines.push(`${planet}: ${total.toFixed(1)}/${required.toFixed(1)} (${pct}%) ${grade}`)
    } else {
      lines.push(`${planet}: ${grade || 'N/A'}`)
    }
  }

  lines.push('')

  // ─── Ashtakavarga SAV (compact) ─────────────────────────────────
  lines.push('--- SAV ---')
  if (chart.ashtakavarga.sarvashtakavarga) {
    const sav = chart.ashtakavarga.sarvashtakavarga
    lines.push(`Total: ${sav.total}`)
    const bySign = sav.by_sign.map((s) => `${s.sign.substring(0, 3)}:${s.points}`).join(' ')
    lines.push(bySign)
  } else if (chart.ashtakavarga.sarvashtakavarga_by_house) {
    const byHouse = chart.ashtakavarga.sarvashtakavarga_by_house
      .map((h) => `H${h.house}:${h.bindus}`)
      .join(' ')
    lines.push(byHouse)
  }

  lines.push('')

  // ─── Current Dasha Period ───────────────────────────────────────
  lines.push('--- DASHA (Current) ---')
  const now = new Date()
  const currentMD = dashaTree.mahadashas.find((md) => now >= md.start && now < md.end)

  if (currentMD) {
    lines.push(`Mahadasha: ${currentMD.lord} (${formatDate(currentMD.start)} to ${formatDate(currentMD.end)})`)

    const currentAD = currentMD.antardashas.find((ad) => now >= ad.start && now < ad.end)
    if (currentAD) {
      lines.push(`Antardasha: ${currentAD.lord} (${formatDate(currentAD.start)} to ${formatDate(currentAD.end)})`)

      if (currentAD.pratyantardashas) {
        const currentPD = currentAD.pratyantardashas.find((pd) => now >= pd.start && now < pd.end)
        if (currentPD) {
          lines.push(`Pratyantar: ${currentPD.lord} (${formatDate(currentPD.start)} to ${formatDate(currentPD.end)})`)
        }
      }
    }
  }

  lines.push(`Balance at birth: ${dashaTree.balance_years.toFixed(2)} years`)

  lines.push('')

  // ─── Mahadasha Timeline (compact) ──────────────────────────────
  lines.push('--- DASHA TIMELINE ---')
  for (const md of dashaTree.mahadashas) {
    const isCurrent = currentMD?.lord === md.lord && currentMD?.start.getTime() === md.start.getTime()
    const marker = isCurrent ? ' ← CURRENT' : ''
    lines.push(`${md.lord}: ${formatDate(md.start)} → ${formatDate(md.end)}${marker}`)
  }

  lines.push('')

  // ─── Pre-Analysis Alerts ────────────────────────────────────────
  const warnings = alerts.filter((a) => a.severity === 'warning')
  const criticals = alerts.filter((a) => a.severity === 'critical')

  if (criticals.length > 0 || warnings.length > 0) {
    lines.push('--- ALERTS ---')
    for (const alert of criticals) {
      lines.push(`[CRITICAL] ${alert.message}`)
    }
    for (const alert of warnings) {
      lines.push(`[WARNING] ${alert.message}`)
    }
    lines.push('')
  }

  // ─── Divisional Chart Lagnas ────────────────────────────────────
  lines.push('--- DIVISIONAL LAGNAS ---')
  const charts = chart.divisional_charts
  if (charts.D9_Navamsa.lagna) lines.push(`D9 Navamsa: ${charts.D9_Navamsa.lagna}`)
  if (charts.D10_Dasamsa.lagna) lines.push(`D10 Dasamsa: ${charts.D10_Dasamsa.lagna}`)
  if (charts.D4_Chaturthamsa.lagna) lines.push(`D4 Chaturthamsa: ${charts.D4_Chaturthamsa.lagna}`)
  if (charts.D30_Trimshamsa.lagna) lines.push(`D30 Trimshamsa: ${charts.D30_Trimshamsa.lagna}`)

  lines.push('')
  lines.push('=== END CHART SUMMARY ===')

  return lines.join('\n')
}

/** Format a date as YYYY-MM-DD. */
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}
