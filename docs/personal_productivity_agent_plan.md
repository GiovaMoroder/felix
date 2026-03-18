# Personal Productivity Agent Plan

## Product Direction

Build a personal productivity system with two tightly connected parts:

- a first-class calendar application with the core interaction model of Google Calendar
- an AI planning layer that helps schedule work, protect focus time, detect conflicts, and translate natural-language instructions into concrete changes

The current HTML prototype is useful as a product sketch, but not as a foundation for implementation. It should inform the information architecture, not the code structure.

## Non-Negotiable Product Requirements

### Calendar Core

The calendar should support the core experience users expect from Google Calendar:

- month, week, and day views
- click or drag on the timeline to create an event
- drag existing events to move them
- drag the bottom edge to change duration
- all-day events
- overlapping events
- recurring events with exceptions
- keyboard shortcuts
- timezone-aware event display
- event details panel or modal
- search and filtering

### AI Productivity Layer

The agent should add value beyond the calendar itself:

- natural-language command bar
- daily planning suggestions
- conflict detection
- deep-work protection
- task-to-calendar time blocking
- rescheduling suggestions when the day changes
- project- and priority-aware recommendations

## Recommended Stack

### Frontend

- `Next.js`
- `React`
- `TypeScript`
- `FullCalendar React`
- `Tailwind CSS` for velocity, with a custom design system layered on top
- `Zustand` or plain React state first; add heavier client state only if needed

### Backend

- `FastAPI`
- `Python 3.11+`
- `Pydantic`
- `SQLAlchemy 2.x`
- `PostgreSQL`
- background worker in Python initially

### Integrations

- Google Calendar API for sync
- Google OAuth for account linking
- optional Supabase for managed Postgres/auth/realtime if you want to move faster

## Architectural Decision

Use a split architecture:

- `frontend/` owns rendering, routing, browser interaction, and calendar UX
- `services/planning/` owns domain logic, use cases, persistence, integrations, and AI workflows

This is the pragmatic design:

- serious calendar interaction belongs in a React app
- planning logic, sync orchestration, and agent behavior fit naturally in Python

Do not try to implement the full UI in Python templates or a Python-only web stack. That would slow down the exact part of the product that is hardest to fake: calendar interaction quality.

## DDD-Oriented Backend Design

The backend should be organized by layer, with bounded contexts inside those layers where appropriate.

### Proposed Repository Shape

```text
.
├── docs/
│   └── personal_productivity_agent_plan.md
├── services/
│   └── planning/
│       ├── pyproject.toml
│       ├── src/
│       │   └── productivity_agent/
│       │       ├── application/
│       │       │   ├── commands/
│       │       │   ├── dto/
│       │       │   ├── queries/
│       │       │   ├── services/
│       │       │   └── use_cases/
│       │       ├── domain/
│       │       │   ├── calendar/
│       │       │   │   ├── aggregates/
│       │       │   │   ├── entities/
│       │       │   │   ├── events/
│       │       │   │   ├── policies/
│       │       │   │   ├── repositories/
│       │       │   │   └── value_objects/
│       │       │   ├── planning/
│       │       │   ├── tasks/
│       │       │   ├── projects/
│       │       │   └── shared/
│       │       ├── infrastructure/
│       │       │   ├── ai/
│       │       │   ├── db/
│       │       │   ├── google/
│       │       │   ├── messaging/
│       │       │   ├── repositories/
│       │       │   └── settings/
│       │       ├── interfaces/
│       │       │   ├── api/
│       │       │   ├── jobs/
│       │       │   └── schemas/
│       │       └── bootstrap/
│       └── tests/
│           ├── application/
│           ├── domain/
│           └── integration/
└── frontend/
    ├── app/
    ├── components/
    ├── features/
    ├── lib/
    ├── styles/
    └── tests/
```

### Layer Responsibilities

#### Domain

Contains pure business concepts and rules:

- entities
- value objects
- aggregates
- domain services
- repository interfaces
- domain events

Examples:

- `CalendarEvent`
- `RecurringRule`
- `TimeRange`
- `FocusPolicy`
- `SchedulingConstraint`
- `TaskPriority`

The domain must not depend on FastAPI, SQLAlchemy, Google APIs, or LLM SDKs.

#### Application

Contains use cases and orchestration:

- create event
- reschedule event
- convert task into calendar block
- ingest Google calendar changes
- generate planning suggestions
- parse natural-language user command

The application layer coordinates domain objects and repository interfaces. It should not contain low-level API code.

#### Infrastructure

Contains implementation details:

- SQLAlchemy models and repositories
- Google Calendar API clients
- OAuth integration
- background jobs
- AI provider adapters
- configuration

#### Interfaces

Contains external entry points:

- FastAPI routes
- webhooks
- scheduled jobs
- serializer/schema models

## Frontend Design Direction

The current prototype feels too much like a generic dark dashboard. The replacement should feel more like a premium personal operating system than an admin panel.

### Design Principles

- calmer and brighter base palette
- stronger typography hierarchy
- fewer visible borders
- more whitespace and rhythm
- assistant UI integrated into the workflow, not bolted on as a chat sidebar
- calendar as the primary canvas, not one card among many

### Suggested Visual Direction

Use a visual system closer to:

- warm off-white background
- graphite text
- muted greens, slate blues, and restrained amber accents
- one serif or expressive display face for headlines, paired with a practical sans-serif for UI
- subtle panel depth instead of heavy card borders

### Information Architecture

Desktop:

- left rail: navigation, mini calendar, saved views
- center: primary calendar canvas
- right context rail: selected event, tasks, suggestions, planner output

Mobile:

- calendar first
- collapsible agenda/details drawer
- AI command entry pinned accessibly but not always expanded

## Core Bounded Contexts

Start with these contexts:

### Calendar

Owns:

- calendars
- events
- recurring rules
- availability
- reminders

### Tasks

Owns:

- tasks
- statuses
- estimates
- due dates
- energy/focus metadata

### Projects

Owns:

- projects
- priorities
- strategic categories
- target allocations

### Planning

Owns:

- scheduling suggestions
- conflict detection
- focus protection
- day planning
- weekly reviews

## Initial Domain Model

### Core Entities

- `User`
- `Calendar`
- `CalendarEvent`
- `Task`
- `Project`
- `PlanningSuggestion`
- `SyncAccount`

### Useful Value Objects

- `EventId`
- `TaskId`
- `ProjectId`
- `CalendarId`
- `TimeRange`
- `Duration`
- `RecurrenceRule`
- `Priority`
- `EventSource`
- `SuggestionType`

### Important Flags

For events:

- internal vs synced
- confirmed vs tentative
- all-day vs timed
- recurring master vs occurrence vs exception
- user-created vs AI-proposed

## Persistence Outline

Use PostgreSQL as the system of record.

Suggested first tables:

- `users`
- `connected_accounts`
- `calendars`
- `events`
- `event_recurrence_rules`
- `event_overrides`
- `tasks`
- `projects`
- `planning_suggestions`
- `sync_cursors`

The application should store its own normalized event model even when syncing with Google Calendar. Do not make Google Calendar the only source of truth for the product.

## API Outline

### Frontend-Facing Endpoints

- `GET /api/calendar/events`
- `POST /api/calendar/events`
- `PATCH /api/calendar/events/{event_id}`
- `DELETE /api/calendar/events/{event_id}`
- `GET /api/tasks`
- `POST /api/tasks`
- `GET /api/planning/suggestions`
- `POST /api/commands/interpret`

### Integration Endpoints

- `GET /api/integrations/google/oauth/start`
- `GET /api/integrations/google/oauth/callback`
- `POST /api/integrations/google/webhooks/calendar`

## AI Capability Plan

Do not start with a fully autonomous agent. Start with high-value, tightly scoped assistance.

### Phase 1 AI Features

- parse commands like "move tomorrow's doctor appointment to 11"
- suggest focus blocks from unscheduled tasks
- flag conflicts and impossible plans
- generate a daily brief

### Phase 2 AI Features

- auto-propose week plans from project priorities
- learn preferred working hours and meeting patterns
- suggest what to defer when overload is detected

### Phase 3 AI Features

- semi-autonomous planning loops with confirmation gates
- recurring routines and review generation

## Delivery Phases

### Phase 0: Foundations

Goal: prove the architecture and interaction model.

Deliver:

- `frontend/` Next.js app scaffold
- `services/planning/` FastAPI scaffold
- local dockerized Postgres or managed Postgres
- authentication decision
- event schema draft
- basic design system tokens

Exit criteria:

- frontend can load
- backend can serve health + stub API
- database connection works

### Phase 1: Calendar Core

Goal: ship the non-negotiable calendar UX.

Deliver:

- month/week/day calendar views
- event CRUD
- click-to-create
- drag-to-move
- drag-to-resize
- event details drawer/modal
- timezone-aware rendering

Exit criteria:

- user can manage events entirely inside the app
- interaction quality feels close to a real calendar, not a prototype

### Phase 2: Tasks and Projects

Goal: connect planning inputs to the calendar.

Deliver:

- task CRUD
- project CRUD
- task metadata for estimate/priority/energy
- convert task into time block
- side panel showing tasks relevant to the selected day

Exit criteria:

- user can schedule real work, not just meetings

### Phase 3: Google Calendar Sync

Goal: integrate without surrendering product control.

Deliver:

- Google OAuth
- one-way import first
- then two-way sync
- webhook or polling-based refresh
- sync conflict handling

Exit criteria:

- external events appear reliably
- user can trust synced state

### Phase 4: AI Planning Assistant

Goal: make the product meaningfully smarter.

Deliver:

- command bar
- command interpretation endpoint
- planning suggestions
- conflict explanations
- one-click apply for suggestions

Exit criteria:

- AI saves time in common workflows
- suggestions are inspectable and reversible

## First Sprint Recommendation

The first sprint should not attempt Google sync or full AI.

### Sprint Goal

Build a vertical slice where a user can open the app, see a real calendar, create/edit/move/resize events, and persist them through the backend.

### Sprint Scope

#### Frontend

- scaffold `frontend/` with Next.js and TypeScript
- install and configure FullCalendar
- implement month, week, and day views
- event fetch + create + update + delete
- basic event editor drawer
- replace the current visual style with a cleaner design direction

#### Backend

- scaffold `services/planning/`
- add DDD package structure
- define `CalendarEvent` aggregate and supporting value objects
- implement repository interfaces
- add SQLAlchemy persistence
- add FastAPI endpoints for event CRUD

#### Data

- create first migration for calendars and events

### Sprint Exit Criteria

- event creation from calendar interaction works
- event move and resize persist correctly
- page refresh preserves state
- code structure does not mix domain logic with framework code

## Concrete Folder Conventions

### Backend Naming

Use:

- `domain/<context>/entities`
- `domain/<context>/value_objects`
- `domain/<context>/repositories`
- `application/use_cases`
- `infrastructure/repositories`
- `interfaces/api`

Avoid:

- putting SQLAlchemy models in `domain`
- putting route handlers in `application`
- putting LLM prompt logic directly in controllers

### Frontend Naming

Group by feature, not by file type alone.

Example:

```text
frontend/
├── app/
├── features/
│   ├── calendar/
│   │   ├── api/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── lib/
│   │   └── types/
│   ├── tasks/
│   └── planning/
├── components/
│   └── ui/
└── lib/
```

## Risks and Decisions to Lock Early

These decisions should be made before implementation gets deep:

- auth provider
- managed vs self-hosted Postgres
- whether to use Supabase Realtime or poll first
- whether natural-language commands execute immediately or always produce reviewable suggestions
- whether Google sync is one-way first or bidirectional from day one

My recommendation:

- use reviewable suggestions first, not silent autonomous execution
- start with one-way Google import before two-way sync
- keep the backend as the canonical planning system

## What Not To Build Yet

Do not start with:

- autonomous multi-step agents
- voice UI
- complex collaboration features
- custom drag-and-drop calendar from scratch
- heavy microservice decomposition

Those are all distractions before the calendar core is excellent.

## Immediate Next Build Step

Start by creating:

1. `frontend/` Next.js app
2. `services/planning/` FastAPI app
3. first event domain model and CRUD slice
4. a design system pass for the shell and calendar frame

Once that exists, the rest of the roadmap becomes much easier to execute safely.
