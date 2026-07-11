/**
 * POST /api/duration-analysis/[id]/chat — Follow-up question to DA-3.
 *
 * Requires analysis status === 'done'. Builds a DA-3 prompt with full
 * conversation history and returns the model response synchronously.
 * Uses contextSummary instead of full da1Output when history depth > 2.
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { callLLM, readPromptFile } from '@/engine/llm'
import { extractCategoryData } from '@/engine/durationAnalysis/extractor'
import { extractJsonBlock } from '@/engine/durationAnalysis/agentJson'
import type { DA1Output, DA2Output, DA3Output, DurationCategory } from '@/lib/durationTypes'

const ChatSchema = z.object({
  message: z.string().min(1).max(2000),
  focusPeriod: z.string().max(200).optional(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = ChatSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }
  const { message, focusPeriod } = parsed.data

  const analysis = await prisma.durationAnalysis.findUnique({
    where: { id: params.id },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  })

  if (!analysis) {
    return NextResponse.json({ error: 'Analysis not found' }, { status: 404 })
  }
  if (analysis.status !== 'done') {
    return NextResponse.json({ error: 'Analysis not complete' }, { status: 400 })
  }

  const chart = await prisma.unifiedChart.findUniqueOrThrow({
    where: { id: analysis.unifiedChartId },
  })
  const da3Config = await prisma.modelConfig.findUniqueOrThrow({ where: { waveId: 'DA-3' } })

  // Persist user message
  const userMessage = await prisma.durationMessage.create({
    data: {
      analysisId: params.id,
      role: 'user',
      content: message,
      focusPeriod: focusPeriod ?? null,
    },
  })

  // Build conversation history including the new user message
  const allMessages = [...analysis.messages, userMessage]
  const conversationHistory = allMessages.map((m) => ({ role: m.role, content: m.content }))

  // Category-scoped chart data
  const categoryData = extractCategoryData(
    {
      planets: chart.planets,
      nakshatras: chart.nakshatras,
      relationships: chart.relationships,
      shadbala: chart.shadbala,
      divisionalCharts: chart.divisionalCharts,
      jaimini: chart.jaimini,
      ashtakavarga: chart.ashtakavarga,
      dashaTree: chart.dashaTree,
    },
    analysis.category as DurationCategory
  )

  const da1Output = analysis.da1Output as unknown as DA1Output
  const da2Output = analysis.da2Output as unknown as DA2Output | null
  const contextSummary = analysis.contextSummary ?? undefined

  // Build DA-3 prompt as stable prefix + volatile suffix.
  //
  // The prefix (chart data + DA-1 + DA-2 sections) is byte-identical across
  // chat turns, so it is passed as cachedPrefix — Anthropic prompt caching
  // reads it from cache on every follow-up instead of re-billing full input.
  // The one planned prefix change: at history depth > 2 the DA-1 section is
  // swapped for the compact contextSummary (one cache miss, then stable again).
  // Volatile parts (focus period, growing history, instructions) go last.
  const template = await readPromptFile('duration_da3_future_analyser.md')
  const historyDepth = analysis.messages.length

  const prefixParts: string[] = []
  prefixParts.push('--- CHART DATA ---')
  prefixParts.push(JSON.stringify(categoryData, null, 1))
  prefixParts.push('')

  if (contextSummary && historyDepth > 2) {
    prefixParts.push('--- CONTEXT SUMMARY ---')
    prefixParts.push(contextSummary)
  } else {
    prefixParts.push('--- DA-1 ANALYSIS ---')
    prefixParts.push(JSON.stringify(da1Output, null, 1))
  }

  if (da2Output) {
    prefixParts.push('')
    prefixParts.push('--- DA-2 VALIDATION ---')
    prefixParts.push(JSON.stringify(da2Output, null, 1))
  }
  prefixParts.push('')
  prefixParts.push('')
  const cachedPrefix = prefixParts.join('\n')

  const parts: string[] = []
  if (focusPeriod) {
    parts.push(`Focus period: ${focusPeriod}`)
    parts.push('')
  }
  if (conversationHistory.length > 0) {
    parts.push('--- CONVERSATION HISTORY ---')
    for (const msg of conversationHistory) {
      parts.push(`${msg.role === 'user' ? 'Practitioner' : 'Assistant'}: ${msg.content}`)
    }
  }

  parts.push('')
  parts.push('--- AGENT INSTRUCTIONS ---')
  parts.push(template)
  const prompt = parts.join('\n')

  // Follow-ups reuse the run's persisted provider/model selection (non-secret).
  // The API key was never persisted, so chat falls back to the env key.
  const response = await callLLM({
    model: analysis.overrideModel ?? da3Config.modelId,
    provider: (analysis.overrideProvider ?? da3Config.provider) as 'anthropic' | 'openai' | 'google',
    prompt,
    cachedPrefix,
    temperature: Number(da3Config.temperature),
    maxTokens: da3Config.maxTokens,
  })

  // Lenient parse (strips markdown fences / preamble); a synchronous chat
  // request skips the retry an async pipeline would do — fall back to raw text.
  let da3Output: DA3Output
  try {
    da3Output = JSON.parse(extractJsonBlock(response.content)) as DA3Output
  } catch {
    da3Output = { raw_content: response.content } as unknown as DA3Output
  }

  const answerText =
    typeof da3Output.answer === 'string' ? da3Output.answer : JSON.stringify(da3Output)

  const assistantMessage = await prisma.durationMessage.create({
    data: {
      analysisId: params.id,
      role: 'assistant',
      content: answerText,
      agentId: 'DA-3',
      tokenIn: response.tokenIn,
      tokenOut: response.tokenOut,
    },
  })

  // Roll the follow-up spend into the analysis-level totals (Requirement 5).
  await prisma.durationAnalysis.update({
    where: { id: params.id },
    data: {
      totalTokenIn: { increment: response.tokenIn },
      totalTokenOut: { increment: response.tokenOut },
      totalCostUsd: { increment: response.costUsd },
    },
  })

  return NextResponse.json({
    response: answerText,
    messageId: assistantMessage.id,
    tokenIn: response.tokenIn,
    tokenOut: response.tokenOut,
  })
}
