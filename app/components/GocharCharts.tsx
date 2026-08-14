/**
 * Four compact North-Indian charts for the current Gochar snapshot.
 *
 * The Gochar range table deliberately describes ingress intervals. These
 * diagrams instead use `TransitAnalysis.asOf` for the current graha positions.
 * The Transit Moment Chart uses the moving Ascendant at that exact instant and
 * birthplace, while the other Gochar diagrams retain their natal references.
 */
'use client'

import NorthIndianChart from './NorthIndianChart'
import { SectionUnavailable } from './SectionUnavailable'
import type { ChartData, ChartPlanet } from './chartTypes'

const SIGNS = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
]

export interface CurrentGocharPlanet {
  planet: string
  signNumber: number
  retrograde: boolean
}

/** The sign currently rising at `TransitAnalysis.asOf` for the birth location. */
export interface CurrentAscendantTransit {
  signNumber: number
  isCurrent: boolean
}

export interface GocharChartsProps {
  /** Natal D1 carried by the chart result displayed on the page. */
  natalD1: unknown
  /** UTC instant at which the current transit snapshot was computed. */
  asOf: string
  transits: CurrentGocharPlanet[]
  ascendantTransits?: CurrentAscendantTransit[]
}

function isSignNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 12
}

function isChartPlanet(value: unknown): value is ChartPlanet {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const planet = value as Record<string, unknown>
  return typeof planet.planet === 'string'
    && isSignNumber(planet.signNumber)
    && typeof planet.house === 'number'
}

function isNatalD1(value: unknown): value is ChartData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const chart = value as Record<string, unknown>
  return chart.division === 1
    && typeof chart.lagna === 'string'
    && isSignNumber(chart.lagnaSignNumber)
    && typeof chart.name === 'string'
    && typeof chart.shortName === 'string'
    && Array.isArray(chart.planets)
    && chart.planets.every(isChartPlanet)
}

function houseFrom(referenceSign: number, planetSign: number): number {
  return ((planetSign - referenceSign + 12) % 12) + 1
}

/** Builds a complete whole-sign Gochar chart anchored to one reference sign. */
export function buildGocharChart(
  name: string,
  referenceSignNumber: number,
  transits: CurrentGocharPlanet[],
): ChartData {
  const planets: ChartPlanet[] = transits
    .filter((planet) => isSignNumber(planet.signNumber))
    .map((planet) => ({
      planet: planet.planet,
      signNumber: planet.signNumber,
      house: houseFrom(referenceSignNumber, planet.signNumber),
      retrograde: planet.retrograde,
    }))

  return {
    lagna: SIGNS[referenceSignNumber - 1],
    lagnaSignNumber: referenceSignNumber,
    division: 1,
    name,
    shortName: 'Gochar',
    planets,
  }
}

export default function GocharCharts({
  natalD1,
  asOf,
  transits,
  ascendantTransits,
}: GocharChartsProps) {
  if (!isNatalD1(natalD1) || !Array.isArray(transits)) {
    return <SectionUnavailable section="Gochar charts" />
  }

  const natalMoon = natalD1.planets.find((planet) => planet.planet === 'Moon')
  const currentAscendant = Array.isArray(ascendantTransits)
    ? ascendantTransits.find((transit) => transit.isCurrent && isSignNumber(transit.signNumber))
    : undefined
  const transitMomentChart = currentAscendant
    ? { ...buildGocharChart('Transit Moment Chart', currentAscendant.signNumber, transits), shortName: 'Transit' }
    : undefined
  const transitCharts = [
    transitMomentChart,
    buildGocharChart('From Birth Lagna', natalD1.lagnaSignNumber, transits),
    natalMoon && buildGocharChart('From Natal Moon', natalMoon.signNumber, transits),
  ]

  return (
    <section className="rounded-lg border border-gray-700 bg-gray-900/30 p-4" aria-labelledby="gochar-charts-heading">
      <div className="mb-4 space-y-1">
        <h3 id="gochar-charts-heading" className="text-sm font-semibold">Current Gochar charts</h3>
        <p className="text-xs text-gray-500">
          Lahiri sidereal positions at <time dateTime={asOf}>{asOf}</time> (UTC). Transit Moment Chart uses the moving Ascendant at this instant and birthplace; the Lagna and Moon charts use their natal references.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <NorthIndianChart chart={{ ...natalD1, name: 'Natal Rāśi', shortName: 'D1' }} size={260} />
        {transitCharts.map((chart, index) => chart ? (
          <NorthIndianChart key={chart.name} chart={chart} size={260} />
        ) : (
          <div key={index} className="rounded-xl border border-gray-700 p-3 text-xs text-gray-500" role="status">
            {index === 0 ? 'Transit Moment Chart data is unavailable.' : 'Gochar chart data is unavailable.'}
          </div>
        ))}
      </div>
    </section>
  )
}
