/**
 * ChartGrid — Renders all divisional charts with North/South Indian style toggle.
 * Passes Arudha Padas, Special Lagnas, and Upagrahas only to D1.
 */
'use client'

import { useState } from 'react'
import NorthIndianChart from './NorthIndianChart'
import SouthIndianChart from './SouthIndianChart'
import type { ChartData } from './chartTypes'

type ChartStyle = 'north' | 'south'

interface ArudhaPadaRaw { abbr: string; signNumber: number; house_in_chart: number }
interface SpecialLagnaRaw { abbr: string; signNumber: number; house: number }
interface UpagrahaRaw { abbr: string; signNumber: number; house: number }

interface RawDivisionalChart {
  division: number
  name: string
  shortName: string
  lagna: string
  lagnaSignNumber: number
  planets: Array<{ planet: string; signNumber: number; house: number; retrograde?: boolean }>
  arudhaPadas?: ArudhaPadaRaw[]
  specialLagnas?: SpecialLagnaRaw[]
  upagrahas?: UpagrahaRaw[]
}

interface ChartGridProps {
  charts: RawDivisionalChart[]
  /** D1 fallbacks (used when a chart doesn't carry its own computed points). */
  arudhaPadas?: ArudhaPadaRaw[]
  specialLagnas?: SpecialLagnaRaw[]
  upagrahas?: UpagrahaRaw[]
}

export default function ChartGrid({
  charts,
  arudhaPadas,
  specialLagnas,
  upagrahas,
}: ChartGridProps) {
  const [style, setStyle] = useState<ChartStyle>('north')

  return (
    <div>
      {/* Style Toggle */}
      <div className="flex items-center gap-3 mb-5">
        <span className="text-sm text-gray-400">Chart Style:</span>
        <div className="inline-flex rounded-lg border border-gray-600 overflow-hidden">
          <button
            onClick={() => setStyle('north')}
            className={`px-4 py-1.5 text-xs font-medium transition-colors ${
              style === 'north' ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            North Indian
          </button>
          <button
            onClick={() => setStyle('south')}
            className={`px-4 py-1.5 text-xs font-medium transition-colors ${
              style === 'south' ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            South Indian
          </button>
        </div>
        <span className="text-xs text-gray-600">
          <span className="text-amber-400">■</span> Arudha &nbsp;
          <span className="text-fuchsia-400">■</span> Special Lagnas &nbsp;
          <span className="text-gray-400">■</span> Upagrahas
        </span>
      </div>

      {/* Chart Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {charts.map((chart) => {
          const isD1 = chart.division === 1
          const chartData: ChartData = {
            lagna: chart.lagna,
            lagnaSignNumber: chart.lagnaSignNumber,
            division: chart.division,
            name: chart.name,
            shortName: chart.shortName,
            planets: chart.planets,
            arudhaPadas: chart.arudhaPadas ?? (isD1 ? arudhaPadas : undefined),
            specialLagnas: chart.specialLagnas ?? (isD1 ? specialLagnas : undefined),
            upagrahas: chart.upagrahas ?? (isD1 ? upagrahas : undefined),
          }

          return style === 'north' ? (
            <NorthIndianChart key={chart.shortName} chart={chartData} size={340} />
          ) : (
            <SouthIndianChart key={chart.shortName} chart={chartData} size={340} />
          )
        })}
      </div>
    </div>
  )
}
