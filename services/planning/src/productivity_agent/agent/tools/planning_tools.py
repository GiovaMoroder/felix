from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, time, timedelta, timezone

from sqlalchemy.orm import Session

from productivity_agent.agent.tools.calendar_tools import list_events
from productivity_agent.agent.tools.work_tools import ProjectSnapshot, TaskSnapshot, unscheduled_tasks
from productivity_agent.domain.calendar.entities.calendar_event import CalendarEvent
from productivity_agent.infrastructure.repositories.sqlalchemy_calendar_event_repository import (
    SqlAlchemyCalendarEventRepository,
)


@dataclass(slots=True)
class PlannedBlock:
    task_id: str
    task_name: str
    start: datetime
    end: datetime


def build_schedule_proposal(
    session: Session,
    *,
    project: ProjectSnapshot,
    now: datetime,
    commit: bool = False,
) -> tuple[list[PlannedBlock], str]:
    candidates = unscheduled_tasks(project)[:3]
    if not candidates:
        return [], f"{project.name} has no unscheduled work to place."

    busy_ranges = [(event.start, event.end) for event in list_events(session, start=now, end=now + timedelta(days=21))]
    cursor = _round_up_half_hour(now.astimezone(timezone.utc) + timedelta(hours=1))
    search_limit = now.astimezone(timezone.utc) + timedelta(days=21)

    blocks: list[PlannedBlock] = []
    for task in candidates:
        slot = _find_open_slot(
            cursor=cursor,
            duration_minutes=task.estimate_minutes,
            busy_ranges=busy_ranges + [(block.start, block.end) for block in blocks],
            search_limit=search_limit,
        )
        if slot is None:
            break
        start, end = slot
        blocks.append(PlannedBlock(task_id=task.id, task_name=task.name, start=start, end=end))
        cursor = end + timedelta(minutes=30)

    if not blocks:
        return [], f"I could not find a credible focus window for {project.name} in the next 3 weeks."

    if commit:
        _commit_blocks(session, project=project, blocks=blocks)
        return blocks, f"Scheduled {len(blocks)} block{'s' if len(blocks) != 1 else ''} for {project.name}."

    return blocks, f"Prepared {len(blocks)} block{'s' if len(blocks) != 1 else ''} for {project.name}."


def _commit_blocks(session: Session, *, project: ProjectSnapshot, blocks: list[PlannedBlock]) -> None:
    from productivity_agent.infrastructure.db.models import ProjectRecord, TaskRecord

    repository = SqlAlchemyCalendarEventRepository(session)
    for block in blocks:
        task = session.get(TaskRecord, block.task_id)
        if task is None:
            continue
        event = CalendarEvent.create(
            title=block.task_name,
            start=block.start,
            end=block.end,
            notes=f"Project: {project.name}",
        )
        saved = repository.save(event=event)
        task.status = "scheduled"
        task.scheduled_start = block.start
        task.linked_event_id = saved.id
        task.updated_at = datetime.now(timezone.utc)

    project_record = session.get(ProjectRecord, project.id)
    if project_record is not None:
        project_record.updated_at = datetime.now(timezone.utc)
    session.commit()


def _find_open_slot(
    *,
    cursor: datetime,
    duration_minutes: int,
    busy_ranges: list[tuple[datetime, datetime]],
    search_limit: datetime,
) -> tuple[datetime, datetime] | None:
    candidate = cursor
    duration = timedelta(minutes=duration_minutes)

    while candidate < search_limit:
        candidate = _normalize_business_start(candidate)
        if candidate >= search_limit:
            return None

        end = candidate + duration
        business_end = datetime.combine(candidate.date(), time(hour=18, minute=0), tzinfo=candidate.tzinfo)
        if end > business_end:
            candidate = _next_business_day(candidate)
            continue

        overlap = next(
            (
                (busy_start, busy_end)
                for busy_start, busy_end in busy_ranges
                if candidate < busy_end and end > busy_start
            ),
            None,
        )
        if overlap is None:
            return candidate, end

        candidate = _round_up_half_hour(overlap[1] + timedelta(minutes=15))

    return None


def _normalize_business_start(value: datetime) -> datetime:
    normalized = _round_up_half_hour(value)
    while normalized.weekday() >= 5:
        normalized = _next_business_day(normalized)

    business_start = datetime.combine(normalized.date(), time(hour=9, minute=0), tzinfo=normalized.tzinfo)
    business_end = datetime.combine(normalized.date(), time(hour=18, minute=0), tzinfo=normalized.tzinfo)
    if normalized < business_start:
        return business_start
    if normalized >= business_end:
        return _next_business_day(normalized)
    return normalized


def _next_business_day(value: datetime) -> datetime:
    next_day = value + timedelta(days=1)
    next_day = datetime.combine(next_day.date(), time(hour=9, minute=0), tzinfo=value.tzinfo)
    while next_day.weekday() >= 5:
        next_day = datetime.combine((next_day + timedelta(days=1)).date(), time(hour=9, minute=0), tzinfo=value.tzinfo)
    return next_day


def _round_up_half_hour(value: datetime) -> datetime:
    minute_bucket = 30 if 0 < value.minute <= 30 else 60 if value.minute > 30 else 0
    if minute_bucket == 0:
        rounded = value.replace(minute=0, second=0, microsecond=0)
    elif minute_bucket == 30:
        rounded = value.replace(minute=30, second=0, microsecond=0)
    else:
        rounded = (value + timedelta(hours=1)).replace(minute=0, second=0, microsecond=0)

    if rounded < value.replace(second=0, microsecond=0):
        return rounded + timedelta(minutes=30)
    return rounded
