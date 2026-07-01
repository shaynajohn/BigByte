from __future__ import annotations

from backend.main import _commute_specs


def test_commute_specs_use_group_meetup_origin() -> None:
    members = [
        {
            "actor_id": "a",
            "features": {
                "commute": {
                    "value": {
                        "origin_type": "meetup",
                        "mode": "walking",
                        "max_minutes": 20,
                    }
                }
            },
        }
    ]
    meetup = {
        "latitude": 37.7879,
        "longitude": -122.4075,
        "label": "Union Square",
    }
    specs = _commute_specs(members, meetup)
    assert len(specs) == 1
    assert specs[0]["latitude"] == 37.7879
    assert specs[0]["origin_type"] == "meetup"
    assert specs[0]["origin_label"] == "Union Square"


def test_commute_specs_self_origin_unchanged() -> None:
    members = [
        {
            "actor_id": "b",
            "features": {
                "commute": {
                    "value": {
                        "origin_type": "self",
                        "origin": {
                            "latitude": 37.7599,
                            "longitude": -122.4148,
                            "label": "Mission District",
                        },
                        "mode": "walking",
                        "max_minutes": 15,
                    }
                }
            },
        }
    ]
    specs = _commute_specs(members, None)
    assert len(specs) == 1
    assert specs[0]["origin_type"] == "self"
    assert specs[0]["origin_label"] == "Mission District"
