from __future__ import annotations

import math
from typing import Any


def _norm(s: str) -> str:
    return (s or "").strip().lower()


# Curated user-facing cuisines -> category tokens we match against.
# This keeps the UI small while still matching Yelp-style taxonomy.
CUISINE_SYNONYMS: dict[str, list[str]] = {
    "Pizza": ["Pizza"],
    "Burgers": ["Burgers"],
    "Sandwiches": ["Sandwiches", "Delis", "Wraps", "Cheesesteaks"],
    "Breakfast & Brunch": ["Breakfast & Brunch", "Diners", "Waffles", "Bagels", "Donuts"],
    "Mexican": ["Mexican", "Tex-Mex", "Tacos"],
    "Italian": ["Italian", "Pasta Shops", "Sicilian", "Tuscan"],
    "Chinese": ["Chinese", "Szechuan", "Dim Sum", "Cantonese", "Shanghainese", "Hot Pot"],
    "Japanese / Sushi": [
        "Japanese",
        "Sushi Bars",
        "Ramen",
        "Izakaya",
        "Poke",
        "Teppanyaki",
        "Japanese Curry",
    ],
    "Thai": ["Thai"],
    "Vietnamese": ["Vietnamese"],
    "Indian": ["Indian", "Pakistani", "Bangladeshi"],
    "Korean": ["Korean"],
    "Mediterranean": ["Mediterranean", "Middle Eastern", "Turkish", "Lebanese", "Falafel", "Kebab", "Arabic"],
    "Greek": ["Greek"],
    "Caribbean": ["Caribbean", "Puerto Rican", "Dominican", "Trinidadian", "Haitian", "Jamaican"],
    "Cuban": ["Cuban"],
    "Latin American": [
        "Latin American",
        "Colombian",
        "Peruvian",
        "Venezuelan",
        "Brazilian",
        "Argentine",
        "Empanadas",
    ],
    "Barbeque": ["Barbeque", "Smokehouse"],
    "Seafood": ["Seafood", "Seafood Markets"],
}


def haversine_miles(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 3958.8
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lon2 - lon1)
    h = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(h)))


def extract_price_level(attributes: dict[str, Any] | None) -> int | None:
    """
    Yelp academic dataset often stores 'RestaurantsPriceRange2' as a string: '1'..'4'
    """
    if not attributes:
        return None
    v = attributes.get("RestaurantsPriceRange2")
    try:
        if v is None:
            return None
        return int(str(v).strip().strip("'").strip('"'))
    except Exception:
        return None


def est_cost_per_person(price_level: int | None) -> int | None:
    if price_level is None:
        return None
    return {1: 10, 2: 20, 3: 35, 4: 60}.get(price_level)


def contains_any_category(categories: str, needles: list[str]) -> bool:
    c = _norm(categories)
    return any(_norm(n) in c for n in needles if _norm(n))


def score_candidate(
    *,
    stars: float | None,
    review_count: int | None,
    cuisine_match: int,
    distance_miles: float | None,
) -> float:
    s = float(stars or 0.0)
    rc = int(review_count or 0)
    # Simple, explainable scoring for now.
    score = 0.0
    score += s * 10.0
    score += min(5.0, math.log10(rc + 1) * 2.5)
    score += cuisine_match * 1.5
    if distance_miles is not None:
        score += max(0.0, 4.0 - (distance_miles / 2.0))  # bonus for closer
    return score


def merge_group_budget(prefs_list: list[dict[str, Any]]) -> tuple[int | None, int | None, bool]:
    """
    Intersection of per-person budget ranges: everyone must afford the meal.
    Returns (lo, hi, impossible) where impossible is True if constraints cannot be satisfied.
    """
    mins: list[int] = []
    maxs: list[int] = []
    for p in prefs_list:
        lo = p.get("budget_min")
        if lo is not None:
            mins.append(int(round(float(lo))))
        hi = p.get("budget_max")
        if hi is not None:
            maxs.append(int(round(float(hi))))
    lo = max(mins) if mins else None
    hi = min(maxs) if maxs else None
    if lo is not None and hi is not None and lo > hi:
        return lo, hi, True
    return lo, hi, False


def merge_group_max_distance(prefs_list: list[dict[str, Any]]) -> float | None:
    """Tightest distance cap: everyone must be within their max commute."""
    vals: list[float] = []
    for p in prefs_list:
        v = p.get("max_distance_miles")
        if v is not None:
            vals.append(float(v))
    return min(vals) if vals else None


def group_cuisine_fraction(categories: str, prefs_list: list[dict[str, Any]]) -> float:
    """
    Share of members with explicit cuisine preferences whose list matches this restaurant.
    Members with no cuisine preferences are ignored here (neutral).
    """
    with_prefs: list[list[str]] = []
    for p in prefs_list:
        c = p.get("cuisine_preferences") or []
        if c:
            with_prefs.append(list(c))
    if not with_prefs:
        return 1.0
    matches = sum(1 for cuisines in with_prefs if contains_any_category(categories, cuisines))
    return matches / len(with_prefs)


def score_group_candidate(
    *,
    stars: float | None,
    review_count: int | None,
    cuisine_fraction: float,
    distance_miles: float | None,
) -> float:
    s = float(stars or 0.0)
    rc = int(review_count or 0)
    score = 0.0
    score += s * 10.0
    score += min(5.0, math.log10(rc + 1) * 2.5)
    score += max(0.0, min(1.0, cuisine_fraction)) * 4.0
    if distance_miles is not None:
        score += max(0.0, 4.0 - (distance_miles / 2.0))
    return score

def _importance_weight(w: int) -> float:
    """
    Map user slider 1..5 to a weight. Exponential makes 5 meaningfully stronger.
    1->1, 2->2, 3->4, 4->8, 5->16
    """
    w = int(w or 1)
    w = max(1, min(5, w))
    return float(2 ** (w - 1))


def _dealbreaker_threshold_for_strength(base_threshold: float, strength: int | None) -> float:
    """
    Convert dealbreaker slider 1..5 into an effective satisfaction threshold.
    Higher strength => stricter requirement.
    """
    s = int(strength or 1)
    s = max(1, min(5, s))
    # Scale around the configured base threshold:
    # strength 1 => 60% of base, strength 5 => 100% of base.
    factor = 0.5 + (0.1 * float(s))
    t = float(base_threshold) * factor
    return max(0.0, min(1.0, t))


def _sat_bool(user_pref: bool | None, restaurant_val: bool | None) -> float:
    """
    Satisfaction for tri-state booleans.
    - user_pref None => neutral (feature not used)
    - restaurant_val None => unknown => partial credit
    """
    if user_pref is None:
        return 1.0
    if restaurant_val is None:
        return 0.5
    return 1.0 if (restaurant_val is user_pref) else 0.0


def _sat_price(user_level: int | None, restaurant_level: int | None) -> float:
    if user_level is None:
        return 1.0
    if restaurant_level is None:
        return 0.5
    # Range is 1..4, normalize distance by max diff (3).
    return max(0.0, 1.0 - (abs(int(restaurant_level) - int(user_level)) / 3.0))


def _sat_stars(accepted: list[int] | None, restaurant_stars: float | None) -> float:
    selected = [int(n) for n in (accepted or []) if 1 <= int(n) <= 5]
    if not selected:
        return 1.0
    if restaurant_stars is None:
        return 0.5
    rounded = max(1, min(5, int(round(float(restaurant_stars)))))
    if rounded in selected:
        return 1.0
    return max(0.0, 1.0 - (min(abs(rounded - n) for n in selected) / 4.0))


def _sat_ambiance(user_labels: list[str] | None, restaurant_labels: list[str] | None) -> float:
    """
    Satisfaction based on set overlap of desired ambiance labels.
    """
    desired = [str(x) for x in (user_labels or []) if str(x).strip()]
    if not desired:
        return 1.0
    have = set(_norm(x) for x in (restaurant_labels or []) if str(x).strip())
    desired_norm = [_norm(x) for x in desired]
    if not have:
        return 0.5
    hits = sum(1 for x in desired_norm if x in have)
    return hits / max(1, len(desired_norm))


def _category_tokens(categories: str | None) -> set[str]:
    """
    Tokenize the comma-separated Yelp categories string into normalized tokens.
    """
    raw = categories or ""
    toks = [t.strip() for t in raw.split(",")]
    return { _norm(t) for t in toks if _norm(t) }


def _expand_cuisine_selection(selection: list[str] | None) -> dict[str, set[str]]:
    """
    Map curated selections to sets of normalized tokens.
    Returns {selection_label: set(tokens)} for computing satisfaction by-chip.
    """
    out: dict[str, set[str]] = {}
    for label in (selection or []):
        if not str(label).strip():
            continue
        label_s = str(label)
        syns = CUISINE_SYNONYMS.get(label_s, [label_s])
        out[label_s] = { _norm(s) for s in syns if _norm(s) }
    return out


def _sat_categories(user_selected: list[str] | None, restaurant_categories: str | None) -> float:
    """
    Satisfaction based on curated cuisine chip selections.
    Score is the fraction of selected chips that match at least one synonym token.
    """
    selected = [str(x) for x in (user_selected or []) if str(x).strip()]
    if not selected:
        return 1.0
    rest_toks = _category_tokens(restaurant_categories)
    if not rest_toks:
        return 0.5
    expanded = _expand_cuisine_selection(selected)
    hits = 0
    for _, syns in expanded.items():
        if rest_toks.intersection(syns):
            hits += 1
    return hits / max(1, len(expanded))


def score_group_by_feature_importance(
    *,
    restaurants: list[dict[str, Any]],
    members: list[dict[str, Any]],
    dealbreaker_threshold: float = 0.67,
    fairness_alpha: float = 0.6,
) -> list[dict[str, Any]]:
    """
    New group recommender logic:
    - Each member provides per-feature preferences and an importance slider (1..5).
    - Optional `dealbreaker_strength` (1..5) marks a feature as non-negotiable.
      If satisfaction is below a strength-scaled threshold, the restaurant is rejected.
    - Backward compatibility: importance==5 is treated as a max-strength dealbreaker.
    - Remaining restaurants are ranked by a fairness-aware group objective:
        G = alpha*avg(U_i) + (1-alpha)*min(U_i)
      where U_i is member utility in [0,1].

    Expected member structure (all fields optional):
      {
        "features": {
          "price_range": {"value": 1..4 or null, "importance": 1..5, "dealbreaker_strength": 1..5?},
          "takeout": {"value": true/false/null, "importance": 1..5, "dealbreaker_strength": 1..5?},
          "delivery": {"value": true/false/null, "importance": 1..5, "dealbreaker_strength": 1..5?},
          "table_service": {"value": true/false/null, "importance": 1..5, "dealbreaker_strength": 1..5?},
          "good_for_groups": {"value": true/false/null, "importance": 1..5, "dealbreaker_strength": 1..5?},
          "ambiance_labels": {"value": ["casual","classy",...], "importance": 1..5, "dealbreaker_strength": 1..5?},
        }
      }
    """
    alpha = float(fairness_alpha)
    alpha = max(0.0, min(1.0, alpha))

    def member_utility(m: dict[str, Any], r: dict[str, Any]) -> tuple[float, dict[str, float]]:
        feats = (m.get("features") or {}) if isinstance(m, dict) else {}
        total_w = 0.0
        total = 0.0
        contrib: dict[str, float] = {}

        def add(name: str, sat: float, imp: int | None, dealbreaker_strength: int | None) -> None:
            nonlocal total_w, total
            if imp is None:
                imp = 1
            eff_imp = max(int(imp), int(dealbreaker_strength or 1))
            w = _importance_weight(eff_imp)
            total_w += w
            total += w * float(sat)
            contrib[name] = float(sat)

        pr = feats.get("price_range") or {}
        add(
            "price_range",
            _sat_price(pr.get("value"), r.get("price_range")),
            pr.get("importance"),
            pr.get("dealbreaker_strength"),
        )

        stars = feats.get("stars") or {}
        add(
            "stars",
            _sat_stars(stars.get("value"), r.get("stars")),
            stars.get("importance"),
            stars.get("dealbreaker_strength"),
        )

        for key in ("takeout", "delivery", "table_service", "good_for_groups"):
            pref = feats.get(key) or {}
            add(
                key,
                _sat_bool(pref.get("value"), r.get(key)),
                pref.get("importance"),
                pref.get("dealbreaker_strength"),
            )

        amb = feats.get("ambiance_labels") or {}
        add(
            "ambiance_labels",
            _sat_ambiance(amb.get("value"), r.get("ambiance_labels")),
            amb.get("importance"),
            amb.get("dealbreaker_strength"),
        )

        cats = feats.get("categories") or {}
        add(
            "categories",
            _sat_categories(cats.get("value"), r.get("categories")),
            cats.get("importance"),
            cats.get("dealbreaker_strength"),
        )

        if total_w <= 0.0:
            return 1.0, contrib
        return max(0.0, min(1.0, total / total_w)), contrib

    scored: list[dict[str, Any]] = []
    for r in restaurants:
        member_utils: list[float] = []
        dealbreaker_failed = False
        per_member: list[dict[str, Any]] = []

        for m in members:
            u, contrib = member_utility(m, r)
            member_utils.append(u)
            per_member.append({"utility": u, "feature_satisfaction": contrib})

            feats = (m.get("features") or {}) if isinstance(m, dict) else {}
            # Enforce dealbreakers:
            # - explicit dealbreaker_strength (1..5), or
            # - backward-compatible importance==5.
            for fname, fobj in feats.items():
                if not isinstance(fobj, dict):
                    continue
                strength = fobj.get("dealbreaker_strength")
                if strength is None and int(fobj.get("importance") or 1) == 5:
                    strength = 5
                if strength is None:
                    continue
                sat = contrib.get(fname)
                if sat is None:
                    continue
                effective_threshold = _dealbreaker_threshold_for_strength(
                    dealbreaker_threshold, int(strength)
                )
                if float(sat) < float(effective_threshold):
                    dealbreaker_failed = True
                    break
            if dealbreaker_failed:
                break

        if dealbreaker_failed or not member_utils:
            continue

        avg_u = sum(member_utils) / len(member_utils)
        min_u = min(member_utils)
        group_score = (alpha * avg_u) + ((1.0 - alpha) * min_u)

        rr = dict(r)
        rr["_member_utilities"] = member_utils
        rr["_avg_utility"] = avg_u
        rr["_min_utility"] = min_u
        rr["_group_score"] = group_score
        rr["_member_debug"] = per_member
        scored.append(rr)

    scored.sort(key=lambda x: float(x.get("_group_score") or 0.0), reverse=True)
    return scored


def score_single_candidate_by_feature_importance(
    *,
    restaurant: dict[str, Any],
    features: dict[str, dict[str, Any]],
    dealbreaker_threshold: float = 0.67,
) -> tuple[float, dict[str, float], bool]:
    """
    Compute a single-user preference utility in [0,1] for one restaurant.
    Returns (utility, feature_satisfaction, dealbreaker_failed).
    """
    feats = features or {}
    total_w = 0.0
    total = 0.0
    contrib: dict[str, float] = {}

    def add(name: str, sat: float, imp: int | None, dealbreaker_strength: int | None) -> None:
        nonlocal total_w, total
        if imp is None:
            imp = 1
        eff_imp = max(int(imp), int(dealbreaker_strength or 1))
        w = _importance_weight(eff_imp)
        total_w += w
        total += w * float(sat)
        contrib[name] = float(sat)

    pr = feats.get("price_range") or {}
    add(
        "price_range",
        _sat_price(pr.get("value"), restaurant.get("price_range")),
        pr.get("importance"),
        pr.get("dealbreaker_strength"),
    )

    stars = feats.get("stars") or {}
    add(
        "stars",
        _sat_stars(stars.get("value"), restaurant.get("stars")),
        stars.get("importance"),
        stars.get("dealbreaker_strength"),
    )

    for key in ("takeout", "delivery", "table_service", "good_for_groups"):
        pref = feats.get(key) or {}
        add(
            key,
            _sat_bool(pref.get("value"), restaurant.get(key)),
            pref.get("importance"),
            pref.get("dealbreaker_strength"),
        )

    amb = feats.get("ambiance_labels") or {}
    add(
        "ambiance_labels",
        _sat_ambiance(amb.get("value"), restaurant.get("ambiance_labels")),
        amb.get("importance"),
        amb.get("dealbreaker_strength"),
    )

    cats = feats.get("categories") or {}
    add(
        "categories",
        _sat_categories(cats.get("value"), restaurant.get("categories")),
        cats.get("importance"),
        cats.get("dealbreaker_strength"),
    )

    dealbreaker_failed = False
    for fname, fobj in feats.items():
        if not isinstance(fobj, dict):
            continue
        strength = fobj.get("dealbreaker_strength")
        if strength is None and int(fobj.get("importance") or 1) == 5:
            strength = 5
        if strength is None:
            continue
        sat = contrib.get(fname)
        if sat is None:
            continue
        effective_threshold = _dealbreaker_threshold_for_strength(dealbreaker_threshold, int(strength))
        if float(sat) < float(effective_threshold):
            dealbreaker_failed = True
            break

    if total_w <= 0.0:
        return 1.0, contrib, dealbreaker_failed
    utility = max(0.0, min(1.0, total / total_w))
    return utility, contrib, dealbreaker_failed
