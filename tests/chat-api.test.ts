/**
 * tests/chat-api.test.ts
 * Integration tests for POST /api/runs/[id]/chat route handler.
 *
 * Mocks: Prisma, callLLM.
 * Based on the actual route implementation at app/api/runs/[id]/chat/route.ts.
 *
 * Response shape: { response, messageId, tokenIn, tokenOut }
 * Error codes per route:
 *   400 — bad input / run not done / no 4C output
 *   404 — run not found
 *   500 — model config missing
 *   502 — LLM error
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mocks ─────────────────────────────────────────────────────────────
// vi.mock factories are hoisted; they must use only vi.fn() literals.

vi.mock('@/lib/db', () => ({
  prisma: {
    pipelineRun: {
      findUnique: vi.fn(),
    },
    runMessage: {
      create: vi.fn(),
    },
    modelConfig: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/engine/llm', () => ({
  callLLM: vi.fn(),
}))

// ── Import after mocks are registered ────────────────────────────────
import { POST } from '../app/api/runs/[id]/chat/route'
import { prisma } from '../lib/db'
import { callLLM } from '../engine/llm'

// ── Fixtures ──────────────────────────────────────────────────────────

const MOCK_SYNTHESIS = {
  scores: { wealth_potential: 72, health_resilience: 8 },
  executive_summary: 'Strong chart with good wealth yoga active until 2027.',
  lagna_lord_ruling: 'Jupiter rules the chart.',
  yogakaraka_status: 'Saturn as yogakaraka is well-placed.',
  health_analysis: {
    score: 8,
    primary_risks: ['Digestive issues'],
    protective_factors: ['Strong Sun'],
  },
  cashflow_timeline: [
    {
      period: '2025-2026',
      dasha: 'Jupiter-Venus',
      direction: 'positive',
      magnitude: 'High',
      key_driver: 'Career growth',
      caution: 'Avoid speculation',
    },
  ],
}

const MOCK_MODEL_CONFIG = {
  waveId: '1A',
  modelId: 'claude-3-haiku-20240307',
  provider: 'anthropic',
  temperature: 0.3,
  maxTokens: 8192,
  promptVersion: 'v1.0',
}

const MOCK_RUN_DONE = {
  id: 'run-001',
  status: 'done',
  chart: { clientName: 'Test Client', lagna: 'Cancer' },
  waveOutputs: [
    {
      agentId: '4C',
      waveNumber: 4,
      outputJson: MOCK_SYNTHESIS,
      status: 'done',
    },
  ],
  messages: [],
}

function makeRequest(body: Record<string, unknown>, runId = 'run-001'): NextRequest {
  return new NextRequest(`http://localhost:3000/api/runs/${runId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// ── Setup ──────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()

  ;(prisma.pipelineRun.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_RUN_DONE)
  ;(prisma.modelConfig.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_MODEL_CONFIG)
  ;(callLLM as ReturnType<typeof vi.fn>).mockResolvedValue({
    content: 'Jupiter in own sign gives excellent results for wealth.',
    tokenIn: 200,
    tokenOut: 80,
    costUsd: 0.002,
  })
  ;(prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
    (ops: Promise<unknown>[]) => Promise.all(ops)
  )
  ;(prisma.runMessage.create as ReturnType<typeof vi.fn>).mockResolvedValue({
    id: 'msg-001',
    role: 'assistant',
    content: 'Jupiter in own sign gives excellent results for wealth.',
  })
})

// ── Happy path ─────────────────────────────────────────────────────────

describe('POST /api/runs/[id]/chat — happy path', () => {
  it('should return 200 with response and token counts', async () => {
    const req = makeRequest({ message: 'What does Jupiter placement mean?' })
    const res = await POST(req, { params: { id: 'run-001' } })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('response')
    expect(body).toHaveProperty('tokenIn')
    expect(body).toHaveProperty('tokenOut')
  })

  it('should return the LLM response as the response field', async () => {
    const req = makeRequest({ message: 'Tell me about wealth.' })
    const res = await POST(req, { params: { id: 'run-001' } })
    const body = await res.json()

    expect(body.response).toBe('Jupiter in own sign gives excellent results for wealth.')
  })

  it('should return a messageId in the response', async () => {
    const req = makeRequest({ message: 'What is my strongest planet?' })
    const res = await POST(req, { params: { id: 'run-001' } })
    const body = await res.json()

    expect(body).toHaveProperty('messageId')
  })

  it('should persist both user and assistant RunMessages via $transaction', async () => {
    const req = makeRequest({ message: 'Explain the yogas.' })
    await POST(req, { params: { id: 'run-001' } })

    expect(prisma.$transaction).toHaveBeenCalledOnce()
    const transactionArgs = (prisma.$transaction as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(Array.isArray(transactionArgs)).toBe(true)
    expect(transactionArgs).toHaveLength(2)
  })

  it('should call callLLM exactly once per request', async () => {
    const req = makeRequest({ message: 'Any question.' })
    await POST(req, { params: { id: 'run-001' } })

    expect(callLLM).toHaveBeenCalledOnce()
  })

  it('should call callLLM with a prompt containing the user message', async () => {
    const req = makeRequest({ message: 'What are my wealth prospects?' })
    await POST(req, { params: { id: 'run-001' } })

    const callArgs = (callLLM as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(callArgs.prompt).toContain('What are my wealth prospects?')
  })

  it('should call callLLM with a prompt containing synthesis context (executive summary)', async () => {
    const req = makeRequest({ message: 'Tell me about wealth.' })
    await POST(req, { params: { id: 'run-001' } })

    const callArgs = (callLLM as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(callArgs.prompt).toContain('Strong chart with good wealth yoga active until 2027')
  })

  it('should call callLLM with model and provider from modelConfig', async () => {
    const req = makeRequest({ message: 'Any question.' })
    await POST(req, { params: { id: 'run-001' } })

    const callArgs = (callLLM as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(callArgs.model).toBe('claude-3-haiku-20240307')
    expect(callArgs.provider).toBe('anthropic')
  })

  it('should return tokenIn from the LLM response', async () => {
    const req = makeRequest({ message: 'Hello.' })
    const res = await POST(req, { params: { id: 'run-001' } })
    const body = await res.json()

    expect(body.tokenIn).toBe(200)
  })

  it('should return tokenOut from the LLM response', async () => {
    const req = makeRequest({ message: 'Hello.' })
    const res = await POST(req, { params: { id: 'run-001' } })
    const body = await res.json()

    expect(body.tokenOut).toBe(80)
  })
})

// ── Conversation history threading ────────────────────────────────────

describe('POST /api/runs/[id]/chat — history threading', () => {
  it('should include prior user and assistant messages in the LLM prompt', async () => {
    ;(prisma.pipelineRun.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...MOCK_RUN_DONE,
      messages: [
        { role: 'user', content: 'Prior question about health.' },
        { role: 'assistant', content: 'Prior answer about health.' },
      ],
    })

    const req = makeRequest({ message: 'Follow-up question.' })
    await POST(req, { params: { id: 'run-001' } })

    const callArgs = (callLLM as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(callArgs.prompt).toContain('Prior question about health')
    expect(callArgs.prompt).toContain('Prior answer about health')
    expect(callArgs.prompt).toContain('Follow-up question')
  })

  it('should work correctly with no prior messages', async () => {
    ;(prisma.pipelineRun.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...MOCK_RUN_DONE,
      messages: [],
    })

    const req = makeRequest({ message: 'First question.' })
    const res = await POST(req, { params: { id: 'run-001' } })

    expect(res.status).toBe(200)
    expect(callLLM).toHaveBeenCalledOnce()
  })
})

// ── Synthesis context extraction ───────────────────────────────────────

describe('POST /api/runs/[id]/chat — synthesis context in prompt', () => {
  it('should include HEALTH ANALYSIS block in prompt context', async () => {
    const req = makeRequest({ message: 'What about my health?' })
    await POST(req, { params: { id: 'run-001' } })

    const callArgs = (callLLM as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(callArgs.prompt).toContain('HEALTH ANALYSIS')
  })

  it('should include CASHFLOW TIMELINE block in prompt context', async () => {
    const req = makeRequest({ message: 'What are my financial timelines?' })
    await POST(req, { params: { id: 'run-001' } })

    const callArgs = (callLLM as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(callArgs.prompt).toContain('CASHFLOW TIMELINE')
    expect(callArgs.prompt).toContain('Jupiter-Venus')
  })

  it('should include SCORES block in prompt context', async () => {
    const req = makeRequest({ message: 'What are my scores?' })
    await POST(req, { params: { id: 'run-001' } })

    const callArgs = (callLLM as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(callArgs.prompt).toContain('SCORES')
    expect(callArgs.prompt).toContain('72')
  })

  it('should include lagna and client name in the system prompt', async () => {
    const req = makeRequest({ message: 'Any question.' })
    await POST(req, { params: { id: 'run-001' } })

    const callArgs = (callLLM as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(callArgs.prompt).toContain('Test Client')
    expect(callArgs.prompt).toContain('Cancer')
  })
})

// ── Error handling ─────────────────────────────────────────────────────

describe('POST /api/runs/[id]/chat — error handling', () => {
  it('should return 404 if run does not exist', async () => {
    ;(prisma.pipelineRun.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)

    const req = makeRequest({ message: 'Hello?' }, 'nonexistent')
    const res = await POST(req, { params: { id: 'nonexistent' } })

    expect(res.status).toBe(404)
  })

  it('should return 400 if run is not done (status=running)', async () => {
    ;(prisma.pipelineRun.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...MOCK_RUN_DONE,
      status: 'running',
    })

    const req = makeRequest({ message: 'Hello?' })
    const res = await POST(req, { params: { id: 'run-001' } })

    expect(res.status).toBe(400)
  })

  it('should return 400 if run status is queued', async () => {
    ;(prisma.pipelineRun.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...MOCK_RUN_DONE,
      status: 'queued',
    })

    const req = makeRequest({ message: 'Hello?' })
    const res = await POST(req, { params: { id: 'run-001' } })

    expect(res.status).toBe(400)
  })

  it('should return 400 if run has no 4C wave output', async () => {
    ;(prisma.pipelineRun.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...MOCK_RUN_DONE,
      waveOutputs: [],
    })

    const req = makeRequest({ message: 'Hello?' })
    const res = await POST(req, { params: { id: 'run-001' } })

    expect(res.status).toBe(400)
  })

  it('should return 400 if message field is missing', async () => {
    const req = makeRequest({})
    const res = await POST(req, { params: { id: 'run-001' } })

    expect(res.status).toBe(400)
  })

  it('should return 400 if message is empty string', async () => {
    const req = makeRequest({ message: '' })
    const res = await POST(req, { params: { id: 'run-001' } })

    expect(res.status).toBe(400)
  })

  it('should return 400 if request body is not valid JSON', async () => {
    const req = new NextRequest('http://localhost:3000/api/runs/run-001/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-valid-json{{{',
    })
    const res = await POST(req, { params: { id: 'run-001' } })

    expect(res.status).toBe(400)
  })

  it('should return 500 if modelConfig is not found', async () => {
    ;(prisma.modelConfig.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)

    const req = makeRequest({ message: 'Hello?' })
    const res = await POST(req, { params: { id: 'run-001' } })

    expect(res.status).toBe(500)
  })

  it('should return 502 if callLLM throws', async () => {
    ;(callLLM as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('API timeout'))

    const req = makeRequest({ message: 'Hello?' })
    const res = await POST(req, { params: { id: 'run-001' } })

    expect(res.status).toBe(502)
  })

  it('should return JSON body with error field on 404', async () => {
    ;(prisma.pipelineRun.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)

    const req = makeRequest({ message: 'Hello?' }, 'missing')
    const res = await POST(req, { params: { id: 'missing' } })
    const body = await res.json()

    expect(body).toHaveProperty('error')
    expect(typeof body.error).toBe('string')
  })

  it('should return JSON body with error field on 400 for bad input', async () => {
    const req = makeRequest({ message: '' })
    const res = await POST(req, { params: { id: 'run-001' } })
    const body = await res.json()

    expect(body).toHaveProperty('error')
  })
})
