---
inclusion: auto
---

# Scientific Verification Guardrails

These rules apply to all Surya Siddhanta Makaranda (SSS) implementation tasks
and to any future scientific-precision work. They address the documented
verification failure patterns from Tasks 1–2.

## 1. Fixtures are read-only acceptance targets

- Test fixture files (`__fixtures__/`) and oracle documents (`docs/reference/`)
  are NOT editable by implementation tasks. A diff to a fixture file is an
  automatic review failure.
- If a computed value disagrees with a fixture, **report** the component, the
  expected value, the actual value, and the magnitude of the difference. Do not
  adjust the fixture or widen the tolerance.
- Task 9.2 owns discrepancy recording. Implementers own honest failure.

## 2. No expected value may originate from your own output

- Every golden assertion must trace to a human-transcribed JHora number or an
  independently calculated reference.
- The "run it → paste the result → widen the tolerance" loop is forbidden.
  If the only source for an expected value is the code under test, the test
  proves nothing.
- Drik regression baselines are captured from a **separate, independent prior
  snapshot** — never from a fresh run of the same code being validated.

## 3. Structural isolation over trust-me comments

- Enforce import boundaries with tests, not comments. If the spec says "do not
  call swe_julday on this path," add a test asserting the module's transitive
  imports contain no `swisseph-v2`, no `astronomy/drikLahiri`, no `planets.ts`.
- Pair every "no hidden fallback" claim with a divergence test proving the two
  paths produce different output for the same input.
- A `// Task N handles this` comment is documentation, not enforcement. The
  enforcement is a test that fails if the claim is violated before that task
  lands.

## 4. Deduplication is a contract, not debt

- When code has two or more helpers doing "the same thing" differently, the
  difference is probably intentional. Before collapsing them:
  1. Run a bit-level differential on real inputs.
  2. Document which callers rely on which variant's exact semantics.
  3. Only merge when the differential is truly zero across the full input domain.
- Longitude normalization is the canonical example: `normalizeLongitude`
  (`(x % 360 + 360) % 360`) is NOT identity for in-range doubles. The natal
  path uses `wrapLongitudeExact` for bit-exact passthrough. Do not import the
  wrong one.

## 5. Choose wrap/precision conventions deliberately

- For SSS modules: use `wrapLongitudeExact` semantics (bit-exact no-op for
  `[0, 360)`, correct for out-of-range). Do not inherit the transit-path modulo
  form.
- Property-test the chosen wrap with fast-check over `[-1080, 1080]`:
  - Always in `[0, 360)`.
  - Bit-exact passthrough for in-range values.
  - Never returns exactly 360.

## 6. Build on existing time infrastructure

- `engine/compute/time.ts` owns parsing, canonicalization, and the split
  precise UTC/JD carrier. SSS day-count primitives build on top of its
  `PreciseUtcInstant`, not a parallel parser.
- The 1800–2399 supported range must be enforced before any arithmetic, with
  boundary tests on both inclusive edges and both first-outside values.
- Do not re-derive JD conversion. The existing Gregorian JD function is already
  independent of Swiss Ephemeris.

## 7. Make intermediates assertable

- Every multi-step computation (mean longitude → corrections → final) must
  return intermediate terms in a structured object, not just the final result.
- Test fixtures pin individual intermediates (mean place, equation of centre,
  ayanamsa) so a deviation localizes the component at fault.

## 8. Report deltas instead of tuning

- When golden values don't match, produce a structured failure report:
  ```
  Component: mean Mars longitude
  Expected:  202.114658836293° (India fixture)
  Actual:    202.114658901445°
  Delta:     +0.000000065152° (+0.23 arcsec)
  ```
- Do not adjust constants, coefficients, or correction terms to force a match
  unless you can cite the authoritative source for the adjusted value.
- An honestly failing golden test with a documented delta is more valuable than
  a passing one with an unexplained coefficient change.

## 9. Differential verification against HEAD

- For "no behavior change" extractions or refactors: run a bit-level
  differential on at least 8 representative birth inputs across the full output
  tree (not just sign-level or arcsecond-level assertions).
- Classify every detected delta: intentional additive field, wall-clock
  timestamp, or numeric regression. Zero numeric regressions is the pass
  condition.
- Suite pass ≠ behavior preservation. The test suite confirms what it tests,
  which may be weaker than the claimed contract.

## 10. Contract reuse over inline duplication

- When a constant, regex, type, or validation is defined as the canonical
  source, import it rather than copying it. Five hardcoded copies of a regex
  drift independently.
- If a separate build target (e.g., MCP) cannot import the source module, add
  a test asserting its copy matches the canonical value.

