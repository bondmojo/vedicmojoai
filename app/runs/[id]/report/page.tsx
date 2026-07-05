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
  outputJson: any
  factSummary: string | null
  status: string
  tokenIn: number
  tokenOut: number
  costUsd: number
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
  waveOutputs: WaveOutput[]
}

export default function ReportPage() {
  const params = useParams()
  const runId = params.id as string

  const [report, setReport] = useState<RunReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set(['4C', '4X']))

  useEffect(() => {
    fetch(`/api/runs/${runId}`)
      .then((res) => res.json())
      .then((data) => {
        setReport(data)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [runId])

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

  // Extract key outputs
  const synthesis4C = report.waveOutputs.find((w) => w.agentId === '4C')
  const factSummary4X = report.waveOutputs.find((w) => w.agentId === '4X')
  const errorDetection4A = report.waveOutputs.find((w) => w.agentId === '4A')
  const validation4B = report.waveOutputs.find((w) => w.agentId === '4B')

  // Group by wave
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

        {/* ─── Final Synthesis (4C) ─────────────────────────────── */}
        {synthesis4C?.outputJson && (
          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-emerald-400" />
              Final Synthesis
            </h2>
            <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-6">
              <SynthesisRenderer data={synthesis4C.outputJson} />
            </div>
          </section>
        )}

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
        {errorDetection4A?.outputJson && (
          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-amber-400" />
              Error Detection
            </h2>
            <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-6">
              <ErrorDetectionRenderer data={errorDetection4A.outputJson} />
            </div>
          </section>
        )}

        {/* ─── All Wave Outputs (Expandable) ────────────────────── */}
        <section>
          <h2 className="text-xl font-semibold mb-4">All Agent Outputs</h2>
          <div className="space-y-2">
            {waveGroups.map(({ wave, outputs }) => (
              <div key={wave}>
                <h3 className="text-sm font-medium text-gray-500 mb-2 uppercase tracking-wider">
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
                      {expandedAgents.has(output.agentId) && output.outputJson && (
                        <div className="border-t border-gray-700 px-4 py-4 bg-gray-900/30">
                          <pre className="text-xs text-gray-300 overflow-auto max-h-96 whitespace-pre-wrap font-mono">
                            {typeof output.outputJson === 'string'
                              ? output.outputJson
                              : JSON.stringify(output.outputJson, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}

// ─── Synthesis Renderer ─────────────────────────────────────────────

function SynthesisRenderer({ data }: { data: any }) {
  // 4C output can be either structured JSON or raw text
  if (typeof data === 'string') {
    return (
      <pre className="whitespace-pre-wrap text-sm text-gray-300 font-sans leading-relaxed">
        {data}
      </pre>
    )
  }

  // If it has raw_content (fallback from non-JSON output)
  if (data.raw_content) {
    return (
      <pre className="whitespace-pre-wrap text-sm text-gray-300 font-sans leading-relaxed">
        {data.raw_content}
      </pre>
    )
  }

  // Structured synthesis output — render key sections
  return (
    <div className="space-y-6">
      {/* Executive Summary */}
      {data.executive_summary && (
        <div>
          <h3 className="text-lg font-medium text-gray-200 mb-2">Executive Summary</h3>
          <p className="text-sm text-gray-300 leading-relaxed">{data.executive_summary}</p>
        </div>
      )}

      {/* Domain Findings */}
      {data.domain_findings && (
        <div>
          <h3 className="text-lg font-medium text-gray-200 mb-3">Domain Findings</h3>
          {Object.entries(data.domain_findings).map(([domain, findings]: [string, any]) => (
            <div key={domain} className="mb-4 rounded-lg border border-gray-700 p-4">
              <h4 className="font-medium text-indigo-400 capitalize mb-2">{domain.replace(/_/g, ' ')}</h4>
              {typeof findings === 'string' ? (
                <p className="text-sm text-gray-300">{findings}</p>
              ) : (
                <pre className="text-xs text-gray-400 whitespace-pre-wrap">
                  {JSON.stringify(findings, null, 2)}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Scores */}
      {data.scores && (
        <div>
          <h3 className="text-lg font-medium text-gray-200 mb-3">Scores</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(data.scores).map(([key, value]: [string, any]) => (
              <div key={key} className="rounded-lg border border-gray-700 p-3 text-center">
                <div className="text-2xl font-bold text-indigo-400">{typeof value === 'number' ? value : '—'}</div>
                <div className="text-xs text-gray-500 capitalize mt-1">{key.replace(/_/g, ' ')}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Timeline / Dasha Periods */}
      {data.timeline && (
        <div>
          <h3 className="text-lg font-medium text-gray-200 mb-3">Timeline</h3>
          <div className="space-y-2">
            {(Array.isArray(data.timeline) ? data.timeline : []).map((period: any, idx: number) => (
              <div key={idx} className="flex items-center gap-4 text-sm border-l-2 border-indigo-500 pl-4 py-1">
                <span className="text-gray-500 font-mono text-xs w-32">
                  {period.start} – {period.end}
                </span>
                <span className="text-gray-300">{period.description || period.lord}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {data.recommendations && (
        <div>
          <h3 className="text-lg font-medium text-gray-200 mb-3">Recommendations</h3>
          {Array.isArray(data.recommendations) ? (
            <ul className="space-y-2">
              {data.recommendations.map((rec: any, idx: number) => (
                <li key={idx} className="text-sm text-gray-300 flex items-start gap-2">
                  <span className="text-indigo-400 mt-1">•</span>
                  <span>{typeof rec === 'string' ? rec : rec.text || JSON.stringify(rec)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-300">{JSON.stringify(data.recommendations)}</p>
          )}
        </div>
      )}

      {/* Fallback: show full JSON for any unhandled structure */}
      {!data.executive_summary && !data.domain_findings && !data.scores && (
        <pre className="text-xs text-gray-400 whitespace-pre-wrap overflow-auto max-h-96">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  )
}

// ─── Error Detection Renderer ───────────────────────────────────────

function ErrorDetectionRenderer({ data }: { data: any }) {
  if (data.raw_content) {
    return <pre className="text-sm text-gray-300 whitespace-pre-wrap">{data.raw_content}</pre>
  }

  const errors = data.errors_found || data.errors || []
  const criticalCount = data.critical_errors ?? errors.filter((e: any) => e.severity === 'critical').length

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
          {errors.map((err: any, idx: number) => (
            <div
              key={idx}
              className={`rounded border px-3 py-2 text-sm ${
                err.severity === 'critical' ? 'border-red-700 bg-red-900/20 text-red-300' :
                err.severity === 'moderate' ? 'border-amber-700 bg-amber-900/20 text-amber-300' :
                'border-gray-700 bg-gray-800/50 text-gray-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium uppercase">{err.severity}</span>
                {err.check && <span className="text-xs text-gray-500">— {err.check}</span>}
              </div>
              <p className="mt-1">{err.description || err.message}</p>
              {err.correction_suggestion && (
                <p className="mt-1 text-xs text-gray-500">Suggestion: {err.correction_suggestion}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
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
