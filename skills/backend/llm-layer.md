# LLM Layer (`engine/llm.ts`)

**Rules:**
- ALL LLM calls go through `callLLM()` — never import provider SDKs elsewhere
- Uses Vercel AI SDK (`ai` package) for provider abstraction
- Model/provider resolved at runtime from `model_config` DB table
- Returns `{ content, tokenIn, tokenOut, costUsd }` on every call
- Swapping providers requires zero code changes — update DB row only

**Provider factory pattern:**
```typescript
switch (provider) {
  case 'anthropic': createAnthropic({ apiKey })
  case 'openai': createOpenAI({ apiKey })
  case 'google': // not yet configured
}
```

**Cost estimation** uses `COST_PER_MILLION` lookup table (per-model input/output rates).
