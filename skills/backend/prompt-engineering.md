# Prompt Engineering Rules

Prompt files live in `prompts/agents/{wave}_{id}_{name}.md`. Read at runtime via `readPromptFile()`.

**When writing or modifying agent prompts:**
- Output must be structured JSON (parsed by orchestrator)
- Include explicit output schema in the prompt
- Define clear domain boundaries — don't let agents overlap
- Use few-shot examples for complex output structures
- Set temperature per tier: foundation=0.3, specialists=0.3, QA=0.0, synthesis=0.0
- Include "DO NOT" constraints to prevent common hallucination patterns
- Reference pre-analysis alerts — agents should acknowledge flagged conditions
