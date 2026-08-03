/**
 * GET /api/duration-analysis/[id]/events — SSE stream for pipeline progress.
 *
 * Polls DurationAnalysis every 2 seconds and emits events based on DB state
 * transitions. Mirrors the pattern used in /api/runs/[id]/events.
 * Closes on terminal states: done | failed | symptom_unmatched.
 * Max poll duration: 10 minutes.
 */
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { isStale, STALE_RUN_MESSAGE } from '@/engine/durationAnalysis/reaper'
import { resolveRequestUser } from '@/lib/auth'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await resolveRequestUser(request)
  if (!userId) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { id } = params

  // Verify analysis exists and is owned by the caller before opening stream
  const initial = await prisma.durationAnalysis.findUnique({
    where: { id },
    select: { id: true, status: true, unifiedChart: { select: { userId: true } } },
  })

  if (!initial || initial.unifiedChart.userId !== userId) {
    return new Response('Analysis not found', { status: 404 })
  }

  const encoder = new TextEncoder()
  let closed = false

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: string, data: Record<string, unknown>) => {
        if (closed) return
        try {
          const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
          controller.enqueue(encoder.encode(payload))
        } catch {
          // Controller already closed — ignore
          closed = true
        }
      }

      const closeStream = () => {
        if (closed) return
        closed = true
        try {
          controller.close()
        } catch {
          // Already closed — ignore
        }
      }

      // Emit connected immediately
      sendEvent('connected', { analysisId: id, status: initial.status, timestamp: new Date().toISOString() })

      // Track reported events to avoid duplicates
      const reportedEvents = new Set<string>()

      const MAX_DURATION_MS = 10 * 60 * 1000 // 10 minutes
      const startTime = Date.now()

      const pollInterval = setInterval(async () => {
        if (closed) {
          clearInterval(pollInterval)
          return
        }

        // Enforce max poll duration
        if (Date.now() - startTime > MAX_DURATION_MS) {
          clearInterval(pollInterval)
          closeStream()
          return
        }

        try {
          const analysis = await prisma.durationAnalysis.findUnique({
            where: { id },
            select: {
              status: true,
              symptoms: true,
              foundationOutput: true,
              da1Output: true,
              da2Output: true,
              da3Output: true,
              errorMessage: true,
              totalTokenIn: true,
              totalTokenOut: true,
              totalCostUsd: true,
              updatedAt: true,
            },
          })

          if (!analysis) {
            clearInterval(pollInterval)
            closeStream()
            return
          }

          // Stale-run reaper: no heartbeat for 10 minutes ⇒ the pipeline
          // process died. Mark failed and surface it instead of spinning.
          if (isStale(analysis.status, analysis.updatedAt)) {
            await prisma.durationAnalysis.updateMany({
              where: { id, status: { in: ['queued', 'running'] } },
              data: { status: 'failed', errorMessage: STALE_RUN_MESSAGE },
            })
            sendEvent('agent_error', {
              error: STALE_RUN_MESSAGE,
              timestamp: new Date().toISOString(),
            })
            clearInterval(pollInterval)
            closeStream()
            return
          }

          // Cancelled (terminal) — practitioner cancelled via /cancel.
          if (analysis.status === 'cancelled' && !reportedEvents.has('run_cancelled')) {
            reportedEvents.add('run_cancelled')
            sendEvent('run_cancelled', { timestamp: new Date().toISOString() })
            clearInterval(pollInterval)
            closeStream()
            return
          }

          const tokenPayload = {
            tokenIn: analysis.totalTokenIn,
            tokenOut: analysis.totalTokenOut,
            costUsd: Number(analysis.totalCostUsd),
          }
          const hasSymptoms = Boolean(analysis.symptoms)

          // ── agent_start derivation (Req 6.2) ──
          // FOUNDATION runs first (Track 2): natal foundation sub-agents before DA-1.
          if (analysis.status === 'running' && !reportedEvents.has('FOUNDATION_start')) {
            reportedEvents.add('FOUNDATION_start')
            sendEvent('agent_start', { agent_id: 'FOUNDATION', timestamp: new Date().toISOString() })
          }
          // FOUNDATION completes once its output is persisted (present even when empty).
          if (analysis.foundationOutput && !reportedEvents.has('FOUNDATION_complete')) {
            reportedEvents.add('FOUNDATION_complete')
            sendEvent('agent_complete', { agent_id: 'FOUNDATION', ...tokenPayload, timestamp: new Date().toISOString() })
          }
          // DA-1 starts once foundation is done (foundationOutput set); da1Output is a
          // fallback so a domain with no foundation stage still surfaces DA-1_start.
          if (
            analysis.status === 'running' &&
            (analysis.foundationOutput || analysis.da1Output) &&
            !reportedEvents.has('DA-1_start')
          ) {
            reportedEvents.add('DA-1_start')
            sendEvent('agent_start', { agent_id: 'DA-1', timestamp: new Date().toISOString() })
          }
          // DA-2 starts once DA-1 is done, symptoms exist, and DA-2 hasn't produced output.
          if (
            analysis.da1Output && hasSymptoms && !analysis.da2Output &&
            analysis.status === 'running' && !reportedEvents.has('DA-2_start')
          ) {
            reportedEvents.add('DA-2_start')
            sendEvent('agent_start', { agent_id: 'DA-2', timestamp: new Date().toISOString() })
          }
          // DA-3 starts once DA-1 is done, DA-2 is done or skipped, and DA-3 has no output yet.
          if (
            analysis.da1Output && !analysis.da3Output && analysis.status === 'running' &&
            (!hasSymptoms || analysis.da2Output) && !reportedEvents.has('DA-3_start')
          ) {
            reportedEvents.add('DA-3_start')
            sendEvent('agent_start', { agent_id: 'DA-3', timestamp: new Date().toISOString() })
          }

          // DA-1 complete
          if (analysis.da1Output && !reportedEvents.has('DA-1_complete')) {
            reportedEvents.add('DA-1_complete')
            sendEvent('agent_complete', { agent_id: 'DA-1', ...tokenPayload, timestamp: new Date().toISOString() })
          }

          // DA-2 complete
          if (analysis.da2Output && !reportedEvents.has('DA-2_complete')) {
            reportedEvents.add('DA-2_complete')
            sendEvent('agent_complete', { agent_id: 'DA-2', ...tokenPayload, timestamp: new Date().toISOString() })
          }

          // Symptom gate (terminal)
          if (analysis.status === 'symptom_unmatched' && !reportedEvents.has('symptom_gate')) {
            reportedEvents.add('symptom_gate')
            sendEvent('symptom_gate', {
              da2Output: analysis.da2Output,
              actions: ['override_continue', 'cancel'],
              timestamp: new Date().toISOString(),
            })
            clearInterval(pollInterval)
            closeStream()
            return
          }

          // DA-3 complete
          if (analysis.da3Output && !reportedEvents.has('DA-3_complete')) {
            reportedEvents.add('DA-3_complete')
            sendEvent('agent_complete', { agent_id: 'DA-3', ...tokenPayload, timestamp: new Date().toISOString() })
          }

          // Done (terminal)
          if (analysis.status === 'done' && !reportedEvents.has('run_complete')) {
            reportedEvents.add('run_complete')
            sendEvent('run_complete', {
              totalTokenIn: analysis.totalTokenIn,
              totalTokenOut: analysis.totalTokenOut,
              totalCostUsd: Number(analysis.totalCostUsd),
              timestamp: new Date().toISOString(),
            })
            clearInterval(pollInterval)
            closeStream()
            return
          }

          // Failed (terminal)
          if (analysis.status === 'failed' && !reportedEvents.has('failed')) {
            reportedEvents.add('failed')
            sendEvent('agent_error', {
              error: analysis.errorMessage ?? 'Analysis pipeline failed',
              timestamp: new Date().toISOString(),
            })
            clearInterval(pollInterval)
            closeStream()
            return
          }
        } catch (error) {
          console.error('[duration-analysis/events] poll error:', error)
          clearInterval(pollInterval)
          closeStream()
        }
      }, 2000)
    },

    cancel() {
      // Client disconnected — stop polling
      closed = true
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
