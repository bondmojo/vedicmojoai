/**
 * engine/llm.ts — Provider-agnostic LLM wrapper using Vercel AI SDK.
 *
 * All model calls in the pipeline go through this single module.
 * Provider/model is swappable via ModelConfig table — zero code changes required.
 */

import { generateText } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { LLMCallError } from '@/lib/errors'
import type { LLMCallOptions, LLMResponse } from '@/lib/types'

// ─── Provider Factory ───────────────────────────────────────────────

/**
 * Creates the appropriate provider model instance based on the provider string.
 */
function getProviderModel(provider: string, model: string) {
  switch (provider) {
    case 'anthropic': {
      const anthropic = createAnthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      })
      return anthropic(model)
    }
    case 'openai': {
      const openai = createOpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      })
      return openai(model)
    }
    case 'google': {
      // Google AI SDK integration — uses @ai-sdk/google when added
      throw new LLMCallError(
        'Google provider not yet configured. Add @ai-sdk/google dependency.',
        provider,
        model
      )
    }
    default:
      throw new LLMCallError(`Unknown provider: ${provider}`, provider, model)
  }
}

// ─── Cost Estimation ────────────────────────────────────────────────

/** Approximate cost per 1M tokens for common models (USD). */
const COST_PER_MILLION: Record<string, { input: number; output: number }> = {
  'claude-opus-4-5': { input: 15, output: 75 },
  'claude-sonnet-4-5': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 0.8, output: 4 },
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
}

function estimateCost(model: string, tokenIn: number, tokenOut: number): number {
  const rates = COST_PER_MILLION[model]
  if (!rates) return 0 // Unknown model — can't estimate

  const inputCost = (tokenIn / 1_000_000) * rates.input
  const outputCost = (tokenOut / 1_000_000) * rates.output
  return inputCost + outputCost
}

// ─── Main LLM Call Function ─────────────────────────────────────────

/**
 * Makes a single LLM call through the Vercel AI SDK.
 *
 * This is the ONLY function in the codebase that talks to LLM APIs.
 * All 18 agents route through here.
 *
 * @param opts - Call options (model, provider, prompt, temperature, maxTokens).
 * @returns LLM response with content, token counts, and estimated cost.
 * @throws {LLMCallError} On provider errors, timeouts, or invalid responses.
 *
 * @example
 * ```typescript
 * const response = await callLLM({
 *   model: 'claude-sonnet-4-5',
 *   provider: 'anthropic',
 *   prompt: chartSummary + agentPrompt,
 *   temperature: 0.3,
 *   maxTokens: 8192,
 * })
 * ```
 */
export async function callLLM(opts: LLMCallOptions): Promise<LLMResponse> {
  const { model, provider, prompt, temperature, maxTokens } = opts

  try {
    const providerModel = getProviderModel(provider, model)

    const result = await generateText({
      model: providerModel,
      prompt,
      temperature,
      maxTokens,
    })

    const tokenIn = result.usage?.promptTokens ?? 0
    const tokenOut = result.usage?.completionTokens ?? 0
    const costUsd = estimateCost(model, tokenIn, tokenOut)

    return {
      content: result.text,
      tokenIn,
      tokenOut,
      costUsd,
    }
  } catch (error) {
    if (error instanceof LLMCallError) throw error

    const message = error instanceof Error ? error.message : String(error)
    throw new LLMCallError(
      `LLM call failed: ${message}`,
      provider,
      model
    )
  }
}

/**
 * Reads the prompt file for a given agent from the prompts/agents/ directory.
 *
 * @param promptFile - Filename within prompts/agents/ (e.g., 'wave2_2f_career.md').
 * @returns The prompt file contents as a string.
 */
export async function readPromptFile(promptFile: string): Promise<string> {
  const fs = await import('fs/promises')
  const path = await import('path')

  const promptPath = path.join(process.cwd(), 'prompts', 'agents', promptFile)

  try {
    return await fs.readFile(promptPath, 'utf-8')
  } catch (error) {
    throw new Error(`Failed to read prompt file: ${promptFile}. ${error}`)
  }
}
