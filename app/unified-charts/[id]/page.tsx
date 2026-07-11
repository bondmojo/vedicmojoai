/**
 * /unified-charts/[id] — Unified chart detail page.
 *
 * Shows chart metadata, source info, domain data availability,
 * and recent pipeline runs.
 */

'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

interface ChartDetail {
  id: string
  name: string
  source: 'compute' | 'paste'
  lagna: string
  lagnaLongitude: number
  moonLongitude: number
  ayanamsa: number
  birthDatetime: string
  sunriseMode: string
  birthInput: any
  planets: any
  nakshatras: any
  divisionalCharts: any
  karakas: any
  ashtakavarga: any
  relationships: any
  shadbala: any
  jaimini: any
  bhavaBala: any
  dashaTree: any
  chartInputV1: any
  pipelineRuns: {
    id: string
    status: string
    runType: string
    queryTypes: string[]
    totalCostUsd: number
    createdAt: string
    completedAt: string | null
  }[]
  createdAt: string
  updatedAt: string
}

export default function ChartDetailPage() {
  const params = useParams()
  const router = useRouter()
  const chartId = params.id as string

  const [chart, setChart] = useState<ChartDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/unified-charts/${chartId}`)
      .then((res) => res.json())
      .then(setChart)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [chartId])

  if (loading) {
    return (
      <main className="min-h-screen p-8">
        <div className="max-w-5xl mx-auto">
          <p className="text-gray-500">Loading...</p>
        </div>
      </main>
    )
  }

  if (!chart) {
    return (
      <main className="min-h-screen p-8">
        <div className="max-w-5xl mx-auto">
          <p className="text-red-400">Chart not found</p>
        </div>
      </main>
    )
  }

  const domainColumns = [
    { key: 'planets', label: 'Planets' },
    { key: 'nakshatras', label: 'Nakshatras' },
    { key: 'divisionalCharts', label: 'Divisional Charts' },
    { key: 'karakas', label: 'Karakas' },
    { key: 'ashtakavarga', label: 'Ashtakavarga' },
    { key: 'relationships', label: 'Relationships' },
    { key: 'shadbala', label: 'Shadbala' },
    { key: 'jaimini', label: 'Jaimini' },
    { key: 'bhavaBala', label: 'Bhava Bala' },
    { key: 'dashaTree', label: 'Dasha Tree' },
  ]

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">{chart.name}</h1>
            <div className="flex items-center gap-3 mt-2 text-gray-400 text-sm">
              <SourceBadge source={chart.source} />
              <span>{chart.lagna} Lagna</span>
              <span>Sunrise: {chart.sunriseMode}</span>
              <span>Created: {formatDate(chart.createdAt)}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href={`/duration-analysis?chartId=${chart.id}`}
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 transition-colors whitespace-nowrap"
            >
              Duration Analysis
            </Link>
            <button
              onClick={() => router.push(`/unified-charts/${chart.id}/analyze`)}
              className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 transition-colors"
            >
              Run AI Analysis
            </button>
          </div>
        </div>

        {/* Meta Info */}
        <section className="rounded-lg border border-gray-700 bg-gray-800/50 p-5 mb-6">
          <h2 className="text-lg font-medium mb-3">Chart Data</h2>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Lagna Longitude</span>
              <p className="text-gray-200">{chart.lagnaLongitude.toFixed(4)}</p>
            </div>
            <div>
              <span className="text-gray-500">Moon Longitude</span>
              <p className="text-gray-200">{chart.moonLongitude.toFixed(4)}</p>
            </div>
            <div>
              <span className="text-gray-500">Ayanamsa</span>
              <p className="text-gray-200">{chart.ayanamsa.toFixed(4)}</p>
            </div>
            <div>
              <span className="text-gray-500">Birth Datetime (UTC)</span>
              <p className="text-gray-200">{new Date(chart.birthDatetime).toISOString()}</p>
            </div>
            <div>
              <span className="text-gray-500">Source</span>
              <p className="text-gray-200 capitalize">{chart.source}</p>
            </div>
            <div>
              <span className="text-gray-500">Has ChartInputV1</span>
              <p className="text-gray-200">{chart.chartInputV1 ? 'Yes' : 'No'}</p>
            </div>
          </div>
        </section>

        {/* Domain Data Availability */}
        <section className="rounded-lg border border-gray-700 bg-gray-800/50 p-5 mb-6">
          <h2 className="text-lg font-medium mb-3">Domain Data</h2>
          <div className="grid grid-cols-5 gap-2">
            {domainColumns.map(({ key, label }) => {
              const populated = (chart as any)[key] != null
              return (
                <div
                  key={key}
                  className={`rounded-lg border px-3 py-2 text-center text-xs ${
                    populated
                      ? 'border-green-800 bg-green-900/20 text-green-400'
                      : 'border-gray-700 bg-gray-900/50 text-gray-500'
                  }`}
                >
                  {label}
                </div>
              )
            })}
          </div>
          {chart.source === 'paste' && !chart.planets && (
            <p className="text-xs text-gray-500 mt-3">
              Domain columns are populated when computed from birth data. Paste-path charts
              use ChartInputV1 for AI analysis directly.
            </p>
          )}
        </section>

        {/* Pipeline Runs */}
        <section className="rounded-lg border border-gray-700 bg-gray-800/50 p-5">
          <h2 className="text-lg font-medium mb-3">Pipeline Runs</h2>
          {chart.pipelineRuns.length === 0 ? (
            <p className="text-gray-500 text-sm">No runs yet. Click &ldquo;Run AI Analysis&rdquo; to start.</p>
          ) : (
            <div className="space-y-2">
              {chart.pipelineRuns.map((run) => (
                <Link
                  key={run.id}
                  href={`/runs/${run.id}`}
                  className="flex items-center justify-between rounded-lg border border-gray-700 p-3 hover:border-indigo-500/50 transition-all"
                >
                  <div className="flex items-center gap-3 text-sm">
                    <StatusBadge status={run.status} />
                    <span className="text-gray-300">{run.runType}</span>
                    <span className="text-gray-500">
                      [{run.queryTypes.join(', ')}]
                    </span>
                  </div>
                  <div className="text-xs text-gray-500">
                    {run.totalCostUsd > 0 && (
                      <span className="mr-3">${run.totalCostUsd.toFixed(4)}</span>
                    )}
                    {formatDate(run.createdAt)}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}

function SourceBadge({ source }: { source: string }) {
  const styles = source === 'compute'
    ? 'bg-cyan-900/50 text-cyan-400'
    : 'bg-purple-900/50 text-purple-400'

  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${styles}`}>
      {source}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    done: 'bg-green-900/50 text-green-400',
    running: 'bg-blue-900/50 text-blue-400',
    queued: 'bg-gray-700/50 text-gray-400',
    failed: 'bg-red-900/50 text-red-400',
    halted_for_review: 'bg-amber-900/50 text-amber-400',
  }

  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[status] ?? colors.queued}`}>
      {status}
    </span>
  )
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}
