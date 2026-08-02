/**
 * CharaDashaView — Jaimini Chara Dasha (sign/rasi-based) viewer.
 *
 * Sibling of DashaTimeline (Vimshottari). Chara Dasha mahadashas are SIGNS, not
 * planets. Shows the sequence, per-sign duration, lord + its placement, and the
 * 12 equal antardashas per mahadasha. Highlights the running period.
 */

'use client'

import { useState } from 'react'
import { planetColorClass } from '@/lib/brandColors'

interface CharaAntardasha {
  sign: string
  signNumber: number
  start: string
  end: string
  durationYears: number
}

interface CharaPeriod {
  sign: string
  signNumber: number
  lord: string
  lordSignNumber: number
  durationYears: number
  cycle: number
  start: string
  end: string
  antardashas: CharaAntardasha[]
}

interface CharaDasha {
  method: string
  lagnaSignNumber: number
  ninthSignNumber: number
  direction: 'forward' | 'reverse'
  cycleYears: number
  periods: CharaPeriod[]
}

const SIGN_SHORT = ['Ari', 'Tau', 'Gem', 'Can', 'Leo', 'Vir', 'Lib', 'Sco', 'Sag', 'Cap', 'Aqu', 'Pis']

// Distinct color per sign (by element) for the timeline bar / dots.
const ELEMENT_COLOR = (signNumber: number): string => {
  const el = (signNumber - 1) % 4 // 0 fire,1 earth,2 air,3 water
  return ['bg-red-600', 'bg-amber-700', 'bg-sky-600', 'bg-teal-600'][el]
}

function formatDate(s: string): string {
  return new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}
function formatDateShort(s: string): string {
  return new Date(s).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
}
function isActive(start: string, end: string, now: Date): boolean {
  return new Date(start) <= now && new Date(end) > now
}

export default function CharaDashaView({ charaDasha }: { charaDasha: CharaDasha }) {
  const now = new Date()
  const hasData = Boolean(charaDasha?.periods?.length)

  const currentIndex = hasData ? charaDasha.periods.findIndex((p) => isActive(p.start, p.end, now)) : -1
  const [expanded, setExpanded] = useState<number | null>(currentIndex >= 0 ? currentIndex : null)

  if (!hasData) {
    return (
      <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-6 text-center text-sm text-gray-400">
        No Chara Dasha data available for this chart.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-sm font-semibold text-ink">Chara Dasha (Jaimini rasi dasha)</h3>
            <p className="text-xs text-gray-400 mt-1">
              {charaDasha.method} · {charaDasha.direction === 'forward' ? 'Zodiacal (direct)' : 'Anti-zodiacal (reverse)'} sequence
              {' '}· one cycle ≈ {charaDasha.cycleYears} years
            </p>
          </div>
          {currentIndex >= 0 && (
            <div className="text-right">
              <span className="text-xs text-gray-400">Current:</span>
              <span className="ml-2 text-sm font-medium text-indigo-700 dark:text-indigo-400">
                {charaDasha.periods[currentIndex].sign} MD
              </span>
            </div>
          )}
        </div>
        <p className="mt-2 text-[11px] text-gray-500">
          Mahadashas are SIGNS (not planets). Duration = count from the sign to its lord (direction by sign parity),
          minus 1, with the lord in its own sign giving 12 years. Parasara / PVR method: runs two cycles (second-cycle
          duration = 12 − first); Scorpio/Aquarius use their node co-lord (Ketu/Rahu). Matches Jagannatha Hora.
        </p>
      </div>

      {/* Mahadasha list */}
      <div className="space-y-2">
        {charaDasha.periods.map((p, i) => {
          const isCurrent = i === currentIndex
          const isExpanded = expanded === i
          return (
            <div
              key={i}
              className={`rounded-lg border transition-colors ${isCurrent ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/10' : 'border-gray-700 bg-gray-800/30'}`}
            >
              <button
                onClick={() => setExpanded(isExpanded ? null : i)}
                className="w-full p-4 flex items-center justify-between text-left hover:bg-gray-700/20 rounded-lg transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${ELEMENT_COLOR(p.signNumber)}`} />
                  <span className="font-medium text-sm text-ink">{p.sign} Dasha</span>
                  <span className="text-xs text-gray-500">
                    lord <span className={planetColorClass(p.lord)}>{p.lord}</span> in {SIGN_SHORT[p.lordSignNumber - 1]}
                  </span>
                  {isCurrent && (
                    <span className="text-xs text-indigo-700 dark:text-indigo-400 font-medium px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/30 border border-indigo-300 dark:border-indigo-700">
                      CURRENT
                    </span>
                  )}
                  {p.cycle > 1 && (
                    <span className="text-[10px] text-gray-600">cycle {p.cycle}</span>
                  )}
                </div>
                <div className="text-xs text-gray-400">
                  {formatDate(p.start)} → {formatDate(p.end)}
                  <span className="ml-2 text-gray-500">({p.durationYears}y)</span>
                </div>
              </button>

              {isExpanded && (
                <div className="px-4 pb-4 ml-3 sm:ml-6 border-l-2 border-gray-700/60">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 pl-3">
                    {p.antardashas.map((ad, j) => {
                      const adActive = isActive(ad.start, ad.end, now)
                      return (
                        <div
                          key={j}
                          className={`flex items-center justify-between px-3 py-1.5 text-xs rounded ${adActive ? 'bg-indigo-100 dark:bg-indigo-900/30 border border-indigo-300 dark:border-indigo-700 text-indigo-800 dark:text-indigo-300' : 'text-gray-400'}`}
                        >
                          <span className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${ELEMENT_COLOR(ad.signNumber)}`} />
                            {p.sign}-{ad.sign}
                            {adActive && <span className="text-[10px] text-indigo-700 dark:text-indigo-400">active</span>}
                          </span>
                          <span className="text-gray-500">
                            {formatDateShort(ad.start)} → {formatDateShort(ad.end)}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
