# Varshaphal (Tajika Annual Chart) — Computation & JHora Reconciliation

**Status:** Reference + reconciliation plan (partially implemented)
**Scope:** How JHora computes Varshaphal, what our engine currently does, the gaps,
and the evidence-based backlog to reach JHora parity.
**Engine:** `engine/compute/varshaphal.ts` · **API:** `POST /api/compute/varshaphal`
· **UI:** `/compute` → Varshaphal tab

---

## 1. Overview

Varshaphal ("fruit of the year") is a Tajika annual horoscope cast for the exact
moment the transiting Sun returns to its natal sidereal longitude (the **Varsha
Pravesh**). Our implementation is an on-demand, stateless compute that reuses
`computeFullChart` for the annual chart, then adds Muntha, Panchavargeeya Bala,
and a Varshesha (year-lord) pick.

---

## 2. How JHora computes Varshaphal (reference)

| Element | JHora method | Status here |
|---|---|---|
| Varsha Pravesh | Sidereal (Lahiri) solar return, same birthplace | ✅ implemented |
| Annual chart | Full chart at the return instant | ✅ (reuses `computeFullChart`) |
| Muntha | +1 sign/year from natal lagna; shows sign, lord, house | ✅ implemented |
| Year Lord (Varshesha) | 5 office-bearers → the strongest (Panchavargeeya) that **aspects the Varsha Lagna**; office count only breaks ties (Tajika Neelakanthi). JHora's exact ordering is unverified — see §7 | ✅ strength-first + sign-based Lagna aspect; ⚠️ unverified vs JHora |
| Panchavargeeya Bala (Tajika) | Kshetra + Uccha + Hadda + Drekkana + Navamsa, ÷4 | ⚠️ scale unverified |
| Harsha Bala | 4-source Tajika joy strength (max 20) | ❌ |
| Dwadasavargeeya Bala | dignity across 12 vargas | ❌ |
| Tajika aspects | sign-distance aspects with deeptamsha orbs, applying/separating | ⚠️ Phase 1: sign distance only (`tajikaAspects.ts`); orbs + applying/separating = Phase 2 |
| Tajika yogas | Ithasala, Ishrafa, Nakta, Yamaya, Kamboola, Manau, Radda, Khallasara… | ❌ |
| Sahams | Punya + ~50 sensitive points, day/night reversal | ❌ |
| Dashas | Mudda (annual Vimshottari), Patyayini; Yogini/Chara optional | ✅ natal Vimshottari through the year + Mudda (with antardashas), `varshaphalDashas.ts`; ⚠️ Mudda balance/year length unverified; ❌ Patyayini |
| Tri-pataki chakra | Moon-based year transit device | ❌ |

> ❓ **Validation requests (need a JHora screen not yet available):**
> - The Tajika year-lord **Panchavargeeya Bala** table (Kshetra/Uccha/Hadda/
>   Drekkana/Navamsa per planet) and the Varshesha JHora selects.
> - JHora's exact solar-return ayanamsa/rounding and "nearest return" behaviour.

---

## 3. Two different "Panchavargeeya" — do not conflate

1. **Tajika Panchavargeeya Bala** (year-lord strength): Kshetra + Uccha + Hadda +
   Drekkana + Navamsa. Decides the Varshesha. Implemented in `varshaphal.ts`.
   Lives in JHora's *Tajaka/Varshaphal* section.
2. **"Pancha Vargeeya (5 Charts)"** under Graha Bala → Other Balas: a Parashari
   Vimsopaka-family strength over 5 divisional charts, shown for any chart. Values
   like Venus 25.52, Saturn 25.32. **Not** the year-lord Panchavargeeya.

The JHora reference we have (a Graha Bala screen) contains #2, not #1 — so #1
remains unverified.

---

## 4. Shadbala reconciliation vs JHora (evidence-based)

Source: the JHora **annual (Varshaphal) Shadbala** screen for the Mojo chart.
All rows verified internally consistent (six balas sum to the stated total; every
planet's Ishta + Kashta = 60).

### 4.1 Reference values (JHora annual chart)

| Planet | Total/Req | Sthana | Dig | Kaala | Cheshta | Naisargika | Drik |
|---|---|---|---|---|---|---|---|
| Venus | 571.78/330 | 230.85 | 93.34 | 220.38 | 2.01 | 42.86 | −17.66 |
| Mercury | 602.67/420 | 153.15 | 74.15 | 271.29 | 97.71 | 25.71 | −19.34 |
| Jupiter | 557.63/390 | 189.33 | 6.28 | 270.46 | 72.72 | 34.29 | −15.45 |
| Saturn | 404.53/300 | 211.15 | 46.13 | 80.35 | 51.79 | 8.57 | 6.54 |
| Sun | 380.99/**300** | 203.30 | 31.45 | 104.61 | 0.00 | 60.00 | −18.37 |
| Mars | 238.79/300 | 142.42 | 22.13 | **−6.55** | 57.18 | 17.14 | 6.47 |
| Moon | 257.16/360 | 206.17 | 10.68 | **−21.15** | 0.00 | 51.43 | 10.03 |

### 4.2 Confirmed divergences

| # | Finding | Evidence | Our engine (before) | Effort |
|---|---|---|---|---|
| 1 | **Sun required = 300** (5.0 rupas), not 390 | Sun 380.99/300 = 127% | `REQUIRED_RUPAS.Sun = 6.5` | trivial ✅ done |
| 2 | **Luminary Cheshta = 0** | Sun 0.00, Moon 0.00 | Sun = Ayana, Moon = Paksha | small ✅ done |
| 3 | **Cheshta uncapped** (epicyclic Cheshta-Kendra) | Mercury 97.71, Jupiter 72.72 (>60) | `clamp(…, 0, 60)`, speed/mean-motion proxy | reimplementation ⏳ |
| 4 | **Dig Bala uncapped + true bhava** | Venus 93.34, Mercury 74.15 (>60); natal Moon was −38.93 | `(180−arcDist)/3 ∈ [0,60]`, equal-house cusps | reimplementation ⏳ |
| 5 | **Kaala Bala includes Ayana Bala** (JHora also signs/negatives via Yuddha) | Kaala magnitudes ~270; Mars −6.55, Moon −21.15 | no Ayana term; always ≥ 0 | ✅ Ayana added (positive); signed Yuddha ⏳ |
| 6 | **Ishta + Kashta = 60** (complementary) | every row sums to 60 | `sqrt`-based, don't sum to 60 | small ⏳ |

### 4.3 Confirmed matches (no change)

- **Naisargika Bala** — identical for all 7 (Sun 60, Moon 51.43, Venus 42.86,
  Jupiter 34.29, Mercury 25.71, Mars 17.14, Saturn 8.57).
- **Required virupas** — match for Moon 360, Mars 300, Mercury 420, Jupiter 390,
  Venus 330, Saturn 300. Only the **Sun** differed (finding #1).

### 4.4 Reference values for future "Other Balas" (not yet implemented)

- **Harsha Bala** (max 20): Mars 15, Venus 10, Jupiter 10, Saturn 5, Sun 5,
  Mercury 0, Moon 0.
- **Dwadasavargeeya (12 charts)**: Venus 9, Mercury 8, Jupiter 8, Saturn 5,
  Sun 5, Mars 4, Moon 2.
- **Pancha Vargeeya (5 charts, Parashari)**: Venus 25.52, Saturn 25.32, Sun 14.26,
  Moon 13.61, Jupiter 11.83, Mars 8.01, Mercury 7.91.

---

## 5. Ayana Bala (as implemented)

Ayana Bala is now a Kaala Bala sub-component for all seven classical planets.

- Declination δ from the tropical longitude (sidereal + ayanamsa), latitude
  ignored (documented approximation): `sin δ = sin ε · sin λ_tropical`, ε = 23.4393°.
- Direction preference (effective kranti):
  - North-preferring (Sun, Mars, Jupiter, Venus): `+δ`
  - South-preferring (Moon, Saturn): `−δ`
  - Mercury: `+|δ|` (always gains)
- `AyanaBala = ((ε + effectiveKranti) / (2ε)) × 60` → 0–60.
- **Sun's Ayana Bala is doubled** (classical rule) → 0–120.
- Rahu/Ketu: 0.

Because the Sun's Ayana now lives in Kaala, and the Moon's Paksha is already a
Kaala term, **both luminaries' Cheshta Bala are set to 0** (matching JHora and the
classical "luminaries have no motional strength" rule).

> Note: JHora's negative Kaala values (Mars −6.55, Moon −21.15) come from a signed
> **Yuddha (planetary war)** term and JHora-specific sign conventions we do not yet
> implement. Our Ayana Bala is the classical non-negative form, so our Kaala stays
> ≥ 0. This is a known remaining divergence (finding #5, partial).

---

## 6. Fix backlog (prioritised)

### Tier A — confirmed, done
1. ✅ Sun required rupas 6.5 → 5.0 (300 virupas).
2. ✅ Ayana Bala added to Kaala (all 7 planets, Sun doubled); luminary Cheshta = 0.

### Tier B — method reimplementation (changes natal Shadbala; spec-gated) ⏳
3. Cheshta Bala — epicyclic Cheshta-Kendra, uncapped (findings #3).
4. Dig Bala — true bhava (Sripati) cusps, unclamped (finding #4).
5. Ishta/Kashta — complementary convention, Ishta + Kashta = 60 (finding #6).
6. Yuddha Bala — signed planetary-war term so Kaala can go negative (finding #5).

> ⚠️ Tier B changes the natal Shadbala numbers too (same engine). Gate behind a
> `deterministic-1c-1d` spec update and re-baseline any fixtures.

### Tier C — Varshaphal-specific
7. ✅ Varshesha selection is strength-first (Tajika Neelakanthi): among the five
   office-bearers, the highest Panchavargeeya Bala that aspects the Varsha Lagna
   wins, and the number of offices held only breaks ties. If none aspects the
   Lagna, the strongest of all five wins; `varshesha.selectionBasis` says which
   branch fired. This replaced an earlier lordship-count-first rule, so the
   Varshesha can differ from what was shown before for the same year. Spec:
   `.kiro/specs/varshesha-lagna-aspect/`.
8. ✅ Lagna aspect: any sign-based Tajika aspect counts — sextile (3/11) and
   trine (5/9) are friendly; conjunction (1), square (4/10) and opposition (7)
   are inimical. Per Tajika Neelakanthi the same sign and the 7th are both the
   open inimical aspect (pratyaksha shatru), so a candidate in the Varsha Lagna
   itself counts; it did not until the 2026-10-28 astrologer review, which meant
   a Varsha Lagna lord in its own Lagna could never be year lord.
   Every candidate reports its raw `lagnaAspect` plus `aspectsLagna` (whether it
   counts). `VARSHESHA_LAGNA_ASPECT_NATURES` in `varshaphal.ts` is the code switch
   to make the rule friendly-only; the result's `method` note is built from it,
   but this doc and the spec describe the current setting and need a hand edit.
8a. ✅ **Dinaratri & Trirashi lords now use the year's commencement (Varsha
    Pravesh) day/night** — the annual Sun above vs below the horizon, judged
    from its longitude against the Ascendant degree (`isSunAboveHorizon`). Whole-
    sign houses 7–12 were used at first; they misclassify a Varsha Pravesh near
    sunrise or sunset (a Sun in the Lagna sign that has already risen, or in the
    7th sign that has already set). Across 6 birth times × 50 years for the test
    birth, 34 of 300 annual charts flipped; this was corrected with the Varshesha
    change. The rule matches the Tajika convention ("if the year commences by day, take
    the lord of the Sun's sign; if by night, the lord of the Moon's sign") and
    JHora. Previously these two offices were derived from the *natal* chart's
    day/night, which could pick the wrong luminary sign lord (and hence a
    different Varshesha) whenever the Varsha Pravesh fell on the opposite side of
    the horizon from the birth. The result field is now `dayVarsha` (was
    `dayBirth`).
8b. ✅ **Trirashi lord per the Neelakanthi sign table** (`TRIRASHI_LORDS`,
    `getTrirashiLord`). The engine used one Dorothean day/night pair per element,
    which is right only for Aries, Taurus, Gemini and Cancer. The Tajika table
    swaps the pair for the second sign of each element and gives the third sign
    its participating ruler by day and night:

    | Varsha Lagna | Day | Night |
    |---|---|---|
    | Aries, Taurus, Gemini, Cancer | Sun, Venus, Saturn, Venus | Jupiter, Moon, Mercury, Mars |
    | Leo, Virgo, Libra, Scorpio | Jupiter, Moon, Mercury, Mars | Sun, Venus, Saturn, Venus |
    | Sagittarius, Capricorn, Aquarius, Pisces | Saturn, Mars, Jupiter, Moon | Saturn, Mars, Jupiter, Moon |

    Sources disagree on the Sagittarius night lord (Saturn here; some give
    Jupiter) — see §7.
8c. ✅ **Kshetra Bala by sign lord only.** Moolatrikona no longer scores full
    Kshetra. Only the Moon was affected: Taurus is its moolatrikona *and*
    exaltation sign, so it was counted twice (full Uccha and full Kshetra). It
    now scores 7.5 there (Venus is neutral to the Moon), 5.63 less PV.

8d. ✅ **Annual-chart Sade Sati from the natal Moon.** `computeFullChart` treats
    the return instant as a birth, so the annual chart's `transits` block
    reckoned Sade Sati (and Ashtama/Kantaka Shani, houses from Moon and Lagna)
    from the *annual* Moon and Lagna, evaluated at the wall-clock time of the
    request. For the test birth (natal Moon in Taurus) the 2026 Varshaphal
    reported Sade Sati for a Leo Moon and the 2030 one for an Aquarius Moon.
    `computeVarshaphal` now passes `computeFullChart` a `transitReference` (the
    natal Moon and Lagna as of the Varsha Pravesh), so the annual chart's one
    transit block is reckoned from those (`transits.asOf` = the return
    instant) instead of being computed and then replaced, so `active`/`phase`/`isCurrent` describe the start of the year and
    the period list is the same whichever year is asked for. A Sade Sati that
    begins or ends during the year shows in the period dates, not in `active`.

8e. ✅ **Dashas for the year** (`engine/compute/varshaphalDashas.ts`, spec
    `.kiro/specs/varshaphal-dashas/`), returned as `VarshaphalResult.dashas`:
    - `natalVimshottari` — the natal MD/AD/PD chain at the Varsha Pravesh plus every
      antardasha and pratyantardasha overlapping the year (this Varsha Pravesh to
      the next), with true period dates. The tree is built exactly as
      `POST /api/compute` builds it (natal Moon longitude, UTC birth instant).
    - `mudda` — Tajika Mudda dasha: Vimshottari compressed into the year, each lord
      taking its Vimshottari years ÷ 120 of it, with Vimshottari antardashas.
      Starting lord by the classical rule (Janma nakshatra number + completed
      years − 2) mod 9 → 1 Sun … 8 Ketu, 0 Venus — the natal lord at age 0, one
      step on per year. The first period runs for the natal balance fraction and
      the rest of that lord's period closes the year (`portion: balance /
      remainder`). The year is this return to the next (~365.26 days); the
      classical 3-days-per-year table (360 days) supplies the proportions.

    Items 8 (conjunction), 8b and 8c came from an astrologer review on
    2026-10-28. Together they change the year lord in 90 of 306 annual charts
    (6 birth times × 1990–2040 for the test birth date), and in 14 of 51 years
    for the 12:00 test birth.
9. Keep Tajika **Panchavargeeya Bala** as a clearly-labelled "indicative" extra
   until a JHora year-lord screen is available to reconcile the Vishwa scale.

### Tier D — new Tajika features (separate planning doc)
10. **Phase 2 aspects:** deeptamsha orbs (Sun 15°, Moon 12°, Mars 8°, Mercury
    7°, Jupiter 9°, Venus 7°, Saturn 9°) and applying/separating motion, on top
    of the Phase 1 sign-based aspects in `tajikaAspects.ts`.
11. Then yogas (Ithasala/Ishrafa/…) → Sahams → Patyayini dasha (Mudda done, 8e) →
    Tri-pataki. To be specced in `docs/computation_tajika_aspects_dashas.md`.
12. **Natal-contact flag** (requested 2026-11-02; not started): flag the Varsha
    Lagna, or a year planet, within 1° of a natal planet, by longitude. Show it in
    the Varshaphal tab and return it from `compute_varshaphal`. To settle before
    speccing:
    - The annual Sun always sits on the natal Sun (that is the solar return), so it
      must be left out or it flags every year.
    - Conjunction only, or the opposition / Tajika aspects as well?
    - Which bodies count on each side: the seven classical planets only, or Rahu/Ketu
      too, and does the natal Lagna count as a target?
    - Whether the 1° limit is inclusive.

---

## 7. Open items / needs a JHora reference

- Tajika year-lord **Panchavargeeya Bala** table + selected Varshesha. Needed to
  confirm the year-lord ordering (strength-first with a Lagna aspect, as
  implemented) and to reconcile the PV scale. The Tajika Neelakanthi verse should
  be checked too. Still unverified:
  - whether inimical aspects (conjunction, square, opposition) qualify a planet
    for the Lagna check, or only friendly ones (sources confirm they are Tajika
    aspects, not that the year-lord rule accepts them);
  - the strongest-of-five fallback when no office-holder aspects the Lagna, and
    whether some texts bar the Moon from year lordship in that case;
  - the Sagittarius night Trirashi lord (Saturn here; some sources give Jupiter);
  - for Panchavargeeya Bala: whether Tajika uses its own friendship table (the
    engine uses Parashari natural friendship), whether the Drekkana is the
    Parashari one (1st/5th/9th, as implemented) or the Perso-Arabic decan, and
    the friend/neutral/enemy fractions (½, ¼, ⅛);
  - Mudda dasha: the first-period balance (natal balance, remainder closing the
    year) and the year length (return to return, where the classical table
    assumes 360 days). A JHora Mudda screen for one known chart would settle both.
    Patyayini dasha is still not implemented.
- A **numeric per-planet diff**: run our engine on one canonical birth record
  (date + time + lat/long + timezone) and diff against §4.1. Blocked on a single
  consistent birth record — the sample JSONs (`djma.json`, `vedic_chart_FINAL.json`)
  have inconsistent/synthetic Shadbala and conflicting birth identities, so they
  cannot serve as ground truth.
