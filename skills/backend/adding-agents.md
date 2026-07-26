# Adding a New Agent

1. Create prompt file: `prompts/agents/{wave}_{id}_{name}.md`
2. Add entry to `AGENT_CATALOGUE` in `engine/constants.ts`
3. Add to `DOMAIN_AGENTS` map (if domain-specific)
4. Add to `ALWAYS_RUN_FIRST_QUERY` (if needed)
5. Update `model_config` seed in `prisma/seed.ts`
6. Add context assembly logic in `orchestrator.ts → assemblePrompt()`
7. Update `Agents.md` documentation
