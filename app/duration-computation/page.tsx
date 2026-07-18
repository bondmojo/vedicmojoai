/**
 * /duration-computation — Duration Analyser / Computation tab.
 *
 * Purely deterministic: picks a chart, a dasha period (MD → AD → PD drill
 * down), and a life-domain analysis type, then POSTs straight to
 * /api/timeline (no LLM, no cost) and renders the full domain-scoped
 * computation for that period — divisional charts, planets, nakshatras,
 * upagrahas, balas, and ashtakavarga. This is the same deterministic
 * backbone the MCP server exposes to Claude Desktop, now surfaced in the
 * web app.
 */
'use client'

import { useEffect, useState } from 'react'
import { DurationCategory } from '@/lib/durationTypes'
import DashaPeriodPicker, { SelectedPeriod } from '@/app/components/DashaPeriodPicker'
import DurationComputationResults, { TimelineResponse } from '@/app/components/DurationComputationResults'
import PageHeader from '@/app/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

interface UnifiedChartSummary {
  id: string
  name: string
  lagna: string
}

interface DashaPeriodRaw {
  lord: string
  start: string
  end: string
  duration_days: number
  antardashas?: DashaPeriodRaw[]
  pratyantardashas?: DashaPeriodRaw[]
}

interface DashaTree {
  balance_years: number
  mahadashas: DashaPeriodRaw[]
}

const ANALYSIS_TYPES: { key: DurationCategory; label: string }[] = [
  { key: 'career',   label: 'Career' },
  { key: 'health',   label: 'Health' },
  { key: 'cashflow', label: 'Money' },
  { key: 'family',   label: 'Family' },
]

// Mirrors MAX_SPAN_DAYS in app/api/timeline/route.ts. A bare Mahadasha (up to ~20
// years for Saturn/Rahu/Jupiter) routinely exceeds this — checked client-side so
// the practitioner is nudged to drill into an Antardasha before hitting a 400.
const MAX_SPAN_DAYS = 3653

function spanDays(dateFrom: string, dateTo: string): number {
  return (new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / (1000 * 60 * 60 * 24)
}

export default function DurationComputationPage() {
  // Chart list
  const [charts, setCharts] = useState<UnifiedChartSummary[]>([])
  const [loadingCharts, setLoadingCharts] = useState(true)
  const [chartLoadError, setChartLoadError] = useState<string | null>(null)

  // Selected chart + its dasha tree
  const [unifiedChartId, setUnifiedChartId] = useState('')
  const [dashaTree, setDashaTree] = useState<DashaTree | null>(null)
  const [loadingDashaTree, setLoadingDashaTree] = useState(false)

  // Analysis type + selected period
  const [category, setCategory] = useState<DurationCategory>('career')
  const [selectedPeriod, setSelectedPeriod] = useState<SelectedPeriod | null>(null)

  // Analyse submission
  const [analysing, setAnalysing] = useState(false)
  const [analyseError, setAnalyseError] = useState<string | null>(null)
  const [result, setResult] = useState<TimelineResponse | null>(null)

  useEffect(() => {
    async function fetchCharts() {
      try {
        const res = await fetch('/api/unified-charts')
        if (!res.ok) {
          setChartLoadError('Failed to load charts')
          return
        }
        const data: UnifiedChartSummary[] = await res.json()
        setCharts(data)
      } catch {
        setChartLoadError('Network error loading charts')
      } finally {
        setLoadingCharts(false)
      }
    }
    fetchCharts()
  }, [])

  useEffect(() => {
    setDashaTree(null)
    setSelectedPeriod(null)
    setResult(null)
    setAnalyseError(null)
    if (!unifiedChartId) return

    let cancelled = false
    setLoadingDashaTree(true)
    fetch(`/api/unified-charts/${unifiedChartId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) setDashaTree(data?.dashaTree ?? null)
      })
      .catch(() => {
        if (!cancelled) setDashaTree(null)
      })
      .finally(() => {
        if (!cancelled) setLoadingDashaTree(false)
      })

    return () => { cancelled = true }
  }, [unifiedChartId])

  const selectedChart = charts.find((c) => c.id === unifiedChartId)
  const spanTooLong = selectedPeriod ? spanDays(selectedPeriod.dateFrom, selectedPeriod.dateTo) > MAX_SPAN_DAYS : false

  async function handleAnalyse() {
    if (!unifiedChartId || !selectedPeriod || spanTooLong) return
    setAnalysing(true)
    setAnalyseError(null)
    setResult(null)
    try {
      const res = await fetch('/api/timeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unifiedChartId,
          dateFrom: selectedPeriod.dateFrom,
          dateTo: selectedPeriod.dateTo,
          category,
          includeCategoryData: true,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setAnalyseError(data.error || `Request failed (${res.status})`)
        return
      }
      setResult(data)
    } catch {
      setAnalyseError('Network error — please try again')
    } finally {
      setAnalysing(false)
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <PageHeader
          title="Duration Analyser"
          subtitle="Deterministic period computation — no LLM, no cost. Pick a chart, a dasha period, and a life domain to see every computed chart for that window."
        />

        <Card>
          <CardContent className="p-6 space-y-6">
            {/* Chart Picker */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Chart <span className="text-destructive">*</span>
              </label>
              {loadingCharts ? (
                <div className="w-full rounded-md border border-input bg-background px-3 py-2 text-muted-foreground text-sm">
                  Loading charts…
                </div>
              ) : chartLoadError ? (
                <div className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">
                  {chartLoadError}
                </div>
              ) : (
                <Select value={unifiedChartId} onValueChange={setUnifiedChartId}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="— select a chart —" />
                  </SelectTrigger>
                  <SelectContent>
                    {charts.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} ({c.lagna})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {!loadingCharts && !chartLoadError && charts.length === 0 && (
                <p className="mt-1.5 text-xs text-muted-foreground">No charts found. Compute or paste a chart first.</p>
              )}
            </div>

            {/* Analysis Type */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Analysis Type</label>
              <div className="inline-flex flex-wrap gap-1 rounded-md border border-border bg-muted/40 p-1">
                {ANALYSIS_TYPES.map(({ key, label }) => (
                  <Button
                    key={key}
                    type="button"
                    size="sm"
                    variant={category === key ? 'default' : 'ghost'}
                    className={cn('rounded-sm', category !== key && 'text-muted-foreground')}
                    onClick={() => setCategory(key)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Period Picker */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Analysis Duration (Dasha Period)</label>
              {loadingDashaTree ? (
                <div className="w-full rounded-md border border-input bg-background px-3 py-2 text-muted-foreground text-sm">
                  Loading dasha tree…
                </div>
              ) : (
                <DashaPeriodPicker dashaTree={dashaTree} onSelect={setSelectedPeriod} />
              )}
            </div>

            {/* Analyse */}
            <div>
              <Button
                type="button"
                onClick={handleAnalyse}
                disabled={!unifiedChartId || !selectedPeriod || spanTooLong || analysing}
              >
                {analysing ? 'Analysing…' : 'Analyse'}
              </Button>
              {spanTooLong && (
                <p className="mt-2 text-sm text-amber-600 dark:text-amber-400">
                  This Mahadasha spans more than 10 years — drill into an Antardasha (or
                  Pratyantardasha) above to narrow the range before analysing.
                </p>
              )}
              {analyseError && (
                <p className="mt-2 text-sm text-destructive">{analyseError}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {result && selectedChart && (
          <div className="mt-8">
            <DurationComputationResults result={result} lagna={selectedChart.lagna} />
          </div>
        )}
      </div>
    </main>
  )
}
