/**
 * engine/compute/__fixtures__/ashtakootaOracleSample.ts — Hand-curated sample
 * of PyJHora oracle output, committed per task 9.2 of
 * .kiro/specs/marriage-matchmaking/tasks.md.
 *
 * NOT a raw dump. Task 9.2 explicitly requires "hand-curated/documented
 * values, not a raw copy of PyJHora's generated CSV" (`tasks.md`, Open
 * Decision 13) — the full 11,664-row sweep exists only locally, gitignored,
 * at `scripts/oracle/output/ashtakoota_oracle_raw.json` (see
 * `scripts/oracle/README.md`), and is never committed verbatim.
 *
 * PROVENANCE / SELECTION: every entry below was picked from that local sweep
 * by a throwaway curation script (`scripts/oracle/_curate_fixture_tmp.ts`,
 * deleted after use — see git history / the task 9.2 PR for the exact
 * script), which:
 *
 *   1. Filtered OUT every (bride, groom) pair inside a documented divergence
 *      or cancellation zone — so the remaining pairs are a clean,
 *      apples-to-apples comparison between the oracle's base per-koota
 *      result and this engine's own table lookups, with no Bhanga logic or
 *      known non-adopted divergence in play on either side:
 *        - Vashya Sagittarius/Capricorn (either native) — unresolved
 *          divergence, see docs/computation_matchmaking.md KNOWN DIVERGENCE #2
 *        - Varna Shudra/Vaishya (either direction) — deliberately not
 *          adopted, KNOWN DIVERGENCE #1
 *        - Bhakoot bride=Aquarius/groom=Cancer, BOTH directions (the reverse
 *          direction, bride=Cancer/groom=Aquarius, agrees with the oracle
 *          and is not itself a divergence — excluding it too is deliberately
 *          more conservative than strictly necessary) — not adopted,
 *          KNOWN DIVERGENCE #3
 *        - Any pair where Nadi Bhanga (`detectNadiCancellation`) or Bhakoot
 *          Bhanga (`detectBhakootCancellation`) would fire — the oracle's
 *          bare `Ashtakoota` class has no cancellation concept at all, so a
 *          post-cancellation engine score has nothing meaningful to compare
 *          against there (see KNOWN DIVERGENCE #4)
 *   2. Left 6,554 of the 11,664 combinations eligible.
 *   3. Hand-picked 22 for DIVERSITY, not randomness: at least one example of
 *      every distinct point value each koota can produce (e.g. Yoni's five
 *      tiers 0/1/2/3/4, Graha Maitri's six 0/0.5/1/3/4/5), one example per
 *      `MatchVerdict` score band, a rashi-boundary case (bride nakshatra 3
 *      padas 1 vs 2 straddle rashi 1/2 against the same groom(1,1), entries
 *      #5 and #10 below, scoring differently), an adjacent-nakshatra case,
 *      the SAME rashi pair
 *      in BOTH directions to exercise the one genuinely directional Vashya
 *      relationship this table has (Keet/Scorpio vs Chatushpad — entries #1
 *      and #2, scoring 1 one way and 2 the other — the single most
 *      regression-prone cell in this table, since "re-symmetrizing" it is
 *      exactly the kind of edit this fixture exists to catch), and several
 *      pairs anchored away from nakshatra 1 for input-space breadth.
 *   4. CROSS-VERIFIED every one of the 22 picks against the REAL engine
 *      (`computeAshtakootaMatch`, imported directly, never re-implemented)
 *      before inclusion — so this fixture is required to match BOTH the
 *      oracle's recorded output AND this module's own tables, not just one
 *      or the other. Confirmed zero mismatches across the full 6,554-pair
 *      eligible pool at curation time, not merely on the 22 selected.
 *
 * `expected` values are the oracle's own `compatibility_score` array,
 * reordered into named fields (verified order: [varna, vashya, gana, tara,
 * yoni, grahaMaitri, bhakoot, nadi, total, ...booleans] — see
 * scripts/oracle/README.md's "What the output contains").
 *
 * Consumed by `matchmaking.invariants.test.ts`'s task 9.2 regression test.
 */

export interface AshtakootaOracleSample {
  bride: { nakshatraNumber: number; padaNumber: number }
  groom: { nakshatraNumber: number; padaNumber: number }
  /** Why this pair was picked — which value/tier/boundary it exercises. */
  note: string
  expected: {
    varna: number
    vashya: number
    tara: number
    yoni: number
    grahaMaitri: number
    gana: number
    bhakoot: number
    nadi: number
    gunaScore: number
  }
}

export const ASHTAKOOTA_ORACLE_SAMPLE: AshtakootaOracleSample[] = [
  {
    bride: { nakshatraNumber: 16, padaNumber: 4 },
    groom: { nakshatraNumber: 3, padaNumber: 2 },
    note: 'directional Vashya — bride=Keet(Scorpio)/groom=Chatushpad(Taurus) scores 1',
    expected: { varna: 0, vashya: 1, tara: 1.5, yoni: 1, grahaMaitri: 3, gana: 6, bhakoot: 7, nadi: 0, gunaScore: 19.5 },
  },
  {
    bride: { nakshatraNumber: 3, padaNumber: 2 },
    groom: { nakshatraNumber: 16, padaNumber: 4 },
    note: 'directional Vashya, reversed — bride=Chatushpad(Taurus)/groom=Keet(Scorpio) scores 2 (asymmetric: not the same as the pair above)',
    expected: { varna: 1, vashya: 2, tara: 1.5, yoni: 1, grahaMaitri: 3, gana: 6, bhakoot: 7, nadi: 0, gunaScore: 21.5 },
  },
  {
    bride: { nakshatraNumber: 5, padaNumber: 1 },
    groom: { nakshatraNumber: 4, padaNumber: 1 },
    note: 'excellent score band (>=32)',
    expected: { varna: 1, vashya: 2, tara: 0, yoni: 4, grahaMaitri: 5, gana: 6, bhakoot: 7, nadi: 8, gunaScore: 33 },
  },
  {
    bride: { nakshatraNumber: 1, padaNumber: 1 },
    groom: { nakshatraNumber: 1, padaNumber: 1 },
    note: 'Nadi zero (same Nadi, no cancellation zone — clean base-rule check)',
    expected: { varna: 1, vashya: 2, tara: 0, yoni: 4, grahaMaitri: 5, gana: 6, bhakoot: 7, nadi: 0, gunaScore: 25 },
  },
  {
    bride: { nakshatraNumber: 3, padaNumber: 2 },
    groom: { nakshatraNumber: 1, padaNumber: 1 },
    note: 'Bhakoot zero (dosha distance, no cancellation zone — clean base-rule check)',
    expected: { varna: 1, vashya: 2, tara: 1.5, yoni: 2, grahaMaitri: 3, gana: 1, bhakoot: 0, nadi: 8, gunaScore: 18.5 },
  },
  {
    bride: { nakshatraNumber: 6, padaNumber: 1 },
    groom: { nakshatraNumber: 1, padaNumber: 1 },
    note: 'below_average score band (<18)',
    expected: { varna: 1, vashya: 0.5, tara: 1.5, yoni: 2, grahaMaitri: 0.5, gana: 5, bhakoot: 7, nadi: 0, gunaScore: 17.5 },
  },
  {
    bride: { nakshatraNumber: 7, padaNumber: 4 },
    groom: { nakshatraNumber: 1, padaNumber: 1 },
    note: 'Graha Maitri = 4 (friend+neutral)',
    expected: { varna: 0, vashya: 1, tara: 1.5, yoni: 2, grahaMaitri: 4, gana: 6, bhakoot: 7, nadi: 0, gunaScore: 21.5 },
  },
  {
    bride: { nakshatraNumber: 5, padaNumber: 3 },
    groom: { nakshatraNumber: 1, padaNumber: 1 },
    note: 'Graha Maitri = 0.5 (neutral+enemy)',
    expected: { varna: 1, vashya: 0.5, tara: 1.5, yoni: 3, grahaMaitri: 0.5, gana: 6, bhakoot: 7, nadi: 8, gunaScore: 27.5 },
  },
  {
    bride: { nakshatraNumber: 10, padaNumber: 1 },
    groom: { nakshatraNumber: 1, padaNumber: 1 },
    note: 'Vashya = 0',
    expected: { varna: 1, vashya: 0, tara: 0, yoni: 2, grahaMaitri: 5, gana: 1, bhakoot: 0, nadi: 8, gunaScore: 17 },
  },
  {
    bride: { nakshatraNumber: 3, padaNumber: 1 },
    groom: { nakshatraNumber: 1, padaNumber: 1 },
    note: 'Gana = 1 (Rakshasa bride -> Deva groom)',
    expected: { varna: 1, vashya: 2, tara: 1.5, yoni: 2, grahaMaitri: 5, gana: 1, bhakoot: 7, nadi: 8, gunaScore: 27.5 },
  },
  {
    bride: { nakshatraNumber: 4, padaNumber: 1 },
    groom: { nakshatraNumber: 1, padaNumber: 1 },
    note: 'Yoni friendly tier (3)',
    expected: { varna: 1, vashya: 2, tara: 1.5, yoni: 3, grahaMaitri: 3, gana: 5, bhakoot: 0, nadi: 8, gunaScore: 23.5 },
  },
  {
    bride: { nakshatraNumber: 2, padaNumber: 1 },
    groom: { nakshatraNumber: 1, padaNumber: 1 },
    note: 'Nadi = 8 (different Nadi, full points)',
    expected: { varna: 1, vashya: 2, tara: 0, yoni: 2, grahaMaitri: 5, gana: 5, bhakoot: 7, nadi: 8, gunaScore: 30 },
  },
  {
    bride: { nakshatraNumber: 12, padaNumber: 1 },
    groom: { nakshatraNumber: 1, padaNumber: 1 },
    note: 'Yoni enemy tier (1)',
    expected: { varna: 1, vashya: 0, tara: 1.5, yoni: 1, grahaMaitri: 5, gana: 5, bhakoot: 0, nadi: 0, gunaScore: 13.5 },
  },
  {
    bride: { nakshatraNumber: 13, padaNumber: 1 },
    groom: { nakshatraNumber: 1, padaNumber: 1 },
    note: 'Yoni Vaira (bitter-enemy) tier (0)',
    expected: { varna: 1, vashya: 0.5, tara: 1.5, yoni: 0, grahaMaitri: 0.5, gana: 6, bhakoot: 0, nadi: 0, gunaScore: 9.5 },
  },
  {
    bride: { nakshatraNumber: 7, padaNumber: 4 },
    groom: { nakshatraNumber: 5, padaNumber: 3 },
    note: 'Graha Maitri = 1 (friend+enemy, asymmetric)',
    expected: { varna: 0, vashya: 0, tara: 1.5, yoni: 1, grahaMaitri: 1, gana: 6, bhakoot: 0, nadi: 8, gunaScore: 17.5 },
  },
  {
    bride: { nakshatraNumber: 10, padaNumber: 1 },
    groom: { nakshatraNumber: 3, padaNumber: 2 },
    note: 'Graha Maitri = 0 (mutual naisargika enemy)',
    expected: { varna: 0, vashya: 0, tara: 1.5, yoni: 1, grahaMaitri: 0, gana: 6, bhakoot: 7, nadi: 0, gunaScore: 15.5 },
  },
  {
    bride: { nakshatraNumber: 3, padaNumber: 1 },
    groom: { nakshatraNumber: 2, padaNumber: 1 },
    note: 'Gana = 0',
    expected: { varna: 1, vashya: 2, tara: 0, yoni: 3, grahaMaitri: 5, gana: 0, bhakoot: 7, nadi: 8, gunaScore: 26 },
  },
  {
    bride: { nakshatraNumber: 27, padaNumber: 1 },
    groom: { nakshatraNumber: 1, padaNumber: 1 },
    note: 'adjacent nakshatra (27 -> 1, circular wraparound)',
    expected: { varna: 0, vashya: 1, tara: 0, yoni: 2, grahaMaitri: 5, gana: 6, bhakoot: 0, nadi: 8, gunaScore: 22 },
  },
  {
    bride: { nakshatraNumber: 12, padaNumber: 1 },
    groom: { nakshatraNumber: 23, padaNumber: 3 },
    note: 'mid-to-late nakshatra spread, no anchor at nakshatra 1',
    expected: { varna: 0, vashya: 0, tara: 1.5, yoni: 1, grahaMaitri: 0, gana: 0, bhakoot: 7, nadi: 8, gunaScore: 17.5 },
  },
  {
    bride: { nakshatraNumber: 24, padaNumber: 1 },
    groom: { nakshatraNumber: 23, padaNumber: 3 },
    note: 'both late nakshatras',
    expected: { varna: 1, vashya: 2, tara: 0, yoni: 1, grahaMaitri: 5, gana: 6, bhakoot: 7, nadi: 8, gunaScore: 30 },
  },
  {
    bride: { nakshatraNumber: 8, padaNumber: 1 },
    groom: { nakshatraNumber: 7, padaNumber: 4 },
    note: 'high score, no low-nakshatra anchor',
    expected: { varna: 1, vashya: 2, tara: 0, yoni: 2, grahaMaitri: 5, gana: 6, bhakoot: 7, nadi: 8, gunaScore: 31 },
  },
  {
    bride: { nakshatraNumber: 7, padaNumber: 4 },
    groom: { nakshatraNumber: 6, padaNumber: 1 },
    note: 'low score, no low-nakshatra anchor',
    expected: { varna: 0, vashya: 0, tara: 0, yoni: 2, grahaMaitri: 1, gana: 6, bhakoot: 0, nadi: 0, gunaScore: 9 },
  },
]
