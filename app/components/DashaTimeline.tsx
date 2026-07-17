/**
 * DashaTimeline — Vimshottari Dasha viewer for computed charts.
 * Similar to the existing /charts/[id]/dasha page but standalone (no DB dependency).
 */

'use client'

import { useEffect, useRef, useState } from 'react'

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

// Moon/Rahu use `neutral` (not `gray`/`slate`, which flip between light/dark
// theme via CSS vars — see tailwind.config.ts) so their literal white badge
// text stays legible in both themes.
const PLANET_COLORS: Record<string, string> = {
  Sun: 'bg-orange-600',
  Moon: 'bg-neutral-400',
  Mars: 'bg-red-600',
  Mercury: 'bg-green-600',
  Jupiter: 'bg-yellow-500',
  Venus: 'bg-pink-500',
  Saturn: 'bg-blue-800',
  Rahu: 'bg-neutral-600',
  Ketu: 'bg-purple-700',
}

const FALLBACK_COLOR = 'bg-neutral-600'

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

function isActive(start: string, end: string, now: Date): boolean {
  return new Date(start) <= now && new Date(end) > now
}

export default function DashaTimeline({ dashaTree }: { dashaTree: DashaTree }) {
  const now = new Date()
  const hasData = Boolean(dashaTree?.mahadashas?.length)

  const currentMDIndex = hasData
    ? dashaTree.mahadashas.findIndex((md) => isActive(md.start, md.end, now))
    : -1
  const currentADIndex =
    currentMDIndex >= 0
      ? (dashaTree.mahadashas[currentMDIndex].antardashas ?? []).findIndex((ad) =>
          isActive(ad.start, ad.end, now)
        )
      : -1

  const [expandedMD, setExpandedMD] = useState<number | null>(
    currentMDIndex >= 0 ? currentMDIndex : null
  )
  const [expandedAD, setExpandedAD] = useState<number | null>(
    currentADIndex >= 0 ? currentADIndex : null
  )

  const currentMDRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    currentMDRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    // Scroll to today's period once on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!hasData) {
    return (
      <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-6 text-center text-sm text-gray-400">
        No dasha data available for this chart.
      </div>
    )
  }

  const totalDays = dashaTree.mahadashas.reduce((s, m) => s + m.duration_days, 0)
  const firstStart = new Date(dashaTree.mahadashas[0].start)
  const lastEnd = new Date(dashaTree.mahadashas[dashaTree.mahadashas.length - 1].end)
  const totalSpanMs = lastEnd.getTime() - firstStart.getTime()
  const showTodayMarker = now >= firstStart && now <= lastEnd
  const todayPct = showTodayMarker
    ? Math.min(100, Math.max(0, ((now.getTime() - firstStart.getTime()) / totalSpanMs) * 100))
    : 0

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
                {currentADIndex >= 0 &&
                  ` / ${dashaTree.mahadashas[currentMDIndex].antardashas?.[currentADIndex]?.lord} AD`}
              </span>
            </div>
          )}
        </div>

        {/* Timeline bar */}
        <div className="relative mt-4">
          <div className="flex h-8 rounded-lg overflow-hidden border border-gray-700">
            {dashaTree.mahadashas.map((md, i) => {
              const widthPct = (md.duration_days / totalDays) * 100
              const isCurrent = i === currentMDIndex
              return (
                <div
                  key={i}
                  ref={isCurrent ? currentMDRef : undefined}
                  className={`${PLANET_COLORS[md.lord] ?? FALLBACK_COLOR} flex items-center justify-center text-[10px] font-medium text-white cursor-pointer hover:opacity-80 transition-opacity ${isCurrent ? 'ring-2 ring-white ring-inset' : ''}`}
                  style={{ width: `${widthPct}%` }}
                  onClick={() => { setExpandedMD(expandedMD === i ? null : i); setExpandedAD(null) }}
                  title={`${md.lord}: ${formatDate(md.start)} - ${formatDate(md.end)}`}
                >
                  {widthPct > 4 ? md.lord.substring(0, 3) : ''}
                </div>
              )
            })}
          </div>
          {showTodayMarker && (
            <div
              className="absolute top-0 h-8 w-0.5 bg-red-500 pointer-events-none"
              style={{ left: `${todayPct}%` }}
              title={`Today: ${formatDate(now.toISOString())}`}
            />
          )}
        </div>
      </div>

      {/* Mahadasha List */}
      <div className="space-y-2">
        {dashaTree.mahadashas.map((md, i) => {
          const isCurrent = i === currentMDIndex
          const isExpanded = expandedMD === i

          return (
            <div
              key={i}
              className={`rounded-lg border transition-colors ${isCurrent ? 'border-indigo-500 bg-indigo-900/10' : 'border-gray-700 bg-gray-800/30'}`}
            >
              <button
                onClick={() => { setExpandedMD(isExpanded ? null : i); setExpandedAD(null) }}
                className="w-full p-4 flex items-center justify-between text-left hover:bg-gray-700/20 rounded-lg transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${PLANET_COLORS[md.lord] ?? FALLBACK_COLOR}`} />
                  <span className="font-medium text-sm text-ink">{md.lord} Mahadasha</span>
                  {isCurrent && (
                    <span className="text-xs text-indigo-400 font-medium px-2 py-0.5 rounded-full bg-indigo-900/30 border border-indigo-700">
                      CURRENT
                    </span>
                  )}
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
                <div className="px-4 pb-4 space-y-1 border-l-2 border-gray-700/60 ml-3 sm:ml-6">
                  {md.antardashas.map((ad, j) => {
                    const isCurrentAD = isCurrent && j === currentADIndex
                    const isADExpanded = expandedAD === j

                    return (
                      <div key={j} className="pl-3">
                        <button
                          onClick={() => setExpandedAD(isADExpanded ? null : j)}
                          className={`w-full rounded px-3 py-2 flex items-center justify-between text-xs transition-colors ${isCurrentAD ? 'bg-indigo-900/30 border border-indigo-700' : 'hover:bg-gray-700/40'}`}
                        >
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${PLANET_COLORS[ad.lord] ?? FALLBACK_COLOR}`} />
                            <span className="text-ink">{md.lord}-{ad.lord}</span>
                            {isCurrentAD && (
                              <span className="text-indigo-400 text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-900/30">
                                active
                              </span>
                            )}
                          </div>
                          <span className="text-gray-500">
                            {formatDateShort(ad.start)} → {formatDateShort(ad.end)}
                          </span>
                        </button>

                        {/* Pratyantar expansion */}
                        {isADExpanded && ad.pratyantardashas && (
                          <div className="ml-3 sm:ml-6 mt-1 space-y-0.5 border-l border-gray-700/40 pl-3">
                            {ad.pratyantardashas.map((pd, k) => {
                              const isCurrentPD = isCurrentAD && isActive(pd.start, pd.end, now)
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
