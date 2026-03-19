from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from productivity_agent.agent.tools.calendar_tools import list_events, summarize_upcoming
from productivity_agent.agent.tools.planning_tools import build_schedule_proposal
from productivity_agent.agent.tools.work_tools import (
    get_project,
    list_projects,
    neglected_projects,
    project_assessment,
    top_projects,
)
from productivity_agent.application.use_cases.create_calendar_event import CreateCalendarEvent
from productivity_agent.application.use_cases.delete_calendar_event import DeleteCalendarEvent
from productivity_agent.application.use_cases.update_calendar_event import UpdateCalendarEvent
from productivity_agent.infrastructure.db.models import ProjectRecord, TaskRecord
from productivity_agent.infrastructure.repositories.sqlalchemy_calendar_event_repository import (
    SqlAlchemyCalendarEventRepository,
)


def build_calendar_tools(session: Session) -> list:
    repository = SqlAlchemyCalendarEventRepository(session)

    def list_calendar_events(days_ahead: int = 7) -> str:
        """List upcoming events in the next number of days."""

        now = datetime.now(timezone.utc)
        events = list_events(session, start=now - timedelta(hours=2), end=now + timedelta(days=days_ahead))
        return summarize_upcoming(events, limit=8)

    def create_event(
        title: str,
        start_iso: str,
        end_iso: str,
        notes: str | None = None,
        all_day: bool = False,
    ) -> str:
        """Create a calendar event. Datetimes must be ISO-8601 strings."""

        use_case = CreateCalendarEvent(repository=repository)
        event = use_case.execute(
            title=title,
            start=datetime.fromisoformat(start_iso),
            end=datetime.fromisoformat(end_iso),
            notes=notes,
            all_day=all_day,
        )
        return f"Created event {event.title} ({event.id}) from {event.time_range.start.isoformat()} to {event.time_range.end.isoformat()}."

    def update_event(
        event_id: str,
        title: str | None = None,
        start_iso: str | None = None,
        end_iso: str | None = None,
        notes: str | None = None,
        all_day: bool | None = None,
    ) -> str:
        """Update an existing event by id. If rescheduling, provide both start_iso and end_iso."""

        use_case = UpdateCalendarEvent(repository=repository)
        event = use_case.execute(
            event_id=event_id,
            title=title,
            start=datetime.fromisoformat(start_iso) if start_iso else None,
            end=datetime.fromisoformat(end_iso) if end_iso else None,
            notes=notes,
            all_day=all_day,
        )
        return f"Updated event {event.title} ({event.id})."

    def delete_event(event_id: str) -> str:
        """Delete a calendar event by id."""

        use_case = DeleteCalendarEvent(repository=repository)
        deleted = use_case.execute(event_id=event_id)
        return "Deleted event." if deleted else f"Event {event_id} was not found."

    def get_free_windows(days_ahead: int = 7, duration_minutes: int = 60) -> str:
        """Find open windows in business hours for the next number of days."""

        now = datetime.now(timezone.utc)
        events = list_events(session, start=now, end=now + timedelta(days=days_ahead))
        busy_ranges = [(event.start, event.end) for event in events]
        slots: list[str] = []
        cursor = now.replace(minute=0, second=0, microsecond=0)
        search_limit = now + timedelta(days=days_ahead)
        duration = timedelta(minutes=duration_minutes)

        while cursor < search_limit and len(slots) < 5:
            day_start = cursor.replace(hour=9, minute=0, second=0, microsecond=0)
            day_end = cursor.replace(hour=18, minute=0, second=0, microsecond=0)
            candidate = max(cursor, day_start)
            while candidate + duration <= day_end and len(slots) < 5:
                overlap = next(
                    (span for span in busy_ranges if candidate < span[1] and candidate + duration > span[0]),
                    None,
                )
                if overlap is None:
                    slots.append(f"{candidate.isoformat()} to {(candidate + duration).isoformat()}")
                    candidate += duration + timedelta(minutes=30)
                else:
                    candidate = overlap[1] + timedelta(minutes=15)
            cursor = (day_start + timedelta(days=1)).replace(hour=9)

        return "Open windows: " + ", ".join(slots) if slots else "No open windows found."

    return [list_calendar_events, create_event, update_event, delete_event, get_free_windows]


def build_planning_tools(session: Session) -> list:
    def list_work_projects() -> str:
        """List the most relevant work projects and their unscheduled task counts."""

        projects = top_projects(list_projects(session), limit=6)
        lines = []
        for project in projects:
            unscheduled = len([task for task in project.tasks if task.status in {"todo", "overdue"}])
            lines.append(f"{project.id}: {project.name} ({project.priority}, {project.status}) - {unscheduled} unscheduled tasks")
        return "\n".join(lines) if lines else "No projects found."

    def inspect_project(project_id: str) -> str:
        """Inspect one project by id."""

        project = get_project(session, project_id)
        if project is None:
            return f"Unknown project: {project_id}"
        tasks = ", ".join(f"{task.name} [{task.status}]" for task in project.tasks) or "no tasks"
        return f"{project.name} in {project.area_name}, priority {project.priority}, status {project.status}. Tasks: {tasks}"

    def build_project_schedule(project_id: str, commit: bool = False) -> str:
        """Build or commit a schedule proposal for a project. Set commit=True only for explicit user-approved scheduling."""

        project = get_project(session, project_id)
        if project is None:
            return f"Unknown project: {project_id}"
        blocks, summary = build_schedule_proposal(
            session,
            project=project,
            now=datetime.now(timezone.utc),
            commit=commit,
        )
        if not blocks:
            return summary
        lines = [summary]
        for block in blocks:
            lines.append(f"{block.task_name}: {block.start.isoformat()} -> {block.end.isoformat()}")
        return "\n".join(lines)

    def break_down_project_task(task_id: str) -> str:
        """Split a task into two smaller tasks by id."""

        task = session.get(TaskRecord, task_id)
        if task is None:
            return f"Unknown task: {task_id}"

        first_minutes = max(15, task.estimate_minutes // 2)
        second_minutes = max(15, task.estimate_minutes - first_minutes)
        base_name = task.name.replace(" (Part 1)", "").replace(" (Part 2)", "")
        task.name = f"{base_name} (Part 1)"
        task.estimate_minutes = first_minutes
        task.status = "todo"
        task.linked_event_id = None
        task.scheduled_start = None
        task.completed_at = None

        follow_up = TaskRecord(
            id=f"{task.id}-part-2",
            project_id=task.project_id,
            name=f"{base_name} (Part 2)",
            estimate_minutes=second_minutes,
            status="todo",
        )
        session.add(follow_up)
        session.commit()
        return f"Split {base_name} into two tasks of {first_minutes} and {second_minutes} minutes."

    return [list_work_projects, inspect_project, build_project_schedule, break_down_project_task]


def build_coaching_tools(session: Session) -> list:
    def assess_priorities() -> str:
        """Assess priorities across projects."""

        now = datetime.now(timezone.utc)
        projects = list_projects(session)
        selected = top_projects(projects, limit=5)
        lines = [f"{project.name}: {project_assessment(project, now=now)}" for project in selected]
        return "\n".join(lines) if lines else "No projects found."

    def find_neglected_projects() -> str:
        """Find projects that are neglected or overdue."""

        now = datetime.now(timezone.utc)
        projects = neglected_projects(list_projects(session), now=now)
        if not projects:
            return "No neglected projects right now."
        return "\n".join(f"{project.id}: {project.name}" for project in projects)

    def park_project(project_id: str) -> str:
        """Mark a project as parked by id."""

        project = session.get(ProjectRecord, project_id)
        if project is None:
            return f"Unknown project: {project_id}"
        project.status = "parked"
        session.commit()
        return f"Parked {project.name}."

    def raise_project_priority(project_id: str, priority: str) -> str:
        """Update project priority. Priority must be high, medium, or low."""

        project = session.get(ProjectRecord, project_id)
        if project is None:
            return f"Unknown project: {project_id}"
        project.priority = priority
        session.commit()
        return f"Set {project.name} priority to {priority}."

    return [assess_priorities, find_neglected_projects, park_project, raise_project_priority]
