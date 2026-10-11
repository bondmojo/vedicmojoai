# Sri Surya Siddhanta — Generalized Makaranda Resolver

**Status:** Active investigation; exact JHora-compatible Task 3 remains blocked

**Last verified:** 2026-09-07

**Implementation target:** `surya_siddhanta_makaranda_v1`

**Related diagnosis:** [`SSS_MAKARANDA_TASK3_BLOCKER.md`](SSS_MAKARANDA_TASK3_BLOCKER.md)

**PVR/JHora comparison harness:**
[`SSS_MAKARANDA_ORACLE_COMPARISON.md`](SSS_MAKARANDA_ORACLE_COMPARISON.md)

**Claude Code research handoff:**
[`SSS_MAKARANDA_CLAUDE_CODE_HANDOFF.md`](SSS_MAKARANDA_CLAUDE_CODE_HANDOFF.md)

---

## 1. Purpose

This document is the working resolver for `.kiro/specs/surya-siddhanta-makaranda/`
Task 3. It records:

- what the repository already implements;
- which scientific facts have been established;
- the exact publication or local artifact supporting each fact;
- what remains unknown for an exact JHora-compatible implementation;
- which parts can be prototyped from published Makaranda research; and
- the evidence and tests required before any formula becomes production code.

This is deliberately stricter than a bibliography. A source appearing here does
not automatically authorize using every number in it. Each proposed formula or
constant must be connected to a page, equation/table, interpretation, and
independent verification case.

---

## 2. Current Resolution in One Sentence

Public sources now provide a credible route to reconstructing **historical
Makarandasāriṇī day-count and planetary-correction procedures**, but they do not
yet specify the exact **all-era generalized Makaranda transformation used by
JHora**, its SSS ayanāṃśa and mean-node formulas, or its effective-time and Lagna
conventions.

Therefore:

- source transcription and a separately labelled research prototype can begin;
- `surya_siddhanta_makaranda_v1` must continue to fail closed; and
- the existing India/Mojo JHora values remain output oracles, not coefficients
  from which formulas may be fitted.

---

## 3. What Tasks 1 and 2 Already Give Us

| Area | Current state | Repository evidence |
|---|---|---|
| Profile contract | Complete | `engine/compute/profiles.ts` defines immutable Drik and SSS profiles |
| Precise civil time and Gregorian JD transport | Complete scaffolding | `engine/compute/time.ts` |
| Provider boundary | Complete | `engine/compute/astronomy/types.ts` and `engine/compute/astronomy/index.ts` |
| Drik/Lahiri isolation | Complete | `engine/compute/astronomy/drikLahiri.ts` |
| SSS provider | Not implemented; fails closed | Resolver throws `CALCULATION_PROFILE_UNAVAILABLE` |
| JHora oracle data | India and Mojo natal, point, MD/AD/PD values transcribed | `docs/reference/surya-siddhanta-makaranda/fixtures.md` |
| Scientific goldens | Contract exists, formula-dependent assertions pending | `engine/compute/suryaSiddhantaMakaranda.golden.test.ts` |
| Fixture structure checks | Implemented | `engine/compute/suryaSiddhantaMakaranda.fixture.test.ts` |
| Human fixture release audit | Pending | Recorded in the fixture documentation and tests |

The unresolved work begins at the scientific contents of the provider, not at
the TypeScript architecture.

---

## 4. Task 3 Resolution Board

### 4.1 Task 3.1 — Ahargaṇa, epoch, time and day count

**Established for historical Makarandasāriṇī:**

- Ahargaṇa is the elapsed count of civil days from a selected epoch.
- Siddhāntic systems may count at mean midnight or mean sunrise for the
  Ujjain/Laṅkā meridian; the convention must therefore be named, not assumed.
- The Makarandasāriṇī discussion identifies a Kali-era basis and a midnight
  central-meridian convention.
- Published tables and examples show how traditional dates and Gregorian/Julian
  dates can be connected to ahargaṇa.

**Primary supporting sources:** S07 pp. 403–404 and S08 pp. 16–32, especially
pp. 16–19 and the worked tables/examples that follow.

**Still missing for the production JHora-compatible profile:**

- confirmation that JHora's generalized implementation uses the published MKS
  epoch and midnight convention without an additional offset;
- exact reference-meridian longitude and sign convention used by JHora;
- UTC → local civil → mean/apparent solar-time conversion sequence;
- JHora 7.6 equation-of-time details beyond the release-note description;
- fractional-day and intermediate rounding rules; and
- the exact generalized rule across the full required 1800–2399 range.

**Status:** `PARTIAL — historical prototype possible; production rule unresolved`

**Next resolver action:** transcribe S08's MKS day-count definition, tables, and
worked examples into a formula sheet, then request the same intermediate
ahargaṇa from the target JHora build for India and Mojo.

### 4.2 Task 3.2 — Mean and corrected graha positions

**Established for historical Makarandasāriṇī:**

- MKS is a mean-linear table system: mean-motion tables are accompanied by
  equation/correction tables.
- Its major planetary tables include mean longitudes, mandaphala (equation of
  centre), and śīghraphala (equation of conjunction).
- Sun and Moon receive the manda correction; the five visible planets require
  manda and śīghra corrections.
- The MKS planetary correction order is described as three stages:
  half-śīghra → manda → full-śīghra, combining the otherwise separate half/full
  manda treatment.
- Published studies contain mean daily motions, inferred bīja/revolution
  comparisons, manda/śīghra tables, analytical expressions, and worked cases.

**Primary supporting sources:** S07 pp. 402–404; S09 pp. 186–208, especially
pp. 190–191 and 198–202; S10 pp. 221–240, especially pp. 222–231; and S11
pp. 637–658, especially the MKS correction sequence and examples around p. 640.

**Important qualification:** S10 explicitly says that the MKS text and its
commentaries do not state how the five planetary mandaphala tables were formed.
Its authors derive a **possible** procedure and later propose revised modern
parameters. That derivation is valuable candidate mathematics, but it is not
proof of JHora's Vinay Jha algorithm. Proposed modernized parameters must not be
silently mixed with historical MKS or the JHora oracle.

**Still missing for the production JHora-compatible profile:**

- the exact epoch mean places and per-body mean motions used by JHora;
- the complete all-era bīja-saṃskāra transformation;
- mandocca and śīghrocca epochs and motions;
- the exact per-body manda and śīghra parameters selected by JHora;
- interpolation, quadrant signs, iteration and rounding rules;
- the precise Mercury and Venus treatment;
- numerical speed/retrograde derivation; and
- changes introduced through JHora 7.63.

**Status:** `PARTIAL — published component formulas exist; JHora parameter set unresolved`

**Next resolver action:** create a line-by-line equation register from S09–S11,
without coding or choosing among conflicting parameter sets, and calculate their
published worked examples independently.

### 4.3 Task 3.3 — SSS ayanāṃśa and mean nodes

**Established:**

- JHora 7.5 states that generalized Makaranda mode includes an SSS ayanāṃśa.
- The saved JHora configuration and fixtures establish zero additional
  ayanāṃśa adjustment and mean Rahu/Ketu as the required product settings.
- One historical MKS-related eclipse example in S09 pp. 205–206 supplies a
  dated ayanāṃśa value and shows it being added to a sidereal Sun to obtain a
  tropical Sun. It is a useful historical checkpoint, not a JHora formula.

**Still missing:**

- ayanāṃśa epoch, value, rate/cycle/trepidation rule and normalization;
- whether and where JHora applies the ayanāṃśa in this mode;
- mean Rahu epoch longitude, rate/revolution count and time basis;
- speed convention and rounding; and
- numeric JHora ayanāṃśa checkpoints for India, Mojo and range boundaries.

**Status:** `BLOCKED — configuration known; generating equations unknown`

**Next resolver action:** obtain numeric ayanāṃśa and Rahu intermediate output
from JHora, and search the cited editions/commentaries for explicit node and
precession rules.

### 4.4 Task 3.4 — Effective time, Lagna and houses

**Established:**

- JHora 7.5 says the SSS generalized Makaranda option calculates both planetary
  longitudes and Lagna.
- JHora 7.6 changed SSS effective time so that the equation of time uses the SSS
  Sun rather than the Drik Sun; the release notes call the change disruptive and
  say it can shift effective time by seconds or more than a minute.
- JHora 7.6 also introduced an SSS bhava/chalit house system close to, but not
  identical with, Sripati.
- The VedicMojoAI profile deliberately uses whole-sign houses after Lagna is
  obtained, so Task 3.4 needs the exact Lagna longitude but does not need to
  reproduce JHora's SSS unequal-house cusps.
- S09 pp. 205–206 contains a dated historical true Sun/Lagna/ayanāṃśa example
  that may serve as a secondary cross-check after its assumptions are understood.

**Still missing:**

- the exact SSS equation-of-time equation and its input/output time scale;
- local longitude/deśāntara and meridian signs;
- obliquity and sidereal-time or sign-rising procedure;
- ayanāṃśa application point;
- interpolation and rounding; and
- India/Mojo intermediate effective time and pre-ayanāṃśa Lagna.

**Status:** `BLOCKED — release behavior known; generating equations unknown`

**Next resolver action:** request a JHora intermediate trace or worked manual
calculation for effective time and Lagna, and locate the relevant
Makaranda/Tripraśna commentary material.

### 4.5 Task 3.5 — Golden verification

**Established:**

- India and Mojo provide displayed Lagna, Sun, Moon, five visible planets, mean
  Rahu/Ketu, special points and Dasha boundaries.
- Tests define a one-arcsecond natal tolerance and keep formula-dependent checks
  pending.
- The provider must diverge from Drik and must not import Swiss Ephemeris.

**Still missing:**

- exact JHora version/build used to produce the source screenshots;
- independent two-person fixture audit;
- higher-precision textual exports;
- direct SSS ayanāṃśa values;
- intermediate values for fault localization; and
- additional cases for range edges, wraparound, retrograde stations and Lagna
  boundaries.

JHora's release history makes the missing version scientifically material: SSS
behavior was fixed in 7.51, its house/effective-time handling changed in 7.6,
and planetary calculations were updated again in 7.63.

**Status:** `READY AS OUTPUT ORACLE; NOT READY TO IDENTIFY THE FORMULA`

**Next resolver action:** capture **Help → About** on the fixture machine before
creating more screenshots or exports.

---

## 5. Source Ledger — Exactly What We Used

### S01 — Approved local requirements, design and tasks

- **Links:**
  - [Requirements](../.kiro/specs/surya-siddhanta-makaranda/requirements.md)
  - [Design](../.kiro/specs/surya-siddhanta-makaranda/design.md)
  - [Tasks](../.kiro/specs/surya-siddhanta-makaranda/tasks.md)
- **Used for:** required profile identity, supported range, independence from
  Swiss Ephemeris, output fields, one-arcsecond target, whole-sign houses and
  true-sidereal-solar-year contract.
- **Does not prove:** any classical equation or numerical constant.

### S02 — Local JHora oracle bundle

- **Links:**
  - [Reference bundle](reference/surya-siddhanta-makaranda/README.md)
  - [India/Mojo transcription](reference/surya-siddhanta-makaranda/fixtures.md)
  - [Mojo settings evidence](reference/surya-siddhanta-makaranda/mojo-settings.md)
- **Used for:** birth inputs, final displayed longitudes, mean-node selection,
  ayanāṃśa setting, whole-sign attachment, special points and MD/AD/PD times.
- **Does not prove:** the equations producing those outputs.
- **Audit state:** human release audit pending.

### S03 — JHora 7.5 release notes

- **Link:** <https://www.vedicastrologer.org/jh/update_7.5.htm>
- **Used portion:** change item 1.
- **Used for:** the official name “SSS — generalized Makaranda,” attribution of
  the algorithms to Sri Vinay Jha, inclusion of SSS ayanāṃśa, use of traditional
  bīja-saṃskāra, and the statement that Makaranda rules were generalized into a
  siddhāntic form intended for all eras.
- **Does not provide:** equations, constants or worked intermediate values.

### S04 — JHora 7.51 release notes

- **Link:** <https://www.vedicastrologer.org/jh/update_7.51.htm>
- **Used portions:** introductory note and change items 1 and 6.
- **Used for:** evidence that SSS introduced instabilities/inaccuracies, that a
  sunrise-definition freeze was fixed, and that SSS house-system behavior was
  corrected after 7.5.
- **Consequence:** “matches JHora” must name a version.

### S05 — JHora 7.6 release notes

- **Link:** <https://www.vedicastrologer.org/jh/update_7.6.htm>
- **Used portions:** change items 6 and 10.
- **Used for:** introduction of the SSS-specific bhava/chalit system and the
  disruptive effective-time change to use the SSS Sun in the equation of time.
- **Does not provide:** the house or equation-of-time formula.

### S06 — JHora 7.63 release notes

- **Link:** <https://www.vedicastrologer.org/jh/update_7.63.htm>
- **Used portion:** change item 4.
- **Used for:** proof that SSS planetary calculations were updated from later
  communications with Sri Vinay Jha.
- **Consequence:** older public reconstructions cannot automatically be assumed
  to reproduce 7.63-or-later output.

### S07 — Chetana and Uma, 2022 review article

- **Full official article:**
  <https://www.currentscience.ac.in/Volumes/122/04/0402.pdf>
- **DOI:** <https://doi.org/10.18520/cs/v122/i4/402-404>
- **User-supplied institutional compilation:**
  <https://www.sirmvit.edu/wp-content/uploads/2023/09/3.3.1_2022.pdf>
- **Used portions:**
  - p. 402: MKS classification as a mean-linear table system;
  - p. 403: inventory of major MKS tables, three-stage correction order,
    solar-ingress description and ahargaṇa overview;
  - p. 404: almanac table usage and the authors' explicit research agenda to
    formulate algorithms, write programs and update parameters.
- **Access warning:** the user-supplied 31-page Sir MVIT compilation contains
  only p. 402 of this article; its next PDF page begins an unrelated paper. Use
  the three-page Current Science PDF for pp. 402–404.
- **Value:** authoritative map of the problem and bibliography.
- **Limitation:** review article, not an executable specification.

### S08 — Uma and Balachandra Rao, 2018, Ahargaṇa

- **Full-text record:**
  <https://www.researchgate.net/publication/323909290_Ahargana_in_Makarandasarini_and_Other_Indian_Astronomical_Texts>
- **DOI:** <https://doi.org/10.16943/ijhs/2018/v53i1/49361>
- **Used portions:**
  - pp. 16–17: definition of ahargaṇa and Ujjain/Laṅkā mean-midnight versus
    mean-sunrise context;
  - p. 19 onward: MKS ahargaṇavallī, Kali-era/midnight description, tables and
    worked examples;
  - pp. 31–32: Gregorian/Julian conversion conclusion and bibliography.
- **Value:** strongest current source for Task 3.1 historical reconstruction.
- **Limitation:** does not establish JHora's later all-era or civil-time layer.

### S09 — Rupa, Venugopal and Balachandra Rao, 2014

- **Link:**
  <https://cahc.jainuniversity.ac.in/assets/ijhs/Vol49_2_9_KRupa.pdf>
- **Title:** “Makarandasāriṇī and Allied Saurapakṣa Tables — A Study.”
- **Used portions:**
  - pp. 186–191: MKS scope, commentaries, bīja corrections, mean daily motions
    and inferred revolution comparisons;
  - pp. 198–202: manda/śīghra analytical treatment, parameters and comparison
    tables;
  - pp. 205–206: historical eclipse example containing true nirayaṇa Sun,
    Lagna and ayanāṃśa.
- **Value:** main published parameter/table survey for Tasks 3.2 and secondary
  historical checkpoints for Tasks 3.3–3.4.
- **Limitation:** includes comparisons and proposed revisions; each table must
  be labelled by tradition/version before use.

### S10 — Balachandra Rao, Rupa and Venugopal, Mandaphala analysis

- **Link:**
  <https://ancientindianastronomy.wordpress.com/wp-content/uploads/2016/02/gb-chap-10-may-14vol-15-no-11.pdf>
- **Title:** “An Analysis of the Mandaphala Tables of Makaranda and Revision of
  Parameters,” *Gaṇita Bhāratī* 35 (2013), pp. 221–240.
- **Used portions:**
  - pp. 222–224: classical Sūryasiddhānta true-position correction sequence;
  - pp. 225–231: MKS mandaphala behavior and a mathematically reconstructed
    possible table-generation procedure;
  - pp. 232–238: proposed revisions and comparison with modern parameters;
  - p. 238: conclusion and status of the reconstruction.
- **Value:** equations and worked numerical material for a candidate Task 3.2
  implementation.
- **Critical limitation:** the authors state the formation procedure is not
  supplied by MKS or its commentaries; their result is an inference. The paper's
  modern revisions are a separate parameter set.

### S11 — Venugopal, Rupa, Uma and Balachandra Rao, 2023

- **Link:**
  <https://dds.sciengine.com/cfs/files/pdfs/1440-2807/23F9CD88F1C2437D80C0B0178CCD328A.pdf>
- **Title:** “Equation of the Conjunction of the Planets,” *Journal of
  Astronomical History and Heritage* 26(2), pp. 637–658.
- **Used portions:** MKS discussion around p. 640 describing the reduction from
  the usual four correction stages to half-śīghra → full-manda → full-śīghra,
  followed by planetary tables, formula comparisons and worked examples.
- **Value:** strongest current companion source for śīghraphala and correction
  order.
- **Limitation:** still must be compared with the exact JHora/Vinay Jha choices.

### S12 — “Makarandasāriṇī — Some Special Features” chapter

- **Link:**
  <https://www.namami.gov.in/sites/default/files/book_pdf/History%20and%20Development%20of%20Mathematics%20in%20India.pdf>
- **Used for:** broader synthesis and bibliography tying together ahargaṇa,
  mean places, correction tables, eclipses and surviving editions/commentaries.
- **Value:** acquisition guide and cross-check.
- **Limitation:** secondary synthesis; exact equations must cite the original
  paper or edition page where possible.

### S13 — Historical editions and commentary leads

- **1923 scan:** <https://archive.org/details/in.ernet.dli.2015.405753>
- **Lal Bahadur Shastri Sanskrit University manuscript/edition:**
  <https://archive.org/details/rSuR_makarand-sarini-of-diwakar-manu-03-02-673-lal-bahadur-shastri-sanskrit-university/mode/2up>
- **Used for:** primary-text and commentary acquisition.
- **Current state:** not yet mathematically transcribed into this project.
- **Limitation:** language, edition variance and table interpretation require a
  qualified reviewer; possession of a scan alone does not resolve JHora's
  generalized form.

---

## 6. Claim-to-Source Traceability Matrix

| Claim used in our reasoning | Source and exact portion | Confidence | Implementation effect |
|---|---|---:|---|
| JHora's target is named “SSS — generalized Makaranda” | S03, item 1 | High | Fixes profile label and intended family |
| JHora credits Sri Vinay Jha for the algorithms | S03, item 1 | High | Original algorithm memo remains highest-priority source |
| JHora says its formulas include traditional bīja and are generalized for all eras | S03, item 1 | High | A plain transcription of 1478 tables is insufficient for exact compatibility |
| JHora SSS changed after initial release | S04 items 1/6; S05 items 6/10; S06 item 4 | High | Oracle version/build is mandatory metadata |
| MKS is a mean-linear table system | S07 p. 402 | High for historical MKS | Mean places and correction stages should remain inspectable |
| MKS contains mean longitude, manda and śīghra tables | S07 p. 403 | High for historical MKS | Defines Task 3.2 source families |
| MKS uses a three-stage planetary correction sequence | S07 p. 403; S11 around p. 640 | High for historical MKS | Candidate execution order; not yet asserted as JHora-exact |
| MKS day count uses an epoch/central-meridian convention | S07 p. 403; S08 pp. 16–19 | High for historical MKS | Candidate Task 3.1 basis |
| Published researchers themselves say further algorithm formulation/programming is needed | S07 p. 404 | High | Confirms the survey is not executable by itself |
| The five-planet MKS mandaphala table formation is reconstructed, not stated in the text/commentaries | S10 p. 229 | High | Treat the derived formula as a candidate, never as settled provenance |
| The repo's India/Mojo values are final outputs, not formulas | S02 | High | They may test but may not generate coefficients |
| SSS ayanāṃśa formula is known | No current source | None | Task 3.3 remains blocked |
| JHora generalized mean-node formula is known | No current source | None | Task 3.3 remains blocked |
| JHora's exact SSS effective-time/Lagna formula is known | Release behavior only: S03/S05 | Low | Task 3.4 remains blocked |

---

## 7. Two-Track Resolution Strategy

### Track A — Exact JHora-compatible production profile

This remains the definition of `surya_siddhanta_makaranda_v1`.

Required before implementation can be claimed complete:

1. Record the exact JHora oracle version/build.
2. Obtain the generalized formula/constant package from Sri Vinay Jha, the
   JHora maintainer, or a source demonstrably documenting the same version.
3. Obtain or reproduce intermediate traces for India and Mojo.
4. Link every production coefficient to the formula package.
5. Pass component tests and final one-arcsecond goldens without coefficient
   fitting.

### Track B — Published historical reconstruction

This track can start while correspondence is pending, but it must not use the
production profile name.

Suggested research identity:

```text
makaranda_historical_reconstruction_research_v0
```

Permitted work:

- transcribe equations/tables with source IDs and printed page numbers;
- implement pure, inspectable research functions for ahargaṇa, mean places,
  mandaphala and śīghraphala;
- reproduce each publication's worked examples;
- compare results with India/Mojo JHora outputs and report deltas; and
- use differences to identify which component needs a JHora-specific rule.

Not permitted:

- relabel the research output as `surya_siddhanta_makaranda_v1`;
- tune coefficients against only India and Mojo;
- blend historical, author-proposed modern, and JHora parameter sets;
- edit oracle fixtures to match the prototype; or
- widen the one-arcsecond acceptance tolerance.

---

## 8. Formula Intake Register

Before a formula enters code, add one row here and a fuller equation sheet under
`docs/reference/surya-siddhanta-makaranda/` as a new dated artifact.

| Formula ID | Component | Source/page/equation or table | Parameter-set label | Worked example reproduced? | JHora delta measured? | Status |
|---|---|---|---|---:|---:|---|
| F-001 | MKS ahargaṇa basis | S08, pp. 19 onward | Historical MKS | No | No | To transcribe |
| F-002 | Mean daily motions/bīja comparison | S09, pp. 190–191, Table 5.1 | Historical MKS/inferred comparison | No | No | To transcribe |
| F-003 | Three-stage correction order | S07 p. 403; S11 around p. 640 | Historical MKS | No | No | Cross-source agreement |
| F-004 | Five-planet mandaphala reconstruction | S10, pp. 229–231 | Authors' inferred MKS reconstruction | No | No | Candidate only |
| F-005 | Śīghraphala analytical treatment | S09 pp. 198–202; S11 | Historical/comparative | No | No | To reconcile |
| F-006 | SSS ayanāṃśa | Not found | JHora generalized Makaranda | No | No | Blocked |
| F-007 | Mean Rahu | Not found | JHora generalized Makaranda | No | No | Blocked |
| F-008 | SSS equation of time | S05 describes behavior, not equation | JHora 7.6+ | No | No | Blocked |
| F-009 | SSS Lagna | S03 confirms output, not equation | JHora generalized Makaranda | No | No | Blocked |

For each transcribed formula, preserve:

```text
formula ID
original notation
normalized notation
units and radix
epoch/time scale/meridian
all constants and table version
quadrant/sign rules
interpolation method
rounding/truncation point
source URL + printed page + equation/table number
transcriber + independent reviewer
published worked example expected/actual/delta
JHora fixture expected/actual/delta
```

---

## 9. Experimental Order

The following order localizes uncertainty instead of producing one unexplained
final longitude:

1. **Freeze the oracle:** JHora version, settings and higher-precision exports.
2. **Normalize sources:** transcribe S08–S11 without selecting a preferred
   parameter set.
3. **Reproduce publications:** pass their own worked examples first.
4. **Implement historical ahargaṇa:** expose epoch, integer day and fractional
   day separately.
5. **Implement historical mean places:** expose revolution count, remainder and
   mean longitude.
6. **Implement manda/śīghra stages:** expose every anomaly, periphery/table
   lookup and signed correction.
7. **Compare with JHora:** output component-wise deltas in degrees and
   arcseconds for India and Mojo.
8. **Isolate missing layer:** distinguish mean-place, correction, ayanāṃśa,
   node, effective-time and Lagna errors.
9. **Integrate an authoritative generalized rule only when sourced.**
10. **Run range/boundary cases and the final golden suite.**

An expected comparison report should look like:

```text
fixture: india
body: Mars
component: final sidereal longitude
source_parameter_set: historical_mks_s10
expected_jhora_deg: <oracle>
actual_deg: <prototype>
delta_arcseconds: <signed delta>
first_known_divergent_stage: <mean|manda|sighra|ayanamsa|unknown>
```

---

## 10. Correspondence Tracker

| Contact/action | State | Date | Expected value |
|---|---|---|---|
| Email to Banuvalli Chetana / S. K. Uma | Sent by user; reply pending | Not recorded | Full article/material, table interpretation, referrals, formula notes |
| Request to Sri Vinay Jha | Not recorded | — | Exact generalized equations/constants and change history |
| Request to JHora maintainer | Not recorded | — | Target build, intermediate trace/export capability, implementation notes |
| Sanskrit mathematical-astronomy reviewer | Not engaged | — | Edition-aware transcription and independent validation |

If there is no response, a follow-up should ask these precise questions:

1. Which edition/commentary supplies the MKS constants they analyzed?
2. Is there a machine-readable transcription of the tables?
3. Can they provide the complete ahargaṇa → mean-place → true-place procedure?
4. Which parts of their mandaphala/śīghraphala formulas are textual and which
   are modern mathematical reconstructions?
5. Which bīja corrections are historical MKS, and which are later revisions?
6. Do they know the generalized Makaranda rules used in current pañcāṅgas or
   those communicated by Sri Vinay Jha to JHora?
7. What ayanāṃśa and mean-node rules belong to that generalized version?
8. What meridian, day boundary and equation-of-time rule are used?
9. What procedure is used for Lagna?
10. Can they provide two modern-date worked examples with every intermediate
    value and rounding step?

---

## 11. Immediate Checklist

- [ ] Record the date, recipients and subject of the email already sent.
- [ ] Download and preserve the full official S07 three-page article; do not use
      the one-page institutional compilation as the complete paper.
- [ ] Capture JHora **Help → About** for the India/Mojo oracle machine.
- [ ] Capture/export numeric SSS ayanāṃśa for India and Mojo.
- [ ] Obtain JHora intermediate values if any debug/table view exposes them.
- [ ] Transcribe S08 ahargaṇa formulas and examples into the formula register.
- [ ] Transcribe and separate S09's historical, comparative and proposed values.
- [ ] Transcribe S10 mandaphala equations and reproduce its Mars example.
- [ ] Transcribe S11 śīghraphala equations and reproduce its worked example.
- [ ] Locate the node, ayanāṃśa, Tripraśna/Lagna and equation-of-time sections in
      the primary commentaries.
- [ ] Complete the two-person audit of India/Mojo fixture values.
- [ ] Decide whether to create the separately named historical research module
      while exact JHora correspondence is pending.

---

## 12. Completion Gate for Task 3

Task 3 is complete only when all of the following are true:

- [ ] The target JHora build is recorded.
- [ ] Every production constant and equation has a source and version.
- [ ] Ahargaṇa/time conventions are explicit and range-tested.
- [ ] All seven visible-body mean and correction stages are inspectable.
- [ ] SSS ayanāṃśa and mean-node equations are sourced and unit-tested.
- [ ] Effective time and Lagna are sourced and unit-tested.
- [ ] India and Mojo pass within one arcsecond without fitted coefficients.
- [ ] SSS structurally imports no Swiss/Drik astronomy.
- [ ] SSS and Drik demonstrably diverge on the same input.
- [ ] Fixture values have completed the required independent human audit.

Until then, the correct production behavior is the existing typed
`CALCULATION_PROFILE_UNAVAILABLE` failure.
