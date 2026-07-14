/**
 * DashaTimeline — Vimshottari Dasha viewer for computed charts.
 * Similar to the existing /charts/[id]/dasha page but standalone (no DB dependency).
 */

'use client'

import { useState } from 'react'

interface DashaPeriod {
  lord: string
  start: string
  end: string
  duration_days: number
  antardashas?: DashaPeriod[]
  pratyantardashas?: DashaPeriod[]
}

interface DashaTree {
  balance_years: number
  mahadashas: DashaPeriod[]
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

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function formatDateShort(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    month: 'short',
    year: 'numeric',
  })
}

export default function DashaTimeline({ dashaTree }: { dashaTree: DashaTree }) {
  const [expandedMD, setExpandedMD] = useState<number | null>(null)
  const [expandedAD, setExpandedAD] = useState<number | null>(null)

  const now = new Date()

  // Find current mahadasha
  const currentMDIndex = dashaTree.mahadashas.findIndex(
    (md) => new Date(md.start) <= now && new Date(md.end) > now
  )

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-ink">Vimshottari Dasha Timeline</h3>
            <p className="text-xs text-gray-400 mt-1">
              Balance at birth: {dashaTree.balance_years.toFixed(2)} years
            </p>
          </div>
          {currentMDIndex >= 0 && (
            <div className="text-right">
              <span className="text-xs text-gray-400">Current:</span>
              <span className="ml-2 text-sm font-medium text-indigo-400">
                {dashaTree.mahadashas[currentMDIndex].lord} MD
              </span>
            </div>
          )}
        </div>

        {/* Timeline bar */}
        <div className="mt-4 flex h-8 rounded-lg overflow-hidden border border-gray-700">
          {dashaTree.mahadashas.map((md, i) => {
            const totalDays = dashaTree.mahadashas.reduce((s, m) => s + m.duration_days, 0)
            const widthPct = (md.duration_days / totalDays) * 100
            const isCurrent = i === currentMDIndex
            return (
              <div
                key={i}
                className={`${PLANET_COLORS[md.lord] ?? 'bg-gray-600'} flex items-center justify-center text-[10px] font-medium text-white cursor-pointer hover:opacity-80 transition-opacity ${isCurrent ? 'ring-2 ring-white ring-inset' : ''}`}
                style={{ width: `${widthPct}%` }}
                onClick={() => { setExpandedMD(expandedMD === i ? null : i); setExpandedAD(null) }}
                title={`${md.lord}: ${formatDate(md.start)} - ${formatDate(md.end)}`}
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
          const isCurrent = i === currentMDIndex
          const isExpanded = expandedMD === i

          return (
            <div key={i} className={`rounded-lg border ${isCurrent ? 'border-indigo-500 bg-indigo-900/10' : 'border-gray-700 bg-gray-800/30'}`}>
              <button
                onClick={() => { setExpandedMD(isExpanded ? null : i); setExpandedAD(null) }}
                className="w-full p-4 flex items-center justify-between text-left"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${PLANET_COLORS[md.lord] ?? 'bg-gray-500'}`} />
                  <span className="font-medium text-sm">{md.lord} Mahadasha</span>
                  {isCurrent && <span className="text-xs text-indigo-400 font-medium">CURRENT</span>}
                </div>
                <div className="text-xs text-gray-400">
                  {formatDateShort(md.start)} → {formatDateShort(md.end)}
                  <span className="ml-2 text-gray-500">
                    ({(md.duration_days / 365.2425).toFixed(1)}y)
                  </span>
                </div>
              </button>

              {/* Antardasha expansion */}
              {isExpanded && md.antardashas && (
                <div className="px-4 pb-4 space-y-1">
                  {md.antardashas.map((ad, j) => {
                    const isCurrentAD = isCurrent &&
                      new Date(ad.start) <= now && new Date(ad.end) > now
                    const isADExpanded = expandedAD === j

                    return (
                      <div key={j}>
                        <button
                          onClick={() => setExpandedAD(isADExpanded ? null : j)}
                          className={`w-full rounded px-3 py-2 flex items-center justify-between text-xs ${isCurrentAD ? 'bg-indigo-900/30 border border-indigo-700' : 'hover:bg-gray-700/50'}`}
                        >
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${PLANET_COLORS[ad.lord] ?? 'bg-gray-500'}`} />
                            <span>{md.lord}-{ad.lord}</span>
                            {isCurrentAD && <span className="text-indigo-400 text-[10px]">active</span>}
                          </div>
                          <span className="text-gray-500">
                            {formatDateShort(ad.start)} → {formatDateShort(ad.end)}
                          </span>
                        </button>

                        {/* Pratyantar expansion */}
                        {isADExpanded && ad.pratyantardashas && (
                          <div className="ml-6 mt-1 space-y-0.5">
                            {ad.pratyantardashas.map((pd, k) => {
                              const isCurrentPD = isCurrentAD &&
                                new Date(pd.start) <= now && new Date(pd.end) > now
                              return (
                                <div
                                  key={k}
                                  className={`flex items-center justify-between px-3 py-1 text-[10px] rounded ${isCurrentPD ? 'bg-indigo-900/20 text-indigo-300' : 'text-gray-500'}`}
                                >
                                  <span>{md.lord}-{ad.lord}-{pd.lord}</span>
                                  <span>{formatDateShort(pd.start)} → {formatDateShort(pd.end)}</span>
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
  )
}
