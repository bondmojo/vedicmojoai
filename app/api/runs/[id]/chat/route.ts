/**
 * API: /api/runs/[id]/chat
 * POST — Accept a practitioner question, build context from 4C synthesis
 *         and RunMessage history, call LLM, persist both turns, return response.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { callLLM } from '@/engine/llm'

// ─── Input validation ───────────────────────────────────────────────

const ChatInputSchema = z.object({
  message: z.string().min(1).max(2000),
})

// ─── Synthesis context builder ──────────────────────────────────────

/**
 * Converts the 4C synthesis JSON into a readable text block for the system prompt.
 * Uses the real 4C schema keys (not the fictional domain_findings).
 * Truncates the full JSON to 4000 chars as a safety cap.
 */
function buildSynthesisContext(outputJson: unknown): string {
  if (!outputJson || typeof outputJson !== 'object') {
    return 'No synthesis data available.'
  }

  const s = outputJson as Record<string, unknown>
  const lines: string[] = []

  // Executive summary
  if (typeof s.executive_summary === 'string') {
    lines.push('EXECUTIVE SUMMARY:')
    lines.push(s.executive_summary)
    lines.push('')
  }

  // Scores
  if (s.scores && typeof s.scores === 'object') {
    const sc = s.scores as Record<string, unknown>
    lines.push('SCORES:')
    if (sc.wealth_potential != null) lines.push(`  Wealth Potential: ${sc.wealth_potential}/100`)
    if (sc.wealth_retention != null) lines.push(`  Wealth Retention: ${sc.wealth_retention}/100`)
    if (sc.financial_freedom_pct != null) lines.push(`  Financial Freedom: ${sc.financial_freedom_pct}%`)
    if (sc.health_resilience != null) lines.push(`  Health Resilience: ${sc.health_resilience}/10`)
    lines.push('')
  }

  // Lagna / yogakaraka
  if (typeof s.lagna_lord_ruling === 'string') {
    lines.push('LAGNA LORD:')
    lines.push(s.lagna_lord_ruling)
    lines.push('')
  }
  if (typeof s.yogakaraka_status === 'string') {
    lines.push('YOGAKARAKA STATUS:')
    lines.push(s.yogakaraka_status)
    lines.push('')
  }

  // Atma Karaka / Sade Sati
  if (typeof s.atma_karaka_theme === 'string') {
    lines.push('ATMA KARAKA THEME:')
    lines.push(s.atma_karaka_theme)
    lines.push('')
  }
  if (typeof s.sade_sati_impact === 'string') {
    lines.push('SADE SATI IMPACT:')
    lines.push(s.sade_sati_impact)
    lines.push('')
  }

  // Health analysis (real schema key)
  if (s.health_analysis && typeof s.health_analysis === 'object') {
    const h = s.health_analysis as Record<string, unknown>
    lines.push('HEALTH ANALYSIS:')
    if (h.score != null) lines.push(`  Score: ${h.score}/10`)
    if (Array.isArray(h.primary_risks) && h.primary_risks.length > 0) {
      lines.push(`  Primary Risks: ${(h.primary_risks as string[]).join('; ')}`)
    }
    if (Array.isArray(h.protective_factors) && h.protective_factors.length > 0) {
      lines.push(`  Protective Factors: ${(h.protective_factors as string[]).join('; ')}`)
    }
    lines.push('')
  }

  // Financial freedom (real schema key)
  if (s.financial_freedom && typeof s.financial_freedom === 'object') {
    const ff = s.financial_freedom as Record<string, unknown>
    lines.push('FINANCIAL FREEDOM:')
    if (ff.score_pct != null) lines.push(`  Score: ${ff.score_pct}%`)
    if (ff.earliest_window != null) lines.push(`  Earliest Window: ${ff.earliest_window}`)
    if (ff.primary_enabler != null) lines.push(`  Primary Enabler: ${ff.primary_enabler}`)
    if (ff.primary_risk != null) lines.push(`  Primary Risk: ${ff.primary_risk}`)
    lines.push('')
  }

  // Property analysis (real schema key)
  if (s.property_analysis && typeof s.property_analysis === 'object') {
    const p = s.property_analysis as Record<string, unknown>
    lines.push('PROPERTY ANALYSIS:')
    if (p.d4_assessment != null) lines.push(`  D4 Assessment: ${p.d4_assessment}`)
    if (Array.isArray(p.best_acquisition_periods) && p.best_acquisition_periods.length > 0) {
      lines.push(`  Best Acquisition Periods: ${(p.best_acquisition_periods as string[]).join(', ')}`)
    }
    lines.push('')
  }

  // Active yogas
  if (Array.isArray(s.yoga_registry) && s.yoga_registry.length > 0) {
    const activeYogas = (s.yoga_registry as Record<string, unknown>[]).filter((y) => y.active)
    if (activeYogas.length > 0) {
      lines.push('ACTIVE YOGAS:')
      for (const y of activeYogas) {
        const parts = [`  ${y.name ?? 'Unknown'}`]
        if (y.strength) parts.push(`(${y.strength})`)
        if (Array.isArray(y.houses) && y.houses.length > 0) parts.push(`Houses: ${(y.houses as number[]).join(',')}`)
        if (Array.isArray(y.planets) && y.planets.length > 0) parts.push(`Planets: ${(y.planets as string[]).join(',')}`)
        lines.push(parts.join(' '))
        if (y.notes) lines.push(`    Notes: ${y.notes}`)
      }
      lines.push('')
    }
  }

  // Planet hierarchy (top entries)
  if (Array.isArray(s.planet_hierarchy) && s.planet_hierarchy.length > 0) {
    lines.push('PLANET HIERARCHY:')
    for (const p of s.planet_hierarchy as Record<string, unknown>[]) {
      lines.push(`  ${p.name ?? '?'}: ${p.sign ?? ''} H${p.house ?? ''}, ${p.dignity ?? ''}, Score: ${p.net_score ?? ''}`)
    }
    lines.push('')
  }

  // Cashflow timeline
  if (Array.isArray(s.cashflow_timeline) && s.cashflow_timeline.length > 0) {
    lines.push('CASHFLOW TIMELINE:')
    for (const c of s.cashflow_timeline as Record<string, unknown>[]) {
      lines.push(`  ${c.period ?? ''} (${c.dasha ?? ''}): ${c.direction ?? ''} ${c.magnitude ?? ''} — Driver: ${c.key_driver ?? ''}`)
      if (c.caution) lines.push(`    Caution: ${c.caution}`)
    }
    lines.push('')
  }

  // Priority alerts
  if (Array.isArray(s.priority_alerts) && s.priority_alerts.length > 0) {
    lines.push('PRIORITY ALERTS:')
    for (const alert of s.priority_alerts as string[]) {
      lines.push(`  - ${alert}`)
    }
    lines.push('')
  }

  // Raw content fallback
  if (typeof s.raw_content === 'string') {
    const truncated = s.raw_content.slice(0, 4000)
    return `RAW SYNTHESIS OUTPUT:\n${truncated}${s.raw_content.length > 4000 ? '\n[... truncated]' : ''}`
  }

  const result = lines.join('\n')
  // Safety cap: if the serialized context exceeds 4000 chars, truncate
  if (result.length > 4000) {
    return result.slice(0, 4000) + '\n[... context truncated for brevity]'
  }
  return result
}

// ─── POST handler ───────────────────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // 1. Parse and validate input
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = ChatInputSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const { message } = parsed.data
  const runId = params.id

  // 2. Load the run with 4C synthesis and message history
  const run = await prisma.pipelineRun.findUnique({
    where: { id: runId },
    select: {
      id: true,
      status: true,
      chart: {
        select: { clientName: true, lagna: true },
      },
      waveOutputs: {
        where: { agentId: '4C', status: 'done' },
        select: { outputJson: true },
        take: 1,
      },
      messages: {
        orderBy: { createdAt: 'asc' },
        select: { role: true, content: true },
      },
    },
  })

  if (!run) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 })
  }

  if (run.status !== 'done') {
    return NextResponse.json(
      { error: 'Analysis not complete. Chat is only available after the run finishes.' },
      { status: 400 }
    )
  }

  const synthesis4C = run.waveOutputs[0]
  if (!synthesis4C?.outputJson) {
    return NextResponse.json(
      { error: 'No synthesis available for chat. The 4C agent has not completed.' },
      { status: 400 }
    )
  }

  // 3. Build system prompt
  const clientName = run.chart.clientName
  const lagna = run.chart.lagna
  const synthesisContext = buildSynthesisContext(synthesis4C.outputJson)

  const systemPrompt = `You are a senior Vedic astrology consultant assistant. You have just completed a full analysis for ${clientName} (Lagna: ${lagna}). The practitioner may now ask follow-up questions about the analysis.

=== ANALYSIS SYNTHESIS ===

${synthesisContext}

=== INSTRUCTIONS ===
- Answer ONLY based on the analysis above. Do not invent planetary positions or readings not in the synthesis.
- If asked about something not covered, say "That domain was not part of this analysis."
- Be concise and direct. Use plain English where possible; use Jyotish terms when they add precision.
- Do not repeat the full synthesis. Refer to specific findings when relevant.
- If the practitioner asks to re-run or re-analyze, tell them to use the Analyze button on the chart page.
- Always ground your answer in specific dasha periods, planets, or yogas mentioned in the synthesis above.`

  // 4. Build full prompt: system + conversation history + new question
  const historyLines: string[] = []
  for (const msg of run.messages) {
    const roleName = msg.role === 'user' ? 'Practitioner' : 'Assistant'
    historyLines.push(`${roleName}: ${msg.content}`)
  }

  const fullPrompt = [
    systemPrompt,
    '',
    historyLines.length > 0 ? '=== CONVERSATION HISTORY ===' : '',
    ...historyLines,
    '',
    '=== NEW QUESTION ===',
    `Practitioner: ${message}`,
    '',
    'Assistant:',
  ]
    .filter((line) => line !== undefined)
    .join('\n')

  // 5. Get model config — use 1A (Haiku) for chat: fast and cost-effective
  const modelConfig = await prisma.modelConfig.findUnique({
    where: { waveId: '1A' },
  })

  if (!modelConfig) {
    return NextResponse.json(
      { error: 'Model configuration not found. Run db:seed to populate model_config.' },
      { status: 500 }
    )
  }

  // 6. Call LLM
  let llmResponse: Awaited<ReturnType<typeof callLLM>>
  try {
    llmResponse = await callLLM({
      model: modelConfig.modelId,
      provider: modelConfig.provider as 'anthropic' | 'openai' | 'google',
      prompt: fullPrompt,
      temperature: 0.5,
      maxTokens: 1024,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[chat] LLM call failed:', msg)
    return NextResponse.json(
      { error: 'LLM call failed', details: msg },
      { status: 502 }
    )
  }

  const assistantContent = llmResponse.content.trim()

  // 7. Persist both turns in RunMessage
  const [_userMsg, assistantMsg] = await prisma.$transaction([
    prisma.runMessage.create({
      data: {
        runId,
        role: 'user',
        content: message,
        agentId: 'chat',
      },
    }),
    prisma.runMessage.create({
      data: {
        runId,
        role: 'assistant',
        content: assistantContent,
        agentId: 'chat',
      },
    }),
  ])

  // 8. Return response
  return NextResponse.json({
    response: assistantContent,
    messageId: assistantMsg.id,
    tokenIn: llmResponse.tokenIn,
    tokenOut: llmResponse.tokenOut,
  })
}
