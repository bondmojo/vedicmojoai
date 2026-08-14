---
inclusion: auto
---

# VedicMojoAI — Gochar Skill

Use this skill for dated Gochar, the Transits → Gochar diagrams and range form,
the Vimshottari PD **View Gochar** expansion, `POST /api/gochar`, or MCP
`get_gochar`.

## Required references

1. Read [the focused Gochar workflow](../../skills/frontend/gochar.md) for UI
   state, UTC, PD, and verification conventions.
2. For route or MCP changes, also read
   [API route conventions](../../skills/backend/api-routes.md) and
   [MCP conventions](../../skills/backend/mcp-server.md).
3. Treat `.kiro/specs/gochar-feature/requirements.md` and `design.md` as the
   feature contracts. Preserve Lahiri sidereal whole-sign computation, Moon
   opt-in, UTC interval disclosure, and the immutable displayed-chart birth-data
   snapshot.

## Guardrails

- Do not import Gochar API response types into client code from
  `@/engine/compute`; use `@/lib/gocharRange`.
- Do not replace a form's visible bare `dateTo` with the API's exclusive
  next-midnight echo.
- Do not truncate PD ISO bounds or compute a range from live, edited birth-form
  state.
