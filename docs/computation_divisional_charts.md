# Divisional Chart Computation — Implementation Logic

**For practitioner review and teacher validation.**

---

## What are Divisional Charts (Vargas)?

A divisional chart is obtained by dividing each 30° zodiac sign into N equal (or in one case unequal) parts and mapping each part to a specific sign. The resulting chart shows a more specific area of life: D9 for marriage and inner strength, D10 for career, etc.

Our system computes: **D1, D4, D7, D9, D10, D30**.

All use **Lahiri (Chitrapaksha) ayanamsa** and **sidereal longitudes** from Swiss Ephemeris.

---

## D1 — Rashi (Natal Chart)

Each 30° of the zodiac = 1 sign. This is simply the sign the planet is in.

No computation needed beyond identifying the sign from the planet's sidereal longitude.

---

## D4 — Chaturthamsa

**Life area:** Property, fixed assets, fortune.

Each sign is divided into **4 equal parts of 7°30'** each.

**Mapping rule (all signs, no odd/even distinction):**

| Part (0–3) | Signs advanced from natal sign |
|---|---|
| Part 1 (0°–7°30') | 0 — same sign |
| Part 2 (7°30'–15°) | +3 (4th from natal) |
| Part 3 (15°–22°30') | +6 (7th from natal) |
| Part 4 (22°30'–30°) | +9 (10th from natal) |

**Source:** Parashari Chaturthamsa, BPHS.

**❓ Validation request:** Some sources apply an odd/even rule to D4 (different starting sign for odd vs. even natal signs). Our rule uses the kendra-progression (0, +3, +6, +9) uniformly for all signs. Please confirm which method your school follows.

---

## D7 — Saptamsa

**Life area:** Children, progeny.

Each sign is divided into **7 equal parts of 4°17'08"** (30° / 7).

**Mapping rule:**
- If the natal sign is **odd**: counting starts from the natal sign itself.
- If the natal sign is **even**: counting starts from the **7th sign** from the natal sign.
- Count forward by part number (0 through 6) from the starting sign.

**Source:** BPHS.

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
| 1 | D4 rule | Kendra-progression (uniform) vs. odd/even starting sign? |
| 2 | D30 even signs | Are the boundary degrees and sign assignments correct? |
| 3 | D30 alternate systems | Which D30 system does your school follow? |
| 4 | Special lagnas in vargas | Is showing HL, GL etc. in D9/D10 a valid practice? |
| 5 | Karakamsa in non-D9 | Should KS be shown in D4, D7, D10, D30? |
