# Sri Surya Siddhanta — Generalized Makaranda

## Task 3 Blocker and Source-Acquisition Plan

**Status:** Blocked on authoritative scientific specification  
**Prepared:** 2026-09-07  
**Scope:** `.kiro/specs/surya-siddhanta-makaranda/` Tasks 1–3

**Working source/equation resolver:**
[`SSS_MAKARANDA_RESOLVER.md`](SSS_MAKARANDA_RESOLVER.md)

---

## Executive Summary

Tasks 1 and 2 established the calculation-profile contracts, fractional-time
transport, JHora oracle fixtures, provider interface, and isolated Drik/Lahiri
implementation. They did not implement the Sri Surya Siddhanta astronomy.

Task 3 is blocked because the repository contains final JHora outputs but does
not contain an authoritative, versioned specification of the exact **“Sri Surya
Siddhanta — generalized Makaranda”** algorithm that generated them.

The missing material is scientific rather than architectural. The TypeScript
provider boundary is ready, but its equations, constants, epochs, correction
sequence, ayanamsa model, mean-node model, and Lagna conventions are not defined
well enough to implement or independently verify the required one-arcsecond
JHora compatibility.

Public historical sources explain substantial parts of Makaranda and classical
Surya Siddhanta computation. However, the available sources do not establish
the precise all-era generalization supplied to JHora by Sri Vinay Jha. JHora's
official release history also shows that its SSS implementation changed after
the initial release. The exact JHora version used for the repository screenshots
is not recorded.

The project should therefore either:

1. obtain a written, citable specification of the JHora-compatible generalized
   algorithm; or
2. explicitly redefine the calculation profile around a named published
   classical edition and document any divergence from JHora.

Fitting coefficients to the two existing output charts is not an acceptable
substitute. It would be scientifically underdetermined and would violate the
project's prohibition on reverse engineering and unreferenced coefficient
tuning.

---

## 1. Task 1 Status — Completed Scaffolding

Task 1 is marked complete in
`.kiro/specs/surya-siddhanta-makaranda/tasks.md`.

It delivered:

- immutable `drik_lahiri_v1` and
  `surya_siddhanta_makaranda_v1` profile definitions;
- typed profile resolution with no implicit Drik fallback;
- fractional-second birth-time parsing and a Swiss-independent Gregorian
  Julian-day carrier;
- India and Mojo JHora fixture transcriptions;
- fixture-integrity tests and explicit pending golden-test contracts; and
- temporary persistence safeguards preventing an unavailable SSS chart from
  entering legacy Drik deduplication.

Relevant implementation files:

- `engine/compute/profiles.ts`
- `engine/compute/time.ts`
- `engine/compute/__fixtures__/suryaSiddhantaMakaranda.ts`
- `engine/compute/suryaSiddhantaMakaranda.fixture.test.ts`
- `engine/compute/suryaSiddhantaMakaranda.golden.test.ts`

### Remaining Task 1 verification work

- The fixture transcription still requires the specified two-pass independent
  human release audit.
- The scientific natal and Dasha assertions remain pending because no SSS
  provider exists.
- The current JavaScript `Date` compatibility bridge rounds to milliseconds.
  The future JD-based Dasha strategy must preserve the accepted precision
  without relying on that bridge.

Task 1 therefore provides a safe test harness and data contract, not the
classical astronomical derivation.

---

## 2. Task 2 Status — Completed Provider Boundary

Task 2 is marked complete and delivered:

- the common `AstronomyProvider` interface;
- extraction of the existing Swiss Ephemeris/Lahiri implementation into
  `engine/compute/astronomy/drikLahiri.ts`;
- provider selection in `computeFullChart()`;
- provider-aware natal, transit, and Gochar entry points;
- separation of the sunrise instant from the active provider's Sun longitude;
  and
- fail-closed handling for the registered but unavailable SSS profile.

The key interface is in:

```text
engine/compute/astronomy/types.ts
```

The current resolver in `engine/compute/astronomy/index.ts` returns the Drik
provider and deliberately throws `CALCULATION_PROFILE_UNAVAILABLE` for
`surya_siddhanta_makaranda_v1`.

The required Task 3 provider file does not yet exist:

```text
engine/compute/astronomy/suryaSiddhantaMakaranda.ts
```

### Remaining Task 2 verification debt

The existing Drik regression coverage does not yet satisfy the newer scientific
verification rule requiring a bit-level, full-output differential over at least
eight representative birth inputs. This should be closed, but it is not the
cause of the Task 3 blockage.

---

## 3. Task 3 Status — Scientifically Unimplemented

The `[~]` markers beside Tasks 3.1–3.5 are planning markers. The task file
explicitly states that they must not be interpreted as completed scientific
features. The Task 3 parent remains unchecked.

Task 3 requires:

| Subtask | Required result | Current blocker |
|---|---|---|
| 3.1 | Makaranda day count, supported-range enforcement, normalization and fractional-time handling | Exact epoch, civil-day boundary, meridian and day-count convention are absent |
| 3.2 | Mean and corrected places for Sun, Moon and five visible planets | Mean-motion constants, bīja corrections and manda/śīghra algorithm are absent |
| 3.3 | SSS ayanamsa, mean Rahu and exact opposite Ketu | Ayanamsa equation and mean-node epoch/rate are absent |
| 3.4 | SSS/Makaranda Lagna and whole-sign attachment | Time correction, obliquity, meridian and Lagna algorithm are absent |
| 3.5 | India/Mojo golden tests within one arcsecond | Cannot be completed until 3.1–3.4 exist and the fixture audit is complete |

Only part of the generic infrastructure for Task 3.1 already exists:
`PreciseUtcInstant`, Gregorian JD conversion, and fractional-time parsing. The
Makaranda-specific `ahargana` and range contract do not exist.

---

## 4. Exact Scientific Blocker

The local evidence bundle establishes:

- India and Mojo birth inputs;
- final Lagna and graha longitudes;
- mean-node selection;
- an SSS ayanamsa selection with zero additional adjustment;
- whole-sign houses;
- selected Vimshottari settings; and
- displayed MD, AD and PD boundaries.

It does not establish the generating formulas.

The approved design refers to “validated generalized formulas,” but neither the
design nor the reference bundle identifies those formulas with a complete
bibliography, equations, constants, version, or worked calculation.

This matters because **generalized Makaranda is not synonymous with a generic
implementation of the surviving Surya Siddhanta text**. JHora's official 7.5
release notes state that:

- the generalized Makaranda algorithms were supplied by Sri Vinay Jha;
- the implementation includes traditional bīja-saṃskāra; and
- historical Makaranda rules were converted into a siddhantic form intended to
  work for all eras.

JHora's subsequent release history is scientifically material:

- version 7.51 corrected SSS inaccuracies and house-related behavior;
- version 7.6 changed SSS equation-of-time handling and introduced an SSS house
  system; and
- version 7.63 updated SSS calculations based on further communications from
  Sri Vinay Jha.

The source screenshots show the program title but not its Help/About
version/build. Until the build is recorded, “match JHora” is not a stable,
versioned acceptance target.

---

## 5. Information Required to Unblock Task 3

### 5.1 Time, epoch and day count

Obtain:

- the exact epoch date and zero instant;
- the definition of `ahargana` used by the generalized model;
- midnight, sunrise, or other civil-day boundary;
- the Laṅkā/Ujjain reference meridian and its numerical longitude;
- the deśāntara sign and east/west longitude conventions;
- Gregorian/Julian calendar treatment across 1800–2399;
- UTC, UT1, local mean time, or apparent solar-time convention;
- the equation-of-time rule applied to entered civil time;
- fractional-day handling; and
- rounding or truncation rules at every stage.

### 5.2 Mean places and bīja generalization

For Sun, Moon, Mars, Mercury, Jupiter, Venus and Saturn, obtain:

- epoch mean longitude;
- mean daily motion or revolution count;
- mandocca and śīghrocca epoch values and motions;
- every bīja-saṃskāra constant;
- the exact rule that generalizes Makaranda's historical corrections to all
  eras; and
- authoritative formula-source references for every coefficient.

### 5.3 Corrected places

Obtain:

- manda and śīghra equations or complete lookup tables;
- epicycle parameters and sine-table convention;
- interpolation method;
- correction signs by quadrant;
- the exact half/full correction sequence;
- iteration or convergence rules;
- the precise Mercury and Venus treatment;
- correction-stage rounding rules; and
- the method for deriving corrected longitudinal speed and retrograde state.

### 5.4 Ayanamsa and nodes

Obtain:

- the SSS ayanamsa reference epoch and value;
- its rate, cycle, or trepidation interpretation;
- sign and normalization convention;
- whether Makaranda graha positions are already native sidereal values and
  exactly where ayanamsa is applied;
- mean Rahu's epoch longitude and revolution count/rate;
- fractional-day handling for the node;
- the model speed convention; and
- numeric JHora ayanamsa checkpoints for India, Mojo, 1800-01-01 and
  2399-12-31.

### 5.5 Lagna

Obtain:

- the exact Lagna method used in the target JHora SSS mode;
- obliquity model and epoch behavior;
- sidereal-time, Tripraśna, or sign-rising-table convention;
- equation-of-time and local-time treatment;
- deśāntara and longitude sign rules;
- ayanamsa application point;
- interpolation rules; and
- intermediate values for the India and Mojo Lagnas.

### 5.6 Independent verification material

The minimum evidence package should include:

- exact JHora version/build from **Help → About**;
- textual or high-precision exports for India and Mojo;
- numeric ayanamsa for both fixtures;
- full intermediate traces containing day count, mean place, each correction,
  ayanamsa and final place;
- several additional dates spanning 1800–2399;
- cases near longitude wraparound, retrograde stations and Lagna sign
  boundaries; and
- two independent human audits of the checked-in fixture values.

More final-output screenshots would improve regression coverage, but would not
replace the missing formula specification.

---

## 6. Recommended Acquisition Routes

### Priority 1 — Original algorithm sources

Contact Sri Vinay Jha and P.V.R. Narasimha Rao/JHora and request a written,
citable formula specification rather than program source code or binaries.

The request should ask for:

1. the exact generalized Makaranda algorithm version represented in JHora after
   the 7.63 update;
2. permission to create an independent implementation;
3. all epochs, constants, equations, correction order and rounding rules;
4. the exact SSS ayanamsa and mean-node rules;
5. the SSS civil-time/equation-of-time and Lagna conventions;
6. worked India and Mojo calculations containing intermediate terms; and
7. confirmation of which JHora version should be treated as the oracle.

Official JHora references:

- <https://www.vedicastrologer.org/jh/update_7.5.htm>
- <https://vedicastrologer.org/jh/update_7.51.htm>
- <https://vedicastrologer.org/jh/update_7.6.htm>
- <https://www.vedicastrologer.org/jh/update_7.63.htm>

### Priority 2 — Makaranda editions and manuscripts

Acquire and have a qualified mathematical-astronomy scholar interpret:

- Makaranda Sāriṇī, 1923 scan:  
  <https://archive.org/details/in.ernet.dli.2015.405753>
- Makaranda Sāriṇī manuscript/edition from Lal Bahadur Shastri Sanskrit
  University:  
  <https://archive.org/details/rSuR_makarand-sarini-of-diwakar-manu-03-02-673-lal-bahadur-shastri-sanskrit-university/mode/2up>
- University of Pennsylvania Hindu astronomy manuscript collection:  
  <https://colenda.library.upenn.edu/?f%5Bphysical_format_sim%5D%5B%5D=treatises&f%5Bsubject_sim%5D%5B%5D=Hindu+astronomy&per_page=100&sort=system_modified_dtsi+asc>
- British Library `Makarandasyodāhṛti`, shelfmark IO SAN 1681b:  
  <https://searcharchives.bl.uk/catalog/032-003720045>
- `Makaranda Prakāśa`, Pt. Laśanlāl Jhā, Chaukhamba Surbharati:  
  <https://www.exoticindiaart.com/book/details/makaranda-prakasha-nzb231/>

These sources can establish a defensible classical implementation, but they may
not independently establish the exact later all-era transformation supplied to
JHora.

### Priority 3 — Specialist reconstruction

Commission a technical transcription or calculation memo from researchers who
have already reconstructed parts of Makaranda's tables.

A useful starting paper is:

- Banuvalli Chetana and S. K. Uma, “Indian astronomical tables — a study with
  special reference to Makarandasāriṇī,” complete article, pp. 402–404:  
  <https://www.currentscience.ac.in/Volumes/122/04/0402.pdf>

The Sir MVIT institutional compilation supplied during the investigation
contains only p. 402 of this article before switching to an unrelated paper:
<https://www.sirmvit.edu/wp-content/uploads/2023/09/3.3.1_2022.pdf>.

The paper contains corresponding-author contact information. The requested work
should be a computational specification with explicit constants and worked
examples, not merely a translation or historical summary.

Sampurnanand Sanskrit Vishwavidyalaya's Jyotiṣa department is another potential
source of a qualified Siddhānta/Gaṇita reviewer:

- <https://www.ssvv.ac.in/depart-of-jyotisha-siddhanta-falit-ganit>
- <https://ssvv.ac.in/contact-us>

---

## 7. Minimum Unblock Package

Task 3 should resume only after the following package exists in a versioned,
reviewable form:

```text
Generalized Makaranda Formula Memo, version X
├── provenance and permission
├── exact target JHora version/build
├── time scale, epoch, meridian and ahargana
├── per-graha mean-motion constants
├── bīja generalization rules
├── manda/śīghra equations and correction order
├── ayanamsa and mean-node formulas
├── Lagna and equation-of-time conventions
├── rounding and numerical precision rules
├── India full intermediate trace
├── Mojo full intermediate trace
└── boundary/station/wraparound verification cases
```

The memo should identify a source for every non-trivial coefficient. It should
be preserved under `docs/reference/surya-siddhanta-makaranda/` as a new dated
artifact and reviewed before its constants enter production code.

---

## 8. Decision if the Exact Algorithm Cannot Be Obtained

### Option A — Retain exact JHora compatibility

Keep Task 3 blocked. Do not implement a generic SSS approximation under the
existing `surya_siddhanta_makaranda_v1` identity.

### Option B — Adopt a cited classical implementation

Select a specific published Surya Siddhanta/Makaranda edition, commission its
computational interpretation, and revise the profile contract to name that
source precisely. JHora outputs can remain comparative oracles, but differences
must be reported as known divergences rather than tuned away.

This option should use a distinct profile/version so users are not told that an
independent textual implementation is identical to JHora's generalized
Makaranda mode.

---

## 9. Immediate Action Checklist

- [ ] Capture the fixture machine's **JHora Help → About** screen.
- [ ] Record the exact JHora version/build and installation provenance.
- [ ] Export or capture numeric SSS ayanamsa for India and Mojo.
- [ ] Send the formula-package request to Sri Vinay Jha and the JHora
      maintainer.
- [ ] Obtain `Makaranda Prakāśa` and the available Makaranda Sāriṇī scans.
- [ ] Contact a Makaranda mathematical-astronomy researcher for a scoped paid
      technical memo.
- [ ] Complete the two-pass human audit of existing fixtures.
- [ ] Choose between exact JHora compatibility and a specifically sourced
      classical profile if the original generalized algorithm is unavailable.
- [ ] Resume Task 3 only after the chosen formula contract is versioned and
      approved.

---

## 10. Repository References

- `.kiro/specs/surya-siddhanta-makaranda/requirements.md`
- `.kiro/specs/surya-siddhanta-makaranda/design.md`
- `.kiro/specs/surya-siddhanta-makaranda/tasks.md`
- `.kiro/skills/scientific-verification.md`
- `docs/reference/surya-siddhanta-makaranda/README.md`
- `docs/reference/surya-siddhanta-makaranda/fixtures.md`
- `engine/compute/profiles.ts`
- `engine/compute/time.ts`
- `engine/compute/astronomy/types.ts`
- `engine/compute/astronomy/index.ts`
- `engine/compute/suryaSiddhantaMakaranda.golden.test.ts`
