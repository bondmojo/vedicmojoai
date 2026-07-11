/**
 * tests/duration-pipeline-helpers.test.ts
 *
 * Covers the deterministic helpers added for pipeline resilience:
 *   - extractJsonBlock / parseAgentJson (fence + preamble salvage)
 *   - mergeDA1Outputs (batched DA-1 merge)
 *   - readPromptFile {{include:}} expansion (per-domain prompt composition)
 */
import { describe, it, expect } from 'vitest'
import { extractJsonBlock, parseAgentJson } from '@/engine/durationAnalysis/agentJson'
import { mergeDA1Outputs } from '@/engine/durationAnalysis'
import { isStale, STALE_RUN_MS } from '@/engine/durationAnalysis/reaper'
import { readPromptFile } from '@/engine/llm'
import type { DA1Output } from '@/lib/durationTypes'

// ─── extractJsonBlock ────────────────────────────────────────────────

describe('extractJsonBlock', () => {
  it('returns clean JSON untouched', () => {
    expect(extractJsonBlock('{"a": 1}')).toBe('{"a": 1}')
  })

  it('strips ```json fences', () => {
    expect(extractJsonBlock('```json\n{"a": 1}\n```')).toBe('{"a": 1}')
  })

  it('strips bare ``` fences', () => {
    expect(extractJsonBlock('```\n{"a": 1}\n```')).toBe('{"a": 1}')
  })

  it('salvages JSON surrounded by preamble and trailing text', () => {
    const content = 'Here is the analysis:\n{"a": {"b": 2}}\nHope this helps!'
    expect(JSON.parse(extractJsonBlock(content))).toEqual({ a: { b: 2 } })
  })

  it('parseAgentJson throws with the agent id on garbage', () => {
    expect(() => parseAgentJson('not json at all', 'DA-1')).toThrow('DA-1 returned invalid JSON')
  })
})

// ─── mergeDA1Outputs ─────────────────────────────────────────────────

const makeBatch = (label: string): DA1Output => ({
  agent_id: 'DA-1',
  category: 'career',
  date_range: { from: '2026-01-01', to: '2028-01-01' },
  period_analysis: [
    {
      md: { lord: 'Jupiter', start: '', end: '' },
      ad: { lord: 'Saturn', start: '', end: '' },
      pd: { lord: label, start: '', end: '' },
      analysis: label,
      key_factors: [],
      transit_factors: [],
      activated_yogas: [],
      intensity: 'medium',
      favorable: true,
      bahiranga: '',
      antaranga: '',
    },
  ],
  overall_trend: `trend-${label}`,
  peak_stress_periods: [{ period: `stress-${label}`, reason: '' }],
  peak_favorable_periods: [{ period: `fav-${label}`, reason: '' }],
})

describe('mergeDA1Outputs', () => {
  it('returns a single batch unchanged', () => {
    const batch = makeBatch('A')
    expect(mergeDA1Outputs([batch])).toBe(batch)
  })

  it('concatenates period_analysis in batch order and joins trends', () => {
    const merged = mergeDA1Outputs([makeBatch('A'), makeBatch('B')])
    expect(merged.period_analysis.map((p) => p.analysis)).toEqual(['A', 'B'])
    expect(merged.overall_trend).toBe('trend-A trend-B')
    expect(merged.peak_stress_periods.map((p) => p.period)).toEqual(['stress-A', 'stress-B'])
    expect(merged.peak_favorable_periods.map((p) => p.period)).toEqual(['fav-A', 'fav-B'])
  })

  it('throws on an empty batch list', () => {
    expect(() => mergeDA1Outputs([])).toThrow()
  })
})

// ─── isStale (stale-run reaper) ──────────────────────────────────────

describe('isStale', () => {
  const now = 1_700_000_000_000
  const fresh = new Date(now - 60_000)                 // 1 min ago
  const old = new Date(now - STALE_RUN_MS - 60_000)    // past the threshold

  it('flags queued/running runs with no recent heartbeat', () => {
    expect(isStale('queued', old, now)).toBe(true)
    expect(isStale('running', old, now)).toBe(true)
  })

  it('leaves active runs with a recent heartbeat alone', () => {
    expect(isStale('running', fresh, now)).toBe(false)
    expect(isStale('queued', fresh, now)).toBe(false)
  })

  it('never flags terminal or gated states, however old', () => {
    for (const status of ['done', 'failed', 'symptom_unmatched', 'cancelled']) {
      expect(isStale(status, old, now)).toBe(false)
    }
  })
})

// ─── {{include:}} prompt composition ─────────────────────────────────

describe('readPromptFile include expansion', () => {
  it('composes a per-domain DA-1 prompt from domain fragment + shared core', async () => {
    const prompt = await readPromptFile('duration_da1_career.md')
    expect(prompt).not.toContain('{{include:')
    // Domain fragment content
    expect(prompt).toContain('Domain Knowledge: Career')
    expect(prompt).toContain('Amatyakaraka')
    // Shared core content
    expect(prompt).toContain('OUTPUT FORMAT')
    expect(prompt).toContain('"agent_id": "DA-1"')
  })

  it('expands the shared fragment inside a wave2 prompt', async () => {
    const prompt = await readPromptFile('wave2_2f_career.md')
    expect(prompt).not.toContain('{{include:')
    expect(prompt).toContain('Domain Knowledge: Career')
    // Wave2's own content is preserved
    expect(prompt).toContain('Yogakaraka protection')
  })

  it('every registered per-domain prompt file exists and composes', async () => {
    const categories = ['health', 'career', 'wealth', 'marriage', 'property', 'cashflow']
    for (const category of categories) {
      const prompt = await readPromptFile(`duration_da1_${category}.md`)
      expect(prompt).not.toContain('{{include:')
      expect(prompt.toLowerCase()).toContain(`domain knowledge: ${category === 'cashflow' ? 'cashflow' : category}`)
      expect(prompt).toContain('OUTPUT FORMAT')
    }
  })
})
