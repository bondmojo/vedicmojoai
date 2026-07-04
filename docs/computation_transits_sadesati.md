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

### Display Filtering

Sade Sati periods that **fully ended before the native's birth year** are not shown in the UI. Periods that began before birth but extended into the native's life are shown — they represent the influence during early childhood.

**❓ Validation request:** Should Sade Sati periods active before the native's birth be shown at all? Some practitioners show the complete Saturn cycle for the soul's perspective. Others only show post-birth periods.

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
| 5 | Retrograde handling | Is the 240-day merge threshold appropriate for Sade Sati retrograde segments? |
