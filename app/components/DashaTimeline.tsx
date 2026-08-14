/**
 * DashaTimeline — Vimshottari Dasha viewer for computed charts.
 * Similar to the existing /charts/[id]/dasha page but standalone (no DB dependency).
 */

'use client'

import { useEffect, useRef, useState } from 'react'
import GocharRangeTable from './GocharRangeTable'
import { useGocharRange } from './useGocharRange'
import type { GocharRequestSource } from './useGocharRange'

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

type SelectedPD = readonly [mdIndex: number, adIndex: number, pdIndex: number]

// Planet colors for the timeline bar — using subtle, brand-aligned tones
// that harmonize with the indigo+gold palette. These are background colors
// for the bar segments, so they need to work with white text overlaid.
const PLANET_COLORS: Record<string, string> = {
  Sun: 'bg-[rgb(var(--color-planet-sun))]',
  Moon: 'bg-neutral-400',
  Mars: 'bg-[rgb(var(--color-planet-mars))]',
  Mercury: 'bg-[rgb(var(--color-planet-mercury))]',
  Jupiter: 'bg-[rgb(var(--color-planet-jupiter))]',
  Venus: 'bg-[rgb(var(--color-planet-venus))]',
  Saturn: 'bg-[rgb(var(--color-planet-saturn))]',
  Rahu: 'bg-neutral-500',
  Ketu: 'bg-[rgb(var(--color-planet-ketu))]',
}

const FALLBACK_COLOR = 'bg-neutral-600'

// Planet dot colors for list items (lighter shade visible on dark backgrounds)
const PLANET_DOT: Record<string, string> = {
  Sun: 'bg-planet-sun',
  Moon: 'bg-planet-moon',
  Mars: 'bg-planet-mars',
  Mercury: 'bg-planet-mercury',
  Jupiter: 'bg-planet-jupiter',
  Venus: 'bg-planet-venus',
  Saturn: 'bg-planet-saturn',
  Rahu: 'bg-planet-rahu',
  Ketu: 'bg-planet-ketu',
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

function isActive(start: string, end: string, now: Date): boolean {
  return new Date(start) <= now && new Date(end) > now
}

export default function DashaTimeline({
  dashaTree,
  gocharSource,
}: {
  dashaTree: DashaTree
  gocharSource: GocharRequestSource
}) {
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
  const [selectedPD, setSelectedPD] = useState<SelectedPD | null>(null)
  const [pdIncludeMoon, setPdIncludeMoon] = useState(false)
  const gochar = useGocharRange(gocharSource)

  const currentMDRef = useRef<HTMLDivElement>(null)

  function isSelectedPD(mdIndex: number, adIndex: number, pdIndex: number): boolean {
    return selectedPD?.[0] === mdIndex
      && selectedPD[1] === adIndex
      && selectedPD[2] === pdIndex
  }

  function requestPD(pd: DashaPeriod, includeMoon: boolean): void {
    void gochar.request({
      dateFrom: pd.start,
      dateTo: pd.end,
      includeMoon,
    })
  }

  function togglePDGochar(mdIndex: number, adIndex: number, pdIndex: number, pd: DashaPeriod): void {
    if (isSelectedPD(mdIndex, adIndex, pdIndex)) {
      setSelectedPD(null)
      gochar.clear()
      return
    }

    // One Gochar result belongs to exactly one PD at a time. Clearing first also
    // invalidates any in-flight response for the previously selected PD.
    gochar.clear()
    setSelectedPD([mdIndex, adIndex, pdIndex])
    setPdIncludeMoon(false)
    requestPD(pd, false)
  }

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
              <span className="ml-2 text-sm font-medium text-brand-400">
                {dashaTree.mahadashas[currentMDIndex].lord} MD
                {currentADIndex >= 0 &&
                  ` / ${dashaTree.mahadashas[currentMDIndex].antardashas?.[currentADIndex]?.lord} AD`}
                {currentADIndex >= 0 && (() => {
                  const pds = dashaTree.mahadashas[currentMDIndex].antardashas?.[currentADIndex]?.pratyantardashas
                  const pdIdx = pds?.findIndex((pd) => isActive(pd.start, pd.end, now))
                  return pdIdx != null && pdIdx >= 0 ? ` / ${pds![pdIdx].lord} PD` : ''
                })()}
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
              className={`rounded-lg border transition-colors ${isCurrent ? 'border-brand-500 bg-brand-900/10' : 'border-gray-700 bg-gray-800/30'}`}
            >
              <button
                onClick={() => { setExpandedMD(isExpanded ? null : i); setExpandedAD(null) }}
                className="w-full p-4 flex items-center justify-between text-left hover:bg-gray-700/20 rounded-lg transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${PLANET_DOT[md.lord] ?? FALLBACK_COLOR}`} />
                  <span className="font-medium text-sm text-ink">{md.lord} Mahadasha</span>
                  {isCurrent && (
                    <span className="text-xs text-brand-300 font-medium px-2 py-0.5 rounded-full bg-brand-900/30 border border-brand-700">
                      CURRENT
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <span>
                    {formatDateShort(md.start)} → {formatDateShort(md.end)}
                    <span className="ml-2 text-gray-500">
                      ({(md.duration_days / 365.2425).toFixed(1)}y)
                    </span>
                  </span>
                  <svg className={`w-4 h-4 text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {/* Antardasha expansion */}
              {isExpanded && md.antardashas && (
                <div className="px-4 pb-4 space-y-1 border-l-2 border-brand-700/40 ml-3 sm:ml-6">
                  {md.antardashas.map((ad, j) => {
                    const isCurrentAD = isCurrent && j === currentADIndex
                    const isADExpanded = expandedAD === j

                    return (
                      <div key={j} className="pl-3">
                        <button
                          onClick={() => setExpandedAD(isADExpanded ? null : j)}
                          className={`w-full rounded px-3 py-2 flex items-center justify-between text-xs transition-colors ${isCurrentAD ? 'bg-brand-900/30 border border-brand-700' : 'hover:bg-gray-700/40'}`}
                        >
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${PLANET_DOT[ad.lord] ?? FALLBACK_COLOR}`} />
                            <span className="text-ink">{md.lord}-{ad.lord}</span>
                            {isCurrentAD && (
                              <span className="text-brand-300 text-[10px] px-1.5 py-0.5 rounded-full bg-brand-900/30">
                                active
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-gray-500">
                              {formatDateShort(ad.start)} → {formatDateShort(ad.end)}
                            </span>
                            <svg className={`w-3 h-3 text-gray-500 transition-transform ${isADExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                        </button>

                        {/* Pratyantar expansion */}
                        {isADExpanded && ad.pratyantardashas && (
                          <div className="ml-3 sm:ml-6 mt-1 space-y-0.5 border-l border-gray-700/40 pl-3">
                            {ad.pratyantardashas.map((pd, k) => {
                              const isCurrentPD = isCurrentAD && isActive(pd.start, pd.end, now)
                              const isPDSelected = isSelectedPD(i, j, k)
                              const pdLabel = `${md.lord}-${ad.lord}-${pd.lord}`
                              return (
                                <div
                                  key={k}
                                  className={`rounded ${isCurrentPD ? 'bg-gold-900/30 border border-gold-700/50 text-gold-300' : 'text-gray-500'}`}
                                >
                                  <button
                                    type="button"
                                    onClick={() => togglePDGochar(i, j, k, pd)}
                                    aria-expanded={isPDSelected}
                                    aria-controls={isPDSelected ? `pd-gochar-${i}-${j}-${k}` : undefined}
                                    aria-label={`View Gochar for ${pdLabel}`}
                                    className={`w-full rounded px-3 py-1.5 text-left text-[10px] transition-colors hover:bg-gray-700/40 focus:outline-none focus:ring-2 focus:ring-brand-500 ${isPDSelected ? 'bg-brand-900/30' : ''}`}
                                  >
                                    <span className="flex items-center justify-between gap-3">
                                      <span className="flex items-center gap-2">
                                        <span>{pdLabel}</span>
                                        {isCurrentPD && (
                                          <span className="text-gold-300 text-[9px] px-1.5 py-0.5 rounded-full bg-gold-900/40 font-medium">
                                            active
                                          </span>
                                        )}
                                      </span>
                                      <span className="flex items-center gap-3 whitespace-nowrap">
                                        <span>{formatDateShort(pd.start)} → {formatDateShort(pd.end)}</span>
                                        <span className="font-medium text-brand-300">{isPDSelected ? 'Hide Gochar' : 'View Gochar'}</span>
                                      </span>
                                    </span>
                                  </button>

                                  {isPDSelected && (
                                    <section
                                      id={`pd-gochar-${i}-${j}-${k}`}
                                      className="mx-3 mb-2 mt-1 space-y-3 rounded border border-gray-700 bg-gray-900/40 p-3 text-xs text-gray-300"
                                      aria-label={`Gochar for ${pdLabel}`}
                                    >
                                      <div>
                                        <h4 className="font-medium text-ink">{pdLabel} Gochar</h4>
                                        <p className="mt-1 text-gray-400">
                                          Exact UTC range: <code className="text-gray-200">{pd.start}</code> → <code className="text-gray-200">{pd.end}</code>
                                        </p>
                                      </div>
                                      <label className="flex items-start gap-2 text-gray-300" htmlFor={`pd-gochar-moon-${i}-${j}-${k}`}>
                                        <input
                                          id={`pd-gochar-moon-${i}-${j}-${k}`}
                                          type="checkbox"
                                          checked={pdIncludeMoon}
                                          onChange={(event) => {
                                            const includeMoon = event.target.checked
                                            setPdIncludeMoon(includeMoon)
                                            // The previous result describes a different graha set.
                                            // Hide it while the newly requested PD view is loading.
                                            gochar.clear()
                                            requestPD(pd, includeMoon)
                                          }}
                                          className="mt-0.5"
                                        />
                                        <span>Include Moon for this PD.</span>
                                      </label>
                                      {gochar.loading && (
                                        <p role="status" className="text-gray-400">Loading Gochar…</p>
                                      )}
                                      {gochar.error && (
                                        <div role="status" className="flex flex-wrap items-center gap-2 rounded border border-red-800 bg-red-950/30 px-3 py-2 text-red-300">
                                          <span>{gochar.error}</span>
                                          <button
                                            type="button"
                                            onClick={() => requestPD(pd, pdIncludeMoon)}
                                            className="rounded border border-red-700 px-2 py-1 font-medium hover:bg-red-900/40"
                                          >
                                            Retry Gochar
                                          </button>
                                        </div>
                                      )}
                                      {gochar.result && <GocharRangeTable result={gochar.result} label={`${pdLabel} Gochar intervals`} />}
                                    </section>
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
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
