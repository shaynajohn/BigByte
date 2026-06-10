from __future__ import annotations

import secrets
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


def restaurant_location_payload(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "address": row.get("address"),
        "city": row.get("city"),
        "state": row.get("state"),
        "postal_code": row.get("postal_code"),
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
    candidates = [with_distance(r, payload.latitude, payload.longitude) for r in demo_candidates(payload.limit)]
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
    scored = score_group_by_feature_importance(
        restaurants=candidates,
        members=members,
        fairness_alpha=float(payload.fairness_alpha),
        dealbreaker_threshold=float(payload.dealbreaker_threshold),
    )
    top = scored[:3]
    return {
        "members": [{"actor_id": m.get("actor_id")} for m in members],
        "candidates_considered": len(candidates),
        "candidates_after_scoring": len(scored),
        "top_3": [recommendation_payload(t) for t in top],
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
