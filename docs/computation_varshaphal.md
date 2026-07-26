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
| Year Lord (Varshesha) | 5 office-bearers → lordship count + **favourable-Lagna-aspect override** + Panchavargeeya tiebreak | ⚠️ lordship-count + PV tiebreak; aspect override deferred |
| Panchavargeeya Bala (Tajika) | Kshetra + Uccha + Hadda + Drekkana + Navamsa, ÷4 | ⚠️ scale unverified |
| Harsha Bala | 4-source Tajika joy strength (max 20) | ❌ |
| Dwadasavargeeya Bala | dignity across 12 vargas | ❌ |
| Tajika aspects | sign-distance aspects with deeptamsha orbs, applying/separating | ❌ |
| Tajika yogas | Ithasala, Ishrafa, Nakta, Yamaya, Kamboola, Manau, Radda, Khallasara… | ❌ |
| Sahams | Punya + ~50 sensitive points, day/night reversal | ❌ |
| Dashas | Mudda (annual Vimshottari), Patyayini; Yogini/Chara optional | ❌ |
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
7. ✅ Varshesha selection now uses lordship-count among the five office-bearers,
   with Panchavargeeya Bala as the tiebreak.
8. ⏳ Favourable-Lagna-aspect override — needs Tajika aspects (Tier D).
9. Keep Tajika **Panchavargeeya Bala** as a clearly-labelled "indicative" extra
   until a JHora year-lord screen is available to reconcile the Vishwa scale.

### Tier D — new Tajika features (separate planning doc)
10. Tajika aspects (deeptamsha) → yogas (Ithasala/Ishrafa/…) → Sahams →
    Mudda & Patyayini dashas → Tri-pataki. To be specced in
    `docs/computation_tajika_aspects_dashas.md`.

---

## 7. Open items / needs a JHora reference

- Tajika year-lord **Panchavargeeya Bala** table + selected Varshesha (blocks the
  Lagna-aspect override and the PV scale reconciliation).
- A **numeric per-planet diff**: run our engine on one canonical birth record
  (date + time + lat/long + timezone) and diff against §4.1. Blocked on a single
  consistent birth record — the sample JSONs (`djma.json`, `vedic_chart_FINAL.json`)
  have inconsistent/synthetic Shadbala and conflicting birth identities, so they
  cannot serve as ground truth.
