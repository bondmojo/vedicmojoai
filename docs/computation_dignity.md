# Planetary Dignity & the Moolatrikona Degree Range — Implementation Logic

**For practitioner review and teacher validation.**

Engine: `engine/compute/dignity.ts` (`getVargaDignityLabel`, `getVargaDignityReason`). This is the
single source of truth for the exaltation / debilitation / moolatrikona / own-sign / friendship tables
and for the panchadha-maitri dignity **label**. It is consumed by `divisional.ts` (every varga
placement's `dignity` field), `yogas.ts` (the named-yoga gates), `durationAnalysis/scoring.ts` and the
UI `KeyDignitiesPanel`.

---

## The five-fold precedence chain

A planet's label is decided by the **first** rule that matches, in this order:

1. **Exaltation** — the varga sign is the planet's exaltation sign.
2. **Debilitation** — the varga sign is the exaltation sign's opposite.
3. **Moolatrikona** — the varga sign is the planet's moolatrikona sign **and** (where a degree is
   available) the degree falls inside the classical range below.
4. **Own** — the varga sign is one of the planet's own signs.
5. **Compound maitri** — permanent (naisargika) relation with the sign's lord combined with temporary
   (tatkalika) relation drawn from the D1 positions, giving great friend / friend / neutral / enemy /
   great enemy. This is the same five-fold combination Saptavargaja Bala uses.

Rahu and Ketu carry no classical friendship dignity and return no label at all.

The change documented below affects **step 3 only**. Nothing about steps 1, 2, 4 or 5 moved.

---

## Moolatrikona degree ranges, as implemented

Until this change, sitting anywhere in the moolatrikona sign produced the `moolatrikona` label.
The classical rule is narrower: moolatrikona occupies a **degree span within** that sign, and outside
the span the placement is merely the planet's **own** sign. `MOOLATRIKONA_RANGES` in `dignity.ts`
implements that span:

| Planet | Moolatrikona sign | Range (degrees in sign) | Outside the range the label becomes |
|---|---|---|---|
| Sun | Leo | **[0°, 20°)** | own (Leo is an own sign) |
| Moon | Taurus | **[4°, 30°)** | — *unreachable, see below* |
| Mars | Aries | **[0°, 12°)** | own (Aries is an own sign) |
| Mercury | Virgo | **[16°, 20°)** | — *unreachable, see below* |
| Jupiter | Sagittarius | **[0°, 10°)** | own (Sagittarius is an own sign) |
| Venus | Libra | **[0°, 15°)** | own (Libra is an own sign) |
| Saturn | Aquarius | **[0°, 20°)** | own (Aquarius is an own sign) |

**Bounds are half-open — `[from, to)`.** The lower bound is included, the upper bound is excluded. The
Sun at exactly 20°00'00" of Leo is therefore **own**, not moolatrikona.

`MOOLATRIKONA_SIGNS` still gates the test: the range is only consulted once the sign already matches.
The range never *adds* a moolatrikona where the sign is wrong; it can only demote a sign match to
`own` (or, for the two unreachable cases, to compound maitri).

**❓ Validation request:** Is each range's upper bound **exclusive** as implemented — the Sun's
moolatrikona ending *at* 20°00'00" Leo, so that exact degree reads as own — or **inclusive**, so that
20°00'00" is still moolatrikona and the span runs 0°–20° closed? The distinction only bites on an exact
boundary degree, but it is a real difference in the printed label when it happens.

---

## The range applies only where a degree exists

The degree is supplied **only for D1**. `divisional.ts` passes `planet.longitude % 30` when
`division === 1` and passes nothing for every other varga. D2 through D60 therefore keep the
**whole-sign** rule: moolatrikona sign → `moolatrikona`, full stop.

This is not a shortcut, it is a consequence of what the engine computes. A varga projection here maps a
D1 longitude to a varga **sign number** — there is no varga longitude anywhere in the codebase, so
there is no degree-in-sign for a D2 or a D9 placement to test a range against. `getVargaDignityLabel`
treats an omitted, non-finite, or out-of-`[0, 30)` degree as "no degree supplied" and falls back to the
whole-sign rule rather than guessing.

`getVargaDignityReason` records which of the two happened, so the distinction is visible rather than
inferred: `rule: 'moolatrikona'` means the sign matched *and* the degree fell inside the range;
`rule: 'moolatrikona_sign_only'` means the sign matched and no usable degree was available.

---

## The label is degree-aware; two strength scores are deliberately not

After this change the repo classifies moolatrikona **two different ways**, and that inconsistency is a
deliberate choice rather than an oversight:

| Consumer | File | Moolatrikona rule | Produces |
|---|---|---|---|
| Dignity **label** | `engine/compute/dignity.ts` | degree-aware (D1) | a label |
| **Saptavargaja Bala** | `engine/compute/shadbala.ts` | sign-only | a score (45 virupas) |
| **Kshetra Bala** (Varshaphal) | `engine/compute/varshaphal.ts` | sign-only | a score (30, the Kshetra maximum) |

Both score modules hold their **own private `MOOLATRIKONA_SIGNS` table**, independent of
`dignity.ts`'s. Neither was touched. Three reasons, stated plainly:

1. **They feed a score, not a label.** `dignityScoreForVarga` returns 45 virupas for a moolatrikona
   placement; `computeKshetraBala` returns the 30-point Kshetra maximum. Nothing about the printed
   dignity depends on either, and nothing about either depends on the printed dignity.
2. **Saptavargaja sums one ladder over seven vargas, and only one of them has a degree.**
   `computeSaptaVargaBala` walks `SAPTAVARGA_DIVISIONS = [1, 2, 3, 7, 9, 12, 30]` and adds
   `dignityScoreForVarga` for each. Making that rung degree-aware would make **D1 behave differently
   from the other six** vargas in a sum whose whole premise is that the same ladder is applied
   uniformly. (The Vimsopaka variant, `dignityScoreForVargaVimsopaka`, reuses the same ladder below its
   exaltation/debilitation rungs, so it inherits the sign-only behaviour too.)
3. **Saptavargaja feeds Sthana Bala, so the blast radius is every planet's total.** Sthana Bala =
   uccha + saptaVarga + ojhaYugma + kendradi + drekkana, and Sthana is one of the six balas. A change
   here would shift every planet's Shadbala total, its strength **grade**, and the chart's strength
   **ranking** — with **no calibration fixture** in the repo to validate the shifted numbers against.

Net effect: the repo now carries a degree-aware moolatrikona rule for the **label** and a sign-only one
for the **two scores**. A planet can legitimately print as `own` while still scoring 45 virupas as
moolatrikona. That is known, intended for this change, and the subject of the second validation request
below. Aligning the scores is a separate, calibrated piece of work that needs its own reference fixture.

**❓ Validation request:** Should Saptavargaja Bala's moolatrikona rung become degree-aware for the
**D1 varga only**, accepting that one of its seven rungs would then behave differently from the other
six? And if so, do you have a reference Shadbala output (any chart, all seven planets, Sthana Bala
broken out) to calibrate the shifted totals against? Without one there is no way to tell a corrected
number from a broken one.

---

## For the Moon and Mercury the range is unreachable

For two planets the degree range can never be consulted, because **their moolatrikona sign is also
their exaltation sign**, and exaltation is tested first:

| Planet | Moolatrikona sign | Exaltation sign | Result |
|---|---|---|---|
| Moon | Taurus | **Taurus** | always `exalted`; the [4°, 30°) range is dead code |
| Mercury | Virgo | **Virgo** | always `exalted`; the [16°, 20°) range is dead code |

The exaltation coincidence is the whole cause, and it is the *same* cause for both. (An earlier
statement of this in the requirements attributed it to the moolatrikona sign not being an own sign.
That is true of the Moon — `OWN_SIGNS.Moon` is Cancer alone — but **false of Mercury**, whose own signs
are Gemini *and* Virgo. Own-sign membership is irrelevant here: step 4 is never reached because step 1
already matched.)

So the degree rule is observable for **five planets only — Sun, Mars, Jupiter, Venus and Saturn** — and
for each of those the out-of-range fall-through lands on `own`, because each one's moolatrikona sign is
also one of its own signs. The two unreachable rows are kept in the table anyway: they are the
classical values, they document intent, and removing them would make the table look like it disagrees
with the texts.

---

## What is NOT implemented

- **No varga longitudes**, hence no degree-aware moolatrikona outside D1. See above.
- **No degree ranges for exaltation or debilitation.** Deep exaltation (the exact degree, e.g. the Sun
  at 10° Aries) is used by Uccha Bala as a *distance* measure in `shadbala.ts`, but it does not refine
  the exaltation **label**, which stays whole-sign.
- **No moolatrikona in the strength scores' degree sense.** `shadbala.ts` and `varshaphal.ts` remain
  sign-only, as above.
- **No school-specific range variants.** One table, the BPHS / PVR Narasimha Rao values, applied
  uniformly.

---

## Summary of Open Questions for Teacher Review

| # | Point | Question |
|---|---|---|
| 1 | Range upper bound | Exclusive as implemented — the Sun's moolatrikona ending *at* 20°00'00" Leo, which then reads as own — or inclusive? |
| 2 | Saptavargaja Bala | Should its moolatrikona rung become degree-aware for the D1 varga only, accepting that one of its seven rungs then behaves differently from the other six? A reference Shadbala output would be needed to calibrate the shift. |
