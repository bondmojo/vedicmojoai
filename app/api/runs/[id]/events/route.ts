/**
 * API: /api/runs/[id]/events
 * GET — SSE stream of pipeline progress events
 *
 * The client opens this connection after POST /api/runs returns 202.
 * Events are polled from the DB (wave_output status changes).
 * Connection closes when run reaches a terminal state.
 */

import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { resolveRequestUser } from '@/lib/auth'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await resolveRequestUser(request)
  if (!userId) {
    return new Response('Unauthorized', { status: 401 })
  }

  const runId = params.id

  // Verify run exists and is owned by the caller
  const run = await prisma.pipelineRun.findUnique({
    where: { id: runId },
    select: { id: true, status: true, unifiedChart: { select: { userId: true } } },
  })

  if (!run || run.unifiedChart?.userId !== userId) {
    return new Response('Run not found', { status: 404 })
  }

  // Create SSE stream
  const encoder = new TextEncoder()
  let closed = false

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: Record<string, unknown>) => {
        if (closed) return
        try {
          const payload = `data: ${JSON.stringify(data)}\n\n`
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

      // Track which agents we've already reported on
      const reportedAgents = new Set<string>()

      // Poll loop — check DB for updates every 2 seconds
      const pollInterval = setInterval(async () => {
        if (closed) {
          clearInterval(pollInterval)
          return
        }

        try {
          // Get current run status
          const currentRun = await prisma.pipelineRun.findUnique({
            where: { id: runId },
            select: { status: true, haltReason: true, totalTokenIn: true, totalTokenOut: true, totalCostUsd: true },
          })

          if (!currentRun) {
            clearInterval(pollInterval)
            closeStream()
            return
          }

          // Get wave outputs to report progress
          const outputs = await prisma.waveOutput.findMany({
            where: { runId },
            orderBy: { startedAt: 'asc' },
            select: {
              agentId: true,
              waveNumber: true,
              status: true,
              tokenIn: true,
              tokenOut: true,
              costUsd: true,
              errorMessage: true,
            },
          })

          // Emit events for newly completed/failed agents
          for (const output of outputs) {
            const key = `${output.agentId}_${output.status}`
            if (!reportedAgents.has(key)) {
              reportedAgents.add(key)

              if (output.status === 'done') {
                sendEvent({
                  type: 'agent_complete',
                  agent_id: output.agentId,
                  wave_number: output.waveNumber,
                  tokenIn: output.tokenIn,
                  tokenOut: output.tokenOut,
                  costUsd: Number(output.costUsd),
                  timestamp: new Date().toISOString(),
                })
              } else if (output.status === 'failed') {
                sendEvent({
                  type: 'agent_error',
                  agent_id: output.agentId,
                  wave_number: output.waveNumber,
                  error: output.errorMessage,
                  timestamp: new Date().toISOString(),
                })
              } else if (output.status === 'running') {
                sendEvent({
                  type: 'agent_start',
                  agent_id: output.agentId,
                  wave_number: output.waveNumber,
                  timestamp: new Date().toISOString(),
                })
              }
            }
          }

          // Check for terminal states
          if (currentRun.status === 'done') {
            sendEvent({
              type: 'run_complete',
              totalTokenIn: currentRun.totalTokenIn,
              totalTokenOut: currentRun.totalTokenOut,
              totalCostUsd: Number(currentRun.totalCostUsd),
              timestamp: new Date().toISOString(),
            })
            clearInterval(pollInterval)
            closeStream()
          } else if (currentRun.status === 'failed') {
            sendEvent({
              type: 'run_failed',
              timestamp: new Date().toISOString(),
            })
            clearInterval(pollInterval)
            closeStream()
          } else if (currentRun.status === 'halted_for_review') {
            sendEvent({
              type: 'critical_error',
              errors: currentRun.haltReason,
              actions: ['override_continue', 'rerun_from_wave', 'cancel'],
              timestamp: new Date().toISOString(),
            })
            clearInterval(pollInterval)
            closeStream()
          }
        } catch (error) {
          console.error('SSE poll error:', error)
          clearInterval(pollInterval)
          closeStream()
        }
      }, 2000)

      // Send initial connection event
      sendEvent({
        type: 'connected',
        runId,
        status: run.status,
        timestamp: new Date().toISOString(),
      })
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
