# Marriage Matchmaking (Ashtakoota / Guna Milan + Mangal Dosha) — Implementation Logic

**For practitioner review and teacher validation.**

---

## Overview

`engine/compute/matchmaking.ts` computes the classical **Ashtakoota** (eight-factor, 36-point)
compatibility score from each native's Moon nakshatra and pada alone, plus a separate **Mangal Dosha
(Kuja Dosha)** compatibility check that additionally needs Mars's sign, the lagna sign, and computed
aspects (compute-source charts only). Both are pure functions — no ephemeris, LLM, network, DB, or file
I/O — reading static reference tables from `engine/compute/matchmakingTables.ts`.

Role-awareness is structural: every scorer resolves which input is the bride and which is the groom
from each input's own `role` field, never from argument order. `gunaScore` is a `number`, never
rounded — half-point values from Vashya, Graha Maitri, and Tara are load-bearing throughout the
pipeline, including in the `CompatibilityMatch.gunaScore` `Decimal(4,1)` database column.

Reachable via `POST /api/matchmaking` (persists a `CompatibilityMatch`), its read-only sibling
`POST /api/matchmaking/preview`, and the MCP tool `compute_match` (task 10,
`mcp/src/tools.ts`) — the MCP tool only ever calls `/api/matchmaking/preview`, never the persisting
route (enforced by `tests/mcp-cost-guard.test.ts`), so Claude Desktop can score a match at $0 API cost
but can never silently create a saved record.

Spec: `.kiro/specs/marriage-matchmaking/`.

**NFR-8, stated explicitly (Requirement 11.3):** the Ashtakoota framework's 36-point figure and the
`<18 / 18-24 / 24-32 / >=32` score-band guidance (`below_average` / `average` / `good` / `excellent`) are
**later almanac ("Panchang") and commercial-software convention** — they are not found in classical
Parashari texts and are not part of PVR Narasimha Rao's published work either (see "Where the 'second
opinion' actually comes from" below). `AshtakootaResult.limitations` carries this same caveat at
runtime, and it is never presented as a verdict of record.

---

## Koota rules, point values, and sources

| # | Koota | Max | Rule | Directional? | Source |
|---|---|---|---|---|---|
| 1 | **Varna** | 1 | Groom's Varna rank (Brahmin>Kshatriya>Vaishya>Shudra) must be >= the bride's, else 0. | **Yes** — bride/groom are not interchangeable (Requirement 1.3). | Classical rank order; oracle-verified 87.5% (see KNOWN DIVERGENCE #1 for the one un-adopted mismatch). |
| 2 | **Vashya** | 2 | 5-group (Chatushpad/Manav/Jalachar/Vanachar/Keet) compatibility matrix, hand-transcribed then oracle-corrected (task 9.3). | **Directional only for Keet (Scorpio)** — every other rashi pair is symmetric (`VASHYA_MATRIX`, `matchmakingTables.completeness.test.ts`). | Oracle-settled, 81–1,296 samples/cell, zero noise for 10 of 12 rashis; Sagittarius/Capricorn unresolved (KNOWN DIVERGENCE #2). |
| 3 | **Tara** | 3 (practically capped at 1.5 for every pair — see below) | Bidirectional nakshatra-count mod 9; 1.5 points per favorable direction, zeroed entirely if either direction's remainder is 1 (Janma) or 9 (Parama Mitra). | Bidirectional by construction, but the koota TOTAL is swap-invariant (addition is commutative). | Remainder thresholds and the total-override rule are oracle-settled, 100% match across 11,664 combinations. |
| 4 | **Yoni** | 4 | 14×14 animal-affinity matrix, five tiers (same=4 ... bitter enemy=0). | No — fully symmetric (oracle-confirmed). | Full replacement of the original hand-picked pair lists during oracle verification; 64–128 samples/cell, zero noise. |
| 5 | **Graha Maitri** | 5 | Naisargika (permanent) friendship between the two Moon-rashi lords, read from `dignity.ts`'s `PERMANENT_FRIENDSHIP` — deliberately excludes tatkalika (positional) friendship (Requirement 2.5). Same lord scores full 5. | No — a friendship relation is inherently mutual in this table. | Oracle-corrected: the 0.5-point exception moved from friend↔enemy to neutral↔enemy (162–2,754 samples/cell, zero noise). |
| 6 | **Gana** | 6 | Deva/Manushya/Rakshasa 3×3 matrix. | **Yes** — bride is the matrix row, groom the column (directionality itself still flagged pending a primary classical source, not just the oracle). | 4 of 9 cells corrected against the oracle (1,296 samples/cell, zero noise). |
| 7 | **Bhakoot** | 7 | Rashi-distance rule: counts in {2,5,6,8,9,12} score 0 (Bhakoot Dosha), every other distance scores 7. Subject to Bhakoot Bhanga (see cancellations below). | No — provably self-reciprocal (the two directions' counts always sum to 14, so one direction's dosha membership forces the other's). | Base table already correct (one oracle mismatch deliberately not adopted — KNOWN DIVERGENCE #3). |
| 8 | **Nadi** | 8 | Same Nadi (Aadi/Madhya/Antya) scores 0 (Nadi Dosha, the single most heavily weighted classical dosha); different Nadi scores the full 8. Subject to Nadi Bhanga (see cancellations below). | No. | No known divergence from the oracle on the base rule; Bhanga logic itself is not oracle-checkable (see "What is NOT implemented"). |

**Cancellations (Bhanga):** `detectNadiCancellation` fires when both natives share a Nadi (dosha
present) AND the same nakshatra lord AND are in different nakshatras — restoring Nadi's full 8.
`detectBhakootCancellation` fires when both natives share the same Moon-rashi lord on a dosha-distance
pair — restoring Bhakoot's full 7. Neither is oracle-verifiable (PyJHora's bare `Ashtakoota` class has no
Bhanga logic at all); see the Summary of Open Questions for the un-settled "full restore vs. annotated
reduction" question these share.

**A fact worth stating plainly, without treating it as a labeling bug: no pair, however favorable, can
ever score Tara above 1.5 of its own declared 3.** Proof: for two DISTINCT nakshatras,
`taraRemainder(bride, groom)` and `taraRemainder(groom, bride)`'s underlying raw (pre-remap) values always
sum to 29 (the two directions are complementary around the 27-nakshatra circle); for the IDENTICAL-nakshatra
case both raw values are 1, summing to 2. Either way the sum is ≡ 2 (mod 9), so the two mod-9 residues
always sum to ≡ 2 (mod 9) — observed as exactly the pair-sums {2, 11} across all 729 nakshatra-pair
directions. Enumerating every residue pair whose sum is ≡ 2 (mod 9) shows that whichever remainder one
direction lands on, the OTHER direction is forced into either the total-override remainder (9) or one of
the inauspicious remainders (3, 5, 7) — never a second plain-auspicious remainder. At most one direction
can ever contribute its 1.5, so 3 is unreachable by any pair — not merely rare.

**`KOOTA_MAXIMA.tara` still declares 3, and `TOTAL_KOOTA_MAXIMA` (`AshtakootaResult.maxScore`) is still
the classical 36 — deliberately.** JHora's own web tool displays every match's Compatibility Score as a
fixed **"X / 36"**, regardless of whether that specific pair (or, for that matter, JHora's own scoring
rules) could theoretically reach it — confirmed directly against a live JHora computation (Mohit
Joshi/Revati × Minal Sultaniya/Dhanishta scored 14.5/36, labeled "Total Kuta Score"). This engine follows
that same fixed-denominator convention rather than computing a per-implementation "corrected" ceiling; an
earlier draft of this document (and of the code) treated the Tara shortfall as a bug and changed the
denominator to a computed 34.5, which was reverted once the discrepancy with JHora's own display was
found. The 1.5-of-3 fact above remains true and worth knowing — it just isn't surfaced by changing the
denominator, exactly as JHora doesn't surface it either.

(For the record, the two LOCAL maxima below the fixed 36 are still worth naming, since a practitioner
reading either on an otherwise strong match might mistake it for a miscalculation: the *global* maximum
this engine can produce for any pair is **34.5** — reached in the ordinary case where Tara scores its own
real maximum of 1.5 and every other koota also scores its own maximum:
1+2+1.5+4+5+6+7+8=34.5. A narrower **33** is reached in the specific case where the Tara total-override
fires (zeroing Tara to 0) while Nadi Bhanga still restores a full 8 elsewhere:
1+2+0+4+5+6+7+8=33 — 1.5 points below the global 34.5, not above it. Both verified analytically and by an
exhaustive 27×4×27×4 sweep in `matchmakingTables.completeness.test.ts` and
`matchmaking.invariants.test.ts`.)

---

## Mangal Dosha (Kuja Dosha) rule

`computeMangalDosha` implements, verbatim, the Kuja Dosha clause from **[`prompts/domains/marriage.md`](../prompts/domains/marriage.md)'s**
Karakas paragraph: *"Mars (passion — and Kuja Dosha when placed in 1/2/4/7/8/12 from lagna, Moon, or
Venus, unless cancelled by own/exalted sign, benefic aspect, or matching dosha in partner)."* No deviation
from that text was needed, so `marriage.md` itself is unchanged by this feature.

- **Trigger:** Mars occupies house 1, 2, 4, 7, 8, or 12 counted from the lagna, the natal Moon, OR Venus
  (any of the three independently triggers `status: 'manglik'`; `marsHouseFrom` records all three
  reference points' house numbers, `triggeredFrom` lists which fired).
- **Bhanga (cancellation), per-native (`detectMangalCancellation`):** Mars in its own sign or exaltation
  sign, OR a natural benefic (Jupiter/Venus/Mercury/Moon) casting a Graha Drishti aspect onto Mars.
  Recorded in `cancellations`, never applied silently — `status` always reports the RAW determination.
- **Bhanga, pairwise ("matching dosha in partner"):** handled one layer up, in `computeMatch`'s
  `deriveMangalDoshaCompatibility` — both natives Manglik (post-cancellation) is reported as `'matched'`,
  not as a per-native cancellation, since it is inherently a comparison between two natives rather than a
  fact about one.
- **Degrades to `status: 'unavailable'`** — never a confident `'not_manglik'` or an affirmative
  `compatibility: 'matched'` — whenever `planets` is missing/malformed, Mars can't be located, or (as of
  the fix below) ALL THREE reference points (lagna, Moon, Venus) fail to resolve. One or two missing
  reference points still leave a real determination standing on whichever ARE present; zero reference
  points leave nothing to stand on, so the whole result degrades rather than reporting a confident
  all-clear built on no data.
- Needs `planets`/`relationships` JSONB — data only `source: 'compute'` charts carry — so it degrades
  independently of the 8-koota score, which needs only Moon nakshatra/pada and is available on both
  paste- and compute-source charts (Requirement 1.5).

---

## Provenance methodology

The eight koota tables were originally hand-transcribed from published classical/secondary sources,
explicitly **not** copied from any third-party tool's source or CSV output (see
`matchmakingTables.ts`'s module header). Cells the author was not confident transcribing were flagged
`UNCERTAIN` inline, for a later verification pass (task 9 of the spec).

That verification pass used **PyJHora** (`naturalstupid/PyJHora` on GitHub/PyPI), run locally and
in isolation as a dev-only oracle — never imported, vendored, or shipped in this application (PyJHora
is AGPL-3.0; see `scripts/oracle/README.md` for the isolation rationale). A full **11,664-combination**
sweep (all 27×4 nakshatra-pada pairs against all 27×4) was generated
(`scripts/oracle/generate_oracle.py`) and cross-referenced against this engine's own scorers
(`scripts/oracle/analyze_oracle.ts`, `analyze_vashya.ts`, `derive_vashya.ts`, `derive_yoni.ts`,
`derive_dual_split.ts`, `verify_tara2.ts`).

**Where the "second opinion" actually comes from.** PVR Narasimha Rao's textbook, *Vedic Astrology: An
Integrated Approach*, does **not** cover Ashtakoota at all — confirmed by a full-text search of all 515
pages; "matchmaking" appears exactly once, in passing. Jagannatha Hora's (JHora) own public site
documents that the matching feature exists but does not publish its internal tables in prose either.
PyJHora's own README states it is a direct port of PVR Narasimha Rao's JHora software — so this oracle
sweep is the closest available record of "PVR's methodology" for this specific feature, even though
neither of his two public-facing documents states it explicitly. JHora's own UI additionally uses
**"bride"/"bridegroom"** terminology, independently corroborating this engine's empirically-derived
boy=groom / girl=bride role calibration (87.5% vs. 37.5% agreement on the unambiguous Varna rule).

This oracle sweep is treated as **the best available second opinion**, not as unquestionable ground
truth — see the KNOWN DIVERGENCE table below for a case where its output was deliberately not adopted.

---

## What the oracle sweep settled (`MATCHMAKING_TABLES_VERSION = 'matchmaking-tables-v1.1-nadi-bhanga-fix'`)

| Koota | What changed | Confidence |
|---|---|---|
| **Gana** | 4 of 9 cells corrected (`Deva→Manushya`, `Deva→Rakshasa`, `Manushya→Deva`, `Rakshasa→Deva`) | 1,296 samples/cell, zero noise |
| **Graha Maitri** | The 0.5-point exception moved from friend↔enemy to neutral↔enemy; friend+enemy now scores a full 1 | 162–2,754 samples/cell, zero noise |
| **Yoni** | Full replacement of the graded enemy(1)/friendly(3) pair lists — 27 + 14 pairs, up from 6 + 6 hand-picked ones. The 7 canonical Vaira (bitter-enemy) pairs and same-animal diagonal were already exactly correct | 64–128 samples/cell, zero noise, fully symmetric |
| **Tara** | New whole-score override: remainder 1 (same nakshatra) or 9 (Parama Mitra) on *either* direction zeroes the entire koota — not the ordinary per-direction partial credit | 100% match across all 11,664 combinations |
| **Vashya** | Corrected for the 10 non-dual rashis; discovered a genuinely **directional** Keet (Scorpio) relationship — `vashyaPoints(bride, groom)` is no longer symmetric | 81–1,296 samples/cell, zero noise (10 of 12 rashis) |

See "Koota rules, point values, and sources" above for the full Tara-ceiling analysis (36 is the fixed,
JHora-matching display denominator; 34.5 and 33 are informational local maxima, not displayed values). One
addition specific to the override: a remainder-1 pair that is 18 nakshatras apart (e.g. Ashwini and Mula —
both Ketu-ruled, both Aadi Nadi) is a genuine, still-live example of the 33-ceiling case —
`detectNadiCancellation`'s identical-nakshatra guard (KNOWN DIVERGENCE #4 below) does **not** exclude it,
since the two nakshatras are different, so Nadi Bhanga can legitimately fire and restore a full 8/8 Nadi
score on exactly the pair Tara has already zeroed. (The identical-nakshatra case — remainder 1, count 1 —
is a *different*, lower local maximum still: KNOWN DIVERGENCE #4's fix means Nadi Bhanga never fires
there, so Nadi itself also scores 0, capping that specific configuration at 25.)

Bhakoot's base table was already correct, with one exception (see KNOWN DIVERGENCE #3 below); Nadi's
base table (`nadiPoints`) has no known divergence at all. Most of their oracle mismatch rate is
explained by this engine's Bhanga
(cancellation) logic, which PyJHora's bare `Ashtakoota` class cannot reproduce at all (it takes only
nakshatra+pada, with no dignity or aspect data to evaluate a cancellation against) — but a code-review
pass independently found and fixed a real bug in the Nadi Bhanga detector itself (KNOWN DIVERGENCE #4
is not a divergence from the oracle at all — the oracle can't check cancellation logic — but is recorded
here for the same audit trail).

---

## KNOWN DIVERGENCE table

| # | Koota | Divergence | Resolution |
|---|---|---|---|
| 1 | **Varna** | PyJHora inverts exactly one adjacent pair: bride=Shudra/groom=Vaishya scores 0 (we score 1), and the reverse scores 1 (we score 0) — as if Vaishya and Shudra were swapped in rank, while Brahmin and Kshatriya sit exactly where every classical source puts them. | **Deliberately NOT adopted.** Swapping Vaishya/Shudra would contradict the single most universally-taught Ashtakoota ordering (Brahmin > Kshatriya > Vaishya > Shudra) for a change affecting 1 of 36 points in one specific pairing — the shape of an isolated implementation quirk, not a documented alternate convention. `VARNA_RANK` is unchanged. |
| 2 | **Vashya — Sagittarius/Capricorn** | Both are classical dual (dwiswabhava) signs. The oracle confirms PyJHora does **not** use this engine's single-VashyaGroup simplification for either sign, but the actual sub-pattern (`scripts/oracle/derive_dual_split.ts`) does not reduce to a simple front-half/back-half degree split — within a single nakshatra of Sagittarius, consecutive pada-pairs alternate between the Manav-equivalent and Chatushpad-equivalent scoring rows. | **Unresolved.** Reverse-engineering an undocumented tool's internal degree logic and presenting it as sourced classical fact would be worse than the existing simplification. `RASHI_ATTRIBUTES` keeps Sagittarius=Manav, Capricorn=Chatushpad (the common single-rashi simplification) pending a real primary source. |
| 3 | **Bhakoot — bride=Aquarius/groom=Cancer** | All 81 (of 11,664) Bhakoot base-rule mismatches are this exact rashi pair (count 6, this engine scores 0, oracle scores 7). The classical rashi-distance rule is provably self-reciprocal — for any two distinct rashis the two directions' counts always sum to 14, so a dosha-set count in one direction (here 6) forces the other direction (here 8) into the dosha set too. The reverse direction of this same pair (bride=Cancer/groom=Aquarius) **does** agree with the oracle at 0, so the oracle's own output is asymmetric where the underlying rule mathematically cannot be. | **Deliberately NOT adopted.** Same reasoning as divergence #1: an oracle output that violates a rule's own provable mathematical symmetry, in exactly one isolated pair, reads as an implementation quirk rather than a genuine alternate convention. `bhakootPoints` is unchanged. |
| 4 | **Nadi Bhanga (cancellation) — identical-nakshatra bug** | Found in code review, not by the oracle sweep (PyJHora's bare `Ashtakoota` class has no Bhanga/cancellation logic at all, so this could not be oracle-checked — though the sweep does independently corroborate the identical-nakshatra half: PyJHora scores every same-Nadi pair 0, so the pre-fix bug's false 8/8 on identical-nakshatra pairs was itself an oracle mismatch on 432 of 11,664 combinations). `detectNadiCancellation` fired whenever both natives shared a Nadi and a nakshatra lord — trivially true whenever the two natives are in the exact **same** nakshatra, since a nakshatra always shares a lord with itself. This turned the single worst possible Nadi result (same nakshatra, same Nadi) into a false perfect 8/8. | **Fixed**, not merely documented: `detectNadiCancellation` now also requires the two nakshatras to be different. Any two genuinely different nakshatras sharing a lord are 9 or 18 nakshatras apart (9 in circular distance — each lord rules 3 of the 27, spaced a fixed 9 apart), so this guard only removes the degenerate identical-nakshatra case and never affects a real different-nakshatra, same-lord match (e.g. Ashwini vs Mula, both Ketu-ruled, 18 apart in nakshatra number / 9 in circular distance). See the regression tests added in `matchmaking.invariants.test.ts`. |

**❓ Validation request:** For divergence #1 — is there a documented tradition anywhere that ranks
Vaishya above Shudra oppositely from the standard order for Varna koota specifically? If not, the
current (unchanged) ranking should stand.

**❓ Validation request:** For divergence #2 — does your school have a primary source for exactly how
Sagittarius and Capricorn split for Vashya koota (e.g. an exact degree boundary, or a navamsa-based
rule)? The oracle's observed pattern is real and reproducible but not attributable to any source this
project has access to.

**❓ Validation request:** For divergence #4 — is restoring FULL points the right response to a fired
Nadi Bhanga, or should a cancelled dosha instead be annotated (e.g. reported at a reduced or
intermediate value) rather than treated identically to a pair that never had the dosha at all? This
engine currently restores full points, matching how `detectBhakootCancellation` already behaves for
Bhakoot Bhanga, but neither is oracle-verifiable. Separately: some schools publish Nadi Dosha pariharas
keyed specifically on a same-nakshatra-different-pada or same-nakshatra-different-rashi configuration —
exactly the identical-nakshatra case this fix now treats as an unmitigated dosha (no cancellation).
Should either of those variants be modeled as an additional, narrower cancellation instead of the blanket
"identical nakshatra never cancels" rule this fix adopted?

---

## What is NOT implemented

- **The South Indian Porutham system.** This feature implements only the North Indian **Ashtakoota**
  (36-point, eight-koota) scheme. Porutham (the Tamil/South Indian matching tradition — typically ten
  poruthams, different nakshatra/rashi rules, and no direct 36-point analogue) is a distinct classical
  system, not an alternate scoring of the same kootas, and is out of scope for v1. Recorded here as a
  known gap rather than left implicit, per NFR-8's spirit of being explicit about what convention this
  engine follows.
- **Mangal Dosha Bhanga variants beyond own-sign/exaltation and a benefic Graha Drishti aspect** — the
  "matching dosha in partner" condition is handled at the pairwise `compatibility` level
  (`computeMatch`), not as a per-native cancellation.
- **Nadi/Bhakoot Bhanga (cancellation) verification against the oracle** — PyJHora's bare `Ashtakoota`
  class has no dignity/aspect input and cannot evaluate these at all, so the oracle sweep is silent on
  whether this engine's specific cancellation variants are the classically standard ones.
- ~~A committed, hand-curated oracle fixture~~ — **done** (task 9.2): 22 combinations, chosen from
  outside every divergence/cancellation zone above and cross-verified against both the oracle and this
  engine, committed at `engine/compute/__fixtures__/ashtakootaOracleSample.ts` and exercised by
  `matchmaking.invariants.test.ts`. The raw 11,664-row sweep itself still exists locally only
  (`scripts/oracle/output/`, git-ignored) and is never committed verbatim.

---

## Summary of Open Questions for Teacher Review

| # | Point | Question |
|---|---|---|
| 1 | Varna — Vaishya/Shudra | Is there a documented tradition ranking Vaishya above Shudra oppositely from the standard order, specifically for Varna koota? PyJHora's output suggests one exists; we could not attribute it to a named source and did not adopt it. |
| 2 | Vashya — Sagittarius/Capricorn split | What is the exact classical rule (degree boundary, navamsa-based, or otherwise) for how these two dual signs split for Vashya koota? PyJHora's behavior does not reduce to a simple front-half/back-half split. |
| 3 | Nadi/Bhakoot Bhanga variants | Are `detectNadiCancellation`'s "same Nadi, same nakshatra lord, different nakshatra" and `detectBhakootCancellation`'s "same Moon-sign lord" the variants your school recognizes? Neither could be checked against the oracle (no dignity/aspect input available to PyJHora's bare koota calculator). |
| 4 | Nadi Bhanga — full points vs. annotated reduction | When Nadi Bhanga fires, should the koota restore the full 8 points (current behavior, matching `detectBhakootCancellation`'s precedent), or should a cancelled dosha be scored/labeled differently from a pair that never had the dosha at all? |
