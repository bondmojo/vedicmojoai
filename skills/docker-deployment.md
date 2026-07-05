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
      - pgdata:/var/lib/postgresql/data

  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgresql://vedicmojo:vedicmojo_dev@db:5432/vedicmojoai
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
      OPENAI_API_KEY: ${OPENAI_API_KEY}
    depends_on:
      - db
    volumes:
      - ./data/reports:/app/data/reports

volumes:
  pgdata:
```

## Dockerfile

- Multi-stage build: `deps` → `build` → `runner`
- Base: `node:20-alpine`
- Use standalone output mode (`next.config.ts: output: 'standalone'`)
- Copy `prompts/` directory into container (read-only at runtime)
- Copy `prisma/` for migrations
- Run `prisma migrate deploy` on container start (via entrypoint script)
- Mount `data/reports/` as a volume for persistence

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `ANTHROPIC_API_KEY` | Yes | Claude API key |
| `OPENAI_API_KEY` | No | OpenAI key (if using GPT models) |
| `GOOGLE_AI_API_KEY` | No | Gemini key (if using Google models) |
| `REPORTS_DIR` | No | Custom reports directory (default: `./data/reports`) |

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
