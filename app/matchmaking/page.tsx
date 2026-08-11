/**
 * /matchmaking — Ashtakoota (Guna Milan) + Mangal Dosha picker + saved-match list.
 *
 * Task 11.1 / 11.3 of .kiro/specs/marriage-matchmaking/tasks.md. Bride/groom
 * role is assigned structurally by which selector a chart is placed in
 * (POST /api/matchmaking's `brideChartId`/`groomChartId` field names ARE the
 * role — see app/api/matchmaking/_shared.ts) — there is no separate role
 * dropdown, and nothing here ever auto-selects a chart into a slot based on
 * its saved gender. `UnifiedChart.gender` only "pre-fills the UI picker" in
 * the sense of labeling each option so the practitioner can place it
 * correctly, and flagging a non-blocking warning on an apparent mismatch —
 * never by inferring or silently swapping the role (design.md OD-6 / tasks.md
 * task 11.1).
 */
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { TOTAL_KOOTA_MAXIMA } from '@/engine/compute/matchmakingTables'

// ─── Types ──────────────────────────────────────────────────────────

interface ChartOption {
  id: string
  name: string
  source: 'compute' | 'paste'
  lagna: string
  gender: string | null
}

interface MatchSummary {
  id: string
  label: string | null
  gunaScore: number
  verdict: string | null
  brideChartName: string | null
  groomChartName: string | null
  createdAt: string
}

// ─── Page Component ─────────────────────────────────────────────────

export default function MatchmakingPage() {
  const router = useRouter()
  const [charts, setCharts] = useState<ChartOption[]>([])
  const [matches, setMatches] = useState<MatchSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const loadAll = useCallback(async () => {
    setLoadError(null)
    try {
      const [chartsRes, matchesRes] = await Promise.all([
        fetch('/api/unified-charts'),
        fetch('/api/matchmaking'),
      ])
      if (chartsRes.ok) setCharts(await chartsRes.json())
      if (matchesRes.ok) setMatches(await matchesRes.json())
      if (!chartsRes.ok || !matchesRes.ok) setLoadError('Failed to load charts or matches.')
    } catch {
      setLoadError('Network error while loading charts and matches.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Marriage Matchmaking</h1>
        <p className="text-sm text-gray-400 mb-8">
          Ashtakoota (Guna Milan) + Mangal Dosha (Kuja Dosha) compatibility between two saved charts.
        </p>

        <NewMatchForm
          charts={charts}
          onCreated={(id) => router.push(`/matchmaking/${id}`)}
        />

        <h2 className="text-xl font-semibold mt-10 mb-4">Saved Matches</h2>

        {loadError && (
          <div className="rounded-lg bg-red-900/30 border border-red-700 p-3 text-red-400 text-sm mb-4">
            {loadError}
          </div>
        )}

        {loading ? (
          <p className="text-gray-500">Loading...</p>
        ) : matches.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p>No matches yet. Use the form above to compute one.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {matches.map((m) => (
              <MatchCard key={m.id} match={m} onDeleted={loadAll} />
            ))}
          </div>
        )}
      </div>
    </main>
  )
}

// ─── New Match Form ─────────────────────────────────────────────────

function NewMatchForm({
  charts,
  onCreated,
}: {
  charts: ChartOption[]
  onCreated: (id: string) => void
}) {
  const [brideChartId, setBrideChartId] = useState('')
  const [groomChartId, setGroomChartId] = useState('')
  const [label, setLabel] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const brideChart = useMemo(() => charts.find((c) => c.id === brideChartId) ?? null, [charts, brideChartId])
  const groomChart = useMemo(() => charts.find((c) => c.id === groomChartId) ?? null, [charts, groomChartId])

  const sameChartWarning = brideChartId && groomChartId && brideChartId === groomChartId
  const brideGenderWarning = brideChart?.gender === 'male'
  const groomGenderWarning = groomChart?.gender === 'female'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!brideChartId || !groomChartId) {
      setError('Select a chart for both bride and groom.')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/matchmaking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brideChartId,
          groomChartId,
          label: label.trim() || undefined,
        }),
      })
      const data = await res.json()

      if (res.status === 201) {
        onCreated(data.id)
      } else if (res.status === 404) {
        setError('One of the selected charts could not be found.')
      } else {
        const details = data.details
          ? Object.entries(data.details).map(([k, v]) => `${k}: ${v}`).join(', ')
          : ''
        setError(`${data.error || 'Failed to compute match'}${details ? ` — ${details}` : ''}`)
      }
    } catch {
      setError('Network error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-gray-700 bg-gray-800/50 p-6 space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-gray-400 mb-1">Bride&apos;s Chart</label>
          <select
            value={brideChartId}
            onChange={(e) => setBrideChartId(e.target.value)}
            required
            className="w-full rounded-lg bg-gray-900 border border-gray-700 px-3 py-2 text-sm text-gray-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
          >
            <option value="">Select a chart…</option>
            {charts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.gender ? ` (${c.gender})` : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">Groom&apos;s Chart</label>
          <select
            value={groomChartId}
            onChange={(e) => setGroomChartId(e.target.value)}
            required
            className="w-full rounded-lg bg-gray-900 border border-gray-700 px-3 py-2 text-sm text-gray-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
          >
            <option value="">Select a chart…</option>
            {charts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.gender ? ` (${c.gender})` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm text-gray-400 mb-1">Label (optional)</label>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={200}
          className="w-full rounded-lg bg-gray-900 border border-gray-700 px-3 py-2 text-sm text-gray-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
          placeholder="e.g., Priya x Rohan — 1st proposal"
        />
      </div>

      {sameChartWarning && (
        <div className="rounded-lg bg-amber-900/30 border border-amber-700 p-3 text-amber-400 text-sm">
          Both selectors reference the same chart. This is allowed, but almost certainly not intended.
        </div>
      )}
      {(brideGenderWarning || groomGenderWarning) && (
        <div className="rounded-lg bg-amber-900/30 border border-amber-700 p-3 text-amber-400 text-sm">
          {brideGenderWarning && (
            <p>
              The chart selected as bride has a saved gender of &ldquo;male&rdquo;. Several kootas (Varna,
              Vashya, Gana) are directional — double-check bride/groom placement before submitting.
            </p>
          )}
          {groomGenderWarning && (
            <p>
              The chart selected as groom has a saved gender of &ldquo;female&rdquo;. Several kootas (Varna,
              Vashya, Gana) are directional — double-check bride/groom placement before submitting.
            </p>
          )}
        </div>
      )}
      {error && (
        <div className="rounded-lg bg-red-900/30 border border-red-700 p-3 text-red-400 text-sm">{error}</div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {submitting ? 'Computing...' : 'Compute Match'}
      </button>
    </form>
  )
}

// ─── Match Card ─────────────────────────────────────────────────────

function MatchCard({ match, onDeleted }: { match: MatchSummary; onDeleted: () => void }) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation()
    setDeleting(true)
    setDeleteError(null)
    try {
      const res = await fetch(`/api/matchmaking/${match.id}`, { method: 'DELETE' })
      if (res.ok) {
        onDeleted()
      } else {
        setDeleteError('Failed to delete')
      }
    } catch {
      setDeleteError('Network error')
    } finally {
      setDeleting(false)
    }
  }

  return (
    // A plain div (not <Link>) with a Delete <button> inside — an
    // interactive button nested inside an <a> is invalid HTML.
    <div
      role="link"
      tabIndex={0}
      onClick={() => router.push(`/matchmaking/${match.id}`)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') router.push(`/matchmaking/${match.id}`)
      }}
      className="flex items-center justify-between rounded-lg border border-gray-700 bg-gray-800/50 p-4 hover:border-gray-600 transition-all cursor-pointer"
    >
      <div className="flex-1 min-w-0">
        <p className="text-lg font-medium">
          {match.brideChartName ?? 'Unknown'} &times; {match.groomChartName ?? 'Unknown'}
        </p>
        <div className="flex items-center gap-4 mt-1 text-sm text-gray-400">
          {match.label && <span>{match.label}</span>}
          <span>{match.verdict === 'incomplete' ? `${match.gunaScore} (partial)` : `${match.gunaScore}/${TOTAL_KOOTA_MAXIMA}`}</span>
          {match.verdict && <VerdictBadge verdict={match.verdict} />}
          <span>{formatDate(match.createdAt)}</span>
          {deleteError && <span className="text-red-400">{deleteError}</span>}
        </div>
      </div>
      <button
        onClick={handleDelete}
        disabled={deleting}
        title="Delete match"
        className="rounded px-2 py-1 text-xs font-medium text-gray-500 hover:text-red-400 transition-colors disabled:opacity-50"
      >
        {deleting ? 'Deleting…' : 'Delete'}
      </button>
    </div>
  )
}

function VerdictBadge({ verdict }: { verdict: string }) {
  const colors: Record<string, string> = {
    excellent: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400',
    good: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-400',
    average: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400',
    below_average: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400',
    incomplete: 'bg-gray-200 text-gray-700 dark:bg-gray-700/50 dark:text-gray-400',
  }
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[verdict] ?? colors.incomplete}`}>
      {verdict.replace('_', ' ')}
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
