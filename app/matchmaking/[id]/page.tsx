/**
 * /matchmaking/[id] — Saved match result view.
 *
 * Task 11.2 of .kiro/specs/marriage-matchmaking/tasks.md. Renders the
 * PERSISTED `result` JSON verbatim (GET /api/matchmaking/[id] never
 * recomputes — OD-5), so this page is a pure display of what the API
 * returns, not a live recomputation.
 */
'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

// ─── Types (mirrors engine/compute/types.ts's MatchResult) ──────────

interface KootaEvidence {
  rule: string
  bride: Record<string, string | number>
  groom: Record<string, string | number>
  notes?: string[]
}

interface Cancellation {
  rule: string
  name: string
  condition: string
}

interface KootaScore {
  key: string
  name: string
  points: number
  maxPoints: number
  status: 'scored' | 'unavailable'
  evidence: KootaEvidence
  cancellation?: Cancellation
}

interface BoundaryRisk {
  role: 'bride' | 'groom'
  moonLongitude?: number
  distanceToBoundaryDeg?: number
  atRisk: boolean
}

interface AshtakootaResult {
  gunaScore: number
  maxScore: number
  kootas: KootaScore[]
  verdict: string
  boundaryRisk: BoundaryRisk[]
  limitations: string[]
}

interface MangalDoshaNative {
  status: 'manglik' | 'not_manglik' | 'unavailable'
  triggeredFrom: Array<'lagna' | 'moon' | 'venus'>
  marsHouseFrom: Record<'lagna' | 'moon' | 'venus', number | null>
  cancellations: Cancellation[]
}

interface MatchResult {
  ashtakoota: AshtakootaResult
  mangalDosha: {
    bride: MangalDoshaNative
    groom: MangalDoshaNative
    compatibility: 'matched' | 'mismatched' | 'cancelled' | 'unavailable'
  }
  tablesVersion: string
}

interface MatchDetail {
  id: string
  label: string | null
  result: MatchResult
  tablesVersion: string
  createdAt: string
  brideChartName: string | null
  brideChartSource: 'compute' | 'paste' | null
  groomChartName: string | null
  groomChartSource: 'compute' | 'paste' | null
}

// ─── Page Component ─────────────────────────────────────────────────

export default function MatchDetailPage() {
  const params = useParams()
  const router = useRouter()
  const matchId = params.id as string

  const [match, setMatch] = useState<MatchDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    setLoadError(null)
    fetch(`/api/matchmaking/${matchId}`)
      .then(async (res) => {
        if (res.status === 404) {
          setLoadError('Match not found')
          return
        }
        if (!res.ok) {
          setLoadError('Failed to load match')
          return
        }
        setMatch(await res.json())
      })
      .catch(() => setLoadError('Network error'))
      .finally(() => setLoading(false))
  }, [matchId])

  async function handleDelete() {
    setDeleting(true)
    setDeleteError(null)
    try {
      const res = await fetch(`/api/matchmaking/${matchId}`, { method: 'DELETE' })
      if (res.ok) {
        router.push('/matchmaking')
        return
      }
      setDeleteError('Failed to delete match')
    } catch {
      setDeleteError('Network error')
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen p-8">
        <div className="max-w-4xl mx-auto">
          <p className="text-gray-500">Loading...</p>
        </div>
      </main>
    )
  }

  if (loadError || !match) {
    return (
      <main className="min-h-screen p-8">
        <div className="max-w-4xl mx-auto">
          <p className="text-red-400">{loadError ?? 'Match not found'}</p>
          <Link href="/matchmaking" className="text-indigo-400 hover:underline text-sm mt-2 inline-block">
            &larr; Back to Matchmaking
          </Link>
        </div>
      </main>
    )
  }

  const { ashtakoota, mangalDosha } = match.result
  const pasteSourceInvolved = match.brideChartSource === 'paste' || match.groomChartSource === 'paste'

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <Link href="/matchmaking" className="text-indigo-400 hover:underline text-sm mb-4 inline-block">
          &larr; Back to Matchmaking
        </Link>

        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-3xl font-bold">
            {match.brideChartName ?? 'Unknown'} &times; {match.groomChartName ?? 'Unknown'}
          </h1>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-400 hover:text-red-400 hover:border-red-700 transition-colors disabled:opacity-50"
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
        {deleteError && <p className="text-sm text-red-400 mb-2">{deleteError}</p>}
        <p className="text-sm text-gray-500 mb-1">Ashtakoota / North Indian Guna Milan</p>
        <div className="flex items-center gap-3 text-sm text-gray-400 mb-8">
          {match.label && <span>{match.label}</span>}
          <span>Computed {formatDate(match.createdAt)}</span>
          <span className="text-xs text-gray-600">tables {match.tablesVersion}</span>
        </div>

        {/* Guna Score */}
        <section className="rounded-lg border border-gray-700 bg-gray-800/50 p-5 mb-6">
          <div className="flex items-baseline justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">Compatibility Score — Total Kuta Score</p>
              <p className="text-4xl font-bold">
                {ashtakoota.gunaScore}
                {ashtakoota.verdict !== 'incomplete' && (
                  <span className="text-lg text-gray-500">/{ashtakoota.maxScore}</span>
                )}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {ashtakoota.verdict === 'incomplete'
                  ? `Partial sum — not out of ${ashtakoota.maxScore}. See limitations below for which kootas could not be scored.`
                  : 'Guidance band shown below is almanac/commercial-software convention, not a verdict of record.'}
              </p>
            </div>
            <VerdictBadge verdict={ashtakoota.verdict} large />
          </div>
        </section>

        {/* Koota Breakdown */}
        <section className="rounded-lg border border-gray-700 bg-gray-800/50 p-5 mb-6">
          <h2 className="text-lg font-medium mb-3">Koota Breakdown</h2>
          <div className="space-y-2">
            {ashtakoota.kootas.map((k) => (
              <KootaRow key={k.key} koota={k} />
            ))}
          </div>
        </section>

        {/* Mangal Dosha */}
        <section className="rounded-lg border border-gray-700 bg-gray-800/50 p-5 mb-6">
          <h2 className="text-lg font-medium mb-3">Mangal Dosha (Kuja Dosha)</h2>
          {mangalDosha.compatibility === 'mismatched' && (
            <div className="rounded-lg bg-red-900/30 border border-red-700 p-3 text-red-400 text-sm mb-4">
              Mangal Dosha compatibility is mismatched — only one native is Manglik (uncancelled). This
              stands regardless of the Guna Score band above.
            </div>
          )}
          {mangalDosha.compatibility === 'unavailable' && (
            <div className="rounded-lg bg-gray-900/50 border border-gray-700 p-3 text-gray-400 text-sm mb-4">
              Mangal Dosha could not be determined for at least one native — it requires a computed chart
              (Mars position, lagna, and aspect data), which a pasted-report chart does not carry.
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <MangalNativeCard title="Bride" native={mangalDosha.bride} />
            <MangalNativeCard title="Groom" native={mangalDosha.groom} />
          </div>
          <p className="text-sm text-gray-400 mt-4">
            Combined compatibility:{' '}
            <span className="font-medium text-gray-200">{mangalDosha.compatibility.replace('_', ' ')}</span>
          </p>
        </section>

        {/* Boundary risk — shown whenever atRisk is set, independent of chart source. */}
        {ashtakoota.boundaryRisk.some((b) => b.atRisk) && (
          <section className="rounded-lg border border-amber-700 bg-amber-900/20 p-5 mb-6 text-sm text-amber-400">
            <h2 className="text-sm font-medium mb-2">Boundary Risk</h2>
            {ashtakoota.boundaryRisk
              .filter((b) => b.atRisk)
              .map((b) => (
                <p key={b.role}>
                  {b.role === 'bride' ? 'Bride' : 'Groom'}&apos;s Moon is within{' '}
                  {b.distanceToBoundaryDeg?.toFixed(2)}° of a nakshatra boundary — a small ayanamsa or
                  birth-time error could shift which nakshatra/pada is used, changing several koota scores.
                </p>
              ))}
            {pasteSourceInvolved && (
              <p className="mt-2">
                At least one chart in this match came from a pasted report rather than being computed
                directly — its ayanamsa is approximate, which compounds the boundary risk above.
              </p>
            )}
          </section>
        )}

        {/* Paste-ayanamsa caution — shown whenever a paste-source chart is
            involved, independent of boundary risk (surfaced separately from
            the amber box above, which only fires when boundary risk itself
            is set). */}
        {pasteSourceInvolved && !ashtakoota.boundaryRisk.some((b) => b.atRisk) && (
          <section className="rounded-lg border border-gray-700 bg-gray-800/50 p-4 mb-6 text-sm text-gray-400">
            At least one chart in this match came from a pasted report rather than being computed directly
            — its ayanamsa is approximate and was not independently verified.
          </section>
        )}

        {/* Limitations */}
        <section className="rounded-lg border border-gray-700 bg-gray-800/50 p-5">
          <h2 className="text-lg font-medium mb-3">Limitations</h2>
          <ul className="space-y-2 text-sm text-gray-400 list-disc list-inside">
            {ashtakoota.limitations.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  )
}

// ─── Koota Row ──────────────────────────────────────────────────────

function KootaRow({ koota }: { koota: KootaScore }) {
  const evidenceLine = [
    ...Object.entries(koota.evidence.bride).map(([k, v]) => `bride ${k}: ${v}`),
    ...Object.entries(koota.evidence.groom).map(([k, v]) => `groom ${k}: ${v}`),
  ].join(' · ')

  return (
    <div className="rounded-lg border border-gray-700 p-3">
      <div className="flex items-center justify-between">
        <span className="font-medium text-gray-200">{koota.name}</span>
        <span className="text-gray-300">
          {koota.status === 'unavailable' ? 'unavailable' : `${koota.points} / ${koota.maxPoints}`}
        </span>
      </div>
      {evidenceLine && <p className="text-xs text-gray-500 mt-1">{evidenceLine}</p>}
      {koota.evidence.notes && koota.evidence.notes.length > 0 && (
        <p className="text-xs text-gray-500 mt-0.5">{koota.evidence.notes.join(' · ')}</p>
      )}
      {koota.cancellation && (
        <p className="text-xs text-emerald-400 mt-1">
          Cancelled: {koota.cancellation.name} — {koota.cancellation.condition}
        </p>
      )}
    </div>
  )
}

// ─── Mangal Native Card ─────────────────────────────────────────────

function MangalNativeCard({ title, native }: { title: string; native: MangalDoshaNative }) {
  const statusColor =
    native.status === 'manglik'
      ? 'text-red-400'
      : native.status === 'not_manglik'
        ? 'text-green-400'
        : 'text-gray-500'

  return (
    <div className="rounded-lg border border-gray-700 p-3">
      <p className="text-sm font-medium text-gray-300">{title}</p>
      <p className={`text-sm ${statusColor}`}>{native.status.replace('_', ' ')}</p>
      {native.status === 'unavailable' && (
        <p className="text-xs text-gray-500 mt-1">No computed chart data (Mars position/lagna) for this native.</p>
      )}
      {native.triggeredFrom.length > 0 && (
        <p className="text-xs text-gray-500 mt-1">Triggered from: {native.triggeredFrom.join(', ')}</p>
      )}
      {native.cancellations.length > 0 && (
        <div className="mt-1">
          {native.cancellations.map((c, i) => (
            <p key={i} className="text-xs text-emerald-400">
              Cancelled: {c.name} — {c.condition}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Badges ─────────────────────────────────────────────────────────

function VerdictBadge({ verdict, large }: { verdict: string; large?: boolean }) {
  const colors: Record<string, string> = {
    excellent: 'bg-green-900/50 text-green-400',
    good: 'bg-cyan-900/50 text-cyan-400',
    average: 'bg-amber-900/50 text-amber-400',
    below_average: 'bg-red-900/50 text-red-400',
    incomplete: 'bg-gray-700/50 text-gray-400',
  }
  return (
    <span
      className={`rounded font-medium ${colors[verdict] ?? colors.incomplete} ${
        large ? 'px-3 py-1.5 text-sm' : 'px-2 py-0.5 text-xs'
      }`}
    >
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
