# MCP Server (`mcp/`)

A **separate stdio process** (its own npm package under `mcp/`) that exposes
VedicMojoAI to **Claude Desktop** so the *reasoning* runs on the Desktop
subscription — **not** the paid API pipelines. It is a thin HTTP client of the
running Next.js app and holds **no astrology logic**.

**Golden rule:** the MCP must NEVER call the paid pipelines
(`POST /api/unified-charts/[id]/analyze`, `POST /api/duration-analysis`). This is
enforced by `tests/mcp-cost-guard.test.ts` (static scan of `mcp/src`). Only these
POSTs are allow-listed: `/api/compute`, `/api/compute/varshaphal`, `/api/timeline`.
The guard also requires every `api.get/post/getText` call's path to be a literal
string/template literal (not a variable or concatenation) — an indirected path
can't be regex-audited, so the test fails loudly rather than let one slip through.

## Files

| File | Responsibility |
|---|---|
| `mcp/src/server.ts` | Entry. `McpServer` + `StdioServerTransport`; wires tools/resources/prompts. stdout is the protocol — log only to stderr. |
| `mcp/src/http.ts` | `api.get/post/getText` to `VEDICMOJO_BASE_URL` (default `http://localhost:3000`); adds `x-mcp-token` when `MCP_TOKEN` is set. `ApiError` on non-2xx. |
| `mcp/src/chart.ts` | `resolveChart({chartId|birthData})` normalizes the two chart shapes (stored `UnifiedChart` vs `ComputedChart`: `karakas`↔`charaKarakas`, `jaimini`↔`computedJaimini`, `dashaTree` sibling). `birthDataSchema`, `chartRefShape`, `activeDashaChain()`. |
| `mcp/src/tools.ts` | All tools (thin route wrappers). `guard()` turns errors into `isError` results; `extractOrGuide()` degrades gracefully on paste-source charts (no computed domains). |
| `mcp/src/resources.ts` | The 6 domain rubrics as `knowledge://domains/{domain}` (content fetched lazily). |
| `mcp/src/prompts.ts` | Ready-to-run readings; each embeds the domain rubric + instructs which Tools to call (compute-first contract). |
| `mcp/smoke-test.mjs` | Live wiring check (spawns `dist/server.js`, exercises tools against `localhost:3000`). |
| `mcp/live-adversarial-test.mjs` | Live edge-case regression (bad input, backwards date ranges, span-cap, unsupported vargas, paid-route grep against the compiled `dist/`). |

## Backing routes (in the Next.js app)

- `POST /api/timeline` (`app/api/timeline/route.ts`) — deterministic, **no LLM**.
  Mirrors `executeDurationPipeline` steps 0a–0d: `sliceDashaTree` → `buildTransitOverlay`
  → `extractCategoryData` → `scorePeriod`/`identifyPeaks`. Returns scored MD/AD/PD
  periods, transit overlay, peaks, and (optional) the domain-scoped `categoryData`.
  Requires `category` (scoring is domain-weighted). 10-year span cap.
- `GET /api/knowledge` + `GET /api/knowledge/[type]/[name]`
  (`app/api/knowledge/**`) — `type`=`domains`|`frameworks`; returns `readPromptFile()`
  output (`{{include:}}`-expanded). `name` allow-listed against the real directory
  listing (no path traversal).
- `lib/mcpAuth.ts` — `requireMcpToken(request)`: open when `MCP_TOKEN` unset, else
  requires matching `x-mcp-token`. Applied to the two routes above only.

## Tool catalogue (all read/compute, synchronous)

- Discovery: `list_clients`, `get_client_chart` (a chart == a client).
- Compute (stateless): `compute_chart`, `compute_varshaphal`.
- Extractors (stored `chartId` OR raw `birthData`): `get_shadbala`, `get_divisional_chart`
  (filter by `divisions`), `get_dasha_tree`, `get_active_dasha`, `get_ashtakavarga`,
  `get_relationships`, `get_jaimini` (incl. chara karakas), `get_bhava_bala`, `get_transits`.
- Timeline: `get_timeline_periods` (trigger points), `get_domain_dataset` (data + timeline,
  dates default to a 3-year window).
- Knowledge: `list_knowledge`, `get_domain_knowledge`, `get_framework`.
- Existing reports (read-only, no new cost): `list_reports`, `get_report`,
  `list_duration_analyses`, `get_duration_analysis`.

## Conventions / gotchas

- **Add a tool = a route wrapper in `tools.ts`.** No engine imports in `mcp/` — always go
  through HTTP so validation/logic stays in one place.
- **Never POST to a paid route.** If you add a POST, also add it to the allow-list only if
  it is deterministic/free; the guard test will fail otherwise (that's intended).
- **Paste-source charts** have no computed domains — extractors return a "compute first" note.
- **`get_transits`** reflects the chart's computation time (stored `transits`); arbitrary
  as-of transits would need a new compute route (out of scope).
- Domain → vargas is registry-driven (`engine/durationAnalysis/registry.ts`): career = D1/D9/D10,
  health = D1/D30, etc. `get_domain_dataset` inherits exactly that scoping.

## Deployment

Two paths, same artifact — `mcp/dist/server.js` — for Claude Desktop to spawn:
local (`cd mcp && npm install && npm run build`) or Docker Compose
(`docker-entrypoint.sh` builds it on every container start, right after the
Next.js build; the bind-mounted repo means that write lands on the host at the
same path). Full setup + Claude Desktop config: `mcp/README.md`. Docker specifics
(image layer for `mcp/`'s deps, the `mcp/node_modules` anonymous volume, the
`--renew-anon-volumes` gotcha): `docker-deployment.md`.

## Verify

```bash
cd mcp && npm run build && node smoke-test.mjs           # live wiring
cd mcp && node live-adversarial-test.mjs                  # live edge cases
npx vitest run tests/mcp-cost-guard.test.ts                # safety (from repo root)
```
