/**
 * /runs/[id]/report — Report viewer page.
 *
 * Renders Agent 4C's synthesis output as a formatted report,
 * with expandable sections for individual wave outputs.
 * Falls back to showing all available wave outputs if 4C hasn't run.
 */

'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

interface WaveOutput {
  agentId: string
  waveNumber: number
  domain: string
  outputJson: unknown
  factSummary: string | null
  status: string
  tokenIn: number
  tokenOut: number
  costUsd: number
}

interface RunMessage {
  id: string
  role: string
  content: string
  agentId: string | null
  createdAt: string
}

interface RunReport {
  id: string
  clientName: string
  status: string
  queryTypes: string[]
  totalTokenIn: number
  totalTokenOut: number
  totalCostUsd: number
  createdAt: string
  completedAt: string | null
  reportPath: string | null
  waveOutputs: WaveOutput[]
  messages: RunMessage[]
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

// ─── 4C Synthesis shape ─────────────────────────────────────────────

interface Synthesis4CScores {
  wealth_potential?: number
  wealth_retention?: number
  financial_freedom_pct?: number
  health_resilience?: number
  [key: string]: number | undefined
}

interface YogaEntry {
  name?: string
  active?: boolean
  strength?: string
  houses?: number[]
  planets?: string[]
  notes?: string
}

interface PlanetEntry {
  name?: string
  sign?: string
  house?: number
  dignity?: string
  shadbala?: string | number
  functional_role?: string
  net_score?: number | string
}

interface CashflowEntry {
  period?: string
  dasha?: string
  direction?: string
  magnitude?: string
  key_driver?: string
  caution?: string
}

interface CrossChannelEntry {
  channel_a?: string
  channel_b?: string
  interaction?: string
  net_effect?: string
  remarks?: string
}

interface ConfidenceEntry {
  domain?: string
  confidence?: number
  data_quality?: string
  limiting_factors?: string
}

interface Synthesis4C {
  scores?: Synthesis4CScores
  executive_summary?: string
  lagna_lord_ruling?: string
  yogakaraka_status?: string
  yoga_registry?: YogaEntry[]
  planet_hierarchy?: PlanetEntry[]
  cashflow_timeline?: CashflowEntry[]
  property_analysis?: {
    d4_assessment?: string
    best_acquisition_periods?: string[]
  }
  health_analysis?: {
    score?: number
    primary_risks?: string[]
    protective_factors?: string[]
  }
  financial_freedom?: {
    score_pct?: number
    earliest_window?: string
    primary_enabler?: string
    primary_risk?: string
  }
  cross_channel_matrix?: CrossChannelEntry[]
  confidence_matrix?: ConfidenceEntry[]
  priority_alerts?: string[]
  corrections_applied?: string[]
  sade_sati_impact?: string
  atma_karaka_theme?: string
  // fallback for non-JSON output
  raw_content?: string
}

// ─── Page ───────────────────────────────────────────────────────────

export default function ReportPage() {
  const params = useParams()
  const runId = params.id as string

  const [report, setReport] = useState<RunReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set(['4C', '4X']))
  const [showDiagnostics, setShowDiagnostics] = useState(false)
  const [markdownContent, setMarkdownContent] = useState<string | null>(null)

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)

  useEffect(() => {
    fetch(`/api/runs/${runId}`)
      .then((res) => res.json())
      .then((data: RunReport) => {
        setReport(data)
        // Seed chat from persisted RunMessages. Both chat turns (user + assistant)
        // are tagged agentId: 'chat'. The original analysis question is a role:'user'
        // message with agentId: null and must NOT appear in the chat thread.
        if (Array.isArray(data.messages)) {
          const chatHistory: ChatMessage[] = data.messages
            .filter((m) => m.agentId === 'chat')
            .map((m) => ({
              id: m.id,
              role: m.role as 'user' | 'assistant',
              content: m.content,
            }))
          setChatMessages(chatHistory)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [runId])

  useEffect(() => {
    if (report?.reportPath?.endsWith('.md')) {
      fetch(`/api/runs/${runId}/report-content`)
        .then((r) => r.text())
        .then(setMarkdownContent)
        .catch(() => {})
    }
  }, [report, runId])

  if (loading) {
    return (
      <main className="min-h-screen p-8">
        <p className="text-gray-500">Loading report...</p>
      </main>
    )
  }

  if (!report) {
    return (
      <main className="min-h-screen p-8">
        <p className="text-red-400">Run not found</p>
      </main>
    )
  }

  // Detect markdown report
  const isMarkdown = report.reportPath?.endsWith('.md') ?? false

  // Extract key outputs
  const synthesis4C = report.waveOutputs.find((w) => w.agentId === '4C')
  const factSummary4X = report.waveOutputs.find((w) => w.agentId === '4X')
  const errorDetection4A = report.waveOutputs.find((w) => w.agentId === '4A')

  // Group by wave for diagnostics panel
  const waveGroups = [1, 2, 3, 4].map((wave) => ({
    wave,
    outputs: report.waveOutputs
      .filter((w) => w.waveNumber === wave && w.status === 'done')
      .sort((a, b) => a.agentId.localeCompare(b.agentId)),
  })).filter((g) => g.outputs.length > 0)

  function toggleAgent(agentId: string) {
    setExpandedAgents((prev) => {
      const next = new Set(prev)
      if (next.has(agentId)) next.delete(agentId)
      else next.add(agentId)
      return next
    })
  }

  async function handleChatSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = chatInput.trim()
    if (!trimmed || chatLoading) return

    // Optimistic user message
    const tempId = `temp-${Date.now()}`
    setChatMessages((prev) => [...prev, { id: tempId, role: 'user', content: trimmed }])
    setChatInput('')
    setChatLoading(true)

    try {
      const res = await fetch(`/api/runs/${runId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }))
        setChatMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: 'assistant',
            content: `Error: ${(err as { error?: string }).error ?? 'Request failed'}`,
          },
        ])
        return
      }

      const data = await res.json() as { response: string; messageId: string }
      setChatMessages((prev) => [
        ...prev,
        { id: data.messageId, role: 'assistant', content: data.response },
      ])
    } catch {
      setChatMessages((prev) => [
        ...prev,
        { id: `err-${Date.now()}`, role: 'assistant', content: 'Network error. Please try again.' },
      ])
    } finally {
      setChatLoading(false)
    }
  }

  return (
    <main className="min-h-screen p-8 bg-gray-950 text-gray-100">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <Link href={`/runs/${runId}`} className="text-sm text-gray-500 hover:text-gray-300 block mb-2">
              &larr; Run Progress
            </Link>
            <h1 className="text-3xl font-bold">Analysis Report</h1>
            <div className="flex items-center gap-3 mt-2 text-sm text-gray-400">
              <span>{report.clientName}</span>
              <span>[{report.queryTypes.join(', ')}]</span>
              <StatusBadge status={report.status} />
            </div>
          </div>
          <div className="text-right text-sm text-gray-500">
            <div>{report.totalTokenIn + report.totalTokenOut} tokens</div>
            <div>${report.totalCostUsd.toFixed(4)}</div>
            {report.completedAt && (
              <div>{new Date(report.completedAt).toLocaleString()}</div>
            )}
          </div>
        </div>

        {/* ─── Markdown Report (inline viewer) ─────────────────── */}
        {isMarkdown && markdownContent && (
          <section className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-violet-400" />
                Report (Markdown)
              </h2>
              <a
                href={`/api/runs/${runId}/report-content`}
                download={`report-${runId}.md`}
                className="text-xs text-indigo-400 hover:text-indigo-300 underline"
              >
                Download .md
              </a>
            </div>
            <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-6">
              <MarkdownViewer content={markdownContent} />
            </div>
          </section>
        )}

        {/* ─── Final Synthesis (4C) ─────────────────────────────── */}
        {synthesis4C != null && Boolean(synthesis4C.outputJson) ? (
          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-emerald-400" />
              Final Synthesis
            </h2>
            <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-6">
              <SynthesisRenderer data={synthesis4C.outputJson as Synthesis4C} />
            </div>
          </section>
        ) : null}

        {/* ─── Fact Summary (4X) ────────────────────────────────── */}
        {factSummary4X?.factSummary && (
          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-blue-400" />
              Consolidated Findings
            </h2>
            <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-6">
              <pre className="whitespace-pre-wrap text-sm text-gray-300 font-sans leading-relaxed">
                {factSummary4X.factSummary}
              </pre>
            </div>
          </section>
        )}

        {/* ─── Error Detection (4A) ─────────────────────────────── */}
        {errorDetection4A != null && Boolean(errorDetection4A.outputJson) ? (
          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-amber-400" />
              Error Detection
            </h2>
            <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-6">
              <ErrorDetectionRenderer data={errorDetection4A.outputJson as Record<string, unknown>} />
            </div>
          </section>
        ) : null}

        {/* ─── Chat Panel ───────────────────────────────────────── */}
        {report.status === 'done' && synthesis4C != null && (
          <section className="mb-8 border-t border-gray-700 pt-8">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-indigo-400" />
              Ask a Follow-up Question
            </h2>

            {/* Message thread */}
            {chatMessages.length > 0 && (
              <div className="mb-4 space-y-3 max-h-96 overflow-y-auto pr-1">
                {chatMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg px-4 py-2 text-sm leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-indigo-700/60 text-indigo-100'
                          : 'bg-gray-800 border border-gray-700 text-gray-200'
                      }`}
                    >
                      <div className="text-xs font-medium mb-1 opacity-60">
                        {msg.role === 'user' ? 'You' : 'Advisor'}
                      </div>
                      <div className="whitespace-pre-wrap">{msg.content}</div>
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-sm text-gray-400">
                      <div className="text-xs font-medium mb-1 opacity-60">Advisor</div>
                      <span className="inline-flex gap-1">
                        <span className="animate-bounce">.</span>
                        <span className="animate-bounce [animation-delay:0.15s]">.</span>
                        <span className="animate-bounce [animation-delay:0.3s]">.</span>
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Input form */}
            <form onSubmit={handleChatSubmit} className="flex gap-2">
              <textarea
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void handleChatSubmit(e as unknown as React.FormEvent)
                  }
                }}
                placeholder="Ask about this chart... (Enter to send, Shift+Enter for new line)"
                rows={2}
                disabled={chatLoading}
                className="flex-1 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={chatLoading || !chatInput.trim()}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors self-end"
              >
                {chatLoading ? 'Sending...' : 'Send'}
              </button>
            </form>
            <p className="mt-1.5 text-xs text-gray-600">
              Answers are based solely on the analysis above. For a new analysis, use the Analyze button.
            </p>
          </section>
        )}

        {/* ─── Agent Diagnostics (collapsed by default) ─────────── */}
        <section>
          <button
            onClick={() => setShowDiagnostics((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 rounded-lg border border-gray-700 hover:bg-gray-800/50 transition-colors text-left"
          >
            <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider">
              Developer / Diagnostics — All Agent Outputs
            </h2>
            <span className="text-gray-500 text-sm">{showDiagnostics ? '▲ Hide' : '▼ Show'}</span>
          </button>

          {showDiagnostics && (
            <div className="mt-2 space-y-2">
              {waveGroups.map(({ wave, outputs }) => (
                <div key={wave}>
                  <h3 className="text-sm font-medium text-gray-500 mb-2 mt-4 uppercase tracking-wider">
                    Wave {wave}
                  </h3>
                  <div className="space-y-1 mb-4">
                    {outputs.map((output) => (
                      <div key={output.agentId} className="rounded-lg border border-gray-700">
                        <button
                          onClick={() => toggleAgent(output.agentId)}
                          className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-800/50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-sm font-medium">{output.agentId}</span>
                            <span className="text-xs text-gray-500">{output.domain}</span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-gray-500">
                            <span>{output.tokenIn + output.tokenOut} tok</span>
                            <span>${output.costUsd.toFixed(4)}</span>
                            <span>{expandedAgents.has(output.agentId) ? '▼' : '▶'}</span>
                          </div>
                        </button>
                        {expandedAgents.has(output.agentId) && output.outputJson != null && (
                          <div className="border-t border-gray-700 px-4 py-4 bg-gray-900/30">
                            <pre className="text-xs text-gray-300 overflow-auto max-h-96 whitespace-pre-wrap font-mono">
                              {typeof output.outputJson === 'string'
                                ? output.outputJson
                                : JSON.stringify(output.outputJson as Record<string, unknown>, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}

// ─── Synthesis Renderer ─────────────────────────────────────────────

function SynthesisRenderer({ data }: { data: Synthesis4C }) {
  const [activeTab, setActiveTab] = useState('summary')

  // Raw-text fallback (non-JSON output or raw_content wrapper)
  if (typeof data === 'string') {
    return (
      <pre className="whitespace-pre-wrap text-sm text-gray-300 font-sans leading-relaxed">
        {data}
      </pre>
    )
  }
  if (data.raw_content) {
    return (
      <pre className="whitespace-pre-wrap text-sm text-gray-300 font-sans leading-relaxed">
        {data.raw_content}
      </pre>
    )
  }

  const tabs = [
    { id: 'summary',    label: 'Summary' },
    { id: 'health',     label: 'Health' },
    { id: 'wealth',     label: 'Wealth' },
    { id: 'property',   label: 'Property' },
    { id: 'yogas',      label: 'Yogas' },
    { id: 'planets',    label: 'Planets' },
    { id: 'cashflow',   label: 'Cashflow' },
    { id: 'confidence', label: 'Confidence' },
  ]

  return (
    <div>
      {/* Tab bar */}
      <div className="flex flex-wrap gap-1 mb-5 border-b border-gray-700 pb-0">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-3 py-1.5 text-sm rounded-t border-b-2 transition-colors ${
              activeTab === t.id
                ? 'border-violet-500 text-violet-300 font-medium'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="space-y-6">
        {activeTab === 'summary'    && <SummaryTab    data={data} />}
        {activeTab === 'health'     && <HealthTab     data={data} />}
        {activeTab === 'wealth'     && <WealthTab     data={data} />}
        {activeTab === 'property'   && <PropertyTab   data={data} />}
        {activeTab === 'yogas'      && <YogasTab      data={data} />}
        {activeTab === 'planets'    && <PlanetsTab    data={data} />}
        {activeTab === 'cashflow'   && <CashflowTab   data={data} />}
        {activeTab === 'confidence' && <ConfidenceTab data={data} />}
      </div>
    </div>
  )
}

// ─── Tab Panels ─────────────────────────────────────────────────────

function SummaryTab({ data }: { data: Synthesis4C }) {
  return (
    <div className="space-y-6">
      {/* Score cards */}
      {data.scores && (
        <div>
          <h3 className="text-base font-medium text-gray-200 mb-3">Scores</h3>
          <ScoreCards scores={data.scores} />
        </div>
      )}

      {data.executive_summary && (
        <div>
          <h3 className="text-base font-medium text-gray-200 mb-2">Executive Summary</h3>
          <Prose text={data.executive_summary} />
        </div>
      )}

      {data.lagna_lord_ruling && (
        <div>
          <h3 className="text-base font-medium text-gray-200 mb-2">Lagna Lord</h3>
          <Prose text={data.lagna_lord_ruling} />
        </div>
      )}

      {data.yogakaraka_status && (
        <div>
          <h3 className="text-base font-medium text-gray-200 mb-2">Yogakaraka Status</h3>
          <Prose text={data.yogakaraka_status} />
        </div>
      )}

      {data.atma_karaka_theme && (
        <div>
          <h3 className="text-base font-medium text-gray-200 mb-2">Atma Karaka Theme</h3>
          <Prose text={data.atma_karaka_theme} />
        </div>
      )}

      {data.sade_sati_impact && (
        <div>
          <h3 className="text-base font-medium text-gray-200 mb-2">Sade Sati Impact</h3>
          <Prose text={data.sade_sati_impact} />
        </div>
      )}

      {data.priority_alerts && data.priority_alerts.length > 0 && (
        <div>
          <h3 className="text-base font-medium text-gray-200 mb-2">Priority Alerts</h3>
          <ul className="space-y-2">
            {data.priority_alerts.map((alert, i) => (
              <li key={i} className="rounded border border-orange-700 bg-orange-900/20 px-3 py-2 text-sm text-orange-200">
                {alert}
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.financial_freedom && (
        <div>
          <h3 className="text-base font-medium text-gray-200 mb-3">Financial Freedom</h3>
          <FinancialFreedomBlock ff={data.financial_freedom} />
        </div>
      )}
    </div>
  )
}

function HealthTab({ data }: { data: Synthesis4C }) {
  const h = data.health_analysis
  if (!h) return <p className="text-sm text-gray-400">No health analysis data available.</p>
  return (
    <div className="space-y-4">
      {h.score !== undefined && (
        <div className="rounded-lg border border-gray-700 p-4">
          <div className="text-xs text-gray-500 uppercase mb-1">Health Resilience Score</div>
          <div className="text-3xl font-bold text-amber-400">{h.score}<span className="text-lg text-gray-400"> / 10</span></div>
        </div>
      )}
      {h.primary_risks && h.primary_risks.length > 0 && (
        <div>
          <h3 className="text-base font-medium text-gray-200 mb-2">Primary Risks</h3>
          <ul className="space-y-1">
            {h.primary_risks.map((r, i) => (
              <li key={i} className="rounded border border-red-800 bg-red-900/20 px-3 py-1.5 text-sm text-red-200">{r}</li>
            ))}
          </ul>
        </div>
      )}
      {h.protective_factors && h.protective_factors.length > 0 && (
        <div>
          <h3 className="text-base font-medium text-gray-200 mb-2">Protective Factors</h3>
          <ul className="space-y-1">
            {h.protective_factors.map((f, i) => (
              <li key={i} className="rounded border border-green-800 bg-green-900/20 px-3 py-1.5 text-sm text-green-200">{f}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function WealthTab({ data }: { data: Synthesis4C }) {
  return (
    <div className="space-y-6">
      {data.scores && (
        <div>
          <h3 className="text-base font-medium text-gray-200 mb-3">Wealth Scores</h3>
          <div className="grid grid-cols-2 gap-3">
            {(['wealth_potential', 'wealth_retention'] as const).map((key) => (
              <div key={key} className="rounded-lg border border-gray-700 p-3 text-center">
                <div className="text-2xl font-bold text-amber-400">{data.scores?.[key] ?? '—'}</div>
                <div className="text-xs text-gray-500 capitalize mt-1">{key.replace(/_/g, ' ')}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {data.financial_freedom && (
        <div>
          <h3 className="text-base font-medium text-gray-200 mb-3">Financial Freedom</h3>
          <FinancialFreedomBlock ff={data.financial_freedom} />
        </div>
      )}
      {data.cashflow_timeline && data.cashflow_timeline.length > 0 && (
        <div>
          <h3 className="text-base font-medium text-gray-200 mb-3">Cashflow Timeline</h3>
          <CashflowList entries={data.cashflow_timeline} />
        </div>
      )}
    </div>
  )
}

function PropertyTab({ data }: { data: Synthesis4C }) {
  const p = data.property_analysis
  if (!p) return <p className="text-sm text-gray-400">No property analysis data available.</p>
  return (
    <div className="space-y-4">
      {p.d4_assessment && (
        <div>
          <h3 className="text-base font-medium text-gray-200 mb-2">D4 Property Assessment</h3>
          <Prose text={p.d4_assessment} />
        </div>
      )}
      {p.best_acquisition_periods && p.best_acquisition_periods.length > 0 && (
        <div>
          <h3 className="text-base font-medium text-gray-200 mb-2">Best Acquisition Periods</h3>
          <ul className="space-y-1">
            {p.best_acquisition_periods.map((period, i) => (
              <li key={i} className="rounded border border-green-800 bg-green-900/20 px-3 py-1.5 text-sm text-green-200">{period}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function YogasTab({ data }: { data: Synthesis4C }) {
  const yogas = data.yoga_registry
  if (!yogas || yogas.length === 0) return <p className="text-sm text-gray-400">No yoga data available.</p>
  const sorted = [...yogas].sort((a, b) => (b.active ? 1 : 0) - (a.active ? 1 : 0))
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-700 text-xs text-gray-500 uppercase text-left">
            <th className="py-2 pr-3">Yoga</th>
            <th className="py-2 pr-3">Status</th>
            <th className="py-2 pr-3">Strength</th>
            <th className="py-2 pr-3">Houses</th>
            <th className="py-2 pr-3">Planets</th>
            <th className="py-2">Notes</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800">
          {sorted.map((y, i) => (
            <tr key={i} className={y.active ? 'text-gray-200' : 'text-gray-500'}>
              <td className="py-2 pr-3 font-medium">{y.name ?? '—'}</td>
              <td className="py-2 pr-3">
                {y.active
                  ? <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-green-900/50 text-green-400">Active</span>
                  : <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-gray-700/50 text-gray-500">Dormant</span>
                }
              </td>
              <td className="py-2 pr-3">{y.strength ?? '—'}</td>
              <td className="py-2 pr-3">{y.houses?.join(', ') ?? '—'}</td>
              <td className="py-2 pr-3">{y.planets?.join(', ') ?? '—'}</td>
              <td className="py-2 text-gray-400">{y.notes ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PlanetsTab({ data }: { data: Synthesis4C }) {
  const planets = data.planet_hierarchy
  if (!planets || planets.length === 0) return <p className="text-sm text-gray-400">No planet hierarchy data available.</p>

  const dignityColor: Record<string, string> = {
    exalted: 'text-green-400 font-semibold',
    'own sign': 'text-blue-400 font-semibold',
    own: 'text-blue-400 font-semibold',
    moolatrikona: 'text-blue-400',
    friend: 'text-lime-400',
    neutral: 'text-gray-400',
    enemy: 'text-orange-400',
    debilitated: 'text-red-400',
    'neecha-bhanga': 'text-yellow-400',
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-700 text-xs text-gray-500 uppercase text-left">
            <th className="py-2 pr-3">#</th>
            <th className="py-2 pr-3">Planet</th>
            <th className="py-2 pr-3">Sign</th>
            <th className="py-2 pr-3">House</th>
            <th className="py-2 pr-3">Dignity</th>
            <th className="py-2 pr-3">Shadbala</th>
            <th className="py-2 pr-3">Role</th>
            <th className="py-2">Score</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800">
          {planets.map((p, i) => {
            const dignClass = dignityColor[(p.dignity ?? '').toLowerCase()] ?? 'text-gray-300'
            return (
              <tr key={i}>
                <td className="py-2 pr-3 text-gray-500 text-xs">{i + 1}</td>
                <td className="py-2 pr-3 font-medium text-gray-200">{p.name ?? '—'}</td>
                <td className="py-2 pr-3 text-gray-300">{p.sign ?? '—'}</td>
                <td className="py-2 pr-3 text-gray-400">{p.house ?? '—'}</td>
                <td className={`py-2 pr-3 ${dignClass}`}>{p.dignity ?? '—'}</td>
                <td className="py-2 pr-3 text-gray-400 font-mono text-xs">{String(p.shadbala ?? '—')}</td>
                <td className="py-2 pr-3 text-gray-400">{p.functional_role ?? '—'}</td>
                <td className="py-2 text-amber-400 font-bold">{String(p.net_score ?? '—')}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function CashflowTab({ data }: { data: Synthesis4C }) {
  const entries = data.cashflow_timeline
  if (!entries || entries.length === 0) return <p className="text-sm text-gray-400">No cashflow timeline data available.</p>
  return <CashflowList entries={entries} />
}

function ConfidenceTab({ data }: { data: Synthesis4C }) {
  return (
    <div className="space-y-6">
      {data.confidence_matrix && data.confidence_matrix.length > 0 && (
        <div>
          <h3 className="text-base font-medium text-gray-200 mb-3">Confidence Matrix</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700 text-xs text-gray-500 uppercase text-left">
                  <th className="py-2 pr-3">Domain</th>
                  <th className="py-2 pr-3">Confidence</th>
                  <th className="py-2 pr-3">Data Quality</th>
                  <th className="py-2">Limiting Factors</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {data.confidence_matrix.map((m, i) => {
                  const pct = typeof m.confidence === 'number'
                    ? Math.min(100, Math.max(0, m.confidence))
                    : 0
                  return (
                    <tr key={i}>
                      <td className="py-2 pr-3 text-gray-200">{m.domain ?? '—'}</td>
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-2">
                          <span className="text-amber-400 font-medium">{pct}%</span>
                          <div className="h-1.5 rounded-full bg-gray-700 w-20">
                            <div
                              className="h-1.5 rounded-full bg-violet-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="py-2 pr-3 text-gray-400">{m.data_quality ?? '—'}</td>
                      <td className="py-2 text-gray-500">{m.limiting_factors ?? '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data.cross_channel_matrix && data.cross_channel_matrix.length > 0 && (
        <div>
          <h3 className="text-base font-medium text-gray-200 mb-3">Cross-Chart Channel Matrix</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700 text-xs text-gray-500 uppercase text-left">
                  <th className="py-2 pr-3">Chart A</th>
                  <th className="py-2 pr-3">Chart B</th>
                  <th className="py-2 pr-3">Interaction</th>
                  <th className="py-2 pr-3">Net Effect</th>
                  <th className="py-2">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {data.cross_channel_matrix.map((m, i) => {
                  const dir = (m.net_effect ?? '').toLowerCase()
                  const cls = dir === 'positive' ? 'bg-green-900/50 text-green-400' :
                              dir === 'negative' ? 'bg-red-900/50 text-red-400' :
                              'bg-gray-700/50 text-gray-400'
                  return (
                    <tr key={i}>
                      <td className="py-2 pr-3 text-gray-300 font-mono text-xs">{m.channel_a ?? '—'}</td>
                      <td className="py-2 pr-3 text-gray-300 font-mono text-xs">{m.channel_b ?? '—'}</td>
                      <td className="py-2 pr-3 text-gray-300">{m.interaction ?? '—'}</td>
                      <td className="py-2 pr-3">
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${cls}`}>
                          {m.net_effect ?? '—'}
                        </span>
                      </td>
                      <td className="py-2 text-gray-400">{m.remarks ?? ''}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data.corrections_applied && data.corrections_applied.length > 0 && (
        <div>
          <h3 className="text-base font-medium text-gray-200 mb-2">Corrections Applied</h3>
          <ul className="space-y-1">
            {data.corrections_applied.map((c, i) => (
              <li key={i} className="text-sm text-gray-300 flex items-start gap-2">
                <span className="text-violet-400 mt-0.5">&#10003;</span>
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ─── Shared Sub-Components ──────────────────────────────────────────

function ScoreCards({ scores }: { scores: Synthesis4CScores }) {
  const cards = [
    { key: 'wealth_potential',    label: 'Wealth Potential',    unit: '/100' },
    { key: 'wealth_retention',    label: 'Wealth Retention',    unit: '/100' },
    { key: 'financial_freedom_pct', label: 'Financial Freedom', unit: '%' },
    { key: 'health_resilience',   label: 'Health Resilience',   unit: '/10' },
  ] as const
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map(({ key, label, unit }) => (
        <div key={key} className="rounded-lg border border-gray-700 p-3 text-center">
          <div className="text-2xl font-bold text-amber-400">
            {scores[key] ?? '—'}
          </div>
          <div className="text-xs text-gray-500 mt-1">{label} <span className="text-gray-600">{unit}</span></div>
        </div>
      ))}
    </div>
  )
}

function FinancialFreedomBlock({ ff }: { ff: NonNullable<Synthesis4C['financial_freedom']> }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="rounded-lg border border-gray-700 p-3 text-center col-span-2 md:col-span-1">
        <div className="text-xs text-gray-500 mb-1">Freedom Score</div>
        <div className="text-3xl font-bold text-amber-400">{ff.score_pct ?? '—'}<span className="text-lg text-gray-400">%</span></div>
      </div>
      <div className="rounded-lg border border-gray-700 p-3">
        <div className="text-xs text-gray-500 mb-1">Earliest Window</div>
        <div className="text-sm text-gray-200">{ff.earliest_window ?? '—'}</div>
      </div>
      <div className="rounded-lg border border-gray-700 p-3">
        <div className="text-xs text-gray-500 mb-1">Primary Enabler</div>
        <div className="text-sm text-gray-200">{ff.primary_enabler ?? '—'}</div>
      </div>
      <div className="rounded-lg border border-gray-700 p-3">
        <div className="text-xs text-gray-500 mb-1">Primary Risk</div>
        <div className="text-sm text-red-300">{ff.primary_risk ?? '—'}</div>
      </div>
    </div>
  )
}

function CashflowList({ entries }: { entries: CashflowEntry[] }) {
  return (
    <div className="space-y-3">
      {entries.map((e, i) => {
        const dir = (e.direction ?? '').toLowerCase()
        const borderColor = dir === 'positive' ? 'border-green-600' :
                            dir === 'negative' ? 'border-red-600' : 'border-gray-600'
        const badgeCls = dir === 'positive' ? 'bg-green-900/50 text-green-400' :
                         dir === 'negative' ? 'bg-red-900/50 text-red-400' :
                         'bg-gray-700/50 text-gray-400'
        return (
          <div key={i} className={`rounded-lg border-l-4 ${borderColor} bg-gray-800/40 px-4 py-3`}>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="font-semibold text-gray-100">{e.period ?? ''}</span>
              <span className="text-xs text-gray-500">{e.dasha ?? ''}</span>
              <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${badgeCls}`}>{e.direction ?? ''}</span>
              <span className="text-xs text-amber-400">{e.magnitude ?? ''}</span>
            </div>
            <div className="text-xs text-gray-400 space-y-0.5">
              <div><span className="text-gray-300">Driver:</span> {e.key_driver ?? '—'}</div>
              <div><span className="text-gray-300">Caution:</span> {e.caution ?? '—'}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Prose({ text }: { text: string }) {
  return (
    <div className="prose-sm text-gray-300 leading-relaxed space-y-2">
      {text.split(/\n\n+/).map((para, i) => {
        const lines = para.split('\n')
        return (
          <p key={i}>
            {lines.map((line, j) =>
              j < lines.length - 1
                ? <span key={j}>{line}<br /></span>
                : <span key={j}>{line}</span>
            )}
          </p>
        )
      })}
    </div>
  )
}

// ─── Error Detection Renderer ───────────────────────────────────────

function ErrorDetectionRenderer({ data }: { data: Record<string, unknown> }) {
  if (typeof data.raw_content === 'string') {
    return <pre className="text-sm text-gray-300 whitespace-pre-wrap">{data.raw_content}</pre>
  }

  const errors = (Array.isArray(data.errors_found) ? data.errors_found :
                  Array.isArray(data.errors) ? data.errors : []) as Record<string, unknown>[]
  const criticalCount = typeof data.critical_errors === 'number'
    ? data.critical_errors
    : errors.filter((e) => e.severity === 'critical').length

  return (
    <div>
      <div className="flex items-center gap-4 mb-4">
        <span className={`text-sm font-medium ${criticalCount > 0 ? 'text-red-400' : 'text-green-400'}`}>
          {criticalCount > 0 ? `${criticalCount} critical error(s)` : 'No critical errors'}
        </span>
        <span className="text-xs text-gray-500">{errors.length} total issues found</span>
      </div>
      {errors.length > 0 && (
        <div className="space-y-2">
          {errors.map((err, idx) => (
            <div
              key={idx}
              className={`rounded border px-3 py-2 text-sm ${
                err.severity === 'critical' ? 'border-red-700 bg-red-900/20 text-red-300' :
                err.severity === 'moderate' ? 'border-amber-700 bg-amber-900/20 text-amber-300' :
                'border-gray-700 bg-gray-800/50 text-gray-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium uppercase">{String(err.severity ?? '')}</span>
                {err.check != null && <span className="text-xs text-gray-500">— {String(err.check)}</span>}
              </div>
              <p className="mt-1">{String(err.description ?? err.message ?? '')}</p>
              {err.correction_suggestion != null && (
                <p className="mt-1 text-xs text-gray-500">Suggestion: {String(err.correction_suggestion)}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Markdown Viewer ────────────────────────────────────────────────

/**
 * Displays raw markdown content in a readable monospace pre block.
 * No parser dependency — the .md file is also downloadable for rich
 * rendering in any markdown-aware editor.
 */
function MarkdownViewer({ content }: { content: string }) {
  return (
    <pre
      className="whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-200"
      style={{
        fontFamily: '"ui-monospace", "SFMono-Regular", "Menlo", monospace',
        lineHeight: 1.75,
      }}
    >
      {content}
    </pre>
  )
}

// ─── Status Badge ───────────────────────────────────────────────────

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
