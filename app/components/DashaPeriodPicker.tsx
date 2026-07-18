/**
 * DashaPeriodPicker — MD → AD → PD select drill-down for the Duration
 * Computation tab. Unlike DashaTimeline (expand/collapse to browse), this
 * component's rows are *selectable*: picking a level derives the analysis
 * date range from that period's start/end and reports it via onSelect.
 */

'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { badgeVariants } from '@/components/ui/badge'

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

// Soft pastel badge colors per planet — light-mode-first, with dark-mode
// variants so the pills stay legible when the app is toggled to dark theme.
// Uses standalone Tailwind palettes (not the app's inverted `gray`/`slate`
// scales) so the pastel intent isn't flipped by theme inversion.
const PLANET_PASTEL: Record<string, string> = {
  Sun: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-900',
  Moon: 'bg-neutral-100 text-neutral-700 border-neutral-200 dark:bg-neutral-800/60 dark:text-neutral-300 dark:border-neutral-700',
  Mars: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900',
  Mercury: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-900',
  Jupiter: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900',
  Venus: 'bg-pink-50 text-pink-700 border-pink-200 dark:bg-pink-950/40 dark:text-pink-300 dark:border-pink-900',
  Saturn: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900',
  Rahu: 'bg-neutral-200 text-neutral-800 border-neutral-300 dark:bg-neutral-700/60 dark:text-neutral-200 dark:border-neutral-600',
  Ketu: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-900',
}
const FALLBACK_PASTEL = 'bg-neutral-100 text-neutral-700 border-neutral-200 dark:bg-neutral-800/60 dark:text-neutral-300 dark:border-neutral-700'

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

function PlanetPill({
  lord,
  selected,
  onClick,
}: {
  lord: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        badgeVariants({ variant: 'outline' }),
        PLANET_PASTEL[lord] ?? FALLBACK_PASTEL,
        'cursor-pointer font-medium',
        selected && 'ring-2 ring-primary ring-offset-1 ring-offset-background'
      )}
    >
      {lord}
    </button>
  )
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
      <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
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
        <label className="block text-xs text-muted-foreground mb-1.5">Mahadasha (MD)</label>
        <div className="flex flex-wrap gap-1.5">
          {dashaTree.mahadashas.map((m, i) => (
            <PlanetPill key={i} lord={m.lord} selected={mdIndex === i} onClick={() => selectMD(i)} />
          ))}
        </div>
      </div>

      {md?.antardashas && md.antardashas.length > 0 && (
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">
            Antardasha (AD) — within {md.lord} MD
          </label>
          <div className="flex flex-wrap gap-1.5">
            {md.antardashas.map((a, i) => (
              <PlanetPill key={i} lord={a.lord} selected={adIndex === i} onClick={() => selectAD(i)} />
            ))}
          </div>
        </div>
      )}

      {ad?.pratyantardashas && ad.pratyantardashas.length > 0 && (
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">
            Pratyantardasha (PD) — within {md!.lord}-{ad.lord} AD, optional
          </label>
          <div className="flex flex-wrap gap-1.5">
            {ad.pratyantardashas.map((p, i) => (
              <PlanetPill key={i} lord={p.lord} selected={pdIndex === i} onClick={() => selectPD(i)} />
            ))}
          </div>
        </div>
      )}

      {selectedPeriod && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-foreground">
          Selected: {md!.lord} MD{ad ? ` / ${ad.lord} AD` : ''}{pd ? ` / ${pd.lord} PD` : ''}
          {' — '}
          {formatDateShort(selectedPeriod.start)} → {formatDateShort(selectedPeriod.end)}
        </div>
      )}
    </div>
  )
}
