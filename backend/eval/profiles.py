from __future__ import annotations

from typing import Any

# SF anchor points used across synthetic profiles.
MISSION = {"latitude": 37.7599, "longitude": -122.4148}
UNION_SQUARE = {"latitude": 37.7879, "longitude": -122.4075}
SUNSET = {"latitude": 37.7534, "longitude": -122.4945}


def _feat(
    value: Any,
    importance: int = 3,
    dealbreaker_strength: int | None = None,
) -> dict[str, Any]:
    row: dict[str, Any] = {"value": value, "importance": importance}
    if dealbreaker_strength is not None:
        row["dealbreaker_strength"] = dealbreaker_strength
    return row


def _commute(origin: dict[str, float], mode: str, max_minutes: int, importance: int = 5) -> dict[str, Any]:
    return _feat(
        {
            "origin": dict(origin),
            "mode": mode,
            "max_minutes": max_minutes,
        },
        importance=importance,
        dealbreaker_strength=3,
    )


def _member(actor_id: str, **features: dict[str, Any]) -> dict[str, Any]:
    return {"actor_id": actor_id, "features": features}


EVAL_PROFILES: list[dict[str, Any]] = [
    {
        "id": "indian_walk_mission",
        "label": "Indian · 20 min walk · Mission",
        "expects_cuisine": True,
        "expects_commute": True,
        "members": [
            _member(
                "a",
                categories=_feat(["Indian"], importance=5, dealbreaker_strength=3),
                commute=_commute(MISSION, "walking", 20),
            )
        ],
    },
    {
        "id": "mexican_walk_tight",
        "label": "Mexican · 15 min walk · Mission",
        "expects_cuisine": True,
        "expects_commute": True,
        "members": [
            _member(
                "a",
                categories=_feat(["Mexican"], importance=5, dealbreaker_strength=4),
                commute=_commute(MISSION, "walking", 15),
            )
        ],
    },
    {
        "id": "group_indian_consensus",
        "label": "Two members · both want Indian",
        "expects_cuisine": True,
        "expects_commute": False,
        "members": [
            _member("a", categories=_feat(["Indian"], importance=5, dealbreaker_strength=3)),
            _member("b", categories=_feat(["Indian"], importance=4, dealbreaker_strength=2)),
        ],
    },
    {
        "id": "group_mixed_cuisines",
        "label": "Indian + Thai group",
        "expects_cuisine": True,
        "expects_commute": False,
        "members": [
            _member("a", categories=_feat(["Indian"], importance=5, dealbreaker_strength=3)),
            _member("b", categories=_feat(["Thai"], importance=5, dealbreaker_strength=3)),
        ],
    },
    {
        "id": "budget_fairness",
        "label": "Budget clash · $ vs $$$$",
        "expects_cuisine": False,
        "expects_commute": False,
        "fairness_probe": True,
        "members": [
            _member("budget", price_range=_feat(1, importance=5, dealbreaker_strength=4)),
            _member("flex", price_range=_feat(4, importance=2)),
        ],
    },
    {
        "id": "table_service_dealbreaker",
        "label": "Dine-in dealbreaker",
        "expects_cuisine": False,
        "expects_commute": False,
        "members": [
            _member(
                "a",
                table_service=_feat(True, importance=5, dealbreaker_strength=5),
            )
        ],
    },
    {
        "id": "vegetarian_pair",
        "label": "Two vegetarians",
        "expects_cuisine": True,
        "expects_commute": False,
        "members": [
            _member("a", categories=_feat(["Vegetarian"], importance=5, dealbreaker_strength=3)),
            _member("b", categories=_feat(["Vegetarian"], importance=4)),
        ],
    },
    {
        "id": "delivery_required",
        "label": "Delivery-only",
        "expects_cuisine": False,
        "expects_commute": False,
        "members": [
            _member(
                "a",
                delivery=_feat(True, importance=5, dealbreaker_strength=4),
            )
        ],
    },
    {
        "id": "drive_sunset_wide",
        "label": "Indian · 45 min drive · Sunset",
        "expects_cuisine": True,
        "expects_commute": True,
        "members": [
            _member(
                "a",
                categories=_feat(["Indian"], importance=4),
                commute=_commute(SUNSET, "driving", 45),
            )
        ],
    },
    {
        "id": "open_minded",
        "label": "No strong preferences",
        "expects_cuisine": False,
        "expects_commute": False,
        "members": [
            _member("a", good_for_groups=_feat(True, importance=2)),
        ],
    },
    {
        "id": "japanese_sushi_union",
        "label": "Japanese / Sushi · Union Square walk",
        "expects_cuisine": True,
        "expects_commute": True,
        "members": [
            _member(
                "a",
                categories=_feat(["Japanese / Sushi"], importance=5, dealbreaker_strength=3),
                commute=_commute(UNION_SQUARE, "walking", 25),
            )
        ],
    },
]
