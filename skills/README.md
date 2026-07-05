# VedicMojoAI — AI Skills

Convention guides for working on this codebase. These files encode project-specific
patterns, constraints, and architectural decisions so any AI assistant (Claude,
Kiro, Cursor, etc.) produces code consistent with the existing codebase.

> These are **read-only convention documents** — they describe how the project
> works, not what to do next. For architecture diagrams see `docs/`. For the
> agent catalogue see `Agents.md`. For the Claude Desktop orientation see `Claude.md`.

## Files

| File | Scope |
|---|---|
| `coding-standards.md` | TypeScript style, naming, error types, git conventions |
| `nextjs-project-structure.md` | Full directory layout, key conventions, dependency rules |
| `engine-pipeline.md` | Pipeline execution rules, dasha computation, model tiers, wave strategy |
| `database-prisma.md` | All DB tables (incl. `UnifiedChart`), constraints, Prisma usage, indexes |
| `ai-backend.md` | LLM pipeline engine, orchestrator, compute modules, unified-chart routes |
| `ai-frontend.md` | Next.js UI patterns, SSE, unified-charts pages, chart components |
| `docker-deployment.md` | Docker/Cloud Run setup, env vars, health check, migration commands |

## Maintenance

These files are the **source of truth for AI-assisted development**.
When the project changes, update the relevant skill file in the same commit — and
also update `docs/ERD.md`, `docs/HLD.md`, `docs/DFD.md`, `Agents.md`, and `Claude.md`
as described in `Agents.md → Documentation Maintenance`.
