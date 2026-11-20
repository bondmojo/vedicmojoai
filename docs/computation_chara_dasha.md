# Chara Dasha Computation — Implementation Logic

**For practitioner review and teacher validation.**

Engine: `engine/compute/charaDasha.ts` (`computeCharaDasha`). Returned by
`POST /api/compute` as the `charaDasha` sibling of `chart` and `dashaTree`;
surfaced in the UI "Chara Dasha" tab, the "Copy for AI" panel, and the MCP
`get_chara_dasha` tool. Tests: `tests/chara-dasha.test.ts`.

---

## What Chara Dasha is

Chara Dasha is Maharishi Jaimini's premier **rasi (sign) dasha** — the
mahadashas are SIGNS, not planets. It complements the planet-based Vimshottari
dasha and is read with the Jaimini toolkit (Chara Karakas, Karakamsa, Arudha
Lagna, argala, rasi drishti).

## Method used: Parasara / PVR Chara Dasha (Jagannatha Hora)

Source: P.V.R. Narasimha Rao, *Parasara's Chara Dasa*
(vedicastrologer.org/articles/pp_chara_dasa.pdf), as Jagannatha Hora computes it.

**Verified against Jagannatha Hora** mahadasha-for-mahadasha on two charts:

| Chart | Seed | Why | Co-lords |
|---|---|---|---|
| Taurus lagna, Moon in Pisces | Taurus (lagna + Sun) | Venus and Jupiter both in own sign; Venus has 2 companions, Jupiter none | Aquarius → Rahu (more companions); Scorpio → Mars (Ketu sits in Scorpio) |
| Aquarius lagna, Moon in Cancer | **Cancer (Moon)** | the Moon is in its own sign; Saturn (lagna lord) and Mercury (Sun-sign lord) are not | Aquarius → Saturn (fixed sign beats Rahu's movable sign); Scorpio → Ketu (aspected by Jupiter and Venus; Mars by none) |

The second chart is the one that exposed the old engine's errors: it started
the dasha from the lagna (Aquarius, forward) and used Rahu for Aquarius (10
years instead of 3), so every period after birth was wrong.

**1. Seed (first mahadasha).** Take the signs holding the **Lagna, Moon and Sun**
and start from the one whose **lord is strongest**. Tests in order, until one
sign is left:

| | Test |
|---|---|
| (a) | Lord in exaltation, moolatrikona (degree-aware) or own sign |
| (b) | Lord joined by more planets |
| (c) | Lord in a trine (1st/5th/9th) from the sign |
| (d) | Lord in a quadrant (1st/4th/7th/10th) from the sign |
| (e) | Lord more advanced in the sign it occupies (Rahu/Ketu: 30° − degree) |
| (g) | Remaining signs share one lord: the sign whose oddity differs from the sign the lord occupies (Mercury in Cancer → Gemini beats Virgo) |

For Scorpio/Aquarius the lord tested is the stronger co-lord (rule 3). If the
references share a sign it is one candidate; `seedReferences` lists every
reference in the seed sign. A full tie falls back to lagna → Moon → Sun.

**Not implemented — exception (f):** the paper deems a lord weak when it is
deeply combust, defeated in a planetary war, in deep gandanta or deeply
debilitated. It gives no thresholds for "deep", so the engine does not apply it.

**2. Sequence direction** — fixed by the **9th sign from the seed**:

| 9th sign from the seed | Direction of the sign sequence |
|---|---|
| Even-footed (Cancer, Leo, Virgo, Capricorn, Aquarius, Pisces) | Reverse (anti-zodiacal) |
| Odd-footed (Aries, Taurus, Gemini, Libra, Scorpio, Sagittarius) | Forward (zodiacal) |

**3. Sign lord** (drives the duration). Single-lord signs → the classical owner.
**Scorpio (Mars/Ketu)** and **Aquarius (Saturn/Rahu)** take the **stronger
co-lord**, in this order:

1. Both co-lords in the sign → the dasha is 12 years.
2. One co-lord in the sign → use the other.
3. Neither in the sign → the stronger planet:
   1. joined by more planets;
   2. more of Jupiter, Mercury and its dispositor conjoining it or casting a
      rasi aspect on it (a planet filling two roles counts twice);
   3. exalted (Rahu in Taurus/Gemini, Ketu in Scorpio/Sagittarius);
   4. in a stronger sign type: dual > fixed > movable;
   5. more advanced in its sign (Rahu/Ketu: 30° − degree).

`periods[].lordRule` records which step decided. This is Jagannatha Hora's order
(as ported by PyJHora's `house.stronger_planet_from_planet_positions`), not the
paper's shorter list: the paper's "movable > fixed > dual, then more dasa years"
picks Rahu for Aquarius in the Aquarius-lagna chart, where Jagannatha Hora uses
Saturn.

**4. Mahadasha duration** = count from the sign to the sign its lord occupies, **minus 1**:

- **Odd-footed** sign → count **forward** (zodiacal) sign → lord.
- **Even-footed** sign → count **reverse** (anti-zodiacal) sign → lord.
- Lord in the sign itself (count − 1 ≤ 0) → **12 years**.
- **No exaltation/debilitation adjustment.** The ±1 rule is the *KN Rao*
  variant; the paper rejects it.

**5. Two cycles.** The 12 signs run **twice**. In the **second cycle** each sign's
duration = **12 − its first-cycle duration** (so a 12-year first-cycle sign has a
0-year second-cycle period, which Jagannatha Hora lists as "0d"). Every chart
totals **12 × 12 = 144 years** across both cycles.

**6. Antardashas** — each mahadasha is split into **12 equal** sub-periods. The
order is the **same for every mahadasha**: the 12-sign mahadasha progression
with the **seed moved to the end** (starts from the 2nd maha sign, cycles in the
dasha direction, ends on the seed). Verified against Jagannatha Hora for the
Taurus-lagna chart (lagna seed, reverse): the Sagittarius mahadasha's antardashas
run Aries, Pisces, Aquarius, Capricorn, Sagittarius, Scorpio, Libra, Virgo, Leo,
Cancer, Gemini, Taurus. The paper does not cover antardashas.

### Output fields

`method`, `lagnaSignNumber`, `seedSignNumber`, `seedReferences` (`lagna` / `moon` /
`sun`), `seedRule` (plain-words reason), `ninthSignNumber` (9th from the seed),
`direction`, `cycleYears` (first cycle), `periods[]` (`sign`, `signNumber`,
`lord`, `lordSignNumber`, `lordRule?`, `durationYears`, `cycle`, `start`, `end`,
`antardashas[]`).

---

## Odd-footed / Even-footed reference

- **Odd-footed (Vishama-pada):** Aries, Taurus, Gemini, Libra, Scorpio, Sagittarius (1,2,3,7,8,9)
- **Even-footed (Sama-pada):** Cancer, Leo, Virgo, Capricorn, Aquarius, Pisces (4,5,6,10,11,12)

---

## Summary of Open Questions for Teacher Review

| # | Point | Status / Question |
|---|---|---|
| 1 | Seed (strongest of Lagna/Moon/Sun) | **Verified against Jagannatha Hora** on a lagna-seeded and a Moon-seeded chart. No Sun-seeded chart checked yet. |
| 2 | Seed exception (f) — deep combustion, planetary war, deep gandanta, deep debilitation | **Not implemented** (no thresholds). Confirm thresholds if this school applies it. |
| 3 | Co-lord order for Scorpio/Aquarius | **Verified against Jagannatha Hora** for the conjunction, one-in-sign, aspect and sign-type steps. The advancement step is unverified. |
| 4 | Antardasha order | Verified against Jagannatha Hora on a lagna-seeded chart only. Unverified when the seed is the Moon or Sun sign. |
| 5 | Exalt/debil adjustment | Not applied (paper and Jagannatha Hora agree). |
| 6 | Year length | Mean Gregorian year (365.2425 d), matching the Vimshottari engine. Jagannatha Hora's boundaries can fall a day later (it reckons solar years). Sequence and durations are unaffected. |
| 7 | Divisional-chart Chara Dasha | The paper computes Chara Dasha in the relevant varga (D-7, D-10, …). The engine computes D1 only. |
