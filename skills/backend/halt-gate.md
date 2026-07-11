# Critical Error Halt Gate

Between agents 4A and 4B:

```typescript
if (errorResult.critical_errors > 0) {
  // Set run status to 'halted_for_review'
  // Emit SSE 'critical_error' event with actions
  // Throw PipelineHaltError (stops pipeline)
}
```

**Resume options:**
- Override & Continue: `resumeFromHalt()` — sets `override_applied = true`, runs 4B→4C
- Re-run from wave: Start new sub-run from specified wave
- Cancel: Mark run as failed
