# Gochar (Transits), Sade Sati & Transit Timings — Implementation Logic

**For practitioner review and teacher validation.**

---

## Gochar (Current Transit Positions)

Current planetary positions are computed using the **Swiss Ephemeris** (NASA JPL data) with Lahiri ayanamsa (sidereal). Positions are calculated for the moment the chart is rendered, not the birth moment.

The following are shown:
- Sign, degree-minute-second, and retrograde status
- House from natal Moon (Chandra Lagna)
- House from natal Lagna (Ascendant)

**The Gochar table always shows present-day positions. No filtering by birth date is applied here — these are real-time sky positions relevant for any reading done today.**

---

## Sade Sati

### Definition

Sade Sati is a ~7.5-year period when Saturn transits through the three signs surrounding the natal Moon:

1. **Rising phase** — Saturn in the sign just before the natal Moon sign (12th from Moon)
2. **Peak phase** — Saturn in the natal Moon sign itself
3. **Setting phase** — Saturn in the sign just after the natal Moon sign (2nd from Moon)

Each phase lasts approximately 2.5 years (Saturn's average stay per sign).

### How Periods Are Computed

Instead of using a fixed approximation (e.g., "every 30 years"), we use the **real Saturn ephemeris** to find the exact moments Saturn enters and exits each relevant sign.

**Method:**
1. Scan a window from 33 years before birth to 35 years after the present date.
   - 33 years back is used because a Sade Sati could have started up to ~32 years before birth (one full Saturn cycle of 29.5 years plus margin) and still be active in early childhood.
2. Walk through Saturn's position in 10-day steps across this window.
3. When Saturn changes sign, find the exact crossing moment by **bisection search** (42 iterations, sub-second accuracy).
4. Record each contiguous segment Saturn spends in a Sade Sati sign.
5. **Merge retrograde fragments:** Saturn sometimes enters a sign, retrogrades back, then re-enters. Segments of the same sign separated by less than 240 days (8 months) are merged into one continuous period.
6. Format as Month-Year ranges.

**Retrograde handling:** Saturn's retrograde motion can cause it to briefly re-enter a previous sign, creating short "gap" segments. The 240-day merge threshold removes these fragmented retrograde re-entries while preserving genuine separate visits decades apart.

**This 240 days applies to the sign-based scan only.** The degree-based reading below uses its own,
smaller threshold (138 days) for the reasons set out there. The two are deliberately separate constants.

### Display Filtering

Sade Sati periods that **fully ended before the native's birth year** are not shown in the UI. Periods that began before birth but extended into the native's life are shown — they represent the influence during early childhood.

**❓ Validation request:** Should Sade Sati periods active before the native's birth be shown at all? Some practitioners show the complete Saturn cycle for the soul's perspective. Others only show post-birth periods.

---

## Degree-Based Sade Sati (±45° from the natal Moon)

Engine: `engine/compute/transits.ts` (`computeDegreeSadeSati`). Returned by `computeTransits` as
`TransitAnalysis.sadeSatiByDegree` — a **sibling** of `sadeSati`, never nested inside it — and shown
in the UI beside the sign-based reading. Absent when the caller supplies no natal Moon longitude.

### Definition and provenance

This is a **second, alternative reading** of the same phenomenon, offered alongside the sign-based one
above rather than replacing it. Sade Sati is running whenever Saturn's **sidereal longitude** lies
within **±45°** of the natal Moon's longitude, measured on the shorter arc. That is a 90°-wide window,
which Saturn takes **≈7.25 years** to traverse.

Two consequences follow from using an angle instead of signs:

- The period is reported as **one contiguous passage**, with **no** rising / peak / setting
  subdivision. There is nothing in the angular model to subdivide — the classical trio exists only
  because signs are discrete.
- The window is anchored to the Moon's **exact degree**, not to the sign it happens to fall in, so it
  starts and ends on dates that generally do not coincide with Saturn's sign ingresses.

**Provenance:** this is PVR Narasimha Rao's model as implemented in **Jagannatha Hora / PyJHora** —
the same source `docs/computation_chara_dasha.md` credits for the Chara Dasha rules. The ±45° orb and
the contiguous-period (unsubdivided) shape both come from that implementation's output, not from an
independent derivation here.

### How Periods Are Computed

The scan deliberately reuses the sign-based machinery step for step, so the two readings cannot drift
apart for mechanical reasons:

1. **Same scan window.** 1 Jan (birth year − 33) → 1 Jan (present year + 35), identical to the
   sign-based scan. The horizon actually used is reported back as `scanFromYear` / `scanToYear` so any
   divergence can be attributed rather than guessed at.
2. **Same 10-day coarse walk.** Saturn's longitude is sampled every 10 days and reduced to a single
   boolean state: inside the 45° orb, or outside it.
3. **Same bisection refinement.** Each state change is refined by **42 bisection iterations**, giving
   sub-second accuracy on the crossing instant — the same `nextStateChange` helper the sign scan uses.
4. **Its own 138-day retrograde merge — *not* the sign scan's 240 days.** Two inside-segments
   separated by a gap of less than **138 days** are merged into one period, so a retrograde dip out of
   and back into the window does not split a passage in two. A gap of 138 days or more is treated as a
   genuine end of the passage. Same `mergeSegments` helper as the sign scan, different constant — see
   "Why the merge threshold differs from the sign scan's" below.
5. **Sequence numbering from 1 across the whole horizon.** Periods are numbered `1, 2, 3, …` in start
   order over the entire scanned window, which begins 33 years before birth. The first period the
   panel actually *displays* is therefore usually **not** `#1`.
6. **Derived fields.** `durationDays` is `end − start` in fractional days; `completionPct` (integer
   0–100) and `startsInDays` are computed only for the current and the future periods respectively.

### Calibration — Reference_Chart (natal Moon 347.76°, Pisces 17.76°, born 1984)

Reference values are PVR's implementation output. Engine values are `computeDegreeSadeSati(347.76,
1984, …)`. `engine/compute/transits.sadeSati.test.ts` asserts all three rows against the reference —
start date, end date **and** duration — with a **±3-day tolerance**, the tolerance absorbing ayanamsa
variation and date rounding in the third-party output, not method differences.

| Period | Reference (PVR) | Engine | Δ |
|---|---|---|---|
| First passage | 1993-03-31 → 2000-06-30, 7y 91d | 1993-03-31 → 2000-06-30, 2648.6 d | **0 d** on both endpoints; duration +0.6 d |
| Current passage | 2023-02-10 → 2030-05-09, 7y 88d | 2023-02-10 → 2030-05-09, 2645.1 d | **0 d** on both endpoints; duration +0.1 d |
| Next passage | 2052-03-20 → 2059-06-19, 7y 91d | 2052-03-20 → 2059-06-19, 2647.2 d | **0 d** on both endpoints; duration −0.8 d |

All three passages now agree with the reference to the day. The earlier divergence on the 2052 passage
— an end date of 2060-02-28, 254.9 days late — is **resolved**: it was caused by the degree scan reusing
the sign scan's 240-day merge threshold, and the degree scan now carries its own 138-day threshold.

### Why the merge threshold differs from the sign scan's

The two scans bound different things.

A **sign** boundary is a hard edge. For a retrograde loop to carry Saturn back across it, Saturn has to
be within roughly a degree of the boundary to begin with, so sign fragments are short and 240 days
brackets them all comfortably.

The **angular** window's edge is crossed at whatever speed Saturn happens to have, and a retrograde
loop straddling it can hold Saturn outside the orb for most of the loop plus the direct motion either
side. Genuine excursions out of the ±45° window therefore run materially longer than sign fragments,
and 240 days over-merges: it swallows real exits and reports a passage running hundreds of days past
its end.

**How 138 days was arrived at.** The raw, unmerged inside-the-orb segments for the Reference_Chart's
three reference passages are:

| Passage | Raw segments (inside the orb) | Gaps between them |
|---|---|---|
| 1993 | 1993-03-31 → 1993-08-25; 1993-12-27 → **2000-06-30**; 2000-11-30 → 2001-03-19 | **123.45 d** (must be bridged), **152.46 d** (must not) |
| 2023 | 2023-02-10 → 2030-05-09 | none — one unfragmented segment |
| 2052 | 2052-03-20 → 2052-09-14; 2052-12-12 → **2059-06-19**; 2059-12-26 → 2060-02-28 | **88.76 d** (must be bridged), **190.07 d** (must not) |

Reproducing all three reference periods therefore admits only thresholds in the half-open interval
**(123.45 d, 152.46 d]**. Two consequences worth stating plainly:

- **182 days (6 months), the obvious classical round number, does not work.** It bridges the 1993
  passage's 152.46-day gap and reports that passage ending 2001-03-19 — 263 days late.
- **138 days is the calibrated midpoint of the admissible interval** (~14.5 days of margin either
  side). It also coincides with Saturn's mean retrograde span measured over the same horizon:
  **138.0 days** across 105 retrograde loops, range 133.7–141.4 days. That is the natural physical
  scale of a retrograde excursion out of the window, so the constant has a reading beyond "it fits".

Sampled across 24 natal Moon longitudes the intra-passage gap distribution is a **smooth continuum**
from ~4 days to ~232 days with no natural cut, so the threshold is a calibrated judgement, not a
derived quantity. Note also that the reference's own behaviour cannot be reproduced by *any* pure gap
threshold in full generality: for the 1993 passage it bridges a 123-day excursion at the leading edge
of the window but not a 152-day one at the trailing edge, and those are the same physical phenomenon at
opposite edges. A plausible alternative model — merge fragments at the leading edge, and end the
passage at the first crossing of the trailing edge — reproduces all three reference passages exactly
without any threshold at all. That model is **not** implemented; it is recorded here because it would
remove the judgement call entirely if a teacher confirms it.

**❓ Validation request:** How long an excursion outside the 45° orb ends a passage rather than
interrupting it? The three reference passages pin the threshold only to somewhere in
**(123.45 d, 152.46 d]**; 138 days is our calibrated midpoint, chosen because it also matches Saturn's
mean retrograde span. If your school has a stated rule — or if the "first trailing-edge exit" model
above is the correct reading of PVR's method — the constant should follow it rather than the midpoint.

The 2030 passage shows no fragmentation at all because its post-exit retrograde loop peaks at 56.8°
separation and never dips back inside 45°, so there is nothing to merge either way.

### Why the two readings can disagree

They are not two ways of computing the same dates. With the Reference_Chart geometry:

- Natal Moon at **Pisces 17.76° = 347.76°** sidereal.
- The ±45° window is therefore **302.76° → 32.76°**, i.e. **Aquarius 2.76° through Taurus 2.76°**.
- That arc touches **four signs — Aquarius, Pisces, Aries and Taurus** — not the three the sign-based
  reading uses (Aquarius 12th, Pisces 1st, Aries 2nd from the Moon).

So the two readings can each be running while the other is not:

- **Sign on, degree off.** The sign reading opens when Saturn enters Aquarius in **Apr 2022**. At
  Aquarius 1° the separation from the Moon is 46.8° — outside the orb. The degree reading does not
  open until **2023-02-10**.
- **Degree on, sign off.** The sign reading closes when Saturn leaves Aries in **Apr 2030**. On
  2030-05-01 Saturn is at **Taurus 1.71°**, the 3rd sign from the Moon and no part of the classical
  trio, yet only 43.95° from the natal Moon — still inside the orb. The degree reading runs on to
  **2030-05-09**.

Neither is an error. The disagreement is the point of showing both.

### The `asOf` correction

**This is a fix, not a caveat.** Both readings' "is this period current?" flags now derive from the
single instant the transit block reports — `TransitAnalysis.asOf`.

Previously `computeSadeSatiPeriods` opened with its own wall-clock `new Date()` and set every period's
`isCurrent` from that, while its caller derived `sadeSati.active` and `sadeSati.phase` from the
`asOfDate` **parameter**. For any evaluation instant that was not the present moment — every historical
date the duration-analysis path evaluates, for instance — the same object could report an active Sade
Sati for 1990 while no period in its own list was flagged current. `asOfDate` is now a required
parameter and both readings key off it, so the panel's two current flags and the `active` flag always
describe the same instant.

**Scope of the fix: `isCurrent` only.** The scan horizon's end year is still derived from the wall
clock, matching "the 35th year after the present year" literally. Making the horizon `asOf`-relative
would change *how many periods* are returned on the duration-analysis path, which is a larger change
than the defect being fixed. Both readings share the same wall-clock horizon, so they stay aligned.

### What is NOT implemented in the degree-based reading

- **No rising / peak / setting subdivision** — deliberate; see the definition above.
- **No configurable orb.** `orbDeg` is reported as a constant 45, not accepted as a parameter.
- **No separate treatment of the fourth sign** the arc touches. The descriptive label names the
  classical 12th / 1st / 2nd trio verbatim, matching PVR's output, even where the arc reaches a fourth
  sign (see the validation request below).
- **No interpretation.** Dates and completion percentage only; nothing about what the passage means.

**❓ Validation request:** Should the descriptive label name the classical **12th / 1st / 2nd trio** — as
PVR's output does, and as implemented — or the signs the ±45° arc **genuinely touches**, which for this
chart is four? Naming the trio is familiar but is arguably wrong for an angular reading; naming four
signs is accurate but will look unfamiliar next to the sign-based panel.

**❓ Validation request:** Should the sequence numbers be **horizon-relative** — numbered from 1 at the
first period in the scan window, which starts 33 years before birth, as implemented — or
**life-relative**, starting at the first period ending at or after birth? Horizon-relative means the
first period the panel displays is usually `#2` or `#3` and the numbers do not line up with PVR's
output. Life-relative matches practitioner-facing tools but makes a period's number depend on the
display filter.

**❓ Validation request:** Is the **±45° symmetric orb** the convention in your school? The alternative
is to anchor the window to the Moon's **sign boundaries** — from the start of the 12th sign to the end
of the 2nd — which is a different shape entirely: asymmetric about the Moon, and equal to the
sign-based reading by construction rather than an independent second opinion.

---

## Ashtama Shani and Kantaka Shani

These are flagged based on current transit Saturn's position relative to natal Moon:

- **Ashtama Shani** — Saturn currently in the **8th sign from natal Moon**
- **Kantaka Shani** — Saturn currently in the **4th sign from natal Moon** (also called Ardha Ashtama)

These are computed from the current Gochar Saturn position only. They are displayed as alerts if active.

**❓ Validation request:** Is Kantaka Shani (4th from Moon) considered as significant as Ashtama Shani in your school? Some schools also flag Saturn in the 7th from Moon.

---

## Moon Transits (~60 days)

### What is shown

The next 27 sign-changes of the Moon, showing the entry date, exit date, and house from natal Moon (Chandra Lagna).

27 signs is approximately 60 days (Moon transits ~2 signs per sidereal week).

### How computed

Using the **real lunar ephemeris** — the same bisection method as Sade Sati, but with a coarse step of 6 hours (0.25 days) instead of 10 days.

1. Find the start of the Moon's current sign by searching backward.
2. Find each subsequent sign change by searching forward.
3. The exact ingress moment is refined to sub-second accuracy.

Moon transit durations are variable (~2.1 to 2.5 days per sign) due to the Moon's elliptical orbit. The engine produces exact times, not approximations.

---

## Ascendant Transits (~24 hours)

### What is shown

The next 12 sign-changes of the transiting Ascendant (lagna), showing entry, exit, and house from natal Lagna.

### How computed

Same bisection method, with a coarse step of **10 minutes** — much finer than for Saturn or Moon because ascendant sign durations can be under an hour at certain latitudes.

The ascendant sign duration varies significantly by:
- **Latitude** — higher latitudes create extreme variation (some signs rise in under 40 minutes, others over 2.5 hours)
- **Sign** — signs near the equinoctial axis rise fastest

The transiting ascendant is computed via Swiss Ephemeris house function with the **birth location coordinates**, giving the lagna at that specific place on Earth.

**❓ Validation request:** Should ascendant transits be shown for the birth location or the current residence of the native?

---

## What is NOT Implemented

- **Gochara results by house** (e.g., Saturn's 7th-house transit effects) — only positions are shown, not interpretations.
- **Chandra Shtama** (Moon in 8th from natal Moon) alert — only Sade Sati phases and Ashtama Shani are flagged.
- **Planetary war (graha yuddha)** detection during transits.
- **Retrograde ingress dates** for planets other than Saturn.
- **Transit over natal planets** (e.g., Saturn conjunct natal Sun).
- **Tara Bala / Chandra Bala** assessment from Moon transit position.

---

## Summary of Open Questions for Teacher Review

| # | Point | Question |
|---|---|---|
| 1 | Sade Sati before birth | Show or hide periods ending before birth year? |
| 2 | Kantaka Shani | Is 4th-from-Moon flagging standard in your school? |
| 3 | Other Shani positions | Should 7th from Moon also be flagged? |
| 4 | Ascendant transits | Birth location vs. current residence? |
| 5 | Retrograde handling — degree reading | How long an excursion outside the 45° orb ends a passage rather than interrupting it? The three reference passages pin the merge threshold only to **(123.45 d, 152.46 d]**; we use **138 d**, the midpoint, which also matches Saturn's mean retrograde span (138.0 d). 182 d (6 months) does not fit. An alternative model — merge at the leading edge, end at the first trailing-edge exit — reproduces all three reference passages with no threshold at all; is that PVR's actual rule? *(The earlier 2059 → 2060 divergence is resolved; the sign scan keeps its own 240 d.)* |
| 6 | Degree reading — label | Should the label name the classical 12th/1st/2nd trio (as PVR's output does, as implemented) or the up-to-four signs the ±45° arc genuinely touches? |
| 7 | Degree reading — numbering | Horizon-relative sequence numbers from 1 at the start of the 33-years-pre-birth scan (as implemented, so the first displayed period is usually not #1), or life-relative from the first period ending at or after birth (what practitioner tools show)? |
| 8 | Degree reading — orb shape | Is ±45° symmetric about the natal Moon's degree your school's convention, or is the window anchored to the Moon's sign boundaries (12th-sign start → 2nd-sign end)? |
