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
| `ANTHROPIC_API_KEY` | Yes | Claude API key |
| `OPENAI_API_KEY` | No | OpenAI key (if using GPT models) |
| `GOOGLE_AI_API_KEY` | No | Gemini key (if using Google models) |
| `REPORTS_DIR` | No | Custom reports directory (default: `./data/reports`) |
| `POSTGRES_DATA_DIR` | No | Host path Postgres data is bind-mounted to (default: `./data/postgres`) — read by `docker-compose.yml`, not the app itself |

## Production (GCP Cloud Run)

- Single container deployment to Cloud Run
- Cloud SQL (PostgreSQL) for database
- Cloud Storage or persistent disk for HTML reports
- Environment variables via Secret Manager
- Single deploy command: `gcloud run deploy`

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
- Checks: DB connection, reports directory writable
- Used by Docker HEALTHCHECK and Cloud Run readiness probe
