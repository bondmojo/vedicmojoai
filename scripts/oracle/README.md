# PyJHora oracle harness (task 9.1)

Dev-only, throwaway Docker setup that runs [PyJHora](https://github.com/naturalstupid/PyJHora)
(AGPL-3.0) locally to generate reference Ashtakoota (Guna Milan) scores for
comparison against this repo's own `engine/compute/matchmaking.ts` +
`matchmakingTables.ts`.

## Why this is a separate Docker stack

PyJHora is licensed **AGPL-3.0**. This app (`docker-compose.yml`'s `app`
service) is deployed and served to users over the network. If PyJHora were
installed into *that* image, this app would become a distributed derivative
of AGPL code — which would trigger AGPL's network-copyleft clause and could
obligate releasing this entire repository's source under AGPL.

To avoid that:

- PyJHora is installed **only** inside `scripts/oracle/Dockerfile`'s image,
  built by the **separate** `docker-compose.oracle.yml` file.
- That file is never referenced by `docker-compose.yml`, and this image is
  never referenced by the app's own `Dockerfile`.
- PyJHora is not a dependency in `package.json`, is never imported from
  `engine/`, `mcp/`, or any route under `app/`, and is not vendored/copied
  into this repository anywhere.
- The oracle's raw output goes to `./scripts/oracle/output/`, which is
  **git-ignored** — nothing PyJHora produces is committed verbatim.

## What this does NOT do

It does not run as part of `npm run dev`, `npm run build`, `docker compose
up`, or any CI/deploy path. It is a manual, local, one-off tool you run
yourself when you're ready to do task 9.

## Usage

Build the image (the `--profile oracle` flag is required for `build`/`up`/
`config` since the service is deliberately kept out of a bare `docker compose
up` — `run`, below, activates its own service's profile automatically and
doesn't need the flag):

```bash
docker compose --profile oracle -f docker-compose.oracle.yml build
```

Run the full 27×4 × 27×4 = 11,664-combination sweep:

```bash
docker compose -f docker-compose.oracle.yml run --rm oracle --full
```

Or a smaller, reproducible random sample (faster iteration):

```bash
docker compose -f docker-compose.oracle.yml run --rm oracle --sample 50
```

Or a handful of specific pairs (fast, verbose — good for spot-checking a
single divergence):

```bash
docker compose -f docker-compose.oracle.yml run --rm oracle --pairs "1,1,7,4;3,2,19,4"
```

Output lands in `scripts/oracle/output/ashtakoota_oracle_raw.json` on the
host (bind-mounted, git-ignored).

## What the output contains

For each `(boy_nakshatra, boy_pada, girl_nakshatra, girl_pada)` combination:

- `compatibility_score` — PyJHora's own `Ashtakoota.compatibility_score()`
  return value, captured as-is.
- `poroutham` — the raw return value of each individual koota method
  (`varna_porutham`, `vasiya_porutham`, `dina_porutham`/`tara_porutham`,
  `yoni_porutham`, `raasi_adhipathi_porutham`/`maitri_porutham`,
  `gana_porutham`, `raasi_porutham`/`bahut_porutham`, `naadi_porutham`),
  keyed by this repo's own `KootaKey` names for cross-reference only.

PyJHora's own docs describe these methods as returning "a tuple or a
boolean" without pinning the exact shape per version, so
`generate_oracle.py` deliberately does **not** try to reinterpret or
reshape the return values — it captures them verbatim so you can read
PyJHora's actual runtime output yourself rather than trust an assumption
baked into the harness script.

## Analysis scripts (task 9.3 — done)

These read `ashtakoota_oracle_raw.json` (never PyJHora itself) and
cross-reference it against this repo's own `engine/compute/matchmaking.ts` /
`matchmakingTables.ts`, by calling the real scorers rather than re-deriving
lookups by hand. All read-only — none of them modify `matchmakingTables.ts`.
Run any of them with `npx tsx scripts/oracle/<name>.ts` from the repo root
(requires `ashtakoota_oracle_raw.json` to already exist — regenerate it with
the Docker steps above if `scripts/oracle/output/` is empty).

- **`analyze_oracle.ts`** — the main pass: empirically calibrates the
  boy/girl↔groom/bride direction (via the unambiguous Varna rule), then
  buckets every koota's oracle-vs-engine agreement, including a dedicated
  Tara remainder-pair breakdown.
- **`analyze_vashya.ts`** — deep-dive once the group-level Vashya bucketing
  showed internal inconsistency: derives the full 12×12 per-rashi matrix,
  checks symmetry, and checks whether VashyaGroup still explains it (it does,
  except for Sagittarius/Capricorn — see the KNOWN DIVERGENCE table in
  `docs/computation_matchmaking.md`).
- **`derive_vashya.ts`** — programmatically emits a corrected, verified
  5-group Vashya matrix (excluding the two dual signs) as ready-to-paste TS,
  to avoid hand-transcription error.
- **`derive_yoni.ts`** — same, for the Yoni koota's enemy(1)/friendly(3) pair
  lists; also checks symmetry (found: fully symmetric).
- **`derive_dual_split.ts`** — the Sagittarius/Capricorn investigation: checks
  whether pinning the exact (nakshatra, pada), not just the rashi, resolves
  PyJHora's Vashya output for these two dual signs into a clean pattern (it
  mostly does, but the pattern itself doesn't reduce to a documented
  classical rule — see KNOWN DIVERGENCE).
- **`verify_tara2.ts`** — confirms the Tara whole-score override rule
  (100% match across all 11,664 combinations) after a simpler-looking first
  attempt was tested and found wrong.

Findings are applied in `matchmakingTables.ts` (each changed table has an
inline PROVENANCE comment citing this oracle run) and summarized in
`docs/computation_matchmaking.md`'s KNOWN DIVERGENCE table, per task 12.3.
`MATCHMAKING_TABLES_VERSION` was bumped to `matchmaking-tables-v1-oracle-verified`
for this pass, then again to `matchmaking-tables-v1.1-nadi-bhanga-fix` for a
post-review fix to `matchmaking.ts`'s Nadi Bhanga cancellation (not part of the
oracle sweep — PyJHora's bare `Ashtakoota` class has no cancellation logic at
all — see `docs/computation_matchmaking.md`'s KNOWN DIVERGENCE #4).

**Task 9.2 — done.** A hand-curated, documented sample (22 of the 6,554
combinations outside every known divergence/cancellation zone — not a raw
dump) is committed at
`engine/compute/__fixtures__/ashtakootaOracleSample.ts` and exercised by
`matchmaking.invariants.test.ts`'s task 7.1 oracle-comparison test. See that
fixture's own header for the exact selection/cross-verification method.

## Troubleshooting

**Ephemeris data errors on import.** The `Ashtakoota` class only needs
integer `(nakshatra, pada)` inputs and does not compute a chart, so it
should not need Swiss Ephemeris data files. If `jhora`'s module-level init
still errors while missing them, PyJHora's own README says (for versions
≥3.6.6) to copy the `ephe` data files from
`https://github.com/naturalstupid/PyJHora/tree/main/src/jhora/data/ephe`
into the installed package's `jhora/data/ephe` directory inside this image
— add a `COPY`/`RUN` step to `scripts/oracle/Dockerfile` for that if needed,
but do not commit the ephemeris data files into this repository.
