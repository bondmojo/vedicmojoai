---
inclusion: auto
---

# VedicMojoAI — Docker & Deployment

## Local Development Stack

```yaml
# docker-compose.yml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: vedicmojo
      POSTGRES_PASSWORD: vedicmojo_dev
      POSTGRES_DB: vedicmojoai
    ports:
      - "5432:5432"
    volumes:
      - ${POSTGRES_DATA_DIR:-./data/postgres}:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U vedicmojo -d vedicmojoai"]

  app:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgresql://vedicmojo:vedicmojo_dev@db:5432/vedicmojoai?schema=public
      NODE_ENV: production
      AUTH_TRUST_HOST: "true"   # see "Auth in Docker" below — auth() 401s everything without this
    env_file:
      - .env
    depends_on:
      db:
        condition: service_healthy
    volumes:
      - .:/app
      - /app/node_modules
      - /app/mcp/node_modules   # keep the image's mcp deps from being shadowed by the bind mount
```

## Dockerfile

- Base: `node:20-alpine`
- Installs deps for **both** the root app (`package.json`) and the MCP server
  (`mcp/package.json`) as separate cached layers — `npm ci` runs in each
- `prisma generate` at image build time
- Actual app/MCP build happens at **container start** (via
  `docker-entrypoint.sh`) against the bind-mounted source, not at image-build
  time — this repo doesn't use a multi-stage/standalone build
- Copy `prisma/` for migrations

## docker-entrypoint.sh

Runs on every container start, in order: `prisma generate` → `prisma migrate
deploy` → `npm run build` (Next.js app) → `(cd mcp && npm run build)` (MCP
server, compiles `mcp/src/*.ts` → `mcp/dist/server.js`) → `next start`. A
single `docker compose up --build` therefore builds **both** the app and the
MCP server together; `mcp/dist/` isn't baked into the image, it's produced
fresh each start from the live bind-mounted `mcp/src/`.

`npm run build` itself runs `prisma generate && next build`. This deliberate
duplication is harmless in Docker and ensures a Vercel build cannot reuse a
cached Prisma Client that predates a schema or binary-target change.

The MCP server itself is a stdio process meant to be spawned directly by
Claude Desktop on the host (see `mcp/README.md`) — it isn't a docker-compose
service. Docker's job here is only to keep its build in sync with the app's.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `DIRECT_URL` | Yes | Direct, unpooled PostgreSQL URL for Prisma migrations (same as `DATABASE_URL` locally) |
| `ANTHROPIC_API_KEY` | Yes | Claude API key |
| `OPENAI_API_KEY` | No | OpenAI key (if using GPT models) |
| `GOOGLE_AI_API_KEY` | No | Gemini key (if using Google models) |
| `REPORTS_DIR` | No | Custom reports directory (default: `./data/reports`) |
| `POSTGRES_DATA_DIR` | No | Host path Postgres data is bind-mounted to (default: `./data/postgres`) — read by `docker-compose.yml`, not the app itself |
| `AUTH_SECRET` | Yes | Auth.js session secret (`npx auth secret`) |
| `COOKIE_SECURE` | No | `"true"` only behind real HTTPS — see "Auth in Docker" below |
| `AUTH_TRUST_HOST` | Yes¹ | `"true"` for this docker-compose stack (no reverse proxy) — see "Auth in Docker" below |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | Yes | Password-reset emails |
| `MCP_DEV_USER_EMAIL` | No | Non-production-only MCP dev fallback identity |

¹ Required whenever `NODE_ENV=production` and the deployment isn't Vercel/Cloudflare Pages (which set their own trust signal automatically).

## Auth in Docker: two env vars that are easy to miss

`npm run dev` runs with `NODE_ENV=development`, where Auth.js quietly defaults
both of the settings below to safe values — so this class of bug is invisible
until the app runs as a production build (`docker compose up`, or any bare
`next build && next start`). Found via live testing of this repo's own
docker-compose stack: login succeeded (`Session` row created) but every
following request 401'd, with `auth()` throwing `UntrustedHost` in the logs.

- **`AUTH_TRUST_HOST=true`** — `@auth/core`'s `trustHost` only defaults `true`
  when `NODE_ENV !== 'production'` (or `AUTH_URL`/`VERCEL`/`CF_PAGES` is set).
  Without it, every `auth()` call throws `UntrustedHost` and no session is ever
  resolved. Safe to hardcode `true` for this single-container stack — there's
  no reverse proxy in front able to forge the `Host` header Docker sees.
- **`COOKIE_SECURE`** (default `false`) — decoupled from `NODE_ENV` on purpose
  in `lib/auth.ts`: a `Secure` cookie is silently dropped by the browser over
  this stack's plain HTTP, so the session cookie the login route sets would
  never actually be stored. Only set `true` once a real TLS-terminating proxy
  sits in front of the app. This flag drives both the app's own cookie code
  *and* `authConfig.useSecureCookies` — `@auth/core` computes its own default
  independently (`url.protocol === 'https:'`) if left unset, which would
  silently diverge from the cookie name the app's routes actually set.

See `.kiro/specs/user-management/design.md`'s "Self-hosted production
deployment" section for the full incident writeup.

## Production (GCP Cloud Run)

- Single container deployment to Cloud Run
- Set `COOKIE_SECURE=true` (Cloud Run terminates TLS at the edge) and
  `AUTH_TRUST_HOST=true` (Cloud Run isn't Vercel/CF Pages, so Auth.js won't
  infer trust automatically) — see "Auth in Docker" above for why both matter
- Cloud SQL (PostgreSQL) for database
- Cloud Storage or persistent disk for HTML reports
- Environment variables via Secret Manager
- Single deploy command: `gcloud run deploy`

## Production (Vercel + Supabase)

- Vercel functions have a read-only application filesystem. Reports are stored
  in `PipelineRun.reportHtml`/`reportMarkdown`; `data/reports/` is never a
  deployment dependency.
- Set `DATABASE_URL` to Supabase's transaction pooler URL with
  `pgbouncer=true&connection_limit=1`, and set `DIRECT_URL` to the unpooled
  direct database URL. Run `prisma migrate deploy` with the latter available.
- Set `COOKIE_SECURE=true` explicitly. It is not inferred from `VERCEL`, even
  though the hosted application is served over HTTPS.
- Vercel needs Node 20 (pinned by `.nvmrc` and `package.json`) because
  `swisseph-v2` contains a native addon. `next.config.mjs` must retain the
  output-file-tracing inclusions for `swisseph-v2` and `prompts/`.
- The `build` script runs `prisma generate && next build`, forcing Prisma to
  regenerate its Vercel-compatible client and `rhel-openssl-3.0.x` engine even
  when Vercel restores cached dependencies.
- `waitUntil()` plus route `maxDuration` provides a bounded window for AI and
  Duration Analysis after their `202` response. It is not a durable job queue;
  use the persisted run status/recovery routes when a pipeline outlives it.

## Commands

```bash
# Local dev (without Docker — uses local Postgres)
npm run dev

# Docker dev
docker compose up -d db          # Start Postgres only
docker compose up                # Start everything

# Migrations
npx prisma migrate dev           # Development (creates migration)
npx prisma migrate deploy        # Production (applies pending)

# Seed model_config
npx prisma db seed
```

## Health Check

- Endpoint: `GET /api/health`
- Checks: DB connection, reports directory writable (the latter is skipped on
  Vercel because database-backed reports do not require filesystem writes)
- Used by Docker HEALTHCHECK and Cloud Run readiness probe
