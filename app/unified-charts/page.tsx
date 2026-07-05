/**
 * /unified-charts — Unified chart list + dual-path ingestion UI.
 *
 * Two tabs:
 *   "Compute" — birth data form (Path A)
 *   "Paste"   — ChartInputV1 JSON textarea (Path B)
 *
 * Below the ingestion UI: chart list with "Run AI Analysis" button.
 */

'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

// ─── Types ──────────────────────────────────────────────────────────

interface UnifiedChartSummary {
  id: string
  name: string
  source: 'compute' | 'paste'
  lagna: string
  birthDatetime: string
  sunriseMode: string
  runCount: number
  lastRun: { id: string; status: string; createdAt: string } | null
  createdAt: string
  updatedAt: string
}

type Tab = 'compute' | 'paste'

// ─── Page Component ─────────────────────────────────────────────────

export default function UnifiedChartsPage() {
  const router = useRouter()
  const [charts, setCharts] = useState<UnifiedChartSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('compute')

  const loadCharts = useCallback(async () => {
    try {
      const res = await fetch('/api/unified-charts')
      if (res.ok) {
        setCharts(await res.json())
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadCharts()
  }, [loadCharts])

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Unified Charts</h1>

        {/* ─── Ingestion Tabs ───────────────────────────────────── */}
        <div className="rounded-lg border border-gray-700 bg-gray-800/50 mb-8">
          <div className="flex border-b border-gray-700">
            <button
              onClick={() => setActiveTab('compute')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === 'compute'
                  ? 'text-indigo-400 border-b-2 border-indigo-400 bg-gray-800'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Compute from Birth Data
            </button>
            <button
              onClick={() => setActiveTab('paste')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === 'paste'
                  ? 'text-indigo-400 border-b-2 border-indigo-400 bg-gray-800'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Paste ChartInputV1 JSON
            </button>
          </div>

          <div className="p-6">
            {activeTab === 'compute' ? (
              <ComputeForm onSuccess={loadCharts} />
            ) : (
              <PasteForm onSuccess={loadCharts} />
            )}
          </div>
        </div>

        {/* ─── Chart List ──────────────────────────────────────── */}
        <h2 className="text-xl font-semibold mb-4">Saved Charts</h2>

        {loading ? (
          <p className="text-gray-500">Loading...</p>
        ) : charts.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p>No charts yet. Use the form above to create one.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {charts.map((chart) => (
              <ChartCard
                key={chart.id}
                chart={chart}
                onAnalyze={() => router.push(`/unified-charts/${chart.id}/analyze`)}
                onView={() => router.push(`/unified-charts/${chart.id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  )
}

// ─── Compute Form (Path A) ──────────────────────────────────────────

function ComputeForm({ onSuccess }: { onSuccess: () => void }) {
  const [form, setForm] = useState({
    name: '',
    date: '',
    time: '',
    timezone: '5.5',
    latitude: '',
    longitude: '',
    sunriseMode: 'precise' as 'precise' | 'jhora',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setSubmitting(true)

    try {
      const res = await fetch('/api/unified-charts/from-compute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          date: form.date,
          time: form.time,
          timezone: parseFloat(form.timezone),
          latitude: parseFloat(form.latitude),
          longitude: parseFloat(form.longitude),
          sunriseMode: form.sunriseMode,
        }),
      })

      const data = await res.json()

      if (res.status === 201) {
        setSuccess(`Chart "${data.name}" created (${data.lagna} Lagna)`)
        setForm({ name: '', date: '', time: '', timezone: '5.5', latitude: '', longitude: '', sunriseMode: 'precise' })
        onSuccess()
      } else if (res.status === 409) {
        setError(`Duplicate: ${data.message}`)
      } else {
        setError(data.error || 'Failed to compute chart')
      }
    } catch {
      setError('Network error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-sm text-gray-400 mb-1">Name</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
            className="w-full rounded-lg bg-gray-900 border border-gray-700 px-3 py-2 text-sm text-gray-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
            placeholder="e.g., Ravi Kumar"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">Birth Date</label>
          <input
            type="date"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            required
            className="w-full rounded-lg bg-gray-900 border border-gray-700 px-3 py-2 text-sm text-gray-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">Birth Time (24h)</label>
          <input
            type="time"
            step="1"
            value={form.time}
            onChange={(e) => setForm({ ...form, time: e.target.value })}
            required
            className="w-full rounded-lg bg-gray-900 border border-gray-700 px-3 py-2 text-sm text-gray-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">Timezone (hours)</label>
          <input
            type="number"
            step="0.5"
            value={form.timezone}
            onChange={(e) => setForm({ ...form, timezone: e.target.value })}
            required
            className="w-full rounded-lg bg-gray-900 border border-gray-700 px-3 py-2 text-sm text-gray-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
            placeholder="5.5"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">Sunrise Mode</label>
          <select
            value={form.sunriseMode}
            onChange={(e) => setForm({ ...form, sunriseMode: e.target.value as 'precise' | 'jhora' })}
            className="w-full rounded-lg bg-gray-900 border border-gray-700 px-3 py-2 text-sm text-gray-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
          >
            <option value="precise">Precise (astronomical)</option>
            <option value="jhora">JHora (6 AM convention)</option>
          </select>
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">Latitude</label>
          <input
            type="number"
            step="0.0001"
            value={form.latitude}
            onChange={(e) => setForm({ ...form, latitude: e.target.value })}
            required
            className="w-full rounded-lg bg-gray-900 border border-gray-700 px-3 py-2 text-sm text-gray-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
            placeholder="28.6139"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">Longitude</label>
          <input
            type="number"
            step="0.0001"
            value={form.longitude}
            onChange={(e) => setForm({ ...form, longitude: e.target.value })}
            required
            className="w-full rounded-lg bg-gray-900 border border-gray-700 px-3 py-2 text-sm text-gray-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
            placeholder="77.2090"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-900/30 border border-red-700 p-3 text-red-400 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg bg-green-900/30 border border-green-700 p-3 text-green-400 text-sm">
          {success}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {submitting ? 'Computing...' : 'Compute & Save Chart'}
      </button>
    </form>
  )
}

// ─── Paste Form (Path B) ────────────────────────────────────────────

function PasteForm({ onSuccess }: { onSuccess: () => void }) {
  const [json, setJson] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    // Validate JSON locally first
    let parsed: unknown
    try {
      parsed = JSON.parse(json)
    } catch {
      setError('Invalid JSON — check for syntax errors')
      return
    }

    setSubmitting(true)

    try {
      const res = await fetch('/api/unified-charts/from-paste', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      })

      const data = await res.json()

      if (res.status === 201) {
        setSuccess(`Chart "${data.name}" saved (${data.lagna} Lagna)`)
        setJson('')
        onSuccess()
      } else if (res.status === 409) {
        setError(`Duplicate: ${data.message}`)
      } else {
        const details = data.fieldErrors
          ? Object.entries(data.fieldErrors).map(([k, v]) => `${k}: ${v}`).join(', ')
          : ''
        setError(`${data.error}${details ? ` — ${details}` : ''}`)
      }
    } catch {
      setError('Network error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm text-gray-400 mb-1">
          ChartInputV1 JSON
        </label>
        <textarea
          value={json}
          onChange={(e) => setJson(e.target.value)}
          rows={10}
          required
          className="w-full rounded-lg bg-gray-900 border border-gray-700 px-3 py-2 text-sm text-gray-200 font-mono focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none resize-y"
          placeholder='{"meta": {"client_name": "...", "birth_datetime": "...", ...}, "natal_nakshatras": [...], ...}'
        />
        <p className="text-xs text-gray-500 mt-1">
          Paste the complete ChartInputV1 JSON. Full Wave 1–4 pipeline will run on analysis.
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-900/30 border border-red-700 p-3 text-red-400 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg bg-green-900/30 border border-green-700 p-3 text-green-400 text-sm">
          {success}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {submitting ? 'Validating...' : 'Save Chart (Paste)'}
      </button>
    </form>
  )
}

// ─── Chart Card ─────────────────────────────────────────────────────

function ChartCard({
  chart,
  onAnalyze,
  onView,
}: {
  chart: UnifiedChartSummary
  onAnalyze: () => void
  onView: () => void
}) {
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-4 hover:border-gray-600 transition-all">
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <button
            onClick={onView}
            className="text-lg font-medium hover:text-indigo-400 transition-colors text-left"
          >
            {chart.name}
          </button>
          <div className="flex items-center gap-4 mt-1 text-sm text-gray-400">
            <span className="flex items-center gap-1">
              <SourceBadge source={chart.source} />
            </span>
            <span>Lagna: {chart.lagna}</span>
            <span>{chart.runCount} run{chart.runCount !== 1 ? 's' : ''}</span>
            {chart.lastRun && (
              <span className="flex items-center gap-1">
                <StatusBadge status={chart.lastRun.status} />
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 ml-4">
          <button
            onClick={onAnalyze}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 transition-colors whitespace-nowrap"
          >
            Run AI Analysis
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Badges ─────────────────────────────────────────────────────────

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
