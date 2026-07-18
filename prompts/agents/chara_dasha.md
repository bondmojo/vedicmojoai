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

The engine follows the **Parasara / PVR Chara Dasha** — the variant Jagannatha
Hora produces by default. Verified end-to-end against JHora (all 24 mahadashas
of both cycles for the reference chart). Rules:

1. **First mahadasha = the Lagna sign.**

2. **Sequence direction** is fixed by the **9th sign from the Lagna**:
   - 9th sign is **even-footed** (Sama-pada: Cancer, Leo, Virgo, Capricorn,
     Aquarius, Pisces) → the dasha signs run **reverse** (anti-zodiacal);
   - otherwise → **forward** (zodiacal).

3. **Sign lord** (drives the duration): single-lord signs use the classical
   owner; the dual-lord signs **Scorpio (Mars/Ketu)** and **Aquarius
   (Saturn/Rahu)** use the **node** (Ketu / Rahu) UNLESS the node occupies that
   sign, in which case the planet (Mars / Saturn) is used.

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
   the lagna moved to the end (2nd maha sign first, cycling in the dasha
   direction, lagna last). Matches Jagannatha Hora.

The MCP output fields: `method`, `direction`, `ninthSignNumber`, `cycleYears`
(first cycle), and `periods[]` with `{ sign, signNumber, lord, lordSignNumber,
durationYears, cycle, start, end, antardashas[] }`.

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

- **Method**: Parasara / PVR (Jagannatha Hora default), verified against JHora.
  Other variants (KN Rao with ±1 exalt/debil and single classical lords;
  Iranganti; Raghava-Bhatta; Sanjay Rath) differ in duration and lord rules.
- **Antardasha order**: matches Jagannatha Hora (maha progression, lagna moved
  to the end; equal twelfths).
- **Dual lords**: node (Ketu/Rahu) unless it occupies the sign → then the planet
  (Mars/Saturn).
- **Progression seed**: JHora's strength-based seed (stronger of asc-/sun-/moon-
  lord) is approximated by the LAGNA seed — exact when the seed resolves to the
  lagna (as on the reference chart). Flag if a chart's seed differs.

Treat the deterministic periods as authoritative; narrate them — do not
recompute the durations by hand.
