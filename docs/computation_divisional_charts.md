# Divisional Chart Computation — Implementation Logic

**For practitioner review and teacher validation.**

---

## What are Divisional Charts (Vargas)?

A divisional chart is obtained by dividing each 30° zodiac sign into N equal (or in one case unequal) parts and mapping each part to a specific sign. The resulting chart shows a more specific area of life: D9 for marriage and inner strength, D10 for career, etc.

Our system computes: **D1, D2, D3, D4, D5, D6, D7, D9, D10, D12, D24, D30**.

All use **Lahiri (Chitrapaksha) ayanamsa** and **sidereal longitudes** from Swiss Ephemeris.

---

## D1 — Rashi (Natal Chart)

Each 30° of the zodiac = 1 sign. This is simply the sign the planet is in.

No computation needed beyond identifying the sign from the planet's sidereal longitude.

---

## D2 — Hora (Wealth, Prosperity)

**Life area:** Wealth, financial prosperity, assets.

Each sign is divided into **2 equal parts of 15°** each.

**Mapping rule — PVR Uma-Shambhu method (JHora default):**

The 24 horas cycle sequentially through all 12 signs twice, starting from Aries. Even-indexed signs in each pair count forward; odd-indexed signs count in reverse. This produces a full 12-sign distribution (planets are not limited to Cancer/Leo).

| D1 Sign | 0°–15° (hora 1) | 15°–30° (hora 2) |
|---|---|---|
| Aries | Aries | Taurus |
| Taurus | Cancer | Gemini |
| Gemini | Leo | Virgo |
| Cancer | Scorpio | Libra |
| Leo | Sagittarius | Capricorn |
| Virgo | Pisces | Aquarius |
| Libra | Aries | Taurus |
| Scorpio | Cancer | Gemini |
| Sagittarius | Leo | Virgo |
| Capricorn | Scorpio | Libra |
| Aquarius | Sagittarius | Capricorn |
| Pisces | Pisces | Aquarius |

The pattern repeats every 6 signs (Libra–Pisces mirrors Aries–Virgo).

**Source:** PVR Narasimha Rao, *Parasara's Hora Chart Decoded* (Uma-Shambhu Hora); PyJHora `parivritti_even_reverse(2)`.

**Alternative — Traditional Parasara method (NOT used):**

Some schools (and a strict reading of BPHS Ch. 6 v. 5–6) use only Cancer and Leo:
- Odd signs: 0–15° → Leo, 15–30° → Cancer
- Even signs: 0–15° → Cancer, 15–30° → Leo

This method does not match JHora output and is therefore not implemented. The PVR method is used instead.

**❓ Validation request:** Confirm that PVR Uma-Shambhu D2 is the correct method for your tradition, or specify Traditional Parasara / Raman / Kashinatha.

---

## D3 — Drekkana (Siblings, Courage)

**Life area:** Siblings, courage, co-borns.

Each sign is divided into **3 equal parts of 10°** each.

**Mapping rule:**
- Part 0 (0°–10°): same sign as natal
- Part 1 (10°–20°): 5th sign from natal
- Part 2 (20°–30°): 9th sign from natal

**Source:** BPHS (Parashari Drekkana).

---

## D4 — Chaturthamsa

**Life area:** Children, progeny.

Each sign is divided into **7 equal parts of 4°17'08"** (30° / 7).

**Mapping rule:**
- If the natal sign is **odd**: counting starts from the natal sign itself.
- If the natal sign is **even**: counting starts from the **7th sign** from the natal sign.
- Count forward by part number (0 through 6) from the starting sign.

**Source:** BPHS.

---

## D5 — Panchamsa (Fame, Authority, Power)

**Life area:** Fame, authority, and power.

Each sign is divided into **5 equal parts of 6°** each.

**Mapping rule — fixed table (same style as D2/D30):**

Unlike the offset-counting divisions (D6, D7, D9, D10...), D5 uses a fixed
lookup table — the target signs are the same for every sign sharing the same
parity, regardless of which sign it is.

| Part | Odd signs (Aries, Gemini, Leo, Libra, Sagittarius, Aquarius) | Even signs (Taurus, Cancer, Virgo, Scorpio, Capricorn, Pisces) |
|---|---|---|
| 1st (0°–6°) | Aries | Taurus |
| 2nd (6°–12°) | Aquarius | Virgo |
| 3rd (12°–18°) | Sagittarius | Pisces |
| 4th (18°–24°) | Gemini | Capricorn |
| 5th (24°–30°) | Libra | Scorpio |

**Source:** Classical Parashari Panchamsa table.

---

## D6 — Shashthamsa (Health Troubles, Obstacles, Debts)

**Life area:** Health troubles, obstacles, debts, litigation.

Each sign is divided into **6 equal parts of 5°** each.

**Mapping rule — offset counting (same style as D9/D10):**
- If the natal sign is **odd**: counting starts from **Aries**.
- If the natal sign is **even**: counting starts from **Libra**.
- Count forward by part number (0 through 5) from the starting sign.

**Source:** Classical Parashari Shashthamsa rule.

---

## D9 — Navamsa

**Life area:** Marriage, dharma, inner strength; also used for all planetary dignity assessment.

Each sign is divided into **9 equal parts of 3°20'** (30° / 9).

**Mapping rule — element-based starting sign:**

| Natal sign element | Starting sign for D9 |
|---|---|
| Fire (Aries, Leo, Sagittarius) | Aries |
| Earth (Taurus, Virgo, Capricorn) | Capricorn |
| Air (Gemini, Libra, Aquarius) | Libra |
| Water (Cancer, Scorpio, Pisces) | Cancer |

Count forward from the starting sign by the part number (0 through 8).

This rule implements the standard 108-navamsa continuous cycle. Every sign group of the same element starts its navamsa sequence at a fixed sign, and the 9 navamsas progress consecutively through the zodiac.

**Source:** BPHS, widely agreed upon.

---

## D10 — Dashamsa

**Life area:** Career, profession, social status.

Each sign is divided into **10 equal parts of 3°** each.

**Mapping rule:**
- If the natal sign is **odd**: counting starts from the natal sign itself.
- If the natal sign is **even**: counting starts from the **9th sign** from the natal sign.
- Count forward by part number (0 through 9).

**Source:** BPHS.

---

## D12 — Dwadasamsa (Parents, Ancestry)

**Life area:** Parents, ancestry, lineage.

Each sign is divided into **12 equal parts of 2°30'** each.

**Mapping rule:**
- Part index = floor(degreeInSign / 2.5) → 0–11
- D12 sign = natal sign + part index (mod 12, 1-indexed)

Counting starts from the natal sign itself and advances one sign per part.

**Source:** BPHS.

---

## D24 — Chaturvimshamsa / Siddhamsa (Education, Learning, Knowledge)

**Life area:** Education, learning capability, knowledge acquisition.

Each sign is divided into **24 equal parts of 1°15'** (30° / 24).

**Mapping rule — offset counting (same style as D6/D9/D10):**
- If the natal sign is **odd**: counting starts from **Leo**.
- If the natal sign is **even**: counting starts from **Cancer**.
- Count forward by part number (0 through 23) from the starting sign.

**Source:** BPHS (Chaturvimsamsa / Siddhamsa chapter).

---

## D30 — Trimshamsa

**Life area:** Misfortune, disease, suffering.

Each sign is divided into **5 unequal parts** (not 30 equal parts). The planet-rulership mapping determines which sign is assigned.

**Odd signs:**

| Degree range within sign | Ruling planet | D30 sign assigned |
|---|---|---|
| 0° – 5° | Mars | Aries |
| 5° – 10° | Saturn | Aquarius |
| 10° – 18° | Jupiter | Sagittarius |
| 18° – 25° | Mercury | Gemini |
| 25° – 30° | Venus | Libra |

**Even signs:**

| Degree range within sign | Ruling planet | D30 sign assigned |
|---|---|---|
| 0° – 5° | Venus | Taurus |
| 5° – 12° | Mercury | Virgo |
| 12° – 20° | Jupiter | Pisces |
| 20° – 25° | Saturn | Capricorn |
| 25° – 30° | Mars | Scorpio |

**Source:** BPHS, Trimshamsa chapter.

**❓ Validation request:** There are alternate D30 systems in use. The most common variant differs in the even-sign mapping — some sources use Virgo/Mercury differently. Please verify the boundary degrees and sign assignments are correct per your school.

---

## Lagna in Divisional Charts

The Ascendant sign in each divisional chart is computed by applying the same formula to the **Ascendant's sidereal longitude** (not to a separate calculation). So the D9 Lagna is determined by where the ascendant degree falls in the 9-part division of its natal sign.

---

## Projection of Special Lagnas into Vargas

Special Lagnas (HL, GL, BL, SL, VL, IL, BBL, PL) have real ecliptic longitudes. These are projected into each divisional chart by applying the varga formula to their longitude — the same way a planet's D9 sign is computed.

**Example:** If Hora Lagna is at 79.88° (Gemini), its D9 sign is computed by applying the Navamsa formula to 79.88°.

**Note on Karakamsa (KS):** KS is stored as the longitude of the start of the Atmakaraka's D9 sign. Projecting this into D4, D7, D10, D30 produces a result that has no classical basis. It is shown for completeness but should be interpreted with caution.

**❓ Validation request:** Is it classical practice to show special lagnas in divisional charts? This is not standard in most printed software.

---

## Summary of Open Questions for Teacher Review

| # | Point | Question |
|---|---|---|
| 1 | D2 method | PVR Uma-Shambhu (JHora default, all 12 signs) vs. Traditional Parasara (Cancer/Leo only)? |
| 2 | D4 rule | Kendra-progression (uniform) vs. odd/even starting sign? |
| 3 | D30 even signs | Are the boundary degrees and sign assignments correct? |
| 4 | D30 alternate systems | Which D30 system does your school follow? |
| 5 | Special lagnas in vargas | Is showing HL, GL etc. in D9/D10 a valid practice? |
| 6 | Karakamsa in non-D9 | Should KS be shown in D4, D7, D10, D30? |
