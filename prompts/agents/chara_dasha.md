# Framework: Chara Dasha (Jaimini) — Computation & Interpretation

Canonical reference for the Jaimini **Chara Dasha** as computed by this system.
Exposed to Claude Desktop via the MCP `get_chara_dasha` tool (and inside
`compute_chart` output as `charaDasha`). This is a **sign/rasi-based** dasha —
the mahadashas are SIGNS, not planets — and is complementary to the planet-based
Vimshottari dasha (`get_dasha_tree`).

---

## What Chara Dasha is (and when to use it)

Chara Dasha is Maharishi Jaimini's premier conditional-free rasi dasha. Because
its periods are signs, it is read together with the **Jaimini toolkit**: the
Chara Karakas (AK…DK), Karakamsa (AK in D9), Arudha Lagna (AL) and the Upapada
(UL), rasi drishti, and argala. It excels at timing **events tied to houses and
karakas** — marriage, career shifts, relocation, litigation, gains — and at
rectification cross-checks against Vimshottari.

Use it to answer "WHICH SIGN/HOUSE is activated now, and what does that house
(and its arudha/karaka) promise?" — then confirm the WHEN against Vimshottari
and transits.

---

## How this system computes it (Parasara / PVR method — JHora-matching)

The engine follows the **Parasara / PVR Chara Dasha** (P.V.R. Narasimha Rao's
write-up, as Jagannatha Hora produces it). Verified mahadasha-for-mahadasha
against Jagannatha Hora on a lagna-seeded and a Moon-seeded chart. Rules:

1. **First mahadasha (the seed)** = whichever of the signs holding the **Lagna,
   Moon and Sun** has the **strongest lord**. Tests in order: lord exalted /
   moolatrikona / own sign → lord joined by more planets → lord in a trine from
   the sign → lord in a quadrant from it → lord more advanced in its sign → (same
   lord) the sign whose oddity differs from the lord's sign. So the dasha often,
   but NOT always, starts from the Lagna.

2. **Sequence direction** is fixed by the **9th sign from the seed**:
   - 9th sign is **even-footed** (Sama-pada: Cancer, Leo, Virgo, Capricorn,
     Aquarius, Pisces) → the dasha signs run **reverse** (anti-zodiacal);
   - otherwise → **forward** (zodiacal).

3. **Sign lord** (drives the duration): single-lord signs use the classical
   owner. The dual-lord signs **Scorpio (Mars/Ketu)** and **Aquarius
   (Saturn/Rahu)** use the **stronger co-lord**: both in the sign → 12 years;
   one in the sign → the other; neither → joined by more planets, then more of
   Jupiter/Mercury/dispositor joining or rasi-aspecting it, then exalted, then
   sign type (dual > fixed > movable), then more advanced in its sign.
   `periods[].lordRule` says which test decided.

4. **Duration** of a sign's dasha = *count from the sign to the sign its lord
   occupies, minus 1*:
   - **odd-footed** sign (Vishama-pada: Aries, Taurus, Gemini, Libra, Scorpio,
     Sagittarius) → count **forward** (sign → lord);
   - **even-footed** sign → count **reverse** (sign → lord).
   - Lord in the sign itself (count − 1 ≤ 0) → **12 years**.
   - **No exaltation/debilitation adjustment** (that is the KN Rao variant).

5. **Two cycles**: the 12 signs run twice; each sign's **second-cycle** duration
   = **12 − its first-cycle** duration (a 12-year sign → a 0-year second period).
   Every chart totals **144 years** across the two cycles.

6. **Antardashas**: each mahadasha is split into **12 equal** sub-periods. The
   order is the same for every mahadasha — the 12-sign mahadasha progression with
   the seed moved to the end (2nd maha sign first, cycling in the dasha
   direction, seed last).

The MCP output fields: `method`, `lagnaSignNumber`, `seedSignNumber`,
`seedReferences` (`lagna` / `moon` / `sun` — every reference in the seed sign),
`seedRule`, `direction`, `ninthSignNumber`, `cycleYears` (first cycle), and
`periods[]` with `{ sign, signNumber, lord, lordSignNumber, lordRule?,
durationYears, cycle, start, end, antardashas[] }`.

When the seed is the Moon or Sun sign, that reference dominates the chart for
this dasha; reading houses from it (Chandra / Surya lagna) as well as from the
Lagna is consistent with the method.

---

## Interpretation rules

**Read each mahadasha SIGN as a bhava.** Its house-from-lagna, its occupants,
the planets aspecting it (graha + rasi drishti), and its **arudha** describe the
theme of the period. A dasha sign that is the 7th (or holds/aspects the Upapada)
times marriage; the 10th (or Amatyakaraka's sign) times career; the 4th (or its
arudha) times property/home.

**Karaka overlay.** The sign holding or aspected by the relevant Chara Karaka is
strongly activated for that karaka's significations during its dasha:
AK (self/turning-points), AmK (career/status), DK (marriage/partner),
PK (children), MK (mother/home), BK (siblings/courage), GK (obstacles/health).

**Argala.** Planets in the 2nd/4th/11th from the dasha sign create supportive
**argala** (intervention) on it; the 12th/10th/3rd give **virodha** (counter)
argala. Net un-neutralised benefic argala on the dasha sign = smoother results.

**Karakamsa & AL.** Events also key off the dasha sign's relationship to the
**Karakamsa** (AK in Navamsa) and to the **Arudha Lagna** — a dasha sign in a
kendra/trikona from AL raises visible status; from the 6/8/12 of AL, setbacks.

**Strength.** A dasha sign is stronger when its lord is exalted/own/in a kendra,
when it holds benefics, and when it carries high SAV bindus. Cross-read the
sign-lord's Shadbala and the house's Bhava Bala.

---

## Timing workflow (how to combine with the rest of the toolkit)

1. `get_chara_dasha` (optionally `asOf`) → the running sign MD/AD.
2. Map the MD sign to its house-from-lagna + arudha + resident/aspecting planets
   (`get_client_chart` / `get_relationships` / `get_jaimini`).
3. Identify which **karaka** the sign carries or is aspected by (`get_jaimini`
   chara karakas).
4. Confirm the WHEN with the **Vimshottari** running period (`get_active_dasha`)
   and transits (`get_transits`) — agreement between the two dasha systems and a
   supporting transit is the classic triple-confirmation for an event.

---

## Validation notes (school choices flagged, per this project's convention)

- **Method**: Parasara / PVR, verified against Jagannatha Hora. Other variants
  (KN Rao: always from Lagna, ±1 exalt/debil; Iranganti; Raghava-Bhatta; Sanjay
  Rath) differ in seed, duration and lord rules — another program's list starting
  from the Lagna is usually that difference, not an error.
- **Seed exception not applied**: the method treats a lord that is deeply
  combust, defeated in planetary war, in deep gandanta or deeply debilitated as
  weak. The engine does not apply this (no thresholds are defined). Flag it when
  the seed's lord is in one of those states.
- **Antardasha order**: maha progression with the seed moved to the end, equal
  twelfths. Verified against Jagannatha Hora on a lagna-seeded chart only.
- **Year length**: mean Gregorian year (365.2425 d); Jagannatha Hora can show a
  boundary a day later.

Treat the deterministic periods as authoritative; narrate them — do not
recompute the durations by hand.
