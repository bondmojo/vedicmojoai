# SSS/Makaranda PVR/JHora Oracle Comparison

**Status:** Comparison harness implemented; production astronomy unavailable  
**Oracle fixtures:** India and Mojo  
**Calculation profile under test:** `surya_siddhanta_makaranda_v1`

**Implementation handoff:**
[`SSS_MAKARANDA_CLAUDE_CODE_HANDOFF.md`](SSS_MAKARANDA_CLAUDE_CODE_HANDOFF.md)

## Purpose

The repository can now compare a future standalone SSS/Makaranda result with
the preserved PVR Narasimha Rao/Jagannatha Hora evidence without using JHora at
runtime and without deriving expected values from VedicMojoAI's own output.

This harness does not implement the missing astronomy. It keeps the production
profile fail-closed and provides the differential verification layer needed
when independently sourced equations become available.

## Current oracle coverage

| Area | India | Mojo | Executable comparison |
|---|---:|---:|---|
| Exact JHD birth record | Yes | Yes | Yes |
| Lagna and nine graha longitudes | 10 values | 10 values | Yes, circular delta in arcseconds |
| Nakshatra, pada and retrograde state | Yes | Yes | Yes; explicit spelling aliases, exact pada/state |
| Upagraha and special-point longitudes | Partial screenshot coverage | Broader screenshot coverage | Yes for transcribed values |
| Vimshottari Mahadasha | 9 periods | 9 periods | Yes, boundary delta in seconds |
| One Antardasha expansion | 9 periods | 9 periods | Yes, boundary delta in seconds |
| One Pratyantardasha expansion | 9 periods | 9 periods | Yes, boundary delta in seconds |
| Numeric SSS ayanamsa | Not displayed/transcribed | Not displayed/transcribed | No: `oracle_missing` |
| Machine-readable varga placements | Screenshot only | Screenshot only | No: `oracle_missing` pending two-pass transcription |
| Exact JHora build/version | Not recorded | Not recorded | No: source-acquisition requirement |

## Known evidence qualifications

- No screenshot records the exact JHora version/build. Window titles identify
  Jagannatha Hora and the JHD file only.
- The preserved option screenshots are for Mojo. Applying those settings to
  India assumes that the same global/session configuration remained active.
- Mojo's natal screenshot displays Bhava Lagna at `29 Ta 32′42.23″` and Hora
  Lagna at `17 Ge 53′39.75″`; the additional-points screenshot displays the
  same values ending in `42.24″` and `39.76″`. The current transcription uses
  the natal screenshot. The 0.01″ differences are inside the one-arcsecond
  numerical gate but remain an audit note, not silently merged evidence.
- Rahu/Ketu retrograde flags in the structured fixture are inferred from the
  selected mean-node behavior; the natal tables do not visibly append `(R)` to
  the nodes.
- Mahadasha transcription has machine-assisted review. The displayed AD/PD
  expansions and the complete fixture still require the recorded human release
  audit.

## Input identity warning

The existing MCP records named `India` and `devendra` share the intended dates,
times and regions, but they are not exact copies of the JHD inputs:

| Fixture mapping | JHD coordinates | Existing MCP coordinates | Approximate separation |
|---|---|---|---:|
| India → `India` | 28.666666667 N, 77.216666667 E | 28.6432577 N, 76.469356 E | 72.97 km |
| Mojo → `devendra` | 24.888611111 N, 74.626944444 E | 24.9048313 N, 74.5803945 E | 5.03 km |

Those MCP charts are also `source="compute"` Drik/Lahiri charts. They must not
be supplied to the harness as SSS results. Future comparisons should calculate
from the exact JHD birth inputs carried by the fixture module.

## Comparison contract

The normalized candidate and structured report types live in
`engine/compute/verification/sssOracleComparison.ts`. The report records each
component's expected value, actual value, signed/absolute delta, unit,
tolerance, evidence pointer and one of four statuses:

- `pass`
- `fail`
- `candidate_missing`
- `oracle_missing`

Every candidate is labelled either `research_prototype` or
`production_provider` and must identify its independent parameter set and
formula sources. A research prototype can be compared without falsely claiming
that the registered profile exists. Production candidates must carry the exact
SSS profile ID, and any Drik/Lahiri substitution fails closed.

Longitude comparisons use the shortest circular difference so values around
0°/360° are handled correctly. Natal and transcribed point longitudes retain
the one-arcsecond acceptance gate. Dasha boundaries are compared as instants,
not formatted strings, and report signed seconds. JHora spellings such as
`Asresha`/`Visakha` are preserved in the oracle and compared through an explicit
alias map to engine spellings `Ashlesha`/`Vishakha`.

## Commands

Inventory the currently missing candidate values:

```bash
npm run sss:compare-pvr -- --fixture india
npm run sss:compare-pvr -- --fixture mojo
```

Compare a normalized future implementation export:

```bash
npm run sss:compare-pvr -- --fixture india --candidate /absolute/path/india-sss.json
npm run sss:compare-pvr -- --fixture mojo --candidate /absolute/path/mojo-sss.json --format json
```

An outcome of `incomplete` means candidate fields are absent. `partial` means
all supplied comparable fields pass but the PVR/JHora bundle lacks at least one
machine-readable oracle. `fail` identifies real disagreements or an attempted
Drik substitution.

## Promotion rule

The harness can be used immediately for research prototypes, but
`surya_siddhanta_makaranda_v1` must remain unavailable until the equations and
constants have independent provenance and the India/Mojo comparisons pass.
Varga and numeric ayanamsa checks stay explicitly unavailable until their
oracle evidence is independently transcribed; generated engine output must
never be copied back into the expected fixture.
