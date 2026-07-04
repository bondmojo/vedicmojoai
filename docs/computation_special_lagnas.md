# Special Lagna Computation — Implementation Logic

**For practitioner review and teacher validation.**

---

## Overview

Special Lagnas are secondary ascendants calculated from time, planetary positions, or classical formulas. They provide additional perspectives on wealth, career, relationships, and other life themes.

The system currently computes:

| Abbr | Full Name | Primary Use |
|---|---|---|
| HL | Hora Lagna | Wealth, sustenance |
| GL | Ghati Lagna | Power, status, authority |
| BL | Bhava Lagna | Inner nature, consciousness |
| SL | Sree Lagna | Lakshmi, prosperity |
| VL | Varnada Lagna | Career class, social karma |
| IL | Indu Lagna | Financial prosperity |
| KL | Kunda Lagna | Same as GL (JHora convention) |
| BBL | Bhrigu Bindu | Accumulated karma trigger point |
| KS | Karakamsa | Soul's deepest desire (AK in D9) |
| PL | Pranapada | Life force and vitality |
| UL | Upapada Lagna | Spouse quality (= A12 arudha) |

---

## Sunrise Convention

All time-based lagnas (HL, GL, BL, VL, PL) require a **sunrise reference**. The system offers two modes:

### Precise Mode (Default)
Uses the **real astronomical sunrise** computed via Swiss Ephemeris for the birth location and date. This is the more accurate method.

### JHora Mode
Uses a **fixed 6:00 AM local time** as sunrise. This matches the convention used by Jagannatha Hora software and is useful for cross-checking.

**Note on GL specifically:** Even in JHora mode, Ghati Lagna (GL) is computed from the real astronomical sunrise. JHora itself uses real sunrise for GL despite using 6 AM for HL and BL. This has been verified by comparison and is intentional.

---

## Hora Lagna (HL)

**Source:** BPHS Chapter 5, verses 2–3.

**Formula:**
- Origin: Sun's sidereal longitude at sunrise
- Rate: **30° per hora** (1 hora = 1 hour)
- HL = Sun-at-sunrise + (hours elapsed since sunrise × 30°)

1 hora = 1 hour. The ascendant completes the full zodiac in 24 hours for HL, so it advances 1 sign per hour.

**House from Lagna:** Computed in the same way as any other point — sign number minus Lagna sign number (mod 12) + 1.

---

## Ghati Lagna / Ghatika Lagna (GL)

**Source:** BPHS Chapter 5, verses 6–8.

**Formula:**
- Origin: Sun's sidereal longitude at **real astronomical sunrise** (always, regardless of sunriseMode)
- Rate: **75° per hour** (1 ghati = 24 minutes = 6° → 75°/hr)
- GL = Sun-at-sunrise + (hours elapsed since sunrise × 75°)

GL advances 1 sign every ghati (24 minutes). It completes the full zodiac in just 4.8 hours, making it extremely sensitive to birth time.

**Kunda Lagna (KL)** = same longitude as GL in our system. In Jagannatha Hora, KL appears in the same house cell as GL. The underlying reason for this identity is not clear from public classical sources and is flagged for teacher review.

**❓ Validation request:** Is Kunda Lagna the same as Ghati Lagna? Or is it a distinct point? Some sources define Kunda Lagna as the 4th from Hora Lagna. Please clarify.

---

## Bhava Lagna (BL)

**Source:** BPHS Chapter 5, verses 2–3.

**Formula:**
- Origin: Sun's sidereal longitude at sunrise
- Rate: **15° per hour** (1 sign per 5 ghatis = 2 hours)
- BL = Sun-at-sunrise + (hours elapsed since sunrise × 15°)

BL advances 1 sign every 2 hours (5 ghatis). It relates the solar day arc to the birth moment.

---

## Sree Lagna (SL)

**Source:** Classical method cited in BPHS and Jaimini tradition.

**Formula:**
1. Find how far into its current nakshatra the Moon has traveled.
   - Each nakshatra spans 13°20' (= 360° / 27).
   - Fraction = (Moon's degree within nakshatra) / 13°20'
2. Multiply this fraction by 360°.
3. Add the result to the Lagna longitude.

**Example:** Moon at 50% of its nakshatra → add 180° to Lagna.

This is the method described at [indastro.com](https://www.indastro.com/astrology-reports/sree-lagna-vedic-report-analysis.html) and [quora (Ashok Gupta)](https://www.quora.com/How-do-I-locate-Sree-Lagna-in-a-chart/answer/Ashok-Gupta-21).

**❓ Validation request:** Some schools compute SL as Lagna + (Moon − Sun). Our formula uses the nakshatra-fraction method. Which does your teacher use?

---

## Varnada Lagna (VL)

**Source:** BPHS Chapter 5, verses 10–13½; Sanjay Rath's commentary.

**Formula** (two-step counting method):
1. Count from Aries to the Lagna sign:
   - If Lagna is in an **odd sign** → count forward from Aries (Aries=1, Taurus=2…). Call this **A**.
   - If Lagna is in an **even sign** → count backward from Pisces (Pisces=1, Aquarius=2…). Call this **A**.
2. Count from Aries to the Hora Lagna sign using the same odd/even rule. Call this **B**.
3. Combine:
   - If both Lagna and HL are in **same parity** (both odd or both even) → **C = A + B**
   - If they are in **different parity** → **C = |A − B|** (if this is 0, use 12)
4. Reduce C to 1–12.
5. Count the result from Aries (if Lagna is odd) or backward from Pisces (if Lagna is even).

**Verification:** The classical example of Jawahar Lal Nehru (Lagna = Cancer, HL = Pisces) gives Varnada = Gemini. Our formula reproduces this correctly.

**Important note on JHora:** JHora shows VL in a different house for the reference chart. Through exhaustive testing, it has been confirmed that JHora's VL placement **cannot be reproduced** using the standard BPHS formula above from a Taurus lagna. JHora's Varnada appears to use a proprietary variant formula. Our implementation follows the classical BPHS text.

**❓ Validation request:** Is the BPHS two-step Hora Lagna–based formula the correct one for Varnada? Or does your school use a different second reference point?

---

## Indu Lagna (IL)

**Source:** Traditional Jyotish (Parashara tradition).

**Formula:**
1. Find the **9th house lord from Lagna**. Look up its Indu value:
   - Sun = 30, Moon = 16, Jupiter = 10, Venus = 12, Mercury = 8, Mars = 6, Saturn = 1, Rahu/Ketu = 0
2. Find the **9th house lord from Moon**. Look up its Indu value.
3. Add both values. Take the result modulo 12 (if 0, use 12).
4. Count that many signs forward from the Moon's sign. That is the Indu Lagna.

**Edge case:** If both 9th lords are Rahu or Ketu (Indu value = 0 for both), the sum is 0. We map this to 12, placing IL in Moon's own sign. This fallback has no classical citation and is flagged for review.

**❓ Validation request:** Are the Indu values (30, 16, 10, 12, 8, 6, 1, 0) correct per your tradition? What should happen when both 9th lords are nodes?

---

## Karakamsa (KS)

**Definition:** The Navamsa (D9) sign occupied by the **Atmakaraka** (the planet with the highest degree in its sign, which is the soul's significator in Jaimini).

**Formula:** Look up the D9 sign of the Atmakaraka planet. The start of that sign (at 0° of that sign) is the Karakamsa longitude.

This is stored with the abbreviation **KS** (not KL) to distinguish it from Kunda Lagna.

**Note:** Karakamsa when projected into divisional charts (D4, D7, D10, D30) uses the KS longitude as a D1-equivalent input. The result in non-D9 vargas has no classical basis and should be interpreted cautiously. It is shown for completeness only.

---

## Pranapada Lagna (PL)

**Source:** BPHS (Pranapada chapter).

**Formula:**
1. Compute the time elapsed since sunrise in **vighatis** (1 vighati = 24 seconds).
2. Divide by 15 → arc in degrees.
3. Add the arc to the **Sun's longitude at birth** (not at sunrise).
4. Add a constant based on the Sun's sign modality:
   - Sun in a **movable** sign (Aries, Cancer, Libra, Capricorn) → add **0°**
   - Sun in a **fixed** sign (Taurus, Leo, Scorpio, Aquarius) → add **240°**
   - Sun in a **dual** sign (Gemini, Virgo, Sagittarius, Pisces) → add **120°**

**Verification:** For the reference chart (Sun in Taurus, a fixed sign), the formula gives Capricorn, matching Jagannatha Hora exactly.

---

## Bhrigu Bindu (BBL)

**Definition:** The midpoint between Rahu and Moon in the sidereal zodiac.

**Formula:** BBL = (Rahu longitude + Moon longitude) / 2

**Verification:** For the reference chart, Rahu at 42.97° + Moon at 347.76° gives BBL = 195.36° = Libra (6th house from Taurus lagna), matching JHora.

**❓ Validation request:** Some sources define the Bhrigu Bindu differently (as the midpoint of the shorter arc between Moon and Rahu, always < 180°). Our formula takes a straight arithmetic average which can exceed 180°. Please confirm the correct method.

---

## Upapada Lagna (UL)

UL = A12 = the Arudha of the 12th house. It is computed by the Arudha Pada engine (same formula as all other arudhas) and is not a separate special lagna computation.

**Source:** Same as all Arudha Padas — BPHS, Jaimini Sutras.

---

## Summary of Open Questions for Teacher Review

| # | Point | Question |
|---|---|---|
| 1 | Scorpio lord | Should Ketu replace Mars for Scorpio arudhas? |
| 2 | Kunda Lagna (KL) | Is KL the same as GL, or a distinct point (e.g., 4th from HL)? |
| 3 | Sree Lagna (SL) | Nakshatra-fraction method vs. Lagna + (Moon − Sun)? |
| 4 | Varnada (VL) | Is Hora Lagna the correct second input, or is a different point used? |
| 5 | Indu Lagna edge case | What value when both 9th lords are nodes (Indu=0)? |
| 6 | Indu values | Are the traditional values (30, 16, 10, 12, 8, 6, 1) correct? |
| 7 | Bhrigu Bindu | Straight average vs. shorter-arc midpoint? |
| 8 | Divisional arudhas | Are arudhas in D9, D10 etc. a valid practice in your school? |
