from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class SlotMetrics:
    cuisine_hits: int = 0
    cuisine_total: int = 0
    commute_within: int = 0
    commute_total: int = 0
    dealbreaker_clean: int = 0
    dealbreaker_total: int = 0
    min_utilities: list[float] = field(default_factory=list)
    group_scores: list[float] = field(default_factory=list)


@dataclass
class ProfileMetrics:
    profile_id: str
    label: str
    top3_count: int
    slots: SlotMetrics
    top1_min_utility: float | None = None


def _commute_within_cap(pick: dict[str, Any]) -> bool:
    summary = pick.get("commute_summary") or {}
    member_count = int(summary.get("member_count") or 0)
    within_count = int(summary.get("within_max_count") or 0)
    if member_count <= 0:
        return False
    return within_count == member_count


def _cuisine_hit(pick: dict[str, Any]) -> bool:
    fit = pick.get("category_fit")
    if fit is None:
        return False
    return float(fit) > 0.0


def analyze_profile_result(
    profile: dict[str, Any],
    top3: list[dict[str, Any]],
) -> ProfileMetrics:
    slots = SlotMetrics()
    expects_cuisine = bool(profile.get("expects_cuisine"))
    expects_commute = bool(profile.get("expects_commute"))

    for pick in top3:
        if expects_cuisine:
            slots.cuisine_total += 1
            if _cuisine_hit(pick):
                slots.cuisine_hits += 1
        if expects_commute:
            slots.commute_total += 1
            if _commute_within_cap(pick):
                slots.commute_within += 1
        slots.dealbreaker_total += 1
        if not pick.get("relaxed_dealbreaker_fallback"):
            slots.dealbreaker_clean += 1
        min_u = pick.get("min_utility")
        if min_u is not None:
            slots.min_utilities.append(float(min_u))
        group_score = pick.get("group_score")
        if group_score is not None:
            slots.group_scores.append(float(group_score))

    top1_min = slots.min_utilities[0] if slots.min_utilities else None
    return ProfileMetrics(
        profile_id=str(profile["id"]),
        label=str(profile.get("label") or profile["id"]),
        top3_count=len(top3),
        slots=slots,
        top1_min_utility=top1_min,
    )


def rate(numerator: int, denominator: int) -> float | None:
    if denominator <= 0:
        return None
    return numerator / denominator


@dataclass
class EvalSummary:
    profile_count: int
    full_top3_profiles: int
    cuisine_hit_rate: float | None
    commute_cap_rate: float | None
    dealbreaker_clean_rate: float | None
    mean_top1_min_utility: float | None
    mean_top1_group_score: float | None
    fairness_top1_min_utility_low_alpha: float | None = None
    fairness_top1_min_utility_high_alpha: float | None = None
    per_profile: list[ProfileMetrics] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "profile_count": self.profile_count,
            "full_top3_rate": rate(self.full_top3_profiles, self.profile_count),
            "cuisine_hit_rate": self.cuisine_hit_rate,
            "commute_cap_rate": self.commute_cap_rate,
            "dealbreaker_clean_rate": self.dealbreaker_clean_rate,
            "mean_top1_min_utility": self.mean_top1_min_utility,
            "mean_top1_group_score": self.mean_top1_group_score,
            "fairness_low_alpha_min_utility": self.fairness_top1_min_utility_low_alpha,
            "fairness_high_alpha_min_utility": self.fairness_top1_min_utility_high_alpha,
        }


def summarize(results: list[ProfileMetrics]) -> EvalSummary:
    cuisine_hits = sum(r.slots.cuisine_hits for r in results)
    cuisine_total = sum(r.slots.cuisine_total for r in results)
    commute_within = sum(r.slots.commute_within for r in results)
    commute_total = sum(r.slots.commute_total for r in results)
    dealbreaker_clean = sum(r.slots.dealbreaker_clean for r in results)
    dealbreaker_total = sum(r.slots.dealbreaker_total for r in results)

    top1_min = [r.top1_min_utility for r in results if r.top1_min_utility is not None]
    top1_group = [
        r.slots.group_scores[0]
        for r in results
        if r.slots.group_scores
    ]

    return EvalSummary(
        profile_count=len(results),
        full_top3_profiles=sum(1 for r in results if r.top3_count >= 3),
        cuisine_hit_rate=rate(cuisine_hits, cuisine_total),
        commute_cap_rate=rate(commute_within, commute_total),
        dealbreaker_clean_rate=rate(dealbreaker_clean, dealbreaker_total),
        mean_top1_min_utility=(sum(top1_min) / len(top1_min)) if top1_min else None,
        mean_top1_group_score=(sum(top1_group) / len(top1_group)) if top1_group else None,
        per_profile=results,
    )
