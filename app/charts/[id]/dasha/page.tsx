/**
 * /charts/[id]/dasha — Interactive Dasha Timeline (Client Component)
 * Shows full lifetime dasha viewer with expandable mahadashas.
 */

'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

interface DashaPeriod {
  lord: string
  start: string
  end: string
  duration_days: number
  antardashas?: DashaPeriod[]
  pratyantardashas?: DashaPeriod[]
}

interface DashaData {
  chartId: string
  currentPeriod: {
    mahadasha?: string
    antardasha?: string
    pratyantar?: string
  }
  dashaTree: {
    balance_years: number
    mahadashas: DashaPeriod[]
  }
}

const PLANET_COLORS: Record<string, string> = {
  Sun: 'bg-orange-600',
  Moon: 'bg-slate-400',
  Mars: 'bg-red-600',
  Mercury: 'bg-green-600',
  Jupiter: 'bg-yellow-500',
  Venus: 'bg-pink-500',
  Saturn: 'bg-blue-800',
  Rahu: 'bg-gray-600',
  Ketu: 'bg-purple-700',
}

export default function DashaTimelinePage() {
  const params = useParams()
  const chartId = params.id as string

  const [data, setData] = useState<DashaData | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedMD, setExpandedMD] = useState<number | null>(null)
  const [expandedAD, setExpandedAD] = useState<number | null>(null)

  useEffect(() => {
    fetch(`/api/charts/${chartId}/dasha`)
      .then((res) => res.json())
      .then((d) => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [chartId])

  if (loading) {
    return (
      <main className="min-h-screen p-8 flex items-center justify-center">
        <p className="text-gray-400">Loading dasha tree...</p>
      </main>
    )
  }

  if (!data) {
    return (
      <main className="min-h-screen p-8 flex items-center justify-center">
        <p className="text-red-400">Failed to load dasha data.</p>
      </main>
    )
  }

  const { dashaTree, currentPeriod } = data

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-5xl mx-auto">
        <Link href={`/charts/${chartId}`} className="text-sm text-gray-500 hover:text-gray-300 mb-2 block">
          ← Back to Chart
        </Link>
        <h1 className="text-3xl font-bold mb-2">Vimshottari Dasha Timeline</h1>
        <p className="text-gray-400 mb-6">
          Balance at birth: {dashaTree.balance_years.toFixed(2)} years
          {currentPeriod.mahadasha && (
            <span className="ml-4">
              Current: <strong className="text-indigo-400">{currentPeriod.mahadasha}</strong>
              {currentPeriod.antardasha && ` / ${currentPeriod.antardasha}`}
              {currentPeriod.pratyantar && ` / ${currentPeriod.pratyantar}`}
            </span>
          )}
        </p>

        {/* Mahadasha Timeline Bars */}
        <div className="mb-8">
          <div className="flex h-10 rounded-lg overflow-hidden border border-gray-700">
            {dashaTree.mahadashas.map((md, i) => {
              const totalDays = dashaTree.mahadashas.reduce((s, m) => s + m.duration_days, 0)
              const widthPct = (md.duration_days / totalDays) * 100
              const isCurrent = currentPeriod.mahadasha === md.lord
              return (
                <div
                  key={i}
                  className={`${PLANET_COLORS[md.lord] ?? 'bg-gray-600'} flex items-center justify-center text-xs font-medium text-white cursor-pointer hover:opacity-80 transition-opacity ${isCurrent ? 'ring-2 ring-white ring-inset' : ''}`}
                  style={{ width: `${widthPct}%` }}
                  onClick={() => { setExpandedMD(expandedMD === i ? null : i); setExpandedAD(null) }}
                  title={`${md.lord}: ${formatDate(md.start)} → ${formatDate(md.end)}`}
                >
                  {widthPct > 4 ? md.lord.substring(0, 3) : ''}
                </div>
              )
            })}
          </div>
        </div>

        {/* Mahadasha List */}
        <div className="space-y-2">
          {dashaTree.mahadashas.map((md, i) => {
            const isCurrent = currentPeriod.mahadasha === md.lord &&
              new Date(md.start) <= new Date() && new Date(md.end) > new Date()
            const isExpanded = expandedMD === i

            return (
              <div key={i} className={`rounded-lg border ${isCurrent ? 'border-indigo-500 bg-indigo-900/10' : 'border-gray-700 bg-gray-800/30'}`}>
                <button
                  onClick={() => { setExpandedMD(isExpanded ? null : i); setExpandedAD(null) }}
                  className="w-full p-4 flex items-center justify-between text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${PLANET_COLORS[md.lord] ?? 'bg-gray-500'}`} />
                    <span className="font-medium">{md.lord} Mahadasha</span>
                    {isCurrent && <span className="text-xs text-indigo-400 font-medium">CURRENT</span>}
                  </div>
                  <div className="text-sm text-gray-400">
                    {formatDate(md.start)} → {formatDate(md.end)}
                    <span className="ml-3 text-gray-500">{(md.duration_days / 365.2425).toFixed(1)}y</span>
                  </div>
                </button>

                {/* Antardasha expansion */}
                {isExpanded && md.antardashas && (
                  <div className="px-4 pb-4 space-y-1">
                    {md.antardashas.map((ad, j) => {
                      const isCurrentAD = isCurrent && currentPeriod.antardasha === ad.lord &&
                        new Date(ad.start) <= new Date() && new Date(ad.end) > new Date()
                      const isADExpanded = expandedAD === j

                      return (
                        <div key={j}>
                          <button
                            onClick={() => setExpandedAD(isADExpanded ? null : j)}
                            className={`w-full rounded px-3 py-2 flex items-center justify-between text-sm ${isCurrentAD ? 'bg-indigo-900/30 border border-indigo-700' : 'hover:bg-gray-700/50'}`}
                          >
                            <div className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full ${PLANET_COLORS[ad.lord] ?? 'bg-gray-500'}`} />
                              <span>{md.lord}-{ad.lord}</span>
                              {isCurrentAD && <span className="text-xs text-indigo-400">active</span>}
                            </div>
                            <span className="text-xs text-gray-500">
                              {formatDate(ad.start)} → {formatDate(ad.end)}
                            </span>
                          </button>

                          {/* Pratyantar expansion */}
                          {isADExpanded && ad.pratyantardashas && (
                            <div className="ml-6 mt-1 space-y-0.5">
                              {ad.pratyantardashas.map((pd, k) => {
                                const isCurrentPD = isCurrentAD && currentPeriod.pratyantar === pd.lord
                                return (
                                  <div
                                    key={k}
                                    className={`flex items-center justify-between px-3 py-1 text-xs rounded ${isCurrentPD ? 'bg-indigo-900/20 text-indigo-300' : 'text-gray-500'}`}
                                  >
                                    <span>{md.lord}-{ad.lord}-{pd.lord}</span>
                                    <span>{formatDate(pd.start)} → {formatDate(pd.end)}</span>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </main>
  )
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    month: 'short',
    year: 'numeric',
  })
}
