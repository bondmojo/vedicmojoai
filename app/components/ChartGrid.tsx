/**
 * ChartGrid — Renders all divisional charts with North/South Indian style toggle.
 * Passes Arudha Padas, Special Lagnas, and Upagrahas only to D1.
 */
'use client'

import { useState } from 'react'
import NorthIndianChart from './NorthIndianChart'
import SouthIndianChart from './SouthIndianChart'
import type { ChartData } from './chartTypes'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

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
  planets: Array<{
    planet: string
    signNumber: number
    house: number
    retrograde?: boolean
    dignity?: string
    vargottama?: boolean
  }>
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
    <Card>
      <CardContent className="p-5">
        {/* Style Toggle */}
        <div className="flex items-center gap-3 mb-5">
          <span className="text-sm text-muted-foreground">Chart Style:</span>
          <div className="inline-flex rounded-lg border border-border overflow-hidden">
            <Button
              type="button"
              size="sm"
              variant={style === 'north' ? 'default' : 'ghost'}
              className="rounded-none"
              onClick={() => setStyle('north')}
            >
              North Indian
            </Button>
            <Button
              type="button"
              size="sm"
              variant={style === 'south' ? 'default' : 'ghost'}
              className="rounded-none"
              onClick={() => setStyle('south')}
            >
              South Indian
            </Button>
          </div>
          <span className="text-xs text-muted-foreground">
            <span className="text-amber-500">■</span> Arudha &nbsp;
            <span className="text-fuchsia-500">■</span> Special Lagnas &nbsp;
            <span className="text-gray-400">■</span> Upagrahas
          </span>
        </div>
        <div className="mb-4 text-[11px] text-muted-foreground">
          (Ab) retrograde &nbsp;·&nbsp; Ab++ exalted &nbsp;·&nbsp; Ab+ own/moolatrikona
          &nbsp;·&nbsp; Ab- great enemy &nbsp;·&nbsp; Ab-- debilitated &nbsp;·&nbsp; Ab^ vargottama
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
      </CardContent>
    </Card>
  )
}
