# Frontend

This folder contains the Next.js frontend for the productivity agent. It is the UI layer that lets you:

- view and edit calendar events
- manage work areas, projects, and tasks
- ask the planning agent for scheduling and coaching help

The frontend talks to the planning service over HTTP and assumes the backend exposes its API under `/api`.

## What Lives Here

- `app/` contains the Next.js app entrypoints and global layout
- `features/calendar/components/calendar-shell.tsx` contains the main application shell and most of the interactive UI
- `features/calendar/lib/calendar-api.ts` wraps calendar API calls
- `features/calendar/lib/work-api.ts` wraps work-planning and agent API calls

## Main Screens

- `Calendar` shows a real calendar built with FullCalendar and supports create, edit, drag, resize, and delete flows for events
- `Work` shows areas, projects, and tasks, plus lightweight planning actions like task breakdown and schedule proposals
- `Jarvis` is the chat-style interface for talking to the planning agent

## Local Development

Install dependencies and start the dev server:

```bash
npm install
npm run dev
```

By default, the app runs on `http://localhost:3000`.

## Environment

The frontend reads one optional environment variable:

- `NEXT_PUBLIC_PLANNING_API_URL`: base URL for the planning API. Defaults to `http://127.0.0.1:8000/api`

If you change the backend host or port, set this before starting the frontend.

## Notes

- The current UI is intentionally concentrated in a single shell component so product flows can evolve quickly
- The backend owns the source of truth for events, projects, tasks, and agent responses
- If the planning service is not running, the frontend will still render, but data-loading and mutation actions will fail
