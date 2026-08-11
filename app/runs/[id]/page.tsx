/**
 * /runs/[id] — Run progress page (Client Component)
 * Live SSE stream showing per-agent status, token count, cost total.
 */

'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

interface AgentStatus {
  agentId: string
  waveNumber: number
  status: 'pending' | 'running' | 'done' | 'failed'
  tokenIn?: number
  tokenOut?: number
  costUsd?: number
  error?: string
}

interface RunData {
  id: string
  chartId: string
  clientName: string
  status: string
  queryTypes: string[]
  reportPath?: string
  haltReason?: unknown
  overrideApplied: boolean
  totalTokenIn: number
  totalTokenOut: number
  totalCostUsd: number
}

export default function RunProgressPage() {
  const params = useParams()
  const runId = params.id as string

  const [run, setRun] = useState<RunData | null>(null)
  const [agents, setAgents] = useState<AgentStatus[]>([])
  const [connected, setConnected] = useState(false)
  const [haltErrors, setHaltErrors] = useState<unknown[] | null>(null)

  // Load initial run state
  useEffect(() => {
    fetch(`/api/runs/${runId}`)
      .then((res) => res.json())
      .then((data) => {
        setRun(data)
        if (data.agents) {
          setAgents(data.agents.map((a: { agentId: string; waveNumber: number; status: string; tokenIn: number; tokenOut: number; costUsd: number; errorMessage?: string }) => ({
            agentId: a.agentId,
            waveNumber: a.waveNumber,
            status: a.status === 'running' ? 'running' : a.status === 'done' ? 'done' : a.status === 'failed' ? 'failed' : 'pending',
            tokenIn: a.tokenIn,
            tokenOut: a.tokenOut,
            costUsd: a.costUsd,
            error: a.errorMessage,
          })))
        }
      })
  }, [runId])

  // SSE connection for live updates. Reconnects (with backoff) on a dropped
  // connection instead of giving up — the SSE route has its own Vercel maxDuration
  // ceiling independent of the pipeline's, so a long-running run can outlive a
  // single connection. Reconnects don't re-announce already-seen progress: the
  // server seeds its dedup from DB state and sends a snapshot on 'connected'.
  useEffect(() => {
    if (run?.status === 'done' || run?.status === 'failed') return

    let cancelled = false
    let reconnectAttempt = 0
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined
    let eventSource: EventSource | undefined

    const connect = () => {
      if (cancelled) return
      const es = new EventSource(`/api/runs/${runId}/events`)
      eventSource = es

      es.onmessage = (event) => {
      const data = JSON.parse(event.data)

      switch (data.type) {
        case 'connected':
          setConnected(true)
          reconnectAttempt = 0
          if (Array.isArray(data.snapshot)) {
            setAgents((prev) => {
              const next = [...prev]
              for (const s of data.snapshot) {
                const idx = next.findIndex((a) => a.agentId === s.agent_id)
                const merged: AgentStatus = {
                  agentId: s.agent_id,
                  waveNumber: s.wave_number,
                  status: s.status === 'running' ? 'running' : s.status === 'done' ? 'done' : s.status === 'failed' ? 'failed' : 'pending',
                  tokenIn: s.tokenIn,
                  tokenOut: s.tokenOut,
                  costUsd: s.costUsd,
                  error: s.error,
                }
                if (idx >= 0) next[idx] = merged
                else next.push(merged)
              }
              return next
            })
          }
          break
        case 'agent_start':
          setAgents((prev) => {
            const existing = prev.find((a) => a.agentId === data.agent_id)
            if (existing) {
              return prev.map((a) =>
                a.agentId === data.agent_id ? { ...a, status: 'running' } : a
              )
            }
            return [...prev, { agentId: data.agent_id, waveNumber: data.wave_number, status: 'running' }]
          })
          break
        case 'agent_complete':
          setAgents((prev) =>
            prev.map((a) =>
              a.agentId === data.agent_id
                ? { ...a, status: 'done', tokenIn: data.tokenIn, tokenOut: data.tokenOut, costUsd: data.costUsd }
                : a
            )
          )
          break
        case 'agent_error':
          setAgents((prev) =>
            prev.map((a) =>
              a.agentId === data.agent_id
                ? { ...a, status: 'failed', error: data.error }
                : a
            )
          )
          break
        case 'run_complete':
          setRun((prev) => prev ? { ...prev, status: 'done', totalTokenIn: data.totalTokenIn, totalTokenOut: data.totalTokenOut, totalCostUsd: data.totalCostUsd } : prev)
          cancelled = true
          es.close()
          break
        case 'run_failed':
          setRun((prev) => prev ? { ...prev, status: 'failed' } : prev)
          cancelled = true
          es.close()
          break
        case 'critical_error':
          setRun((prev) => prev ? { ...prev, status: 'halted_for_review' } : prev)
          setHaltErrors(data.errors)
          cancelled = true
          es.close()
          break
      }
      }

      es.onerror = () => {
        setConnected(false)
        es.close()
        if (cancelled) return
        // Dropped connection (e.g. the SSE route's own maxDuration ceiling) — the run
        // may still be in progress server-side. Reconnect with capped exponential
        // backoff instead of leaving the UI permanently "disconnected".
        reconnectAttempt += 1
        const delayMs = Math.min(30_000, 1_000 * 2 ** (reconnectAttempt - 1))
        reconnectTimer = setTimeout(connect, delayMs)
      }
    }

    connect()

    return () => {
      cancelled = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      eventSource?.close()
    }
  }, [runId, run?.status])

  if (!run) {
    return (
      <main className="min-h-screen p-8 flex items-center justify-center">
        <p className="text-gray-400">Loading run...</p>
      </main>
    )
  }

  // Group agents by wave
  const waveGroups = [1, 2, 3, 4].map((wave) => ({
    wave,
    agents: agents.filter((a) => a.waveNumber === wave),
  }))

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <Link href="/reports" className="text-sm text-gray-500 hover:text-gray-300 block mb-2">
              ← Back to Reports
            </Link>
            <h1 className="text-2xl font-bold">Run: {run.clientName}</h1>
            <div className="flex items-center gap-3 mt-2">
              <StatusBadge status={run.status} />
              {run.queryTypes.map((qt) => (
                <span key={qt} className="px-2 py-0.5 rounded bg-gray-700 text-xs text-gray-300">{qt}</span>
              ))}
            </div>
          </div>
          {run.status === 'done' && (
            <Link
              href={`/runs/${run.id}/report`}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
            >
              View Report
            </Link>
          )}
        </div>

        {/* Halt state */}
        {run.status === 'halted_for_review' && haltErrors && (
          <div className="rounded-lg bg-red-900/20 border border-red-700 p-4 mb-6">
            <h3 className="text-red-400 font-semibold mb-2">Pipeline Halted — Critical Errors</h3>
            <pre className="text-xs text-red-300 overflow-auto">
              {JSON.stringify(haltErrors, null, 2)}
            </pre>
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => fetch(`/api/runs/${runId}/override`, { method: 'POST' }).then(() => window.location.reload())}
                className="rounded bg-amber-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600"
              >
                Override & Continue
              </button>
              <button
                onClick={() => fetch(`/api/runs/${runId}/cancel`, { method: 'POST' }).then(() => window.location.reload())}
                className="rounded bg-gray-700 px-3 py-1.5 text-xs font-medium text-gray-300 hover:bg-gray-600"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Cost summary */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="rounded-lg border border-gray-700 p-4">
            <div className="text-2xl font-bold">{(run.totalTokenIn + run.totalTokenOut).toLocaleString()}</div>
            <div className="text-xs text-gray-500">Total Tokens</div>
          </div>
          <div className="rounded-lg border border-gray-700 p-4">
            <div className="text-2xl font-bold">${run.totalCostUsd.toFixed(4)}</div>
            <div className="text-xs text-gray-500">Estimated Cost</div>
          </div>
          <div className="rounded-lg border border-gray-700 p-4">
            <div className="text-2xl font-bold">{agents.filter((a) => a.status === 'done').length}/{agents.length}</div>
            <div className="text-xs text-gray-500">Agents Complete</div>
          </div>
        </div>

        {/* Wave progress */}
        {waveGroups.map(({ wave, agents: waveAgents }) => (
          waveAgents.length > 0 && (
            <section key={wave} className="mb-6">
              <h3 className="text-sm font-medium text-gray-400 mb-2">Wave {wave}</h3>
              <div className="space-y-1">
                {waveAgents.map((agent) => (
                  <div
                    key={agent.agentId}
                    className={`flex items-center justify-between rounded px-3 py-2 text-sm ${
                      agent.status === 'running' ? 'bg-blue-900/20 border border-blue-800' :
                      agent.status === 'done' ? 'bg-gray-800/50' :
                      agent.status === 'failed' ? 'bg-red-900/20 border border-red-800' :
                      'bg-gray-800/30'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <AgentStatusIcon status={agent.status} />
                      <span className="font-mono">{agent.agentId}</span>
                    </div>
                    <div className="text-xs text-gray-500">
                      {agent.tokenIn != null && `${agent.tokenIn + (agent.tokenOut ?? 0)} tok`}
                      {agent.costUsd != null && ` • $${agent.costUsd.toFixed(4)}`}
                      {agent.error && <span className="text-red-400 ml-2">{agent.error}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )
        ))}
      </div>
    </main>
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
      {status === 'halted_for_review' ? 'halted' : status}
    </span>
  )
}

function AgentStatusIcon({ status }: { status: string }) {
  if (status === 'running') return <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
  if (status === 'done') return <span className="w-2 h-2 rounded-full bg-green-400" />
  if (status === 'failed') return <span className="w-2 h-2 rounded-full bg-red-400" />
  return <span className="w-2 h-2 rounded-full bg-gray-600" />
}
