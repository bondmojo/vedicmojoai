/**
 * DashaPeriodPicker — MD → AD → PD select drill-down for the Duration
 * Computation tab. Unlike DashaTimeline (expand/collapse to browse), this
 * component's rows are *selectable*: picking a level derives the analysis
 * date range from that period's start/end and reports it via onSelect.
 */

'use client'

import { useEffect, useState } from 'react'

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

export interface SelectedPeriod {
  dateFrom: string
  dateTo: string
  label: string
}

// Moon/Rahu use `neutral` (not the theme-mirrored `gray`/`slate` scales) so
// their badge stays legible in both light and dark mode — see DashaTimeline.tsx.
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

function toDateInputValue(iso: string): string {
  return iso.slice(0, 10)
}

function formatDateShort(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function periodButtonClass(selected: boolean): string {
  return `px-3 py-1.5 rounded-md text-xs font-medium border transition-colors flex items-center gap-1.5 ${
    selected
      ? 'bg-indigo-600 border-indigo-500 text-white'
      : 'bg-gray-900 border-gray-600 text-gray-300 hover:border-indigo-500 hover:text-ink'
  }`
}

export default function DashaPeriodPicker({
  dashaTree,
  onSelect,
}: {
  dashaTree: DashaTree | null
  onSelect: (period: SelectedPeriod) => void
}) {
  const [mdIndex, setMdIndex] = useState<number | null>(null)
  const [adIndex, setAdIndex] = useState<number | null>(null)
  const [pdIndex, setPdIndex] = useState<number | null>(null)

  // Reset the drill-down whenever the underlying chart (and thus dasha tree) changes.
  useEffect(() => {
    setMdIndex(null)
    setAdIndex(null)
    setPdIndex(null)
  }, [dashaTree])

  if (!dashaTree?.mahadashas?.length) {
    return (
      <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-4 text-sm text-gray-500">
        Select a chart above to pick a dasha period.
      </div>
    )
  }

  const md = mdIndex !== null ? dashaTree.mahadashas[mdIndex] : null
  const ad = md && adIndex !== null ? md.antardashas?.[adIndex] ?? null : null
  const pd = ad && pdIndex !== null ? ad.pratyantardashas?.[pdIndex] ?? null : null

  function selectMD(i: number) {
    if (!dashaTree) return
    setMdIndex(i)
    setAdIndex(null)
    setPdIndex(null)
    const m = dashaTree.mahadashas[i]
    onSelect({ dateFrom: toDateInputValue(m.start), dateTo: toDateInputValue(m.end), label: `${m.lord} MD` })
  }

  function selectAD(i: number) {
    if (!md) return
    setAdIndex(i)
    setPdIndex(null)
    const a = md.antardashas![i]
    onSelect({
      dateFrom: toDateInputValue(a.start),
      dateTo: toDateInputValue(a.end),
      label: `${md.lord} MD / ${a.lord} AD`,
    })
  }

  function selectPD(i: number) {
    if (!md || !ad) return
    setPdIndex(i)
    const p = ad.pratyantardashas![i]
    onSelect({
      dateFrom: toDateInputValue(p.start),
      dateTo: toDateInputValue(p.end),
      label: `${md.lord} MD / ${ad.lord} AD / ${p.lord} PD`,
    })
  }

  const selectedPeriod = pd ?? ad ?? md

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs text-gray-400 mb-1">Mahadasha (MD)</label>
        <div className="flex flex-wrap gap-1.5">
          {dashaTree.mahadashas.map((m, i) => (
            <button
              key={i}
              type="button"
              onClick={() => selectMD(i)}
              className={periodButtonClass(mdIndex === i)}
            >
              <span className={`w-2 h-2 rounded-full ${PLANET_COLORS[m.lord] ?? FALLBACK_COLOR}`} />
              {m.lord}
            </button>
          ))}
        </div>
      </div>

      {md?.antardashas && md.antardashas.length > 0 && (
        <div>
          <label className="block text-xs text-gray-400 mb-1">
            Antardasha (AD) — within {md.lord} MD
          </label>
          <div className="flex flex-wrap gap-1.5">
            {md.antardashas.map((a, i) => (
              <button
                key={i}
                type="button"
                onClick={() => selectAD(i)}
                className={periodButtonClass(adIndex === i)}
              >
                <span className={`w-2 h-2 rounded-full ${PLANET_COLORS[a.lord] ?? FALLBACK_COLOR}`} />
                {a.lord}
              </button>
            ))}
          </div>
        </div>
      )}

      {ad?.pratyantardashas && ad.pratyantardashas.length > 0 && (
        <div>
          <label className="block text-xs text-gray-400 mb-1">
            Pratyantardasha (PD) — within {md!.lord}-{ad.lord} AD, optional
          </label>
          <div className="flex flex-wrap gap-1.5">
            {ad.pratyantardashas.map((p, i) => (
              <button
                key={i}
                type="button"
                onClick={() => selectPD(i)}
                className={periodButtonClass(pdIndex === i)}
              >
                <span className={`w-2 h-2 rounded-full ${PLANET_COLORS[p.lord] ?? FALLBACK_COLOR}`} />
                {p.lord}
              </button>
            ))}
          </div>
        </div>
      )}

      {selectedPeriod && (
        <div className="rounded-lg border border-indigo-700 bg-indigo-900/70 px-3 py-2 text-xs text-indigo-100">
          Selected: {md!.lord} MD{ad ? ` / ${ad.lord} AD` : ''}{pd ? ` / ${pd.lord} PD` : ''}
          {' — '}
          {formatDateShort(selectedPeriod.start)} → {formatDateShort(selectedPeriod.end)}
        </div>
      )}
    </div>
  )
}
