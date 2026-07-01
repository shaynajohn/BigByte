# BigByte

BigByte is a **session-based group food recommender** for San Francisco. Create a code, friends join from their phones, everyone answers a short questionnaire, and the app returns three ranked picks to vote on — no accounts, no saved history.

Built for **spontaneous in-the-moment decisions** (standing outside, deciding where to eat tonight), not long-term restaurant discovery.

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React + Vite, hash routing, PWA |
| Backend | FastAPI, in-memory session groups |
| Recommender | Feature-importance scoring + fairness objective |
| Routing | OpenRouteService (walking/driving matrix) |
| Deploy | Docker on Render (single URL serves API + UI) |

## How it works

```text
Create group → share join code → each member: questionnaire (~2 min)
      → recommender scores SF catalog → top 3 → live vote → final pick
```

### Product choices (intentional)

| Choice | Why |
|--------|-----|
| **In-memory sessions** | Zero signup, privacy-friendly, built for "right now" |
| **Short questionnaire** | High-signal questions only (commute, cuisine, budget, plan, vibe) |
| **Top 3 + vote** | Avoids analysis paralysis; group converges fast |
| **Commute cap + fallback** | Respects max walk/drive time; fills with closest matches when strict pool is small |

### Recommender (the interesting part)

Each member submits features with **importance sliders** and optional **dealbreaker strength**. For every restaurant, BigByte computes per-member utility in `[0, 1]`, then ranks by a **fairness-aware group score**:

```text
G = α · avg(member utilities) + (1 − α) · min(member utilities)
```

- **Cuisine matching** uses curated synonym maps (e.g. "Indian" → Curry, Dosa, South Indian).
- **Commute** uses OpenRouteService route times when configured; candidates are pre-filtered geographically to limit API calls.
- **Dealbreakers** (strength ≥ 4) filter strictly; softer preferences affect rank only.

See `backend/recommender_rules.py` and `backend/tests/test_recommender_rules.py`.

### Evaluation (synthetic group profiles)

BigByte includes an offline eval harness that runs **11 synthetic San Francisco group profiles** through the full recommendation pipeline (no live API key required — commute uses estimated routes).

```bash
python -m backend.eval.run_eval
```

**Latest baseline** (catalog + scoring as of this repo):

| Metric | Result |
|--------|--------|
| Full top-3 rate | 100% (11/11 profiles return 3 picks) |
| Cuisine hit rate | 100% (top-3 slots match requested cuisine when specified) |
| Commute cap rate | 92% (top-3 slots within all members' max walk/drive time) |
| Dealbreaker-clean rate | 100% (no relaxed-dealbreaker fallback in top-3) |
| Mean top-1 min utility | 0.92 |

Profiles cover Indian/Mexican/Japanese matching, mixed-cuisine groups, budget clash fairness, dine-in dealbreakers, delivery-only, and wide-area driving commutes. See `backend/eval/profiles.py`.

CI runs this eval on every push and fails if metrics drop below configured thresholds.

### Real-time group sync

Groups expose a **Server-Sent Events** stream at `/api/groups/{id}/stream`. Clients receive live updates when:

- Members join
- Questionnaire answers are submitted (progress: "2 of 4 ready")
- Votes change
- A final winner is locked

No polling on the results page — phones update together.

## Run locally

Backend:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r requirements.txt
cd ..
export OPENROUTESERVICE_API_KEY="your_openrouteservice_key"  # optional; live walk/drive times
python3 -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`

### Tests

```bash
pip install -r backend/requirements.txt
pytest -q
python -m backend.eval.run_eval
```

CI runs backend tests, the eval harness, and frontend lint/build on push (`.github/workflows/ci.yml`).

## Deploy

Single Docker service: FastAPI serves the built React app from `frontend/dist`.

**Render:**

1. Push to GitHub.
2. **New → Blueprint** → select this repo.
3. Add `OPENROUTESERVICE_API_KEY` in Render env vars.
4. Render reads `render.yaml` and deploys.

On mobile: open the Render URL → **Add to Home Screen** for an app-like experience.

**Note:** Groups live in server memory. Restart/redeploy clears active sessions — by design for ephemeral use.

## Demo video

https://canva.link/3lx95wur0pj4dos

To regenerate locally, see [DEMO.md](./DEMO.md) — `cd e2e && npm run record-demo` → `demo/bigbyte-demo.webm`. The same doc has a manual 60-second shot list for phone/screen recording.

## Main files

| File | Purpose |
|------|---------|
| `backend/main.py` | API, group sessions, SSE stream, commute routing |
| `backend/recommender_rules.py` | Scoring, dealbreakers, fairness |
| `backend/eval/run_eval.py` | Synthetic profile evaluation harness |
| `backend/demo_catalog.py` | Curated SF food catalog |
| `frontend/src/LandingPage.jsx` | Create/join entry |
| `frontend/src/RecommendationsPage.jsx` | Results, live voting, winner |
| `frontend/src/groupEvents.js` | SSE client hook |

## Resume one-liner

> Built BigByte, an ephemeral group decision app that fuses multi-user food preferences with commute-aware routing, real-time SSE voting, and a validated fairness-weighted recommender — deployed as a mobile PWA on Render.
