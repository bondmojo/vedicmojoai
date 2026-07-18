# Chara Dasha Computation — Implementation Logic

**For practitioner review and teacher validation.**

Engine: `engine/compute/charaDasha.ts` (`computeCharaDasha`). Returned by
`POST /api/compute` as the `charaDasha` sibling of `chart` and `dashaTree`;
surfaced in the UI "Chara Dasha" tab, the "Copy for AI" panel, and the MCP
`get_chara_dasha` tool.

---

## What Chara Dasha is

Chara Dasha is Maharishi Jaimini's premier **rasi (sign) dasha** — the
mahadashas are SIGNS, not planets. It complements the planet-based Vimshottari
dasha and is read with the Jaimini toolkit (Chara Karakas, Karakamsa, Arudha
Lagna, argala, rasi drishti).

## Method used: Parasara / PVR Chara Dasha (Jagannatha Hora default)

Calibrated and **verified end-to-end against Jagannatha Hora** — all 24
mahadashas of both cycles for the Mojo chart (Taurus lagna) match exactly.

**1. Start.** First mahadasha = the Lagna sign.

**2. Sequence direction** — fixed by the **9th sign from the Lagna**:

| 9th sign from Lagna | Direction of the sign sequence |
|---|---|
| Even-footed (Cancer, Leo, Virgo, Capricorn, Aquarius, Pisces) | Reverse (anti-zodiacal) |
| Odd-footed (Aries, Taurus, Gemini, Libra, Scorpio, Sagittarius) | Forward (zodiacal) |

**3. Sign lord** (drives the duration):
- single-lord signs → the classical owner;
- **Scorpio (Mars/Ketu)** and **Aquarius (Saturn/Rahu)** are dual-lord signs:
  use the **node** (Ketu / Rahu) **unless that node occupies the sign itself**,
  in which case use the planet (Mars / Saturn). *(On the Mojo chart: Scorpio →
  Mars because Ketu is IN Scorpio; Aquarius → Rahu because Rahu is NOT in it.)*

**4. Mahadasha duration** = count from the sign to the sign its lord occupies, **minus 1**:

- **Odd-footed** sign → count **forward** (zodiacal) sign → lord.
- **Even-footed** sign → count **reverse** (anti-zodiacal) sign → lord.
- Lord in the sign itself (count − 1 ≤ 0) → **12 years**.
- **No exaltation/debilitation adjustment.** (The ±1 exalt/debil rule is the *KN
  Rao* variant; JHora's default does NOT apply it — this was the source of an
  earlier Capricorn discrepancy.)

**5. Two cycles.** The 12 signs run **twice**. In the **second cycle** each sign's
duration = **12 − its first-cycle duration** (so a 12-year first-cycle sign has a
0-year second-cycle period, which JHora lists as "0d"). Every chart therefore
totals **12 × 12 = 144 years** across both cycles.

**4. Antardashas** — each mahadasha is split into **12 equal** sub-periods. The
order is the **same for every mahadasha**: the 12-sign mahadasha progression
with the **lagna moved to the end** (starts from the 2nd maha sign, cycles in
the dasha direction, ends on the lagna). Verified against Jagannatha Hora for
the Mojo chart (Taurus lagna, reverse): the Sagittarius mahadasha's antardashas
run Aries, Pisces, Aquarius, Capricorn, Sagittarius, Scorpio, Libra, Virgo, Leo,
Cancer, Gemini, Taurus.

### Worked example (verifies the reverse case)

Capricorn Lagna → 9th sign = Virgo (even-footed) → **reverse** sequence:
Capricorn, Sagittarius, Scorpio, Libra, Virgo, Leo, Cancer, Gemini, Taurus,
Aries, Pisces, Aquarius. This matches the standard published Capricorn-lagna
Chara sequence.

---

## Odd-footed / Even-footed reference

- **Odd-footed (Vishama-pada):** Aries, Taurus, Gemini, Libra, Scorpio, Sagittarius (1,2,3,7,8,9)
- **Even-footed (Sama-pada):** Cancer, Leo, Virgo, Capricorn, Aquarius, Pisces (4,5,6,10,11,12)

---

## Summary of Open Questions for Teacher Review

| # | Point | Status / Question |
|---|---|---|
| 1 | Direction + sequence | **Verified against JHora** (Mojo chart, Taurus lagna → reverse; Sagittarius the 6th maha). |
| 2 | Antardasha order | **Verified against JHora** (Sagittarius MD → Ari, Pis, Aqu, … Tau). Fixed 2026-07 from an earlier "start from the maha sign" rule that did NOT match JHora. |
| 3 | Sagittarius MD = 12y | **Verified against JHora** (Jupiter own-sign → 12 years). |
| 4 | **Earlier-maha DURATIONS — KNOWN DIVERGENCE** | Our KN Rao durations (matching the PyJHora `CHARA_TYPE.KN_RAO` reference) place Sagittarius at **birth + 30y (2014)**; JHora.com shows **birth + 33y (2017)** — a ~3-year cumulative difference on the Taurus/Aries/Pisces/Aquarius/Capricorn periods. This is a duration-rule VARIANT (Jagannatha Hora's Chara Dasha options dialog offers several methods). **To resolve: provide JHora's full maha list (all 12 signs' start dates) so the exact rule can be pinned.** |
| 5 | Dual lords | Scorpio → Mars, Aquarius → Saturn (nodes not used). Confirm vs PVN Rao (Ketu/Rahu co-lords). |
| 6 | Exalt/debil adjustment | ±1 year applied to the lord in its occupied sign (KN Rao). Part of the item-4 divergence — confirm your school's rule. |
| 7 | Year length | Gregorian mean year (365.2425 d), matching the Vimshottari engine. JHora uses the sidereal solar year (~365.2564 d); the difference is < 1 day over 30 years and is NOT the cause of item 4. |
