# Error Handling

```typescript
// Engine-specific errors (from lib/errors.ts)
DashaIntegrityError    // Dasha sum != 120 years
ChartValidationError   // Invalid chart input
PipelineHaltError      // Critical errors in 4A
LLMCallError           // Provider/model failures
```

**Recovery patterns:**
- Agent failure: mark failed, emit SSE error, re-throw to orchestrator
- LLM timeout/rate-limit: LLMCallError with provider + model context
- Pipeline halt: persist halt_reason, emit critical_error, throw PipelineHaltError
- Never swallow errors silently — always persist + emit
