/**
 * /duration-analysis/[id] — Duration Analysis results page (Client Component)
 * Streams agent progress via SSE and progressively renders sections as data arrives.
 */

'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import type {
  DurationCategory,
  DurationStatus,
  DurationAgentId,
  DA1Output,
  DA2Output,
  DA3Output,
  PeriodAnalysis,
  PeriodForecast,
} from '@/lib/durationTypes'

// ─── Local types ─────────────────────────────────────────────────────

interface AnalysisRecord {
  id: string
  unifiedChartId: string
  chartName: string
  dateFrom: string
  dateTo: string
  category: DurationCategory
  userQuestion?: string
  symptoms?: string
  status: DurationStatus
  overrideApplied: boolean
  periodSlice: unknown[] | null
  da1Output: DA1Output | null
  da2Output: DA2Output | null
  da3Output: DA3Output | null
  totalTokenIn: number
  totalTokenOut: number
  totalCostUsd: number
  messages: ChatMessage[]
  createdAt: string
  updatedAt: string
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  agentId?: string
  focusPeriod?: string
  createdAt: string
}

type AgentProgressStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped'

interface AgentProgress {
  id: DurationAgentId
  status: AgentProgressStatus
}

// ─── Helper components ────────────────────────────────────────────────

function CategoryBadge({ category }: { category: DurationCategory }) {
  const styles: Record<DurationCategory, string> = {
    health:   'bg-red-900/50 text-red-300',
    career:   'bg-blue-900/50 text-blue-300',
    wealth:   'bg-yellow-900/50 text-yellow-300',
    cashflow: 'bg-teal-900/50 text-teal-300',
    marriage: 'bg-pink-900/50 text-pink-300',
    property: 'bg-green-900/50 text-green-300',
    // Not reachable from this page today (family is excluded from
    // /api/duration-analysis's category enum — see registry.ts) but the
    // Record must stay exhaustive over the shared DurationCategory type.
    family:   'bg-cyan-900/50 text-cyan-300',
  }
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${styles[category]}`}>
      {category}
    </span>
  )
}

function StatusBadge({ status }: { status: DurationStatus | string }) {
  const styles: Record<string, string> = {
    queued:             'bg-gray-700/50 text-gray-400',
    running:            'bg-indigo-900/50 text-indigo-300',
    symptom_unmatched:  'bg-amber-900/50 text-amber-300',
    done:               'bg-green-900/50 text-green-400',
    failed:             'bg-red-900/50 text-red-400',
    cancelled:          'bg-gray-700/50 text-gray-300',
  }
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${styles[status] ?? styles.queued}`}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}

function AgentDot({ status, id }: { status: AgentProgressStatus; id: DurationAgentId }) {
  if (status === 'skipped') {
    return (
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-gray-600 border border-gray-500" />
        <span className="font-mono text-sm text-gray-400">{id}</span>
        <span className="text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-400">Skipped (no symptoms)</span>
      </div>
    )
  }
  const dot =
    status === 'running' ? <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" /> :
    status === 'done'    ? <span className="w-2 h-2 rounded-full bg-green-400" /> :
    status === 'failed'  ? <span className="w-2 h-2 rounded-full bg-red-400" /> :
                           <span className="w-2 h-2 rounded-full border border-gray-500" />
  const label =
    status === 'running' ? 'text-indigo-300' :
    status === 'done'    ? 'text-green-300' :
    status === 'failed'  ? 'text-red-300' :
                           'text-gray-500'
  return (
    <div className="flex items-center gap-2">
      {dot}
      <span className={`font-mono text-sm ${label}`}>{id}</span>
    </div>
  )
}

function IntensityBadge({ intensity }: { intensity: 'high' | 'medium' | 'low' }) {
  const styles = {
    high:   'bg-red-900/60 text-red-300',
    medium: 'bg-amber-900/60 text-amber-300',
    low:    'bg-gray-700/60 text-gray-400',
  }
  return (
    <span className={`px-1.5 py-0.5 rounded text-xs font-medium capitalize ${styles[intensity]}`}>
      {intensity}
    </span>
  )
}

function TransitCell({ bavScore }: { bavScore: number }) {
  if (bavScore === -1) {
    const base = 'text-gray-500'
    return <span className={base}>♄ —</span>
  }
  const color = bavScore <= 3 ? 'text-red-400' : 'text-green-400'
  return <span className={color}>♄ ({bavScore}/8)</span>
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

// ─── Period table row ─────────────────────────────────────────────────

function PeriodRow({ period }: { period: PeriodAnalysis }) {
  const [expanded, setExpanded] = useState(false)
  const bavScore = period.transitContext?.saturnBavScore ?? -1

  // Transit house display
  const saturnHouse = period.transitContext?.saturn?.houseFromLagna
  const transitLabel =
    bavScore === -1
      ? '—'
      : saturnHouse != null
        ? `♄ H${saturnHouse} (${bavScore}/8)`
        : `♄ (${bavScore}/8)`

  const transitColor =
    bavScore === -1 ? 'text-gray-500' :
    bavScore <= 3   ? 'text-red-400'  :
                      'text-green-400'

  return (
    <>
      <tr
        className="border-t border-gray-800 hover:bg-gray-800/40 cursor-pointer"
        onClick={() => setExpanded((p) => !p)}
      >
        <td className="px-3 py-2 text-sm font-mono text-gray-300">{period.md.lord}</td>
        <td className="px-3 py-2 text-sm font-mono text-gray-300">{period.ad.lord}</td>
        <td className="px-3 py-2 text-sm font-mono text-gray-300">{period.pd.lord}</td>
        <td className="px-3 py-2 text-xs text-gray-400">{formatDate(period.pd.start)}</td>
        <td className="px-3 py-2 text-xs text-gray-400">{formatDate(period.pd.end)}</td>
        <td className="px-3 py-2"><IntensityBadge intensity={period.intensity} /></td>
        <td className="px-3 py-2 text-center">
          {period.favorable
            ? <span className="text-green-400 font-bold">✓</span>
            : <span className="text-red-400 font-bold">✗</span>}
        </td>
        <td className={`px-3 py-2 text-xs ${transitColor}`}>{transitLabel}</td>
        <td className="px-3 py-2 text-xs text-gray-400 max-w-xs">
          <span className="line-clamp-2">{period.analysis}</span>
          <span className="text-gray-600 ml-1">{expanded ? '▲' : '▾'}</span>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-gray-900/60 border-t border-gray-800">
          <td colSpan={9} className="px-4 py-4">
            <div className="space-y-3 text-sm text-gray-300">
              <p className="leading-relaxed">{period.analysis}</p>
              {period.bahiranga && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Bahiranga (External)</p>
                  <p className="text-gray-300 leading-relaxed">{period.bahiranga}</p>
                </div>
              )}
              {period.antaranga && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Antaranga (Internal)</p>
                  <p className="text-gray-300 leading-relaxed">{period.antaranga}</p>
                </div>
              )}
              {period.activated_yogas && period.activated_yogas.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Activated Yogas</p>
                  <ul className="list-disc list-inside space-y-0.5 text-gray-400">
                    {period.activated_yogas.map((y, i) => <li key={i}>{y}</li>)}
                  </ul>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ─── DA-3 Forecast accordion card ────────────────────────────────────

function ForecastCard({ forecast }: { forecast: PeriodForecast }) {
  const [open, setOpen] = useState(false)
  const [openSection, setOpenSection] = useState<string | null>(null)

  const toggle = (key: string) =>
    setOpenSection((prev) => (prev === key ? null : key))

  const Section = ({ label, content }: { label: string; content: string | string[] }) => (
    <div className="border-t border-gray-700 mt-2 pt-2">
      <button
        onClick={() => toggle(label)}
        className="flex items-center justify-between w-full text-left text-xs font-semibold text-gray-400 hover:text-gray-200"
      >
        {label}
        <span>{openSection === label ? '▲' : '▾'}</span>
      </button>
      {openSection === label && (
        <div className="mt-2 text-sm text-gray-300 leading-relaxed">
          {Array.isArray(content) ? (
            <ul className="list-disc list-inside space-y-1">
              {content.map((item, i) => <li key={i}>{item}</li>)}
            </ul>
          ) : (
            <p>{content}</p>
          )}
        </div>
      )}
    </div>
  )

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800/40">
      <button
        onClick={() => setOpen((p) => !p)}
        className="flex items-center justify-between w-full px-4 py-3 text-left"
      >
        <span className="font-medium text-gray-200 text-sm">{forecast.period_label}</span>
        <span className="text-gray-500 text-xs">{open ? '▲' : '▾'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4">
          <p className="text-sm text-gray-300 leading-relaxed mb-2">{forecast.forecast}</p>
          {forecast.bahiranga && <Section label="External (Bahiranga)" content={forecast.bahiranga} />}
          {forecast.antaranga && <Section label="Internal (Antaranga)" content={forecast.antaranga} />}
          {forecast.why && <Section label="Why" content={forecast.why} />}
          {forecast.transit_why && <Section label="Transit Why" content={forecast.transit_why} />}
          {forecast.recommendations?.length > 0 && (
            <Section label="Recommendations" content={forecast.recommendations} />
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────

export default function DurationAnalysisPage() {
  const params = useParams()
  const analysisId = params.id as string

  const [record, setRecord] = useState<AnalysisRecord | null>(null)
  const [agents, setAgents] = useState<AgentProgress[]>([
    { id: 'DA-1', status: 'pending' },
    { id: 'DA-2', status: 'pending' },
    { id: 'DA-3', status: 'pending' },
  ])
  const [symptomGateData, setSymptomGateData] = useState<DA2Output | null>(null)
  const [chatInput, setChatInput] = useState('')
  const [focusPeriod, setFocusPeriod] = useState('')
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([])
  const [chatLoading, setChatLoading] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // ── Initial fetch ─────────────────────────────────────────────────
  useEffect(() => {
    fetch(`/api/duration-analysis/${analysisId}`)
      .then((r) => r.json())
      .then((data: AnalysisRecord) => {
        setRecord(data)
        setChatHistory(data.messages ?? [])

        // Hydrate agent progress from fetched state
        setAgents((prev) => prev.map((a) => {
          if (a.id === 'DA-1') {
            if (data.da1Output) return { ...a, status: 'done' }
          }
          if (a.id === 'DA-2') {
            if (!data.symptoms) return { ...a, status: 'skipped' }
            if (data.da2Output) return { ...a, status: 'done' }
            if (data.status === 'symptom_unmatched') return { ...a, status: 'done' }
          }
          if (a.id === 'DA-3') {
            if (data.da3Output) return { ...a, status: 'done' }
          }
          if (data.status === 'failed') return { ...a, status: 'failed' }
          return a
        }))

        // Restore symptom gate if status is unmatched
        if (data.status === 'symptom_unmatched' && data.da2Output) {
          setSymptomGateData(data.da2Output as DA2Output)
        }
      })
  }, [analysisId])

  // ── SSE connection ────────────────────────────────────────────────
  useEffect(() => {
    if (!record) return
    const terminal = ['done', 'failed', 'symptom_unmatched', 'cancelled']
    if (terminal.includes(record.status)) return

    const es = new EventSource(`/api/duration-analysis/${analysisId}/events`)

    const refetchFull = () =>
      fetch(`/api/duration-analysis/${analysisId}`)
        .then((r) => r.json())
        .then((data: AnalysisRecord) => {
          setRecord(data)
          setChatHistory(data.messages ?? [])
        })

    es.addEventListener('connected', () => {
      // noop — initial state already loaded
    })

    es.addEventListener('agent_complete', (e) => {
      const data = JSON.parse((e as MessageEvent).data)
      const agentId = data.agent_id as DurationAgentId
      setAgents((prev) =>
        prev.map((a) => (a.id === agentId ? { ...a, status: 'done' } : a))
      )
    })

    es.addEventListener('agent_error', () => {
      setAgents((prev) => prev.map((a) =>
        a.status === 'running' ? { ...a, status: 'failed' } : a
      ))
    })

    es.addEventListener('symptom_gate', (e) => {
      const data = JSON.parse((e as MessageEvent).data)
      setSymptomGateData(data.da2Output as DA2Output)
      setRecord((prev) =>
        prev ? { ...prev, status: 'symptom_unmatched' } : prev
      )
      es.close()
    })

    es.addEventListener('run_cancelled', () => {
      setRecord((prev) => (prev ? { ...prev, status: 'cancelled' } : prev))
      setAgents((prev) => prev.map((a) =>
        a.status === 'running' || a.status === 'pending' ? { ...a, status: 'skipped' } : a
      ))
      es.close()
    })

    es.addEventListener('run_complete', () => {
      refetchFull().then(() => {
        setAgents((prev) => prev.map((a) =>
          a.status !== 'skipped' ? { ...a, status: 'done' } : a
        ))
      })
      es.close()
    })

    es.onerror = () => es.close()

    return () => es.close()
  }, [analysisId, record?.status])

  // Mark running agent based on pending/done transitions
  useEffect(() => {
    if (!record) return
    if (record.status !== 'running') return
    setAgents((prev) => prev.map((a) => {
      if (a.status !== 'pending') return a
      // DA-1 running if no output yet and status is running
      if (a.id === 'DA-1' && !record.da1Output) return { ...a, status: 'running' }
      // DA-2 running if DA-1 done and no DA-2 output and symptoms exist
      if (a.id === 'DA-2' && record.da1Output && !record.da2Output && record.symptoms)
        return { ...a, status: 'running' }
      // DA-3 running if DA-1 done (and DA-2 done/skipped) and no DA-3 output
      if (a.id === 'DA-3' && record.da1Output && !record.da3Output) {
        const da2Ok = !record.symptoms || record.da2Output
        if (da2Ok) return { ...a, status: 'running' }
      }
      return a
    }))
  }, [record])

  // Scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatHistory])

  // ── Chat send ─────────────────────────────────────────────────────
  const sendChat = async () => {
    if (!chatInput.trim() || chatLoading) return
    const msg = chatInput.trim()
    setChatInput('')
    setChatLoading(true)

    const optimistic: ChatMessage = {
      id: `tmp-${Date.now()}`,
      role: 'user',
      content: msg,
      createdAt: new Date().toISOString(),
    }
    setChatHistory((prev) => [...prev, optimistic])

    try {
      const res = await fetch(`/api/duration-analysis/${analysisId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, focusPeriod: focusPeriod || undefined }),
      })
      const json = await res.json()
      const assistant: ChatMessage = {
        id: json.messageId ?? `tmp-a-${Date.now()}`,
        role: 'assistant',
        content: json.response,
        agentId: 'DA-3',
        createdAt: new Date().toISOString(),
      }
      setChatHistory((prev) => [...prev, assistant])
    } catch {
      // silent — optimistic message stays
    } finally {
      setChatLoading(false)
    }
  }

  // ── Override handler ──────────────────────────────────────────────
  const handleOverride = async () => {
    await fetch(`/api/duration-analysis/${analysisId}/override`, { method: 'POST' })
    setSymptomGateData(null)
    setRecord((prev) => prev ? { ...prev, status: 'running' } : prev)
  }

  const handleAcceptStop = async () => {
    // Persist the cancellation — otherwise the record stays symptom_unmatched forever.
    await fetch(`/api/duration-analysis/${analysisId}/cancel`, { method: 'POST' }).catch(() => {})
    setSymptomGateData(null)
    setRecord((prev) => (prev ? { ...prev, status: 'cancelled' } : prev))
  }

  // ─── Loading ──────────────────────────────────────────────────────
  if (!record) {
    return (
      <main className="min-h-screen p-8 flex items-center justify-center">
        <p className="text-gray-400">Loading analysis…</p>
      </main>
    )
  }

  const da1 = record.da1Output as DA1Output | null
  const da2 = record.da2Output as DA2Output | null
  const da3 = record.da3Output as DA3Output | null

  // Build focus period options from DA-1 AD periods
  const adPeriodOptions = da1
    ? [...new Set((da1.period_analysis ?? []).map((p) => `${p.md.lord} MD / ${p.ad.lord} AD`))]
    : []

  // Truncation note: the slicer caps at 200 periods
  const isTruncated = Array.isArray(record.periodSlice) && record.periodSlice.length === 200

  return (
    <main className="min-h-screen p-6">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* ── Medical Disclaimer (health only) ──────────────────── */}
        {record.category === 'health' && (
          <div className="rounded-lg border border-amber-800/60 bg-amber-900/20 px-4 py-3 flex items-start gap-3">
            <span className="text-amber-400 mt-0.5 flex-shrink-0">⚕</span>
            <p className="text-sm text-amber-200">
              This analysis provides astrological perspectives only. It is not medical advice.
              Always consult qualified healthcare professionals for health concerns.
            </p>
          </div>
        )}

        {/* ── Header ────────────────────────────────────────────── */}
        <div className="flex items-start justify-between">
          <div>
            <Link
              href={`/unified-charts/${record.unifiedChartId}`}
              className="text-sm text-gray-500 hover:text-gray-300 block mb-2"
            >
              ← Back to Chart
            </Link>
            <h1 className="text-2xl font-bold text-ink">{record.chartName}</h1>
            <div className="flex items-center flex-wrap gap-2 mt-2">
              <CategoryBadge category={record.category} />
              <StatusBadge status={record.status} />
              <span className="text-xs text-gray-500">
                {formatDate(record.dateFrom)} – {formatDate(record.dateTo)}
              </span>
            </div>
            {record.userQuestion && (
              <p className="mt-2 text-sm text-gray-400 italic">&ldquo;{record.userQuestion}&rdquo;</p>
            )}
          </div>
        </div>

        {/* ── Agent progress panel ───────────────────────────────── */}
        <section className="rounded-lg border border-gray-700 bg-gray-800/30 p-4">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Pipeline Progress</h2>
          <div className="space-y-2">
            {agents.map((a) => (
              <AgentDot key={a.id} id={a.id} status={a.status} />
            ))}
          </div>
        </section>

        {/* ── Symptom gate banner ────────────────────────────────── */}
        {record.status === 'symptom_unmatched' && symptomGateData && (
          <section className="rounded-lg border border-amber-700 bg-amber-900/20 p-5">
            <h2 className="text-base font-semibold text-amber-300 mb-2">Symptom Validation — No Match Found</h2>
            <p className="text-sm text-amber-200 leading-relaxed mb-4">
              {symptomGateData.symptom_diagnosis.analysis}
            </p>
            {symptomGateData.symptom_diagnosis.contradicting_factors.length > 0 && (
              <ul className="text-sm text-amber-300/70 list-disc list-inside mb-4 space-y-1">
                {symptomGateData.symptom_diagnosis.contradicting_factors.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            )}
            <div className="flex gap-3">
              <button
                onClick={handleOverride}
                className="rounded bg-amber-700 hover:bg-amber-600 px-4 py-2 text-sm font-medium text-white"
              >
                Override &amp; Continue
              </button>
              <button
                onClick={handleAcceptStop}
                className="rounded bg-gray-700 hover:bg-gray-600 px-4 py-2 text-sm font-medium text-gray-300"
              >
                Accept &amp; Stop
              </button>
            </div>
          </section>
        )}

        {/* ── DA-2 analysis (shown when no gate triggered but symptoms checked) ── */}
        {da2 && record.status !== 'symptom_unmatched' && (
          <section className="rounded-lg border border-gray-700 bg-gray-800/30 p-4">
            <h2 className="text-sm font-semibold text-gray-400 mb-2">Symptom Validation (DA-2)</h2>
            <p className="text-sm text-gray-300 leading-relaxed">{da2.symptom_diagnosis.analysis}</p>
            <div className="mt-2 flex items-center gap-2">
              <span className={`text-xs px-2 py-0.5 rounded ${da2.symptom_diagnosis.found ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'}`}>
                {da2.symptom_diagnosis.found ? 'Match found' : 'No match'}
              </span>
              <span className="text-xs text-gray-500 capitalize">Confidence: {da2.symptom_diagnosis.confidence}</span>
            </div>
          </section>
        )}

        {/* ── Period table (DA-1) ────────────────────────────────── */}
        {da1 && (
          <section>
            <h2 className="text-base font-semibold text-gray-200 mb-3">Period Analysis</h2>
            {da1.overall_trend && (
              <p className="text-sm text-gray-400 leading-relaxed mb-4">{da1.overall_trend}</p>
            )}
            {isTruncated && (
              <div className="mb-3 rounded-lg border border-amber-800/60 bg-amber-900/20 px-3 py-2 text-xs text-amber-300">
                Showing the first 200 periods — this window may be truncated. Narrow the date range for full coverage.
              </div>
            )}
            <div className="overflow-x-auto rounded-lg border border-gray-700">
              <table className="w-full text-left">
                <thead className="bg-gray-800/60 text-xs text-gray-500 uppercase tracking-wide">
                  <tr>
                    <th className="px-3 py-2">MD Lord</th>
                    <th className="px-3 py-2">AD Lord</th>
                    <th className="px-3 py-2">PD Lord</th>
                    <th className="px-3 py-2">Start</th>
                    <th className="px-3 py-2">End</th>
                    <th className="px-3 py-2">Intensity</th>
                    <th className="px-3 py-2 text-center">Favorable</th>
                    <th className="px-3 py-2">Transit</th>
                    <th className="px-3 py-2">Analysis ▾</th>
                  </tr>
                </thead>
                <tbody>
                  {(da1.period_analysis ?? []).map((p, i) => (
                    <PeriodRow key={i} period={p} />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Peak periods summaries */}
            {(da1.peak_stress_periods.length > 0 || da1.peak_favorable_periods.length > 0) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                {da1.peak_stress_periods.length > 0 && (
                  <div className="rounded-lg border border-red-900/50 bg-red-900/10 p-3">
                    <p className="text-xs font-semibold text-red-400 mb-2 uppercase">Peak Stress Periods</p>
                    <ul className="space-y-1">
                      {da1.peak_stress_periods.map((s, i) => (
                        <li key={i} className="text-xs text-gray-300">
                          <span className="font-mono text-red-300">{s.period}</span>
                          {' — '}{s.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {da1.peak_favorable_periods.length > 0 && (
                  <div className="rounded-lg border border-green-900/50 bg-green-900/10 p-3">
                    <p className="text-xs font-semibold text-green-400 mb-2 uppercase">Peak Favorable Periods</p>
                    <ul className="space-y-1">
                      {da1.peak_favorable_periods.map((s, i) => (
                        <li key={i} className="text-xs text-gray-300">
                          <span className="font-mono text-green-300">{s.period}</span>
                          {' — '}{s.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* ── DA-3 Forecast ──────────────────────────────────────── */}
        {da3 && (
          <section>
            <h2 className="text-base font-semibold text-gray-200 mb-3">Forecast (DA-3)</h2>
            {/* Prominent answer card */}
            <div className="rounded-lg border border-indigo-800/60 bg-indigo-900/20 p-5 mb-4">
              <p className="text-sm text-indigo-100 leading-relaxed">{da3.answer}</p>
            </div>

            {/* Period forecasts */}
            <div className="space-y-2">
              {(da3.period_forecasts ?? []).map((f, i) => (
                <ForecastCard key={i} forecast={f} />
              ))}
            </div>

            {da3.summary && (
              <div className="mt-4 rounded-lg border border-gray-700 bg-gray-800/30 p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Overall Summary</p>
                <p className="text-sm text-gray-300 leading-relaxed">{da3.summary}</p>
              </div>
            )}
          </section>
        )}

        {/* ── Follow-up chat (status === done) ──────────────────── */}
        {record.status === 'done' && (
          <section className="rounded-lg border border-gray-700 bg-gray-800/30 p-4">
            <h2 className="text-base font-semibold text-gray-200 mb-4">Follow-up Chat</h2>

            {/* Focus period selector */}
            {adPeriodOptions.length > 0 && (
              <div className="mb-3">
                <label className="block text-xs text-gray-500 mb-1" htmlFor="focus-period">
                  Focus Period (optional)
                </label>
                <select
                  id="focus-period"
                  value={focusPeriod}
                  onChange={(e) => setFocusPeriod(e.target.value)}
                  className="w-full sm:w-auto rounded bg-gray-700 border border-gray-600 text-sm text-gray-200 px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">All periods</option>
                  {adPeriodOptions.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Chat history */}
            {chatHistory.length > 0 && (
              <div className="space-y-3 mb-4 max-h-96 overflow-y-auto pr-1">
                {chatHistory.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`rounded-lg px-4 py-2.5 text-sm leading-relaxed max-w-prose ${
                        msg.role === 'user'
                          ? 'bg-indigo-700/60 text-indigo-100'
                          : 'bg-gray-700/60 text-gray-200'
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
            )}

            {/* Input area */}
            <div className="flex gap-2">
              <textarea
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    sendChat()
                  }
                }}
                placeholder="Ask a follow-up question…"
                rows={2}
                className="flex-1 rounded bg-gray-700 border border-gray-600 text-sm text-gray-200 placeholder-gray-500 px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <button
                onClick={sendChat}
                disabled={chatLoading || !chatInput.trim()}
                className="self-end rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 px-4 py-2 text-sm font-medium text-white"
              >
                {chatLoading ? '…' : 'Send'}
              </button>
            </div>
          </section>
        )}

      </div>
    </main>
  )
}
