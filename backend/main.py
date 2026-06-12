from __future__ import annotations

import json
import os
import secrets
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .demo_catalog import DEMO_SAN_FRANCISCO_FOOD_SPOTS
from .recommender_rules import (
    contains_any_category,
    extract_price_level,
    group_cuisine_fraction,
    haversine_miles,
    score_candidate,
    score_group_by_feature_importance,
    score_group_candidate,
)

app = FastAPI(title="BigByte")
FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
FRONTEND_INDEX = FRONTEND_DIST / "index.html"
OPENROUTESERVICE_API_KEY = (
    os.environ.get("OPENROUTESERVICE_API_KEY") or os.environ.get("ORS_API_KEY") or ""
).strip()
ORS_MATRIX_BASE_URL = "https://api.heigit.org/openrouteservice/v2/matrix"

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

GROUPS: dict[str, dict[str, Any]] = {}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def random_code() -> str:
    return secrets.token_urlsafe(5).replace("-", "").replace("_", "")[:8].lower()


def demo_candidates(limit: int) -> list[dict[str, Any]]:
    return [dict(r, attributes=dict(r.get("attributes") or {})) for r in DEMO_SAN_FRANCISCO_FOOD_SPOTS][
        :limit
    ]


def infer_sf_neighborhood(row: dict[str, Any]) -> str:
    if row.get("neighborhood"):
        return str(row["neighborhood"])
    lat = _safe_float(row.get("latitude"))
    lng = _safe_float(row.get("longitude"))
    if lat is None or lng is None:
        return "San Francisco"
    if lat >= 37.789 and lng >= -122.399:
        return "Embarcadero"
    if lat >= 37.790 and -122.414 <= lng < -122.399:
        return "Chinatown / North Beach"
    if lat >= 37.790 and -122.425 <= lng < -122.414:
        return "Nob Hill"
    if lat >= 37.792 and -122.446 <= lng < -122.425:
        return "Marina / Cow Hollow"
    if 37.780 <= lat < 37.792 and -122.440 <= lng < -122.425:
        return "Japantown / Fillmore"
    if 37.782 <= lat < 37.792 and -122.421 <= lng < -122.407:
        return "Tenderloin / Union Square"
    if 37.775 <= lat < 37.784 and -122.431 <= lng < -122.414:
        return "Hayes Valley / Civic Center"
    if 37.769 <= lat < 37.790 and lng >= -122.407:
        return "SoMa"
    if 37.751 <= lat < 37.769 and lng >= -122.405:
        return "Dogpatch / Potrero"
    if 37.748 <= lat < 37.766 and -122.425 <= lng < -122.405:
        return "Mission"
    if 37.756 <= lat < 37.770 and -122.440 <= lng < -122.425:
        return "Castro / Noe Valley"
    if 37.766 <= lat < 37.774 and -122.456 <= lng < -122.438:
        return "Haight"
    if lat >= 37.775 and lng < -122.455:
        return "Richmond"
    if lat < 37.765 and lng < -122.455:
        return "Sunset"
    if lat < 37.746 and -122.430 <= lng < -122.405:
        return "Bernal / Glen Park"
    return "San Francisco"


def restaurant_location_payload(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "address": row.get("address"),
        "city": row.get("city"),
        "state": row.get("state"),
        "postal_code": row.get("postal_code"),
        "neighborhood": infer_sf_neighborhood(row),
        "latitude": row.get("latitude"),
        "longitude": row.get("longitude"),
    }


def with_distance(row: dict[str, Any], latitude: float | None, longitude: float | None) -> dict[str, Any]:
    rr = dict(row)
    dist = None
    if (
        latitude is not None
        and longitude is not None
        and row.get("latitude") is not None
        and row.get("longitude") is not None
    ):
        dist = haversine_miles(
            float(latitude),
            float(longitude),
            float(row["latitude"]),
            float(row["longitude"]),
        )
    rr["_distance_miles"] = dist
    return rr


def _safe_float(value: Any) -> float | None:
    try:
        if value is None:
            return None
        n = float(value)
    except (TypeError, ValueError):
        return None
    return n if -180.0 <= n <= 180.0 else None


def _safe_positive_int(value: Any, default: int = 20) -> int:
    try:
        n = int(round(float(value)))
    except (TypeError, ValueError):
        return default
    return max(5, min(120, n))


def _is_supported_commute_origin(lat: float, lng: float) -> bool:
    # BigByte's catalog is SF-only; reject placeholder/global coordinates like 0,0.
    return 37.0 <= lat <= 38.3 and -123.1 <= lng <= -121.5


def _round_metric(value: float | None, places: int = 1) -> float | None:
    if value is None:
        return None
    return round(float(value), places)


def _commute_specs(members: list[dict[str, Any]]) -> list[dict[str, Any]]:
    specs: list[dict[str, Any]] = []
    for member in members:
        feats = (member.get("features") or {}) if isinstance(member, dict) else {}
        commute_feature = feats.get("commute") or {}
        value = commute_feature.get("value") if isinstance(commute_feature, dict) else None
        if not isinstance(value, dict):
            continue
        origin = value.get("origin") or {}
        if not isinstance(origin, dict):
            continue
        lat = _safe_float(origin.get("latitude"))
        lng = _safe_float(origin.get("longitude"))
        if lat is None or lng is None:
            continue
        if not _is_supported_commute_origin(lat, lng):
            continue
        mode = str(value.get("mode") or "driving").lower()
        if mode not in {"walking", "driving"}:
            mode = "driving"
        specs.append(
            {
                "actor_id": str(member.get("actor_id") or ""),
                "latitude": lat,
                "longitude": lng,
                "mode": mode,
                "max_minutes": _safe_positive_int(value.get("max_minutes")),
            }
        )
    return specs


def _commute_preference_count(members: list[dict[str, Any]]) -> int:
    count = 0
    for member in members:
        feats = (member.get("features") or {}) if isinstance(member, dict) else {}
        commute_feature = feats.get("commute") or {}
        value = commute_feature.get("value") if isinstance(commute_feature, dict) else None
        if isinstance(value, dict):
            count += 1
    return count


def _estimated_route_metrics(
    origin_lat: float,
    origin_lng: float,
    dest_lat: float,
    dest_lng: float,
    mode: Literal["walking", "driving"],
) -> dict[str, Any]:
    straight = haversine_miles(origin_lat, origin_lng, dest_lat, dest_lng)
    if mode == "walking":
        miles = straight * 1.2
        minutes = (miles / 3.0) * 60.0
    else:
        miles = straight * 1.35
        minutes = ((miles / 18.0) * 60.0) + 4.0
    return {
        "distance_miles": _round_metric(miles, 2),
        "duration_minutes": _round_metric(minutes, 1),
        "source": "estimated",
    }


def _rough_route_radius_miles(max_minutes: int, mode: Literal["walking", "driving"]) -> float:
    if mode == "walking":
        route_miles = (float(max_minutes) / 60.0) * 3.0
        return (route_miles * 1.8) + 0.5
    route_miles = (max(0.0, float(max_minutes) - 4.0) / 60.0) * 18.0
    return (route_miles * 1.8) + 1.0


def _should_route_candidate(spec: dict[str, Any], row: dict[str, Any], mode: Literal["walking", "driving"]) -> bool:
    dest_lat = _safe_float(row.get("latitude"))
    dest_lng = _safe_float(row.get("longitude"))
    if dest_lat is None or dest_lng is None:
        return False
    straight = haversine_miles(float(spec["latitude"]), float(spec["longitude"]), dest_lat, dest_lng)
    return straight <= _rough_route_radius_miles(int(spec.get("max_minutes") or 20), mode)


def _fetch_openrouteservice_matrix(
    specs: list[dict[str, Any]],
    candidates: list[dict[str, Any]],
    mode: Literal["walking", "driving"],
) -> dict[tuple[str, str], dict[str, Any]]:
    if not OPENROUTESERVICE_API_KEY:
        return {}

    profile = "foot-walking" if mode == "walking" else "driving-car"
    out: dict[tuple[str, str], dict[str, Any]] = {}
    for spec in specs:
        routable = [
            r
            for r in candidates
            if r.get("id") and r.get("latitude") is not None and r.get("longitude") is not None
            and _should_route_candidate(spec, r, mode)
        ]
        for start in range(0, len(routable), 24):
            chunk = routable[start : start + 24]
            locations = [
                [spec["longitude"], spec["latitude"]],
                *[[float(r["longitude"]), float(r["latitude"])] for r in chunk],
            ]
            request_body = json.dumps(
                {
                    "locations": locations,
                    "sources": [0],
                    "destinations": list(range(1, len(locations))),
                    "metrics": ["distance", "duration"],
                    "units": "m",
                }
            ).encode("utf-8")
            request = urllib.request.Request(
                f"{ORS_MATRIX_BASE_URL}/{profile}",
                data=request_body,
                headers={
                    "Authorization": OPENROUTESERVICE_API_KEY,
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                    "User-Agent": "BigByte/1.0",
                },
                method="POST",
            )
            with urllib.request.urlopen(request, timeout=8) as response:
                data = json.loads(response.read().decode("utf-8"))
            distances = (data.get("distances") or [[]])[0] or []
            durations = (data.get("durations") or [[]])[0] or []
            for idx, row in enumerate(chunk):
                meters = distances[idx] if idx < len(distances) else None
                seconds = durations[idx] if idx < len(durations) else None
                if meters is None or seconds is None:
                    continue
                out[(spec["actor_id"], str(row["id"]))] = {
                    "distance_miles": _round_metric(float(meters) / 1609.344, 2),
                    "duration_minutes": _round_metric(float(seconds) / 60.0, 1),
                    "source": "openrouteservice",
                }
    return out


def attach_commute_metrics(
    candidates: list[dict[str, Any]],
    members: list[dict[str, Any]],
) -> str | None:
    specs = _commute_specs(members)
    if not specs:
        if _commute_preference_count(members):
            return "Commute location was outside the Bay Area, so distance was ignored for these recommendations."
        return None

    note: str | None = None
    route_maps: dict[str, dict[tuple[str, str], dict[str, Any]]] = {"walking": {}, "driving": {}}
    preferred_modes = sorted({str(spec["mode"]) for spec in specs if spec.get("mode") in {"walking", "driving"}})
    if OPENROUTESERVICE_API_KEY:
        try:
            for mode in preferred_modes:
                route_maps[mode] = _fetch_openrouteservice_matrix(specs, candidates, mode)  # type: ignore[index]
        except (OSError, urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError, KeyError):
            route_maps = {"walking": {}, "driving": {}}
            note = "OpenRouteService route lookup failed, so commute times are estimated from straight-line distance."
    else:
        note = "Commute times are estimated."

    for row in candidates:
        dest_lat = _safe_float(row.get("latitude"))
        dest_lng = _safe_float(row.get("longitude"))
        if dest_lat is None or dest_lng is None:
            continue

        member_rows: list[dict[str, Any]] = []
        preferred_minutes: list[float] = []
        preferred_miles: list[float] = []
        overage_minutes: list[float] = []
        walking_minutes: list[float] = []
        walking_miles: list[float] = []
        driving_minutes: list[float] = []
        driving_miles: list[float] = []
        within_count = 0

        for spec in specs:
            key = (spec["actor_id"], str(row.get("id")))
            preferred_mode = spec["mode"]
            preferred = route_maps[preferred_mode].get(key) or _estimated_route_metrics(
                spec["latitude"], spec["longitude"], dest_lat, dest_lng, preferred_mode
            )
            preferred_duration = preferred.get("duration_minutes")
            preferred_distance = preferred.get("distance_miles")
            within_max = (
                preferred_duration is not None
                and float(preferred_duration) <= float(spec["max_minutes"])
            )
            if within_max:
                within_count += 1
                overage_minutes.append(0.0)
            elif preferred_duration is not None:
                overage_minutes.append(max(0.0, float(preferred_duration) - float(spec["max_minutes"])))
            if preferred_duration is not None:
                preferred_minutes.append(float(preferred_duration))
            if preferred_distance is not None:
                preferred_miles.append(float(preferred_distance))
            if preferred_mode == "walking":
                if preferred.get("duration_minutes") is not None:
                    walking_minutes.append(float(preferred["duration_minutes"]))
                if preferred.get("distance_miles") is not None:
                    walking_miles.append(float(preferred["distance_miles"]))
            if preferred_mode == "driving":
                if preferred.get("duration_minutes") is not None:
                    driving_minutes.append(float(preferred["duration_minutes"]))
                if preferred.get("distance_miles") is not None:
                    driving_miles.append(float(preferred["distance_miles"]))

            member_rows.append(
                {
                    "actor_id": spec["actor_id"],
                    "mode": spec["mode"],
                    "max_minutes": spec["max_minutes"],
                    "walking": preferred if preferred_mode == "walking" else None,
                    "driving": preferred if preferred_mode == "driving" else None,
                    "preferred_distance_miles": preferred_distance,
                    "preferred_duration_minutes": preferred_duration,
                    "within_max_minutes": within_max,
                }
            )

        def avg(vals: list[float]) -> float | None:
            return _round_metric(sum(vals) / len(vals), 1) if vals else None

        row["_member_commutes"] = member_rows
        row["_commute_summary"] = {
            "member_count": len(member_rows),
            "within_max_count": within_count,
            "avg_preferred_minutes": avg(preferred_minutes),
            "max_preferred_minutes": _round_metric(max(preferred_minutes), 1) if preferred_minutes else None,
            "avg_preferred_distance_miles": avg(preferred_miles),
            "max_preferred_distance_miles": _round_metric(max(preferred_miles), 2) if preferred_miles else None,
            "preferred_modes": sorted({str(spec["mode"]) for spec in specs}),
            "source": "openrouteservice" if route_maps["walking"] or route_maps["driving"] else "estimated",
        }
        row["_commute_member_count"] = len(member_rows)
        row["_commute_within_max_count"] = within_count
        row["_commute_all_within_max"] = bool(member_rows) and within_count == len(member_rows)
        row["_commute_fit"] = within_count / len(member_rows) if member_rows else 1.0
        row["_commute_max_preferred_minutes"] = max(preferred_minutes) if preferred_minutes else None
        row["_commute_avg_preferred_minutes"] = sum(preferred_minutes) / len(preferred_minutes) if preferred_minutes else None
        row["_commute_max_overage_minutes"] = max(overage_minutes) if overage_minutes else None
        row["_walking_distance_miles"] = avg(walking_miles)
        row["_walking_duration_minutes"] = avg(walking_minutes)
        row["_driving_distance_miles"] = avg(driving_miles)
        row["_driving_duration_minutes"] = avg(driving_minutes)

    return note


def recommendation_payload(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "restaurant_id": row["id"],
        "name": row["name"],
        **restaurant_location_payload(row),
        "score": row.get("_score"),
        "group_score": row.get("_group_score"),
        "avg_utility": row.get("_avg_utility"),
        "min_utility": row.get("_min_utility"),
        "category_fit": row.get("_category_fit"),
        "cuisine_group_fit": row.get("_cuisine_fraction"),
        "distance_miles": row.get("_distance_miles"),
        "commute_summary": row.get("_commute_summary"),
        "member_commutes": row.get("_member_commutes"),
        "walking_distance_miles": row.get("_walking_distance_miles"),
        "walking_duration_minutes": row.get("_walking_duration_minutes"),
        "driving_distance_miles": row.get("_driving_distance_miles"),
        "driving_duration_minutes": row.get("_driving_duration_minutes"),
        "stars": row.get("stars"),
        "review_count": row.get("review_count"),
        "price_range": row.get("price_range"),
        "takeout": row.get("takeout"),
        "delivery": row.get("delivery"),
        "table_service": row.get("table_service"),
        "good_for_groups": row.get("good_for_groups"),
        "ambiance_labels": row.get("ambiance_labels"),
        "categories": row.get("categories"),
        "relaxed_dealbreaker_fallback": row.get("_relaxed_dealbreaker_fallback", False),
    }


class FeaturePref(BaseModel):
    value: Any | None = None
    importance: int = Field(default=3, ge=1, le=5)
    dealbreaker_strength: int | None = Field(default=None, ge=1, le=5)


class MemberFeaturePrefs(BaseModel):
    actor_id: str | None = None
    features: dict[str, FeaturePref] = Field(default_factory=dict)


class GroupFeatureRecommendRequest(BaseModel):
    members: list[MemberFeaturePrefs] = Field(min_length=1, max_length=50)
    latitude: float | None = None
    longitude: float | None = None
    limit: int = Field(default=250, ge=1, le=300)
    fairness_alpha: float = Field(default=0.7, ge=0.0, le=1.0)
    dealbreaker_threshold: float = Field(default=0.67, ge=0.0, le=1.0)


class GroupRecommendRequest(BaseModel):
    actor_ids: list[str] = Field(min_length=1, max_length=50)
    latitude: float | None = None
    longitude: float | None = None
    limit: int = Field(default=250, ge=1, le=300)


class RecommendRequest(BaseModel):
    actor_id: str = Field(min_length=1, max_length=200)
    latitude: float | None = None
    longitude: float | None = None
    limit: int = Field(default=250, ge=1, le=300)


class CreateGroupRequest(BaseModel):
    host_name: str = Field(default="You", min_length=1, max_length=80)
    actor_id: str | None = Field(default=None, max_length=200)


class JoinGroupRequest(BaseModel):
    name: str | None = Field(default=None, max_length=80)
    actor_id: str | None = Field(default=None, max_length=200)


class SaveAnswersRequest(BaseModel):
    actor_id: str = Field(min_length=1, max_length=200)
    features: dict[str, FeaturePref] = Field(default_factory=dict)


class SaveVoteRequest(BaseModel):
    actor_id: str = Field(min_length=1, max_length=200)
    restaurant_id: str = Field(min_length=1, max_length=200)
    vote: Literal["love", "maybe", "pass"]


class SetWinnerRequest(BaseModel):
    actor_id: str = Field(min_length=1, max_length=200)
    restaurant_id: str = Field(min_length=1, max_length=200)


class SessionRecommendRequest(BaseModel):
    latitude: float | None = None
    longitude: float | None = None
    limit: int = Field(default=250, ge=1, le=300)
    fairness_alpha: float = Field(default=0.7, ge=0.0, le=1.0)


@app.get("/", response_model=None)
def read_root():
    if FRONTEND_INDEX.exists():
        return FileResponse(FRONTEND_INDEX)
    return {"app": "BigByte", "mode": "temporary in-memory groups"}


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"ok": "true"}


@app.post("/api/groups")
def create_group(payload: CreateGroupRequest) -> dict[str, Any]:
    group_id = random_code()
    actor_id = payload.actor_id or f"guest:{secrets.token_urlsafe(8)}"
    GROUPS[group_id] = {
        "id": group_id,
        "created_at": now_iso(),
        "members": [
            {
                "id": secrets.token_urlsafe(6),
                "name": payload.host_name.strip() or "You",
                "actor_id": actor_id,
                "joined_at": now_iso(),
            }
        ],
        "answers": {},
        "votes": {},
        "winner": None,
    }
    return GROUPS[group_id]


@app.get("/api/groups/{group_id}")
def get_group(group_id: str) -> dict[str, Any]:
    group = GROUPS.get(group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found or server was restarted.")
    done = set((group.get("answers") or {}).keys())
    member_actor_ids = [
        str(m.get("actor_id"))
        for m in group.get("members", [])
        if m.get("actor_id")
    ]
    pending = sorted(set(member_actor_ids) - done)
    return {
        **group,
        "completed_actor_ids": sorted(done),
        "completed_count": len(done),
        "member_count": len(member_actor_ids),
        "pending_actor_ids": pending,
        "ready_for_recommendations": bool(member_actor_ids) and not pending,
    }


@app.post("/api/groups/{group_id}/members")
def join_group(group_id: str, payload: JoinGroupRequest) -> dict[str, Any]:
    group = GROUPS.get(group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found or server was restarted.")
    actor_id = payload.actor_id or f"guest:{secrets.token_urlsafe(8)}"
    existing = next((m for m in group["members"] if m.get("actor_id") == actor_id), None)
    if existing:
        return {"group": group, "member": existing}
    member_name = (payload.name or "").strip() or f"Participant {len(group.get('members', [])) + 1}"
    member = {
        "id": secrets.token_urlsafe(6),
        "name": member_name,
        "actor_id": actor_id,
        "joined_at": now_iso(),
    }
    group["members"].append(member)
    return {"group": group, "member": member}


@app.post("/api/groups/{group_id}/answers")
def save_group_answers(group_id: str, payload: SaveAnswersRequest) -> dict[str, Any]:
    group = GROUPS.get(group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found or server was restarted.")
    member_actor_ids = {
        str(m.get("actor_id"))
        for m in group.get("members", [])
        if m.get("actor_id")
    }
    if member_actor_ids and payload.actor_id not in member_actor_ids:
        raise HTTPException(status_code=400, detail="Actor is not a member of this group.")
    group.setdefault("answers", {})[payload.actor_id] = {
        "features": {
            k: {
                "value": v.value,
                "importance": v.importance,
                "dealbreaker_strength": v.dealbreaker_strength,
            }
            for k, v in payload.features.items()
        },
        "updated_at": now_iso(),
    }
    completed_count = len(group.get("answers") or {})
    return {
        "ok": True,
        "completed_count": completed_count,
        "member_count": len(member_actor_ids),
        "ready_for_recommendations": bool(member_actor_ids) and completed_count >= len(member_actor_ids),
    }


@app.get("/api/groups/{group_id}/votes")
def get_group_votes(group_id: str) -> dict[str, Any]:
    group = GROUPS.get(group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found or server was restarted.")
    votes = group.get("votes") or {}
    counts: dict[str, dict[str, int]] = {}
    for actor_votes in votes.values():
        if not isinstance(actor_votes, dict):
            continue
        for restaurant_id, vote in actor_votes.items():
            if vote not in {"love", "maybe", "pass"}:
                continue
            row = counts.setdefault(
                str(restaurant_id),
                {"love": 0, "maybe": 0, "pass": 0, "total": 0},
            )
            row[str(vote)] += 1
            row["total"] += 1
    return {
        "votes": votes,
        "counts": counts,
        "member_count": len(group.get("members", []) or []),
        "winner": group.get("winner"),
    }


@app.post("/api/groups/{group_id}/votes")
def save_group_vote(group_id: str, payload: SaveVoteRequest) -> dict[str, Any]:
    group = GROUPS.get(group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found or server was restarted.")
    member_actor_ids = {
        str(m.get("actor_id"))
        for m in group.get("members", [])
        if m.get("actor_id")
    }
    if member_actor_ids and payload.actor_id not in member_actor_ids:
        raise HTTPException(status_code=400, detail="Actor is not a member of this group.")
    group.setdefault("votes", {}).setdefault(payload.actor_id, {})[
        payload.restaurant_id
    ] = payload.vote
    return get_group_votes(group_id)


@app.post("/api/groups/{group_id}/winner")
def set_group_winner(group_id: str, payload: SetWinnerRequest) -> dict[str, Any]:
    group = GROUPS.get(group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found or server was restarted.")
    member_actor_ids = {
        str(m.get("actor_id"))
        for m in group.get("members", [])
        if m.get("actor_id")
    }
    if member_actor_ids and payload.actor_id not in member_actor_ids:
        raise HTTPException(status_code=400, detail="Actor is not a member of this group.")
    group["winner"] = {
        "restaurant_id": payload.restaurant_id,
        "selected_by_actor_id": payload.actor_id,
        "selected_at": now_iso(),
    }
    return get_group_votes(group_id)


@app.post("/api/groups/{group_id}/recommendations")
def recommend_for_session_group(group_id: str, payload: SessionRecommendRequest) -> dict[str, Any]:
    group = GROUPS.get(group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found or server was restarted.")
    answers = group.get("answers") or {}
    member_actor_ids = {
        str(m.get("actor_id"))
        for m in group.get("members", [])
        if m.get("actor_id")
    }
    missing = sorted(member_actor_ids - set(answers.keys()))
    if missing:
        raise HTTPException(
            status_code=409,
            detail=f"Waiting for {len(missing)} group member(s) to submit preferences.",
        )
    members = [
        {"actor_id": actor_id, "features": row.get("features") or {}}
        for actor_id, row in answers.items()
    ]
    if not members:
        members = [{"actor_id": m.get("actor_id"), "features": {}} for m in group.get("members", [])]
    return run_feature_recommendations(
        GroupFeatureRecommendRequest(
            members=[MemberFeaturePrefs(**m) for m in members],
            latitude=payload.latitude,
            longitude=payload.longitude,
            limit=payload.limit,
            fairness_alpha=payload.fairness_alpha,
        )
    )


def run_feature_recommendations(payload: GroupFeatureRecommendRequest) -> dict[str, Any]:
    members = [
        {
            "actor_id": m.actor_id,
            "features": {
                k: {
                    "value": v.value,
                    "importance": v.importance,
                    "dealbreaker_strength": v.dealbreaker_strength,
                }
                for k, v in m.features.items()
            },
        }
        for m in payload.members
    ]
    candidates = [with_distance(r, payload.latitude, payload.longitude) for r in demo_candidates(payload.limit)]
    commute_note = attach_commute_metrics(candidates, members)
    scored = score_group_by_feature_importance(
        restaurants=candidates,
        members=members,
        fairness_alpha=float(payload.fairness_alpha),
        dealbreaker_threshold=float(payload.dealbreaker_threshold),
    )
    note = commute_note
    commute_scored = [r for r in scored if r.get("_commute_member_count")]
    has_category_preferences = any(
        bool(((m.get("features") or {}).get("categories") or {}).get("value"))
        for m in members
        if isinstance(m, dict)
    )
    if commute_scored:
        feasible = [r for r in commute_scored if r.get("_commute_all_within_max")]
        category_scored = [
            r for r in commute_scored if float(r.get("_category_fit") or 0.0) > 0.0
        ] if has_category_preferences else commute_scored
        if feasible:
            category_feasible = [r for r in feasible if float(r.get("_category_fit") or 0.0) > 0.0]
            scored = category_feasible if has_category_preferences else feasible
            if has_category_preferences and not scored:
                scored = sorted(
                    category_scored,
                    key=lambda r: (
                        -float(r.get("_commute_fit") or 0.0),
                        float(r.get("_commute_max_overage_minutes") or 9999.0),
                        float(r.get("_commute_max_preferred_minutes") or 9999.0),
                        -float(r.get("_group_score") or 0.0),
                    ),
                )
                cap_note = (
                    "No exact cuisine match fit everyone's max commute, so these are the closest cuisine matches."
                )
                note = f"{commute_note} {cap_note}" if commute_note else cap_note
            elif len(scored) < 3:
                seen_ids = {r.get("id") for r in scored}
                fill = [
                    r for r in category_scored
                    if r.get("id") not in seen_ids
                ]
                fill.sort(
                    key=lambda r: (
                        -float(r.get("_commute_fit") or 0.0),
                        float(r.get("_commute_max_overage_minutes") or 9999.0),
                        float(r.get("_commute_max_preferred_minutes") or 9999.0),
                        -float(r.get("_group_score") or 0.0),
                    ),
                )
                scored = [*scored, *fill]
                cap_note = (
                    "Some picks are closest nearby matches because fewer than three exact commute matches fit."
                )
                note = f"{commute_note} {cap_note}" if commute_note else cap_note
        else:
            scored = sorted(
                category_scored,
                key=lambda r: (
                    -float(r.get("_commute_fit") or 0.0),
                    float(r.get("_commute_max_overage_minutes") or 9999.0),
                    float(r.get("_commute_max_preferred_minutes") or 9999.0),
                    -float(r.get("_group_score") or 0.0),
                ),
            )
            cap_note = "No exact commute match found, so these are the closest nearby matches."
            note = f"{commute_note} {cap_note}" if commute_note else cap_note
    top = scored[:3]
    return {
        "members": [{"actor_id": m.get("actor_id")} for m in members],
        "candidates_considered": len(candidates),
        "candidates_after_scoring": len(scored),
        "top_3": [recommendation_payload(t) for t in top],
        "note": note,
    }


@app.post("/api/recommendations/group_features")
def recommend_for_group_features(payload: GroupFeatureRecommendRequest) -> dict[str, Any]:
    return run_feature_recommendations(payload)


@app.post("/api/recommendations/group")
def recommend_for_group(payload: GroupRecommendRequest) -> dict[str, Any]:
    candidates = [with_distance(r, payload.latitude, payload.longitude) for r in demo_candidates(payload.limit)]
    prefs_list = [{} for _ in payload.actor_ids]
    filtered: list[dict[str, Any]] = []
    for row in candidates:
        cats = row.get("categories") or ""
        cuisine_frac = group_cuisine_fraction(cats, prefs_list)
        row["_score"] = score_group_candidate(
            stars=row.get("stars"),
            review_count=row.get("review_count"),
            cuisine_fraction=cuisine_frac,
            distance_miles=row.get("_distance_miles"),
        )
        row["_cuisine_fraction"] = cuisine_frac
        filtered.append(row)
    filtered.sort(key=lambda x: float(x.get("_score") or 0.0), reverse=True)
    return {
        "actor_ids": payload.actor_ids,
        "candidates_considered": len(candidates),
        "candidates_after_rules": len(filtered),
        "top_3": [recommendation_payload(t) for t in filtered[:3]],
    }


@app.post("/api/recommendations")
def recommend(payload: RecommendRequest) -> dict[str, Any]:
    candidates = [with_distance(r, payload.latitude, payload.longitude) for r in demo_candidates(payload.limit)]
    filtered: list[dict[str, Any]] = []
    for row in candidates:
        price_level = row.get("price_range") or extract_price_level(row.get("attributes"))
        cats = row.get("categories") or ""
        cuisine_match = 1 if contains_any_category(cats, []) else 0
        row["_score"] = score_candidate(
            stars=row.get("stars"),
            review_count=row.get("review_count"),
            cuisine_match=cuisine_match,
            distance_miles=row.get("_distance_miles"),
        )
        row["price_range"] = price_level
        filtered.append(row)
    filtered.sort(key=lambda x: float(x.get("_score") or 0.0), reverse=True)
    return {
        "actor_id": payload.actor_id,
        "candidates_considered": len(candidates),
        "candidates_after_rules": len(filtered),
        "top_3": [recommendation_payload(t) for t in filtered[:3]],
    }


if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
