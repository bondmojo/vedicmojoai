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
import Link from 'next/link'
import { DurationCategory } from '@/lib/durationTypes'
import DashaPeriodPicker, { SelectedPeriod } from '@/app/components/DashaPeriodPicker'
import DurationComputationResults, { TimelineResponse } from '@/app/components/DurationComputationResults'

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
    <main className="min-h-screen p-6 bg-gray-950 text-gray-100">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold">Duration Analyser</h1>
            <p className="mt-1 text-gray-400 text-sm">
              Deterministic period computation — no LLM, no cost. Pick a chart, a dasha
              period, and a life domain to see every computed chart for that window.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/duration-analysis"
              className="rounded-lg border border-gray-600 px-4 py-2 text-sm font-medium text-gray-400 hover:border-violet-500 hover:text-violet-300 transition-colors"
            >
              Duration Analysis (AI)
            </Link>
            <Link
              href="/"
              className="rounded-lg border border-gray-600 px-4 py-2 text-sm font-medium text-gray-400 hover:border-indigo-500 hover:text-ink transition-colors"
            >
              Chart Computation
            </Link>
          </div>
        </div>

        <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-6 space-y-6">
          {/* Chart Picker */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Chart <span className="text-red-400">*</span>
            </label>
            {loadingCharts ? (
              <div className="w-full rounded-lg bg-gray-900 border border-gray-600 px-3 py-2 text-gray-500 text-sm">
                Loading charts…
              </div>
            ) : chartLoadError ? (
              <div className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded px-3 py-2">
                {chartLoadError}
              </div>
            ) : (
              <select
                value={unifiedChartId}
                onChange={(e) => setUnifiedChartId(e.target.value)}
                className="w-full rounded-lg bg-gray-900 border border-gray-600 px-3 py-2 text-ink focus:border-indigo-500 focus:outline-none"
              >
                <option value="">— select a chart —</option>
                {charts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.lagna})
                  </option>
                ))}
              </select>
            )}
            {!loadingCharts && !chartLoadError && charts.length === 0 && (
              <p className="mt-1 text-xs text-gray-500">No charts found. Compute or paste a chart first.</p>
            )}
          </div>

          {/* Analysis Type */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">Analysis Type</label>
            <div className="flex flex-wrap gap-2">
              {ANALYSIS_TYPES.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setCategory(key)}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                    category === key
                      ? 'bg-indigo-600 border-indigo-500 text-white'
                      : 'bg-gray-900 border-gray-600 text-gray-300 hover:border-indigo-500 hover:text-ink'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Period Picker */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">Analysis Duration (Dasha Period)</label>
            {loadingDashaTree ? (
              <div className="w-full rounded-lg bg-gray-900 border border-gray-600 px-3 py-2 text-gray-500 text-sm">
                Loading dasha tree…
              </div>
            ) : (
              <DashaPeriodPicker dashaTree={dashaTree} onSelect={setSelectedPeriod} />
            )}
          </div>

          {/* Analyse */}
          <div>
            <button
              type="button"
              onClick={handleAnalyse}
              disabled={!unifiedChartId || !selectedPeriod || spanTooLong || analysing}
              className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {analysing ? 'Analysing…' : 'Analyse'}
            </button>
            {spanTooLong && (
              <p className="mt-2 text-sm text-amber-400">
                This Mahadasha spans more than 10 years — drill into an Antardasha (or
                Pratyantardasha) above to narrow the range before analysing.
              </p>
            )}
            {analyseError && (
              <p className="mt-2 text-sm text-red-400">{analyseError}</p>
            )}
          </div>
        </div>

        {result && selectedChart && (
          <div className="mt-8">
            <DurationComputationResults result={result} lagna={selectedChart.lagna} />
          </div>
        )}
      </div>
    </main>
  )
}
