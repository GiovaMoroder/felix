# Planning Service

This folder contains the Python planning backend for the productivity agent. It is responsible for:

- storing calendar events
- storing work areas, projects, and tasks
- generating schedule proposals
- routing chat-style planning requests to the agent runtime

The service is built with FastAPI and uses SQLite by default for local development.

## What Lives Here

- `src/productivity_agent/main.py` exposes the ASGI app entrypoint
- `src/productivity_agent/bootstrap/app.py` wires the FastAPI app, CORS, health check, and routers
- `src/productivity_agent/interfaces/api/` contains the HTTP routes
- `src/productivity_agent/application/` contains use cases for calendar behavior
- `src/productivity_agent/domain/` contains domain entities and repository interfaces
- `src/productivity_agent/infrastructure/` contains database, repository, and OpenAI integration code
- `src/productivity_agent/agent/` contains the planning-agent runtime, handlers, and tools

## API Surface

The frontend mainly relies on these routes:

- `GET /health` for a simple health check
- `GET|POST|PATCH|DELETE /api/calendar/events` for calendar CRUD
- `GET /api/work/areas` for the work tree
- `POST|PATCH|DELETE /api/work/projects` and related task routes for work management
- `POST /api/work/projects/{project_id}/proposal` for schedule proposal generation and optional commit
- `POST /api/agent/respond` for agent-driven planning and coaching responses

## Local Development

Install dependencies:

```bash
uv sync
```

Create the local environment file:

```bash
cp .env.example .env
```

Initialize the database:

```bash
uv run planning-init-db
```

Start the API server:

```bash
uv run uvicorn productivity_agent.main:app --reload
```

By default, the app listens on `http://127.0.0.1:8000`.

## Environment

Common variables:

- `OPENAI_API_KEY`: required for agent features
- `OPENAI_MODEL`: defaults to `gpt-4.1-mini`
- `OPENAI_BASE_URL`: optional override for OpenAI-compatible endpoints
- `PRODUCTIVITY_AGENT_DB_URL`: optional database override, otherwise the service uses a local SQLite file

## Data and Seeding

- The default local database lives at `services/planning/data/planning.db`
- Schema creation runs on startup
- Local SQLite setup also seeds demo work areas, projects, and tasks when the database is empty

## Notes

- The codebase follows a lightweight DDD split so API, domain rules, and persistence stay separated
- The current schedule proposal flow places a small number of upcoming tasks into open business-hour slots
- CORS is configured for the local frontend at `http://localhost:3000` and `http://127.0.0.1:3000`
