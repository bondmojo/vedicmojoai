# Pre-Analysis & Dasha Computation

## Dasha Computation

`computeVimshottari(moonLongitudeDeg, birthDatetime)`:

- Uses `YEAR_DAYS = 365.2425` (single source in constants)
- Self-verification: sum of all MD durations must equal 120 years ± 1 day
- Failure → `DashaIntegrityError` thrown before any LLM runs
- Output: full `DashaTree` with Maha/Antar/Pratyantar periods
- **Birth nakshatra index and elapsed fraction come from `locateInNakshatra()`**
  (`engine/compute/nakshatras.ts`; one quotient: `index = floor(q)`,
  `fraction = q − index`). Never pair `floor(lon / span)` with `lon % span`:
  `NAKSHATRA_SPAN_DEG` rounds up, so at an exact boundary (40°, 80°, …) the two
  disagree and the balance comes out ~0. A boundary Moon gets the full MD of the
  new nakshatra's lord. Tests: `tests/vimshottari-nakshatra-boundary.test.ts`.

## Pre-Analysis Rules

11 deterministic rules in `engine/pre_analysis.ts`:

- No LLM — pure algorithmic checks
- Detects: debilitated lagna lord, retrograde nodes, combustion, etc.
- Output: `alerts[]` with `{ rule_id, rule_name, severity, message }`
- Alerts are injected into ALL agents as context
- Used by planner for conditional decisions (e.g., 3D activation)
