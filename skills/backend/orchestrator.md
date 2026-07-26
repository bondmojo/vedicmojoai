# Orchestrator Pattern (`engine/orchestrator.ts`)

The orchestrator is the pipeline's control plane:

1. **Parallel within waves** — uses `Promise.all()` for Wave 1/2/3
2. **Sequential across waves** — awaits each wave before next
3. **Context accumulation** — builds `AgentContext` as waves complete
4. **DB persistence** — creates/updates `WaveOutput` rows per agent
5. **SSE emission** — calls `emitEvent()` for every state transition
6. **Halt gate** — after 4A, checks `critical_errors > 0` → throws `PipelineHaltError`
7. **Resume path** — `resumeFromHalt()` reconstructs context from DB and runs 4B→4C

**Key invariants:**
- Orchestrator is the ONLY engine module that writes to the database
- Agent failures mark `WaveOutput.status = 'failed'` and re-throw
- 4X must produce non-empty `fact_summary` or pipeline errors
