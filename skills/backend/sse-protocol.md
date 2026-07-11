# SSE Event Protocol

The orchestrator emits events for real-time frontend updates:

| Event Type | When | Data |
|---|---|---|
| `connected` | SSE stream opened | — |
| `agent_start` | Agent begins execution | `agent_id`, `wave_number` |
| `agent_complete` | Agent finished successfully | `tokenIn`, `tokenOut`, `costUsd` |
| `agent_error` | Agent failed | `error` message |
| `token_count` | Token usage update | `tokenIn`, `tokenOut` |
| `critical_error` | 4A halt triggered | `errors[]`, `actions[]` |
| `run_complete` | Pipeline done | total tokens and cost |
| `run_failed` | Pipeline failed | error details |

**Implementation:** API route at `/api/runs/[id]/events/route.ts` using Web Streams API.
