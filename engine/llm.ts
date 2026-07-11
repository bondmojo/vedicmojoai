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
function getProviderModel(provider: string, model: string, apiKey?: string) {
  switch (provider) {
    case 'anthropic': {
      const anthropic = createAnthropic({
        apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
      })
      return anthropic(model)
    }
    case 'openai': {
      const openai = createOpenAI({
        apiKey: apiKey || process.env.OPENAI_API_KEY,
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
  'gpt-5.5': { input: 5, output: 20 },
  'gpt-5.4': { input: 2.5, output: 10 },
  'gpt-5.4-mini': { input: 0.15, output: 0.6 },
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
 * @param opts - Call options (model, provider, prompt, temperature, maxTokens/maxOutputTokens).
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
  const { model, provider, prompt, temperature, maxTokens, cachedPrefix, apiKey } = opts
  const startTime = Date.now()
  const totalChars = (cachedPrefix?.length ?? 0) + prompt.length

  // OpenAI: all models — temperature not supported (reasoning models require default=1).
  // Anthropic Claude 4.x+: models only accept temperature=1 (the API default); passing
  //   any other value (including 0) returns "Unsupported value: temperature does not
  //   support 0 with this model. Only the default (1) value is supported."
  const skipTemperature =
    provider === 'openai' ||
    (provider === 'anthropic' && /claude-(opus|sonnet|haiku)-[4-9]/.test(model))

  // Log request
  console.log(`\n┌─── LLM CALL ───────────────────────────────────────`)
  console.log(`│ Provider: ${provider}`)
  console.log(`│ Model:    ${model}`)
  console.log(`│ Temp:     ${skipTemperature ? 'N/A (model uses default temperature)' : temperature}`)
  console.log(`│ MaxTok:   ${maxTokens}`)
  console.log(`│ Prompt:   ${totalChars} chars (${Math.round(totalChars / 4)} est. tokens)${cachedPrefix ? ` — ${cachedPrefix.length} chars cache-marked` : ''}`)
  console.log(`└────────────────────────────────────────────────────`)

  try {
    const providerModel = getProviderModel(provider, model, apiKey)

    // Prompt caching: on Anthropic, a stable prefix is sent as a separate
    // text part marked cache_control=ephemeral — byte-identical prefixes
    // across calls (chat turns, DA-1 batches) are read from cache at ~10%
    // of input cost. Other providers get plain concatenation.
    const promptOrMessages =
      cachedPrefix && provider === 'anthropic'
        ? {
            messages: [
              {
                role: 'user' as const,
                content: [
                  {
                    type: 'text' as const,
                    text: cachedPrefix,
                    providerOptions: {
                      anthropic: { cacheControl: { type: 'ephemeral' } },
                    },
                  },
                  { type: 'text' as const, text: prompt },
                ],
              },
            ],
          }
        : { prompt: cachedPrefix ? cachedPrefix + prompt : prompt }

    // v7 SDK: maxTokens → maxOutputTokens. temperature=1 is explicit for models that
    // reject other values (OpenAI reasoning, Anthropic Claude 4.x+).
    const result = await generateText({
      model: providerModel,
      ...promptOrMessages,
      // Models that only accept the default temperature: explicitly pass 1 rather than
      // omitting it — the SDK defaults to 0 when omitted, which these APIs reject.
      ...(skipTemperature ? { temperature: 1 } : { temperature }),
      maxOutputTokens: maxTokens,
    })

    const elapsed = Date.now() - startTime
    // v7: usage fields renamed promptTokens→inputTokens, completionTokens→outputTokens
    const tokenIn = result.usage?.inputTokens ?? 0
    const tokenOut = result.usage?.outputTokens ?? 0
    const costUsd = estimateCost(model, tokenIn, tokenOut)

    // Log response
    console.log(`\n┌─── LLM RESPONSE ───────────────────────────────────`)
    console.log(`│ Provider:  ${provider} / ${model}`)
    console.log(`│ Status:    SUCCESS`)
    console.log(`│ Time:      ${(elapsed / 1000).toFixed(2)}s`)
    console.log(`│ Tokens In: ${tokenIn.toLocaleString()}`)
    console.log(`│ Tokens Out:${tokenOut.toLocaleString()}`)
    console.log(`│ Cost:      $${costUsd.toFixed(6)}`)
    console.log(`│ Output:    ${result.text.length} chars`)
    console.log(`└────────────────────────────────────────────────────`)

    return {
      content: result.text,
      tokenIn,
      tokenOut,
      costUsd,
    }
  } catch (error) {
    const elapsed = Date.now() - startTime
    const message = error instanceof Error ? error.message : String(error)

    // Log error
    console.error(`\n┌─── LLM ERROR ──────────────────────────────────────`)
    console.error(`│ Provider: ${provider} / ${model}`)
    console.error(`│ Time:     ${(elapsed / 1000).toFixed(2)}s`)
    console.error(`│ Error:    ${message}`)
    console.error(`└────────────────────────────────────────────────────`)

    if (error instanceof LLMCallError) throw error

    throw new LLMCallError(
      `LLM call failed: ${message}`,
      provider,
      model
    )
  }
}

// {{include:relative/path.md}} — expanded by readPromptFile before variable
// substitution. Paths containing '/' resolve from prompts/ (e.g. domains/career.md);
// bare filenames resolve from prompts/agents/.
const INCLUDE_PATTERN = /\{\{include:([^}]+)\}\}/g
const MAX_INCLUDE_DEPTH = 3

async function readPromptFileRaw(promptFile: string): Promise<string> {
  const fs = await import('fs/promises')
  const path = await import('path')

  const relative = promptFile.includes('/')
    ? path.join('prompts', promptFile)
    : path.join('prompts', 'agents', promptFile)
  const promptPath = path.join(process.cwd(), relative)

  try {
    return await fs.readFile(promptPath, 'utf-8')
  } catch (error) {
    throw new Error(`Failed to read prompt file: ${promptFile}. ${error}`)
  }
}

async function expandIncludes(content: string, depth: number): Promise<string> {
  if (depth > MAX_INCLUDE_DEPTH) {
    throw new Error(`Prompt include depth exceeded ${MAX_INCLUDE_DEPTH} — check for an include cycle`)
  }

  const matches = [...content.matchAll(INCLUDE_PATTERN)]
  let expanded = content
  for (const match of matches) {
    const includePath = match[1].trim()
    const included = await readPromptFileRaw(includePath)
    const resolved = await expandIncludes(included, depth + 1)
    expanded = expanded.replace(match[0], resolved)
  }
  return expanded
}

/**
 * Reads a prompt file and expands {{include:...}} directives.
 *
 * @param promptFile - Filename within prompts/agents/ (e.g., 'wave2_2f_career.md'),
 *                     or a path relative to prompts/ when it contains '/'.
 * @returns The prompt contents with all includes inlined.
 */
export async function readPromptFile(promptFile: string): Promise<string> {
  const content = await readPromptFileRaw(promptFile)
  return expandIncludes(content, 0)
}
