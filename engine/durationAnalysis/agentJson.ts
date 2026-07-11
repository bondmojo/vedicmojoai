/**
 * engine/durationAnalysis/agentJson.ts — resilient JSON handling for agent calls.
 *
 * LLMs occasionally wrap JSON in markdown fences or add preamble despite
 * instructions. extractJsonBlock() salvages the JSON payload; callAgentJson()
 * wraps callLLM with lenient parsing plus ONE retry (with an explicit
 * correction instruction) before failing the pipeline.
 *
 * Token/cost totals returned include the retry call when one happened.
 */

import { callLLM } from '@/engine/llm'

// ─── JSON extraction ─────────────────────────────────────────────────

/**
 * Extracts the JSON payload from an LLM response:
 *  1. a fenced ```json block anywhere in the content, else
 *  2. the substring from the first '{' to the last '}', else
 *  3. the trimmed content as-is (parse will fail and be handled upstream).
 */
export function extractJsonBlock(content: string): string {
  const trimmed = content.trim()

  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (fence && fence[1].trim().length > 0) {
    return fence[1].trim()
  }

  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1)
  }

  return trimmed
}

/**
 * Lenient parse: extract the JSON block, then JSON.parse.
 * Throws with the agent id on failure — callers decide whether to retry.
 */
export function parseAgentJson<T>(content: string, agentId: string): T {
  try {
    return JSON.parse(extractJsonBlock(content)) as T
  } catch {
    throw new Error(`${agentId} returned invalid JSON`)
  }
}

// ─── Call + parse with one retry ─────────────────────────────────────

export interface AgentCallParams {
  model: string
  provider: 'anthropic' | 'openai' | 'google'
  prompt: string
  temperature: number
  maxTokens: number
  /** Stable prefix for prompt caching — see LLMCallOptions.cachedPrefix. */
  cachedPrefix?: string
  /** Per-call API key override — see LLMCallOptions.apiKey. Never persisted. */
  apiKey?: string
}

export interface AgentJsonResult<T> {
  output: T
  tokenIn: number
  tokenOut: number
  costUsd: number
}

const RETRY_SUFFIX =
  '\n\nIMPORTANT: Your previous response was not valid JSON. ' +
  'Respond again with ONLY the JSON object — no markdown fences, no preamble, no trailing text.'

/**
 * Calls the LLM and parses the response as JSON. On a parse failure, retries
 * ONCE with an explicit correction instruction appended to the prompt. Throws
 * (fail-fast, pipeline → status=failed) if the retry is also malformed.
 * Token totals cover both calls when a retry happened.
 */
export async function callAgentJson<T>(
  params: AgentCallParams,
  agentId: string
): Promise<AgentJsonResult<T>> {
  const first = await callLLM(params)
  let tokenIn = first.tokenIn
  let tokenOut = first.tokenOut
  let costUsd = first.costUsd

  try {
    const output = parseAgentJson<T>(first.content, agentId)
    return { output, tokenIn, tokenOut, costUsd }
  } catch {
    console.warn(`[callAgentJson] ${agentId} returned invalid JSON — retrying once`)
  }

  const retry = await callLLM({ ...params, prompt: params.prompt + RETRY_SUFFIX })
  tokenIn += retry.tokenIn
  tokenOut += retry.tokenOut
  costUsd += retry.costUsd

  let output: T
  try {
    output = parseAgentJson<T>(retry.content, agentId)
  } catch {
    throw new Error(`${agentId} returned invalid JSON after retry`)
  }
  return { output, tokenIn, tokenOut, costUsd }
}
