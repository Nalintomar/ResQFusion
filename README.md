# ResQFusion — Multi-Source Disaster Response Coordination System

A working implementation of the synopsis project *"Multi-Source Disaster Response Coordination
System using Heterogeneous Data Aggregation and Predictive Resource Allocation"* (ABESEC Ghaziabad,
CSE, Session 2026-27).

It ingests weather, simulated IoT sensor, and social/citizen-report data; fuses it into one schema;
predicts flood risk and detects distress signals with two trained ML models; allocates shelters,
ambulances, volunteers and relief material with a greedy nearest-need-first optimizer; and shows all
of it on a coordinator dashboard and a citizen reporting portal.

## Architecture

```
                 ┌────────────────────┐        ┌──────────────────────┐
 OpenWeatherMap  │                    │        │                      │
 (or simulator)  │   Node/Express     │ REST   │   Flask ML service   │
 ───────────────▶│   backend          │───────▶│   (scikit-learn)     │
 Simulated IoT   │                    │◀───────│                      │
 sensors         │  ingestion→fusion  │        │  risk model (RF)     │
 ───────────────▶│  →allocation→      │        │  NLP + DBSCAN        │
 X API / citizen │   alerts pipeline  │        │  hotspot clustering  │
 & social feed   │                    │        └──────────────────────┘
 ───────────────▶│  MongoDB (docs)    │
                 │  PostgreSQL (sql)  │        ┌──────────────────────┐
                 │  (in-memory        │  REST  │   React dashboard    │
                 │   fallback if no   │◀──────▶│   + citizen portal   │
                 │   DB configured)   │        └──────────────────────┘
                 └────────────────────┘
```

| Directory      | What it is                                                             |
|-----------------|-------------------------------------------------------------------------|
| `ml-service/`  | Flask microservice: risk-prediction model + NLP distress/hotspot model |
| `backend/`     | Node/Express API: ingestion, fusion, allocation engine, auth, alerts   |
| `frontend/`    | React (Vite) coordinator dashboard + citizen portal                    |
| `docker-compose.yml` | Runs everything together with MongoDB + PostgreSQL                |

## Quick start (recommended: Docker)

```bash
docker compose up --build
```

- Coordinator dashboard: http://localhost:8080 (switch to "Coordinator" in the top bar)
- Backend API: http://localhost:4000
- ML service: http://localhost:5001

Demo accounts (seeded automatically):

| Role     | Email                    | Password     |
|----------|--------------------------|--------------|
| Admin    | admin@resqfusion.in      | Admin@123    |
| Relief   | relief@resqfusion.in     | Relief@123   |
| Citizen  | citizen@resqfusion.in    | Citizen@123  |

## Quick start (without Docker)

Needs Python 3.10+ and Node 18+. Every real-world dependency (live weather API, live social API,
MongoDB, PostgreSQL) is **optional** — the system falls back to realistic simulators and in-memory
stores automatically, so it runs out of the box.

```bash
# 1. ML service
cd ml-service
pip install -r requirements.txt --break-system-packages   # or use a virtualenv
python risk_model.py && python nlp.py                      # trains + saves both models
python app.py                                               # http://localhost:5001

# 2. Backend (new terminal)
cd backend
cp .env.example .env
npm install
npm start                                                    # http://localhost:4000

# 3. Frontend (new terminal)
cd frontend
npm install
npm run dev                                                  # http://localhost:5173
```

Open http://localhost:5173, switch to **Coordinator**, and sign in with `admin@resqfusion.in` /
`Admin@123`. The pipeline runs automatically every `INGEST_INTERVAL_MS` (default 5 s for the demo;
set it to something like 300000 for a realistic 5-minute cycle — see `backend/.env.example`).

## Connecting real data sources

- **Weather**: set `OPENWEATHER_API_KEY` in `backend/.env`.
- **Social media**: set `X_BEARER_TOKEN` (X/Twitter API v2 recent-search).
- **MongoDB**: set `MONGO_URI` (e.g. an Atlas connection string).
- **PostgreSQL**: set `DATABASE_URL`.
- **Historical training data**: drop a CSV with the columns listed in
  `ml-service/data_gen.py` (`FEATURES` + `severity`) at `ml-service/data/historical_floods.csv`
  and re-run `python risk_model.py` — real data.gov.in / IMD records slot in directly.

Leave any of these unset and the corresponding simulator/in-memory store is used instead — nothing
breaks.

## Running the tests

```bash
cd ml-service && python -m pytest -q          # 6 tests: risk model, NLP, clustering, API
cd backend     && npm test                     # 16 tests: fusion, allocation, auth, API
cd frontend    && npm run build                # verifies the UI compiles
```

## Objective → implementation map

| Synopsis objective                                      | Where it lives                                             |
|-----------------------------------------------------------|--------------------------------------------------------------|
| 1. Cloud platform aggregating heterogeneous sources        | `backend/src/ingestion/*`, `backend/src/services/pipeline.js` |
| 2. Fusion/preprocessing engine, unified schema              | `backend/src/fusion/normalize.js`                            |
| 3. ML risk-prediction module                                 | `ml-service/risk_model.py` (Random Forest vs. Logistic Regression vs. threshold baseline) |
| 4. NLP distress detection + geographic clustering           | `ml-service/nlp.py` (TF-IDF+LogReg classifier, DBSCAN hotspots) |
| 5. Resource allocation engine                                | `backend/src/services/allocation.js` (greedy nearest-need-first + LP upper bound) |
| 6. Coordinator dashboard                                     | `frontend/src/pages/CoordinatorDashboard.jsx`                |
| 7. Citizen-facing reporting + alerts module                  | `frontend/src/pages/CitizenPortal.jsx`, `backend/src/routes/citizen.js` |
| 8. Evaluation against baseline                                | `ml-service/models/risk_metrics.json`, `nlp_metrics.json`; `GET /api/dashboard/ml-metrics` |

## Notes on the prototype's honesty

- The historical training set (`ml-service/data_gen.py`) is **synthetic but physically motivated**
  (rainfall → soil saturation → river level → severity), documented as such, and designed to be
  swapped for real data.gov.in/IMD records without any code changes.
- The NLP model is evaluated on a **hand-written held-out set** whose wording doesn't appear in the
  training templates, specifically so the reported accuracy isn't inflated by template leakage.
- The allocation engine is the greedy heuristic the synopsis names; `lpUpperBoundCoverage()` in
  `allocation.js` gives a linear-programming-style bound so a report can quote how far the heuristic
  is from theoretical best coverage — a starting point for the "future scope: LP-based optimization"
  named in the synopsis.
