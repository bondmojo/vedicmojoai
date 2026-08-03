# VedicMojo MCP Server

A thin, **read-only** [Model Context Protocol](https://modelcontextprotocol.io) server
that lets **Claude Desktop act as the astrologer at $0 API cost**. It exposes
VedicMojoAI's deterministic computations, the canonical domain rubrics, and
ready-to-run analysis workflows — and **never invokes the paid LLM pipelines**
(`/api/unified-charts/[id]/analyze`, `POST /api/duration-analysis`).

It runs as its **own Node process** (stdio), launched by Claude Desktop, and
reaches your data by calling the running Next.js app over HTTP.

```
Claude Desktop ──stdio──▶ this server ──HTTP──▶ Next.js app (engine + Prisma + prompts)
```

## What it exposes (MCP's three primitives)

- **Tools** — deterministic data (no LLM cost):
  - Discovery: `list_clients`, `get_client_chart`
  - Compute: `compute_chart`, `compute_varshaphal`
  - Extractors (stored `chartId` **or** raw `birthData`): `get_shadbala`,
    `get_divisional_chart`, `get_dasha_tree`, `get_active_dasha`,
    `get_ashtakavarga`, `get_relationships`, `get_jaimini`, `get_bhava_bala`,
    `get_transits`
  - Timeline: `get_timeline_periods` (scored MD/AD/PD "trigger points"),
    `get_domain_dataset` (domain-scoped data + timeline)
  - Knowledge: `list_knowledge`, `get_domain_knowledge`, `get_framework`
  - Existing reports (read-only): `list_reports`, `get_report`,
    `list_duration_analyses`, `get_duration_analysis`
- **Resources** — the 6 canonical domain rubrics: `knowledge://domains/{career|health|wealth|marriage|property|cashflow}`
- **Prompts** — `analyze_career` / `_health` / `_wealth` / `_marriage` /
  `_property` / `_cashflow`, `duration_timeline`, `analyze_full_chart`

## How the analysis loop works (no API cost)

A **Prompt** is the *recipe* — it embeds the domain rubric and tells Claude which
**Tools** (the *ingredients* = engine numbers) to call for the given client.
Claude Desktop is the *cook*: it reasons over the numbers using the rubric and
writes the reading. The MCP only ever ships rubric text + deterministic data —
never any paid LLM output.

## Deployment

Either path produces the same artifact — `mcp/dist/server.js` — for Claude
Desktop to spawn. Pick whichever matches how you're running the app.

### Option A — Local (npm)

```bash
cd mcp
npm install
npm run build      # → dist/server.js
```

Requires the Next.js app to be running (`npm run dev` in the repo root) so the
server has something to call.

### Option B — Docker Compose

```bash
docker compose up --build      # from the repo root
```

`docker-entrypoint.sh` builds **both** the app and the MCP server on every
container start (`npm run build` for Next.js, then `cd mcp && npm run build`
for the MCP server) — see `skills/docker-deployment.md`. Because the compose
file bind-mounts the repo into the container (`.:/app`), that build writes
straight back to your **host** `mcp/dist/server.js` — the exact same path
Option A produces, so the Claude Desktop config below doesn't change based on
which option you used.

Two operational notes specific to the Docker path:
- MCP's dependencies (`mcp/package.json`) are installed as an **image layer**,
  not at container start. If you add a new dependency, rebuild the image:
  `docker compose build app`.
- If you rebuild and then see `Module not found` for something that's
  definitely in `mcp/package.json`, it's almost always a **stale anonymous
  volume** for `mcp/node_modules` left over from a previous `up` shadowing the
  freshly-built image. Fix: `docker compose up -d --renew-anon-volumes`.

### Configure Claude Desktop

Add to `claude_desktop_config.json`
(`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "vedicmojo": {
      "command": "/opt/homebrew/bin/node",
      "args": ["/absolute/path/to/vedicmojoai/mcp/dist/server.js"],
      "env": {
        "VEDICMOJO_BASE_URL": "http://localhost:3000"
      }
    }
  }
}
```

Use an **absolute path to `node`** (find yours with `which node`), not the
bare command — Claude Desktop launches MCP servers with a minimal `PATH` that
often doesn't include Homebrew/nvm install locations, which is the #1 cause of
a server silently failing to start. Fully quit and reopen Claude Desktop after
editing this file; it's only read on launch.

### Environment

| Var | Default | Purpose |
|---|---|---|
| `VEDICMOJO_BASE_URL` | `http://localhost:3000` | Base URL of the running Next.js app |
| `MCP_TOKEN` | *(required)* | Your **personal** MCP token — see "Getting your MCP token" below. Sent as `x-mcp-token` on every request; the app resolves it to your account and enforces the same per-user chart ownership a browser session would. |

If the app is running via Docker Compose, it's still reachable at
`http://localhost:3000` (the compose file publishes that port to the host),
so `VEDICMOJO_BASE_URL`'s default is correct either way — nothing to change
here based on deployment option.

### Getting your MCP token

As of the `user-management` feature, `MCP_TOKEN` is no longer a shared secret
you invent — it's a per-user credential the web app issues you:

1. Log in to the web app in your browser.
2. Go to **Account** (`/account`) → **MCP Token** → **Generate token**.
3. Copy the raw value shown — **it is displayed exactly once and never
   shown again** (only its hash is stored). If you lose it, generate a new
   one (this revokes the old one — v1 supports one active token per user).
4. Paste it as `MCP_TOKEN` in Claude Desktop's config (see above) and fully
   restart Claude Desktop.

Every chart, run, and report the MCP tools return is scoped to the account
that token belongs to — the same ownership boundary the web UI enforces.
There's no local dev bypass unless the app operator has explicitly set
`MCP_DEV_USER_EMAIL` in a non-production environment.

## Verify

```bash
npm run build && node smoke-test.mjs   # live wiring check against localhost:3000
```

From the repo root, the safety guard runs in the main suite:

```bash
npx vitest run tests/mcp-cost-guard.test.ts   # proves no paid-route POSTs
```

## Backing routes

Existing app routes plus two new **read-only, no-LLM** routes this server relies on:

- `POST /api/timeline` — deterministic dasha-period slice + transit overlay +
  0–100 scoring + peaks (mirrors the Duration Analysis pre-steps, minus the LLM).
- `GET /api/knowledge` and `GET /api/knowledge/{domains|frameworks}/{name}` —
  the rubric files, include-expanded.
