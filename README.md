# Personal Productivity Agent

This repository now has a clean split:

- [frontend](/Users/fabri/Documents/GitHub/mm/frontend) for the React/Next.js application
- [services/planning](/Users/fabri/Documents/GitHub/mm/services/planning) for the Python planning backend
- [docs/personal_productivity_agent_plan.md](/Users/fabri/Documents/GitHub/mm/docs/personal_productivity_agent_plan.md) for the implementation roadmap
- [old_stuff_](/Users/fabri/Documents/GitHub/mm/old_stuff_) for the moved legacy market-making code

## Current Scope

The scaffold is intentionally minimal:

- a frontend shell centered around a real calendar component
- a DDD-style backend with one `CalendarEvent` vertical slice
- a SQLite-backed repository for local development simplicity

## Layout

```text
.
├── docs/
├── frontend/
├── old_stuff_/
└── services/
    └── planning/
```

## Local Development

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Backend:

```bash
cd services/planning
uv sync
uv run planning-init-db
uv run uvicorn productivity_agent.main:app --reload
```

## Notes

- The backend keeps DDD boundaries, but stays lean for now.
- Persistence is SQLite first to reduce setup friction.
- The local database lives at [services/planning/data/planning.db](/Users/fabri/Documents/GitHub/mm/services/planning/data/planning.db) by default.
- You can override the database URL with `PRODUCTIVITY_AGENT_DB_URL`.
- The frontend expects the planning API at `http://127.0.0.1:8000/api` by default.
- You can override the frontend API target with `NEXT_PUBLIC_PLANNING_API_URL`.
