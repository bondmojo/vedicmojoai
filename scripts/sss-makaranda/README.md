# PVR/JHora SSS oracle comparison harness

This development-only harness compares a normalized candidate implementation
against the independently transcribed India and Mojo JHora fixtures. It never
parses screenshots at runtime and is not imported by application routes.

Run it without a candidate to see the fields that remain unavailable:

```bash
npm run sss:compare-pvr -- --fixture india
npm run sss:compare-pvr -- --fixture mojo
```

Compare a future provider export and produce either Markdown or JSON:

```bash
npm run sss:compare-pvr -- --fixture india --candidate /absolute/path/india-sss.json
npm run sss:compare-pvr -- --fixture mojo --candidate /absolute/path/mojo-sss.json --format json
```

The candidate JSON uses the `SssOracleCandidate` contract in
`engine/compute/verification/sssOracleComparison.ts`. A historical calculation
must declare `candidateKind: "research_prototype"`, the SSS target profile and
its independently sourced parameter set. It does not claim the registered
profile is implemented. A production adapter must additionally declare
`calculationProfile: "surya_siddhanta_makaranda_v1"`; Drik/Lahiri input fails
the comparison rather than being treated as a substitute.

The result distinguishes:

- `pass` — comparable values are within their recorded tolerance;
- `fail` — a comparable value disagrees;
- `candidate_missing` — the implementation has not supplied the value; and
- `oracle_missing` — the preserved PVR/JHora evidence has not yet supplied an
  auditable machine-readable expected value.

The current `oracle_missing` sections are numeric ayanamsa and machine-readable
varga placements. Their screenshots are evidence, but must receive the same
two-pass transcription audit as the existing natal and Dasha fixtures before
they become executable acceptance values.
