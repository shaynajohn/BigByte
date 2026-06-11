# BigByte

BigByte is a San Francisco group food recommender.

This version is intentionally independent from the original class-project Supabase setup. It uses:

- React + Vite frontend
- FastAPI backend
- A curated San Francisco demo food catalog
- In-memory group/session state only

Nothing is permanently saved. If the backend restarts, temporary groups and answers are cleared.

## Run Locally

Backend:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r requirements.txt
cd ..
export OPENROUTESERVICE_API_KEY="your_openrouteservice_key"  # optional locally; enables live walking/driving route times
python3 -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Open:

```text
http://localhost:5173
```

## Deploy

This repo is configured to deploy as one Docker web service. The FastAPI backend serves
the built React app from `frontend/dist`, so the deployed app has one public URL that
works on desktop and mobile browsers.

Render:

1. Push this repo to GitHub.
2. In Render, choose **New** → **Blueprint** and select this repository.
3. Add `OPENROUTESERVICE_API_KEY` as a Render environment variable to enable live walking/driving route times.
4. Render will read `render.yaml`, build the Docker image, and run:

```bash
uvicorn backend.main:app --host 0.0.0.0 --port $PORT
```

After deploy, open the Render URL on your phone. Use **Share** → **Add to Home Screen**
on iPhone, or **Install app** / **Add to Home screen** on Android.

Note: groups are currently stored in backend memory. Restarting or redeploying the server
clears active groups.

## Data Behavior

- No Supabase required.
- No SQLite database required.
- Group data is held in backend memory.
- Group membership and submitted answers are held in backend memory while the server is running.

## Main Files

- `backend/main.py`: FastAPI API and temporary group endpoints
- `backend/demo_catalog.py`: San Francisco food catalog
- `backend/recommender_rules.py`: ranking/scoring logic
- `frontend/src/`: React app UI
