# Duration Analysis Scoring — Sanity Backtest Fixtures

These fixtures are used by the Sanity_Backtest test suite (`scoring.backtest.test.ts`)
to assert that the Scoring Engine ranks periods consistently with expected relative outcomes.

## Purpose

Phase 1 weights are **provisional / uncalibrated**. These fixtures provide a lightweight
sanity check that strong periods score higher than weak ones, and that calibration constants
(`BHAVA_RUPAS_CALIBRATION`, `SAV_MEAN`) do not silently regress to a saturating cap.

## Fixtures

| File | Domain | What it tests |
|---|---|---|
| `career_strong_weak.json` | career | Strong MD/AD (exalted, AmK karakaRole match, H10) vs weak (Saturn debilitated, Rahu AD, Sade Sati peak) |
| `health_saturn_affliction.json` | health | Clean period (strong H1, no affliction) vs Sade Sati peak + ashtamaShani + kantakaShani, 6/8 lords |
| `wealth_dhana_vs_dusthana.json` | wealth | Jupiter (natural karaka) owning/occupying 2/11 + Dhana yoga vs Saturn in H12 with malefic transits |
| `marriage_dk_vs_dusthana.json` | marriage | Venus MD (DK + natural karaka, 7th-favorable) vs Saturn debilitated, Rahu AD dusthana + shashtashtaka |

Four domains covered (career, health, wealth, marriage), satisfying task 10.4's "≈4–8 fixtures."
property and cashflow reuse the same factor machinery already exercised by these four.

## Adding a fixture

A fixture carries:
- `category`: DurationCategory
- `description`: human note
- `periods`: Array of { slice: DashaSlice + TransitOverlay, expectedRank: number }
  where `expectedRank: 1` = best period in this fixture, higher = worse.
- `chartData`: ScoringChartData
- `domainWeights`: optional override (if absent, uses DOMAIN_SCORING_WEIGHTS[category])

Relative ranking assertions: the test asserts `score[rank1] > score[rank2]` for all pairs.
