# VedicMojoAI

VedicMojoAI is a personal Vedic astrology analysis tool. You give it a person's birth details, it computes their full Vedic chart using Swiss Ephemeris (the same astronomical engine used by professional astrology software), then runs the chart through an 18-agent AI pipeline that produces a detailed, structured report covering health, wealth, career, property, and relationships.

Think of it as a private astrology research assistant — it does the heavy math automatically, then passes the results to a chain of specialised AI agents that interpret the chart the way an experienced Jyotish practitioner would.

---

## What it does

### 1. Generate a chart
Enter a person's name, birth date, time, and place. The engine calculates:
- All 9 planetary positions and their signs, houses, and nakshtras
- Divisional charts (D9 Navamsa, D10 Dashamsa, D12 Dwadashamsa, etc.)
- Planetary strengths (Shadbala, Bhava Bala)
- Ashtakavarga bindhu scores
- Vimshottari dasha timeline (120-year period system)
- Arudha Padas, Jaimini Karakas, and special lagnas

### 2. Run AI analysis
After the chart is generated, you choose a query type — career, wealth, health, marriage, property, or a full reading — and launch the pipeline:

| Wave | What happens |
|---|---|
| Pre-analysis | Rule engine flags key patterns; dasha tree is built |
| Wave 1 (Foundation) | Planetary data is structured and extracted |
| Wave 2 (Specialists) | Domain experts analyse yogas, timing, and specific life areas |
| Wave 3 (Synthesis) | Cross-domain patterns and timelines are correlated |
| Wave 4 (Quality + Report) | Findings are fact-checked, errors flagged, and the final report is written |

A quality gate between steps pauses the run if critical inconsistencies are detected, letting you review before proceeding.

### 3. Get a report
Wave 4 produces a formatted HTML report you can read directly in the browser.

---

## Tech stack

- **Next.js 14** (App Router, TypeScript) — single monorepo for UI, API, and engine
- **PostgreSQL + Prisma** — stores charts, runs, and wave outputs
- **Swiss Ephemeris** (`swisseph-v2`) — astronomical precision calculations
- **Vercel AI SDK** — unified interface to Anthropic (Claude) and OpenAI models
- **Tailwind CSS** — dark-themed UI
- **Docker** — one-command local setup

---

## Prerequisites

- [Node.js 20+](https://nodejs.org/)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (for the database)
- An **Anthropic API key** — [get one here](https://console.anthropic.com/)

---

## Setup

### 1. Clone the repo

```bash
git clone <your-repo-url>
cd vedicmojoai
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in your values:

```env
# Required — PostgreSQL connection (matches the Docker Compose defaults)
DATABASE_URL=postgresql://vedicmojo:vedicmojo_dev@localhost:5432/vedicmojoai?schema=public

# Required — AI provider
ANTHROPIC_API_KEY=your_anthropic_key_here

# Optional — additional providers
OPENAI_API_KEY=your_openai_key_here
GOOGLE_AI_API_KEY=your_google_key_here

# Directory where HTML reports are saved
REPORTS_DIR=./data/reports
```

### 4. Start the database

```bash
npm run docker:up
```

This starts a Postgres 16 container. The data is persisted in `./data/postgres` so it survives restarts.

### 5. Run database migrations and seed

```bash
npm run db:migrate   # applies schema migrations
npm run db:seed      # loads default model configuration
```

### 6. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Running with Docker (full stack)

If you want to run both the app and database in Docker:

```bash
cp .env.example .env
# fill in API keys in .env

docker-compose up --build
```

The app will be available at [http://localhost:3000](http://localhost:3000).

---

## Useful commands

| Command | What it does |
|---|---|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run lint` | Run ESLint |
| `npm run test` | Run tests (Vitest) |
| `npm run db:migrate` | Apply Prisma migrations |
| `npm run db:seed` | Seed model config defaults |
| `npm run db:studio` | Open Prisma Studio (visual DB browser) |
| `npm run docker:up` | Start Postgres container |
| `npm run docker:down` | Stop containers |

---

## Project structure

```
app/              Next.js pages and API routes
  compute/        Chart generation UI
  unified-charts/ Chart list and AI analysis launcher
  runs/[id]/      Live run progress + report viewer
  api/            REST endpoints

engine/           Core logic (no UI)
  compute/        Swiss Ephemeris calculations (pure functions)
  waves/          Wave 1–4 pipeline utilities
  orchestrator.ts Pipeline execution controller
  planner.ts      Decides which agents run per query type
  llm.ts          Single gateway for all LLM calls
  renderer.ts     Converts Wave 4 output to HTML report

prompts/agents/   Markdown prompt files for each AI agent
prisma/           Database schema and migrations
docs/             Architecture docs (ERD, HLD, DFD)
```

---

## AI agents overview

The pipeline uses 18 agents across 4 waves. Agents in Waves 1–3 run in parallel; Wave 4 runs sequentially with a quality gate.

| Wave | Agents | Models used |
|---|---|---|
| Wave 1 — Foundation | 4 agents (chart extraction, nakshatra, strengths, relationships) | Claude Haiku |
| Wave 2 — Specialists | Up to 7 agents (yogas, ashtakavarga, wealth, property, health, career, marriage) | Claude Sonnet |
| Wave 3 — Synthesis | Up to 4 agents (cashflow, financial freedom, cross-channel, lagna lord) | Claude Sonnet |
| Wave 4 — Quality + Report | 4 agents (consolidation → error check → validation → final synthesis) | Claude Sonnet / Opus |

Full details are in [Agents.md](./Agents.md).

---

## Configuration

AI models are resolved at runtime from the `model_config` database table (seeded by `npm run db:seed`). You can swap models or providers without changing code — just update the table via Prisma Studio or a migration.

---

## Notes

- Reports are saved as HTML files to the `REPORTS_DIR` path and served by the API. Make sure the directory exists and is writable.
- The `data/postgres` directory is created automatically by Docker. Do not commit it.
- Prompt files in `prompts/agents/` are read at runtime — you can edit them to tune agent behaviour without rebuilding the app.
