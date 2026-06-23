from __future__ import annotations

from backend.eval.run_eval import run_evaluation


def test_eval_meets_baseline_thresholds() -> None:
    summary = run_evaluation()
    assert summary.profile_count >= 10
    assert summary.full_top3_profiles / summary.profile_count >= 0.8
    assert summary.cuisine_hit_rate is not None
    assert summary.cuisine_hit_rate >= 0.65
    assert summary.dealbreaker_clean_rate is not None
    assert summary.dealbreaker_clean_rate >= 0.5
