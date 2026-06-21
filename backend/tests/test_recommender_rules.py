from __future__ import annotations

from backend.recommender_rules import (
    contains_any_category,
    merge_group_budget,
    score_group_by_feature_importance,
)


def _restaurant(
    *,
    rid: str,
    categories: str = "Restaurants",
    price_range: int | None = 2,
    stars: float = 4.0,
    table_service: bool | None = True,
    takeout: bool | None = True,
    delivery: bool | None = False,
    member_commutes: list | None = None,
    commute_all_within_max: bool = True,
) -> dict:
    return {
        "id": rid,
        "name": rid,
        "categories": categories,
        "price_range": price_range,
        "stars": stars,
        "table_service": table_service,
        "takeout": takeout,
        "delivery": delivery,
        "_member_commutes": member_commutes or [],
        "_commute_all_within_max": commute_all_within_max,
        "_commute_fit": 1.0 if commute_all_within_max else 0.4,
    }


def _member(actor_id: str, features: dict) -> dict:
    return {"actor_id": actor_id, "features": features}


class TestCategoryMatching:
    def test_indian_matches_synonym_tokens(self) -> None:
        cats = "Indian, South Indian, Vegetarian, Dosa, Restaurants"
        assert contains_any_category(cats, ["Indian"]) is True
        assert contains_any_category(cats, ["Dosa"]) is True

    def test_indian_does_not_match_unrelated_cuisine(self) -> None:
        cats = "Thai, Noodles, Restaurants"
        assert contains_any_category(cats, ["Indian"]) is False

    def test_sat_categories_prefers_selected_cuisine(self) -> None:
        indian = _restaurant(rid="indian", categories="Indian, Curry, Restaurants")
        thai = _restaurant(rid="thai", categories="Thai, Noodles, Restaurants")
        members = [
            _member(
                "a",
                {
                    "categories": {
                        "value": ["Indian"],
                        "importance": 5,
                        "dealbreaker_strength": 3,
                    }
                },
            )
        ]
        scored = score_group_by_feature_importance(restaurants=[indian, thai], members=members)
        assert scored[0]["id"] == "indian"


class TestBudgetMerging:
    def test_intersection_of_member_budgets(self) -> None:
        lo, hi, impossible = merge_group_budget(
            [{"budget_min": 10, "budget_max": 30}, {"budget_min": 20, "budget_max": 40}]
        )
        assert impossible is False
        assert lo == 20
        assert hi == 30

    def test_impossible_budget_overlap(self) -> None:
        lo, hi, impossible = merge_group_budget(
            [{"budget_min": 10, "budget_max": 15}, {"budget_min": 40, "budget_max": 60}]
        )
        assert impossible is True
        assert lo == 40
        assert hi == 15


class TestGroupScoring:
    def test_fairness_alpha_protects_unhappy_member(self) -> None:
        cheap = _restaurant(rid="cheap", price_range=1, stars=3.5)
        pricey = _restaurant(rid="pricey", price_range=4, stars=4.8)
        members = [
            _member("budget", {"price_range": {"value": 1, "importance": 5}}),
            _member("flex", {"price_range": {"value": 4, "importance": 2}}),
        ]
        scored = score_group_by_feature_importance(
            restaurants=[pricey, cheap],
            members=members,
            fairness_alpha=0.2,
        )
        assert scored[0]["id"] == "cheap"

    def test_dealbreaker_filters_strict_mismatch(self) -> None:
        dine_in = _restaurant(rid="dine-in", table_service=True)
        takeout_only = _restaurant(rid="takeout", table_service=False, takeout=True)
        members = [
            _member(
                "a",
                {
                    "table_service": {
                        "value": True,
                        "importance": 5,
                        "dealbreaker_strength": 5,
                    }
                },
            )
        ]
        scored = score_group_by_feature_importance(
            restaurants=[takeout_only, dine_in],
            members=members,
        )
        assert scored[0]["id"] == "dine-in"
        assert all(row["id"] != "takeout" or row.get("_relaxed_dealbreaker_fallback") for row in scored[:1])

    def test_multi_select_categories_use_or_semantics(self) -> None:
        pizza = _restaurant(rid="pizza", categories="Pizza, Italian, Restaurants")
        sushi = _restaurant(rid="sushi", categories="Japanese, Sushi Bars, Restaurants")
        members = [
            _member(
                "a",
                {
                    "categories": {
                        "value": ["Pizza", "Japanese / Sushi"],
                        "importance": 4,
                    }
                },
            )
        ]
        scored = score_group_by_feature_importance(restaurants=[sushi, pizza], members=members)
        top_ids = {row["id"] for row in scored[:2]}
        assert top_ids == {"pizza", "sushi"}


class TestCommuteSatisfaction:
    def test_commute_within_cap_scores_higher(self) -> None:
        near = _restaurant(
            rid="near",
            categories="Indian, Restaurants",
            member_commutes=[
                {
                    "actor_id": "a",
                    "mode": "walking",
                    "preferred_duration_minutes": 12,
                    "within_max_minutes": True,
                }
            ],
            commute_all_within_max=True,
        )
        far = _restaurant(
            rid="far",
            categories="Indian, Restaurants",
            member_commutes=[
                {
                    "actor_id": "a",
                    "mode": "walking",
                    "preferred_duration_minutes": 45,
                    "within_max_minutes": False,
                }
            ],
            commute_all_within_max=False,
        )
        members = [
            _member(
                "a",
                {
                    "categories": {"value": ["Indian"], "importance": 3},
                    "commute": {
                        "value": {"mode": "walking", "max_minutes": 20},
                        "importance": 5,
                    },
                },
            )
        ]
        scored = score_group_by_feature_importance(restaurants=[far, near], members=members)
        assert scored[0]["id"] == "near"
