# Arudha Pada Computation — Implementation Logic

**For practitioner review and teacher validation.**

---

## What is an Arudha Pada?

The Arudha Pada of a house is the **perceived reflection** of that house in the manifest world. It shows how the native's affairs related to that house appear externally, as opposed to the real inner nature shown by the house itself.

- A1 (AL) = Arudha Lagna — public image and social status
- A2 = Dhana Pada — visible wealth
- A3 = Vikrama Pada — visible enterprise and siblings
- A4 = Matri Pada — visible home and mother
- A5 = Putra Pada — visible children and intelligence
- A6 = Roga Pada — visible enemies and disease
- A7 = Dara Pada — visible spouse and partnerships
- A8 = Mrityu Pada — visible suffering and transformation
- A9 = Pitri Pada — visible dharma, father, and fortune
- A10 = Karma Pada — visible career and public karma
- A11 = Labha Pada — visible gains and elder siblings
- A12 (UL) = Upapada Lagna — visible spiritual path and spouse's qualities

---

## Base Calculation Method (BPHS / Jaimini Sutras)

For each house H (1 through 12):

1. Identify the sign occupying house H using whole-sign houses from the Lagna.
2. Find the **ruler (lord)** of that sign.
3. Count the number of signs from house H's sign to the lord's current sign (counting forward, both endpoints inclusive). Call this number **N**.
   - If the lord is in the same sign as house H, treat N as 12 (not 0).
4. Count the same number N signs forward from the lord's sign.
5. That final sign is the **raw Arudha**.

### Exception Rule 1 — Same Sign as House
If the raw Arudha falls in the **same sign as house H**, use the **10th sign from H** instead.

### Exception Rule 2 — 7th from House
If the raw Arudha falls in the **7th sign from H**, use the **4th sign from H** instead.

**Source:** Brihat Parashara Hora Shastra (BPHS), Jaimini Sutras.

---

## Co-lord Rule (Jaimini convention)

Some signs have two lords in Jaimini's scheme. Our implementation follows the convention used by Jagannatha Hora (PVR Narasimha Rao):

| Sign | Primary Lord | Co-lord Used |
|---|---|---|
| Aquarius | Saturn | **Rahu** (co-lord replaces Saturn) |
| Scorpio | Mars | Mars (Ketu is NOT used as co-lord) |

**For Aquarius:** Rahu is always used as the lord for arudha computation, matching JHora's behaviour. This is the Jaimini convention where the outer/higher-octave node takes precedence.

**For Scorpio:** Mars is used as the sole lord. Ketu as co-lord for Scorpio exists in some schools (notably Sanjay Rath's Parashari application), but using Mars gives correct results for all Scorpio-related arudhas in our test chart compared to JHora. This is a point for practitioner review — if a teacher follows the Ketu-for-Scorpio convention, this should be changed.

**❓ Validation request:** Does your school use Ketu as the lord for Scorpio arudhas? If yes, results for A3, A4, A5, A7, A8 (houses whose lord sign is Scorpio) will differ.

---

## Worked Example — A10 (Karma Pada)

For the reference chart: **Lagna = Taurus, Saturn in Libra, Rahu in Taurus.**

- H10 from Taurus = Aquarius (sign 11)
- Co-lord for Aquarius = Rahu, currently in Taurus (sign 2)
- Count from Aquarius (11) to Taurus (2) = 3 signs
- Count 3 signs from Taurus = Leo (sign 5)
- Exception 2 check: 7th from Aquarius = Leo. Leo = Leo ✓ — exception fires
- Use 4th from Aquarius instead = Taurus (sign 2) = **H1**
- **A10 = Taurus, 1st house** ✅ (matches JHora)

Without the Rahu co-lord rule, Saturn in Libra would give:
- Count Aquarius → Libra = 8. 8 signs from Libra = Gemini. No exception. → **A10 = Gemini, 2nd house** ✗

---

## Divisional Charts (Vargas)

Arudha Padas are also computed for each divisional chart (D9, D10, etc.) using the positions of planets **within that varga**. The same BPHS counting method applies, but the planet sign numbers are drawn from the D9/D10/D30 chart, not the D1.

**Rationale:** A10 in D10 shows the Karma Pada within the career chart — which is more relevant for career-specific readings than the D1 A10.

**❓ Validation request:** Some traditions only use arudha padas from the D1. Does your teacher compute arudhas in divisional charts? If not, the divisional-chart arudha display can be hidden.

---

## What is NOT implemented

- The **strength-based Varnada rule** (BPHS v14) that selects Varnada starting point based on whether Lagna or Hora Lagna is stronger — this requires Shadbala computation.
- Ketu as co-lord for Scorpio (see above).
