# Claude Code Handoff — Historical Makarandasāriṇī Research Prototype

**Status:** Ready for research-prototype implementation; production SSS remains blocked  
**Target repository:** VedicMojoAI  
**Do not implement as:** `surya_siddhanta_makaranda_v1`

## 1. Mission

Implement a pure, standalone, **historical Makarandasāriṇī research prototype**
from explicitly cited published formulae and tables. Use the existing India and
Mojo PVR Narasimha Rao/Jagannatha Hora screenshots as a read-only output oracle
through the repository's comparison harness.

The goal is to learn which historical components reproduce or diverge from the
PVR/Vinay Jha generalized-Makaranda output. It is **not** to claim that the
historical reconstruction is the proprietary/all-era generalized method, and it
is not authorization to enable the production calculation profile.

## 2. Required reading, in order

1. [Project instructions](../Agents.md)
2. [Scientific verification guardrails](../.kiro/skills/scientific-verification.md)
3. [SSS requirements](../.kiro/specs/surya-siddhanta-makaranda/requirements.md)
4. [Approved SSS design](../.kiro/specs/surya-siddhanta-makaranda/design.md)
5. [Task list](../.kiro/specs/surya-siddhanta-makaranda/tasks.md)
6. [Formula/source resolver](SSS_MAKARANDA_RESOLVER.md)
7. [PVR/JHora oracle status](SSS_MAKARANDA_ORACLE_COMPARISON.md)
8. [Reference-bundle handling rules](reference/surya-siddhanta-makaranda/README.md)

Treat the requirements and design as product contracts. Treat the resolver as a
source ledger and research boundary. Treat JHora/PVR output as an acceptance
oracle only, never a source for coefficients or an implementation dependency.

## 3. Non-negotiable constraints

- Do not edit `docs/reference/surya-siddhanta-makaranda/**` or
  `engine/compute/__fixtures__/suryaSiddhantaMakaranda.ts`.
- Do not copy, decompile, call, automate, parse at runtime, or vendor JHora,
  PyJHora, or screenshot/OCR output.
- Do not use Swiss Ephemeris, `swisseph-v2`, `astronomy/drikLahiri`,
  `planets.ts`, database code, UI code, a network call, or an LLM in the
  prototype's dependency tree.
- Do not alter `resolveAstronomyProvider()` or make
  `surya_siddhanta_makaranda_v1` available. It must remain fail-closed.
- Do not tune a constant, epoch, correction, or rounding rule merely to reduce
  an India/Mojo delta. Record the delta and its likely stage instead.
- Do not create/persist a chart, expose an API/MCP route, or draw a user-facing
  chart from prototype output.
- Preserve the existing Drik/Lahiri behavior bit-for-bit.

## 4. Scientific scope

### In scope now

- Historical MKS ahargaṇa/day-count logic whose epoch, calendar convention and
  arithmetic can be cited to a source page/table and checked against a published
  worked example.
- Historical mean places and manda/śīghra corrections only when the exact
  parameter set, units, correction order, signs and interpolation rule are
  source-backed.
- Structured intermediate traces: day count, mean place, each correction term,
  final historical longitude, source IDs and precision/rounding decisions.
- A research-candidate adapter for the PVR/JHora comparator and reports of
  comparable deltas.

### Explicitly out of scope until a source resolves it

- The PVR/Vinay Jha all-era generalized Makaranda transformation.
- SSS ayanāṃśa formula and generalized mean-node epoch/rate.
- JHora's effective-time, equation-of-time and Lagna calculation.
- A full SSS natal provider, vargas, upagrahas/special lagnas, Vimshottari,
  transits, Gochar, persistence, UI, MCP, reports or Duration Analysis.
- Any claim of one-arcsecond compatibility or production readiness.

If a source is ambiguous or combines historical and proposed-modern parameters,
stop that component at `unavailable` and record the ambiguity. Do not choose a
value silently.

## 5. Implementation layout

Create a research-only subtree that cannot be mistaken for a provider:

```text
engine/compute/research/historicalMakarandasari/
  types.ts                 # Input, trace, availability and source IDs
  ahargana.ts              # Cited historical day-count component
  meanPlaces.ts            # Only source-backed mean-place calculations
  corrections.ts           # Manda/sighra stages, preserving every term
  prototype.ts             # Composes only available historical components
  provenance.ts            # Immutable parameter-set/source metadata
  *.test.ts                # Published-example and isolation tests
scripts/sss-makaranda/
  export-historical-prototype-candidate.ts
docs/research/
  historical-makarandasari-formula-register.md
  historical-makarandasari-validation-log.md
```

Use ASCII path names. Do not create
`engine/compute/astronomy/suryaSiddhantaMakaranda.ts`; that name is reserved for
the future validated production provider.

## 6. Phase plan and gates

### Phase A — Formula register before code

Create `docs/research/historical-makarandasari-formula-register.md`. For every
proposed formula/table, record:

| Field | Required content |
|---|---|
| Component | e.g. ahargaṇa, Sun mean place, Mars manda correction |
| Source ID | Resolver ledger ID such as S08/S09/S10/S11 |
| Exact locator | publication, edition, page, equation/table/row |
| Parameter set | historical edition/version; never mixed implicitly |
| Units and angular convention | degrees, rāśi/kalā/vikalā, sine-table scale, etc. |
| Time basis | epoch, civil-day boundary, meridian, calendar assumption |
| Formula/correction sequence | including signs, quadrant and iteration rules |
| Rounding | source-stated rule, or `not stated` |
| Independent check | published worked example and expected intermediate/output |
| Status | `approved_for_prototype`, `ambiguous`, or `unavailable` |

Only `approved_for_prototype` items may enter TypeScript. A citation to a broad
discussion without a usable formula/table is `unavailable`, not approval.

**Gate A:** no formula code before at least one source-backed, manually checked
worked example exists for that component.

### Phase B — Ahargaṇa slice

Implement the smallest proven day-count component using the existing pure
Gregorian time transport where appropriate. Return a trace with all inputs and
the final day count. Test:

- the source's published worked examples;
- input-range boundaries where the source supports them;
- fractional civil-time propagation; and
- no Swiss/Drik imports anywhere in the research subtree.

Do not assume that this is JHora's day count. It is a historical prototype
component until PVR/Vinay Jha evidence proves otherwise.

**Gate B:** published-example tests pass with a cited tolerance; if the source
does not state a tolerance, preserve its displayed precision and document it.

### Phase C — Planetary components, one independently traceable stage at a time

Add mean place, then correction stages one body/group at a time. Each function
must return named intermediate values rather than a bare longitude. For example:

```ts
{
  availability: 'available',
  sourceIds: ['S09:table-…', 'S11:p.640'],
  ahargana,
  meanLongitude,
  halfSighra?: { value, sign, inputs },
  manda?: { value, sign, inputs },
  fullSighra?: { value, sign, inputs },
  finalLongitude,
  rounding: '…'
}
```

Implement only the correction order that the selected historical parameter set
actually supports. Keep proposed modern revisions in a distinct parameter-set
module; do not mix them with historical tables.

**Gate C:** every body/stage has (1) a formula-register entry, (2) a test of a
published worked value/intermediate, and (3) an import-isolation test.

### Phase D — PVR/JHora differential report

Write a development-only exporter that normalizes available research output into
`SssOracleCandidate` with:

```text
candidateKind: "research_prototype"
targetProfile: "surya_siddhanta_makaranda_v1"
implementationId: immutable prototype/version identifier
provenance.parameterSetId: historical source-set identifier
provenance.formulaSourceIds: page/equation-level source IDs
```

Run the existing comparator for each fixture:

```bash
npm run sss:compare-pvr -- --fixture india --candidate /absolute/path/india-historical.json --format json
npm run sss:compare-pvr -- --fixture mojo --candidate /absolute/path/mojo-historical.json --format json
```

The output must be saved as a dated **validation log**, outside the reference
bundle. Include the source parameter set, input identity, comparison command,
all non-passing/missing fields, signed arcsecond/second deltas and a
stage-level hypothesis. A delta is evidence, not an instruction to tune.

**Gate D:** comparison reports are informative only. They cannot enable the
profile because ayanāṃśa, nodes, effective time/Lagna and production Dasha rules
remain unresolved.

## 7. PVR/JHora fixture facts

- Use the test-only normalized birth inputs from
  `engine/compute/__fixtures__/suryaSiddhantaMakaranda.ts`; do not read `.jhd`
  files at runtime.
- The saved MCP records called `India` and `devendra` are not valid substitutes:
  their coordinates differ from the JHD fixtures and their output is Drik/Lahiri.
- Available executable oracle fields: D1 Lagna/nine grahas, listed points, nine
  MD periods, one expanded AD group and one expanded PD group for each fixture.
- Numeric ayanāṃśa and machine-readable varga placements are absent from the
  oracle. Return them as unavailable; never assume zero or infer expected values
  from screenshots.
- The JHora version/build and active calculation-mode screenshot are not
  recorded. Do not assert release-grade compatibility.

## 8. Required tests and commands

At minimum, run:

```bash
npx vitest run \
  engine/compute/research/historicalMakarandasari/*.test.ts \
  engine/compute/verification/sssOracleComparison.test.ts \
  engine/compute/suryaSiddhantaMakaranda.fixture.test.ts \
  engine/compute/suryaSiddhantaMakaranda.golden.test.ts

npm run sss:compare-pvr -- --fixture india --candidate /absolute/path/india-historical.json --format json
npm run sss:compare-pvr -- --fixture mojo --candidate /absolute/path/mojo-historical.json --format json
```

Also run the smallest relevant Drik regression suite whenever shared time or
normalization helpers change. Do not report all-repository type-check success
unless it actually passes in the caller's prepared environment.

## 9. Stop conditions and escalation

Stop implementation of a component and report the exact blocker if any of these
occur:

1. the source omits an epoch, coefficient, table interpretation, correction sign
   or rounding rule needed to calculate the component;
2. a source's historical and proposed-modern parameter sets cannot be cleanly
   distinguished;
3. a PVR/JHora delta would require fitting a value not supported by the source;
4. the prototype would need ayanāṃśa, node, effective-time or Lagna logic whose
   source remains unavailable; or
5. work would require touching the production provider, persistence or UI.

Report: component, cited source, missing/ambiguous datum, any computed
intermediates, PVR delta if applicable, and the precise source needed to proceed.

## 10. Definition of done for this handoff

This handoff is complete when Claude Code delivers:

1. a reviewed formula register;
2. pure research-only code for only the source-supported historical components;
3. tests against the cited published worked examples and import-isolation tests;
4. India/Mojo candidate exports and comparator reports; and
5. a validation log that clearly says whether the historical prototype agrees or
   diverges from the PVR/Vinay Jha oracle.

It is **not** complete when a chart merely resembles JHora, when two fixtures
match after tuning, or when the production SSS profile is made callable.

## 11. Paste-ready Claude Code prompt

```text
Read Agents.md, .kiro/skills/scientific-verification.md,
docs/SSS_MAKARANDA_CLAUDE_CODE_HANDOFF.md,
docs/SSS_MAKARANDA_RESOLVER.md, and the SSS requirements/design/tasks before
editing. Implement only the historical Makarandasāriṇī research prototype
described in the handoff. Do not modify docs/reference/** or the SSS fixture;
do not use Swiss Ephemeris, Drik code, JHora/PyJHora, network calls or any
runtime/provider/UI/DB integration. Keep surya_siddhanta_makaranda_v1
fail-closed. Create the formula register first; code only page/equation-backed
historical components with structured intermediate traces and published-example
tests. Export research candidates for India and Mojo and run the PVR/JHora
comparator, recording all deltas without coefficient fitting. Stop and report
any source ambiguity rather than guessing. Update the required project docs in
the same change, run the focused tests, and summarize source provenance,
validation results, known gaps, and files changed.
```
