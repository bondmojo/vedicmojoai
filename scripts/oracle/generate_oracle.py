#!/usr/bin/env python3
"""
scripts/oracle/generate_oracle.py — task 9.1 of
.kiro/specs/marriage-matchmaking/tasks.md.

Runs PyJHora's `Ashtakoota` class (jhora.horoscope.match.compatibility) over
the (nakshatra, pada) x (nakshatra, pada) combination space and dumps its
per-koota and total scores to JSON, for local, offline comparison against
this repo's own `engine/compute/matchmaking.ts` + `matchmakingTables.ts`.

This script — and PyJHora itself — runs ONLY inside the throwaway container
built from scripts/oracle/Dockerfile. It is never imported by, or run as
part of, this application (see that Dockerfile's header comment for why).

Output is written to /oracle/output (bind-mounted from ./scripts/oracle/output
on the host, which is git-ignored). Nothing this script produces is meant to
be committed verbatim — task 9.2 requires transcribing a hand-curated,
documented SAMPLE into a committed fixture, not this raw file.

Usage (inside the container — see docker-compose.oracle.yml):
    python generate_oracle.py --full            # all 11,664 combinations
    python generate_oracle.py --sample 50        # 50 random combinations
    python generate_oracle.py --pairs 1,1,7,4    # one specific pair, verbose

PyJHora's own per-porutham methods are documented as returning "a tuple or a
boolean" depending on version/method — rather than guess the exact shape,
this script captures each method's raw return value (repr'd if it isn't
JSON-native) alongside `compatibility_score()`'s own list, so whoever
transcribes the task-9.2 fixture can read PyJHora's actual runtime output
rather than trust an assumption baked into this script.
"""

import argparse
import json
import random
import sys
import traceback
from datetime import datetime, timezone

try:
    from jhora.horoscope.match import compatibility as _compat_mod
except ImportError as e:
    print(
        "FATAL: could not import jhora.horoscope.match.compatibility — "
        "is PyJHora installed? This script must run inside the "
        "scripts/oracle Docker image, not the app's own environment.",
        file=sys.stderr,
    )
    print(f"  underlying error: {e}", file=sys.stderr)
    sys.exit(1)

Ashtakoota = _compat_mod.Ashtakoota

# The individual porutham methods PyJHora exposes on Ashtakoota, mapped to
# this repo's own koota keys (engine/compute/types.ts's KootaKey) purely as a
# cross-reference label for whoever reads the output — NOT used to reshape
# or reinterpret PyJHora's return values in any way.
POROUTHAM_METHODS = {
    "varna": "varna_porutham",
    "vashya": "vasiya_porutham",
    "tara": "dina_porutham",  # falls back to tara_porutham if absent — see _call_porutham
    "yoni": "yoni_porutham",
    "grahaMaitri": "raasi_adhipathi_porutham",  # falls back to maitri_porutham
    "gana": "gana_porutham",
    "bhakoot": "raasi_porutham",  # falls back to bahut_porutham
    "nadi": "naadi_porutham",
}
POROUTHAM_FALLBACKS = {
    "dina_porutham": "tara_porutham",
    "raasi_adhipathi_porutham": "maitri_porutham",
    "raasi_porutham": "bahut_porutham",
}


def _jsonable(value):
    """Best-effort JSON-safe coercion — never raises, so one odd return
    shape from PyJHora can't abort the whole sweep."""
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    if isinstance(value, (list, tuple)):
        return [_jsonable(v) for v in value]
    if isinstance(value, dict):
        return {str(k): _jsonable(v) for k, v in value.items()}
    return repr(value)


def _call_porutham(ak, method_name):
    fn = getattr(ak, method_name, None)
    if fn is None:
        fallback_name = POROUTHAM_FALLBACKS.get(method_name)
        if fallback_name is not None:
            fn = getattr(ak, fallback_name, None)
            method_name = fallback_name
    if fn is None:
        return {"method": method_name, "error": "method not found on Ashtakoota instance"}
    try:
        return {"method": method_name, "result": _jsonable(fn())}
    except Exception as e:  # noqa: BLE001 — deliberately broad: one bad cell must not kill the sweep
        return {"method": method_name, "error": f"{type(e).__name__}: {e}"}


def score_pair(boy_nak, boy_pada, girl_nak, girl_pada):
    entry = {
        "boy_nakshatra": boy_nak,
        "boy_pada": boy_pada,
        "girl_nakshatra": girl_nak,
        "girl_pada": girl_pada,
    }
    try:
        ak = Ashtakoota(boy_nak, boy_pada, girl_nak, girl_pada, method="North")
    except Exception as e:  # noqa: BLE001
        entry["error"] = f"Ashtakoota construction failed: {type(e).__name__}: {e}"
        return entry

    try:
        entry["compatibility_score"] = _jsonable(ak.compatibility_score())
    except Exception as e:  # noqa: BLE001
        entry["compatibility_score_error"] = f"{type(e).__name__}: {e}"

    entry["poroutham"] = {
        koota_key: _call_porutham(ak, method_name)
        for koota_key, method_name in POROUTHAM_METHODS.items()
    }
    return entry


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--full", action="store_true", help="all 27x4 x 27x4 = 11,664 combinations")
    mode.add_argument("--sample", type=int, metavar="N", help="N random combinations (seeded, reproducible)")
    mode.add_argument(
        "--pairs",
        type=str,
        metavar="bn,bp,gn,gp[;bn,bp,gn,gp;...]",
        help="one or more explicit combinations, semicolon-separated",
    )
    parser.add_argument("--seed", type=int, default=42, help="RNG seed for --sample (default: 42)")
    parser.add_argument(
        "--out",
        type=str,
        default="/oracle/output/ashtakoota_oracle_raw.json",
        help="output path (default: /oracle/output/ashtakoota_oracle_raw.json)",
    )
    args = parser.parse_args()

    if args.full:
        combos = [
            (bn, bp, gn, gp)
            for bn in range(1, 28)
            for bp in range(1, 5)
            for gn in range(1, 28)
            for gp in range(1, 5)
        ]
    elif args.sample is not None:
        random.seed(args.seed)
        all_combos = [
            (bn, bp, gn, gp)
            for bn in range(1, 28)
            for bp in range(1, 5)
            for gn in range(1, 28)
            for gp in range(1, 5)
        ]
        combos = random.sample(all_combos, min(args.sample, len(all_combos)))
    else:
        combos = []
        for group in args.pairs.split(";"):
            bn, bp, gn, gp = (int(x) for x in group.split(","))
            combos.append((bn, bp, gn, gp))

    print(f"Scoring {len(combos)} combination(s) via PyJHora's Ashtakoota class...", file=sys.stderr)

    results = []
    errors = 0
    for i, (bn, bp, gn, gp) in enumerate(combos, start=1):
        entry = score_pair(bn, bp, gn, gp)
        if "error" in entry:
            errors += 1
        results.append(entry)
        if i % 500 == 0 or i == len(combos):
            print(f"  {i}/{len(combos)} done ({errors} errors so far)", file=sys.stderr)

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "PyJHora Ashtakoota class (jhora.horoscope.match.compatibility) — AGPL-3.0, run locally, "
        "not vendored into this repository. See scripts/oracle/README.md.",
        "combination_count": len(results),
        "error_count": errors,
        "results": results,
    }

    with open(args.out, "w") as f:
        json.dump(payload, f, indent=2)

    print(f"Wrote {len(results)} combination(s) ({errors} errors) to {args.out}", file=sys.stderr)
    print(
        "NOTE: this raw file is git-ignored and must not be committed as-is — "
        "task 9.2 requires a hand-curated, documented sample transcribed from it.",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
