/**
 * /charts/[id]/run — New Run page (Client Component)
 * Query type selector, free-text field, agent preview, run button.
 */

'use client'

import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'

const QUERY_TYPES = [
  { id: 'generic', label: 'Generic', description: 'Balanced overview covering wealth, health, career' },
  { id: 'health', label: 'Health', description: 'D30, H6/H8, disease significations' },
  { id: 'wealth', label: 'Wealth', description: 'H2/H11, Dhana yogas, accumulation periods' },
  { id: 'career', label: 'Career', description: 'D10, H10 yogas, career mode' },
  { id: 'property', label: 'Property', description: 'D4, H4, acquisition windows' },
  { id: 'marriage', label: 'Marriage', description: 'D9, H7, Venus/Jupiter karakas, timing' },
  { id: 'full', label: 'Full Analysis', description: 'All agents — comprehensive report' },
] as const

const DOMAIN_AGENTS: Record<string, string[]> = {
  health: ['2E', '3C'],
  wealth: ['2A', '2C', '3A', '3B'],
  career: ['2A', '2F', '3A', '3C'],
  property: ['2A', '2D', '3A'],
  marriage: ['2A', '2G', '3C'],
  generic: ['2A', '2B', '2C', '2E', '2F', '3A', '3C'],
  full: ['2A', '2B', '2C', '2D', '2E', '2F', '2G', '3A', '3B', '3C', '3D'],
}

export default function NewRunPage() {
  const router = useRouter()
  const params = useParams()
  const chartId = params.id as string

  const [selectedTypes, setSelectedTypes] = useState<string[]>([])
  const [userQuery, setUserQuery] = useState('')
  const [forceRerunWave1, setForceRerunWave1] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  // Compute which agents will run based on selection
  function getAgentPreview(): string[] {
    const agentSet = new Set<string>()
    const types = selectedTypes.length > 0 ? selectedTypes : ['generic']

    for (const type of types) {
      const agents = DOMAIN_AGENTS[type] ?? []
      agents.forEach((a) => agentSet.add(a))
    }

    // Always-run agents on first query
    const alwaysRun = ['1A', '1B', '1C', '1D', '2B', '4X', '4A', '4B', '4C']
    alwaysRun.forEach((a) => agentSet.add(a))

    return Array.from(agentSet).sort()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chartId,
          queryTypes: selectedTypes.length > 0 ? selectedTypes : ['generic'],
          userQuery: userQuery || undefined,
          forceRerunWave1,
        }),
      })

      const data = await res.json()

      if (res.status === 202) {
        router.push(`/runs/${data.runId}`)
      } else {
        setError(data.error || 'Failed to start run')
      }
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  const agentPreview = getAgentPreview()

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">New Analysis Run</h1>

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

          {/* Options */}
          <section>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={forceRerunWave1}
                onChange={(e) => setForceRerunWave1(e.target.checked)}
                className="rounded border-gray-600 bg-gray-800 text-indigo-500 focus:ring-indigo-500"
              />
              <span className="text-sm text-gray-300">Force re-run Wave 1 (foundation layer)</span>
            </label>
          </section>

          {/* Agent Preview */}
          <section>
            <h2 className="text-lg font-medium mb-3">Agents to Execute</h2>
            <div className="flex flex-wrap gap-2">
              {agentPreview.map((agent) => (
                <span
                  key={agent}
                  className="px-2 py-1 rounded bg-gray-800 border border-gray-700 text-xs font-mono text-gray-300"
                >
                  {agent}
                </span>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-2">{agentPreview.length} agents total</p>
          </section>

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
            className="w-full rounded-lg bg-indigo-600 px-6 py-3 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Starting...' : 'Start Analysis'}
          </button>
        </form>
      </div>
    </main>
  )
}
