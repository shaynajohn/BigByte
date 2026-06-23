from __future__ import annotations

import argparse
import json
import sys
from typing import Any

from backend.eval.metrics import EvalSummary, analyze_profile_result, summarize
from backend.eval.profiles import EVAL_PROFILES
from backend.main import FeaturePref, GroupFeatureRecommendRequest, MemberFeaturePrefs, run_feature_recommendations


def _build_request(
    profile: dict[str, Any],
    *,
    fairness_alpha: float = 0.7,
) -> GroupFeatureRecommendRequest:
    members: list[MemberFeaturePrefs] = []
    for row in profile.get("members") or []:
        features = {
            key: FeaturePref(**feat)
            for key, feat in (row.get("features") or {}).items()
            if isinstance(feat, dict)
        }
        members.append(
            MemberFeaturePrefs(
                actor_id=str(row.get("actor_id") or ""),
                features=features,
            )
        )
    return GroupFeatureRecommendRequest(
        members=members,
        limit=300,
        fairness_alpha=fairness_alpha,
    )


def run_profile(profile: dict[str, Any], *, fairness_alpha: float = 0.7) -> list[dict[str, Any]]:
    payload = _build_request(profile, fairness_alpha=fairness_alpha)
    result = run_feature_recommendations(payload)
    return list(result.get("top_3") or [])


def run_fairness_probe(profile: dict[str, Any]) -> tuple[float | None, float | None]:
    low = run_profile(profile, fairness_alpha=0.2)
    high = run_profile(profile, fairness_alpha=0.9)
    low_min = low[0].get("min_utility") if low else None
    high_min = high[0].get("min_utility") if high else None
    return (
        float(low_min) if low_min is not None else None,
        float(high_min) if high_min is not None else None,
    )


def run_evaluation() -> EvalSummary:
    results = []
    for profile in EVAL_PROFILES:
        top3 = run_profile(profile)
        results.append(analyze_profile_result(profile, top3))

    summary = summarize(results)

    fairness_profile = next((p for p in EVAL_PROFILES if p.get("fairness_probe")), None)
    if fairness_profile:
        low_min, high_min = run_fairness_probe(fairness_profile)
        summary.fairness_top1_min_utility_low_alpha = low_min
        summary.fairness_top1_min_utility_high_alpha = high_min

    return summary


def _pct(value: float | None) -> str:
    if value is None:
        return "n/a"
    return f"{value * 100:.0f}%"


def print_report(summary: EvalSummary) -> None:
    print("BigByte recommender evaluation")
    print("=" * 40)
    print(f"Profiles:              {summary.profile_count}")
    print(f"Full top-3 rate:       {_pct(rate(summary.full_top3_profiles, summary.profile_count))}")
    print(f"Cuisine hit rate:      {_pct(summary.cuisine_hit_rate)}")
    print(f"Commute cap rate:      {_pct(summary.commute_cap_rate)}")
    print(f"Dealbreaker-clean rate:{_pct(summary.dealbreaker_clean_rate)}")
    if summary.mean_top1_min_utility is not None:
        print(f"Mean top-1 min utility:{summary.mean_top1_min_utility:.2f}")
    if summary.mean_top1_group_score is not None:
        print(f"Mean top-1 group score:{summary.mean_top1_group_score:.2f}")
    if summary.fairness_top1_min_utility_low_alpha is not None:
        print(
            "Fairness probe (budget clash) top-1 min utility: "
            f"α=0.2 → {summary.fairness_top1_min_utility_low_alpha:.2f}, "
            f"α=0.9 → {summary.fairness_top1_min_utility_high_alpha:.2f}"
        )
    print()
    print("Per profile:")
    for row in summary.per_profile:
        print(
            f"  - {row.profile_id}: top3={row.top3_count}"
            + (f", top1 min_u={row.top1_min_utility:.2f}" if row.top1_min_utility is not None else "")
        )


def rate(numerator: int, denominator: int) -> float | None:
    if denominator <= 0:
        return None
    return numerator / denominator


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Evaluate BigByte group recommender on synthetic profiles.")
    parser.add_argument("--json", action="store_true", help="Print JSON summary to stdout")
    parser.add_argument(
        "--min-full-top3-rate",
        type=float,
        default=0.8,
        help="Fail if share of profiles returning 3 picks falls below this (default: 0.8)",
    )
    parser.add_argument(
        "--min-cuisine-hit-rate",
        type=float,
        default=0.65,
        help="Fail if cuisine hit rate falls below this when cuisine profiles exist",
    )
    args = parser.parse_args(argv)

    summary = run_evaluation()

    if args.json:
        print(json.dumps(summary.to_dict(), indent=2))
    else:
        print_report(summary)

    full_rate = rate(summary.full_top3_profiles, summary.profile_count) or 0.0
    if full_rate < args.min_full_top3_rate:
        print(
            f"\nFAIL: full top-3 rate {full_rate:.2f} < {args.min_full_top3_rate:.2f}",
            file=sys.stderr,
        )
        return 1
    if summary.cuisine_hit_rate is not None and summary.cuisine_hit_rate < args.min_cuisine_hit_rate:
        print(
            f"\nFAIL: cuisine hit rate {summary.cuisine_hit_rate:.2f} < {args.min_cuisine_hit_rate:.2f}",
            file=sys.stderr,
        )
        return 1

    if not args.json:
        print("\nPASS: evaluation thresholds met.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
