# SSE (Server-Sent Events) Pattern

The pipeline sends real-time progress via SSE. Frontend consumes with `EventSource`:

```typescript
// Standard SSE consumption pattern
const eventSource = new EventSource(`/api/runs/${runId}/events`)

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data)
  switch (data.type) {
    case 'agent_start':    // Agent began execution
    case 'agent_complete': // Agent finished — includes tokenIn, tokenOut, costUsd
    case 'agent_error':    // Agent failed — includes error message
    case 'run_complete':   // Full pipeline done — includes totals
    case 'run_failed':     // Pipeline failed
    case 'critical_error': // 4A halt gate triggered — show override UI
  }
}
```

**Rules:**
- Always close `EventSource` on unmount (return cleanup in `useEffect`)
- Don't open SSE if run status is already terminal (`done`, `failed`)
- Handle reconnection gracefully — re-fetch full state on reconnect
