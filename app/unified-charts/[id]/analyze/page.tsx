/**
 * /unified-charts/[id]/analyze — Run AI Analysis page.
 *
 * Query type selector, free-text question field, and run button.
 * Shows source-specific info (compute charts skip Wave 1).
 */

'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'

const QUERY_TYPES = [
  { id: 'generic', label: 'Generic', description: 'Balanced overview: wealth, health, career' },
  { id: 'health', label: 'Health', description: 'D30, H6/H8, disease significations' },
  { id: 'wealth', label: 'Wealth', description: 'H2/H11, Dhana yogas, accumulation periods' },
  { id: 'career', label: 'Career', description: 'D10, H10 yogas, career mode' },
  { id: 'property', label: 'Property', description: 'D4, H4, acquisition windows' },
  { id: 'marriage', label: 'Marriage', description: 'D9, H7, Venus/Jupiter karakas, timing' },
  { id: 'full', label: 'Full Analysis', description: 'All agents — comprehensive report' },
] as const

interface ChartMeta {
  id: string
  name: string
  source: 'compute' | 'paste'
  lagna: string
  birthDatetime: string
}

export default function AnalyzePage() {
  const router = useRouter()
  const params = useParams()
  const chartId = params.id as string

  const [chart, setChart] = useState<ChartMeta | null>(null)
  const [selectedTypes, setSelectedTypes] = useState<string[]>([])
  const [userQuery, setUserQuery] = useState('')
  const [forceRerunWave1, setForceRerunWave1] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/unified-charts/${chartId}`)
      .then((res) => res.json())
      .then((data) => setChart(data))
      .catch(() => setError('Failed to load chart'))
  }, [chartId])

  function toggleType(type: string) {
    if (type === 'full') {
      setSelectedTypes(['full'])
      return
    }
    setSelectedTypes((prev) => {
      const filtered = prev.filter((t) => t !== 'full')
      return filtered.includes(type)
        ? filtered.filter((t) => t !== type)
        : [...filtered, type]
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await fetch(`/api/unified-charts/${chartId}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queryTypes: selectedTypes.length > 0 ? selectedTypes : ['generic'],
          userQuery: userQuery || undefined,
          forceRerunWave1,
        }),
      })

      const data = await res.json()

      if (res.status === 202) {
        router.push(`/runs/${data.runId}`)
      } else {
        setError(data.error || 'Failed to start analysis')
      }
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  if (!chart) {
    return (
      <main className="min-h-screen p-8">
        <div className="max-w-3xl mx-auto">
          <p className="text-gray-500">Loading chart...</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Run AI Analysis</h1>
          <div className="flex items-center gap-3 mt-2 text-gray-400">
            <span className="text-lg">{chart.name}</span>
            <span className="text-sm">({chart.lagna} Lagna)</span>
            <SourceBadge source={chart.source} />
          </div>
        </div>

        {/* Wave strategy info */}
        <div className={`rounded-lg border p-4 mb-6 text-sm ${
          chart.source === 'compute'
            ? 'border-cyan-800 bg-cyan-900/20 text-cyan-300'
            : 'border-purple-800 bg-purple-900/20 text-purple-300'
        }`}>
          {chart.source === 'compute' ? (
            <p>
              <strong>Compute path:</strong> Foundation data (Wave 1) is already computed
              deterministically. The AI pipeline will start from Wave 2 (domain specialists).
            </p>
          ) : (
            <p>
              <strong>Paste path:</strong> The full Wave 1–4 pipeline will run, including
              foundation extraction by LLM agents (1A–1D).
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Query Type Selection */}
          <section>
            <h2 className="text-lg font-medium mb-3">Analysis Type</h2>
            <div className="grid grid-cols-2 gap-3">
              {QUERY_TYPES.map((qt) => (
                <button
                  key={qt.id}
                  type="button"
                  onClick={() => toggleType(qt.id)}
                  className={`rounded-lg border p-3 text-left transition-all ${
                    selectedTypes.includes(qt.id)
                      ? 'border-indigo-500 bg-indigo-900/20'
                      : 'border-gray-700 hover:border-gray-500'
                  }`}
                >
                  <span className="font-medium text-sm">{qt.label}</span>
                  <p className="text-xs text-gray-500 mt-1">{qt.description}</p>
                </button>
              ))}
            </div>
          </section>

          {/* Free-text query */}
          <section>
            <h2 className="text-lg font-medium mb-3">Question (optional)</h2>
            <textarea
              value={userQuery}
              onChange={(e) => setUserQuery(e.target.value)}
              rows={3}
              className="w-full rounded-lg bg-gray-900 border border-gray-700 p-3 text-sm text-gray-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
              placeholder="e.g., When is the best period for career growth in the next 5 years?"
            />
          </section>

          {/* Options (paste-path only) */}
          {chart.source === 'paste' && (
            <section>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={forceRerunWave1}
                  onChange={(e) => setForceRerunWave1(e.target.checked)}
                  className="rounded border-gray-600 bg-gray-800 text-indigo-500 focus:ring-indigo-500"
                />
                <span className="text-sm text-gray-300">Force re-run Wave 1 (skip cache)</span>
              </label>
            </section>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-lg bg-red-900/30 border border-red-700 p-3 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-emerald-600 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Starting Analysis...' : 'Run AI Analysis'}
          </button>
        </form>
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
