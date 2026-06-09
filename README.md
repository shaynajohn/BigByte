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
