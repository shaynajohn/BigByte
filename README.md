# BigByte

BigByte is a San Francisco Bay Area group restaurant recommender.

This version is intentionally independent from the original class-project Supabase setup. It uses:

- React + Vite frontend
- FastAPI backend
- A curated Bay Area demo restaurant catalog
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
- Browser refresh may clear frontend-only state until the live group API is fully wired through the UI.

## Main Files

- `backend/main.py`: FastAPI API and temporary group endpoints
- `backend/demo_catalog.py`: Bay Area restaurant catalog
- `backend/recommender_rules.py`: ranking/scoring logic
- `frontend/src/`: React app UI
