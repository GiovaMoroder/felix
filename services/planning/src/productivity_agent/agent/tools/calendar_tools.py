from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone


def _parse_dt(value: str) -> datetime:
    dt = datetime.fromisoformat(value)
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)

from sqlalchemy import select
from sqlalchemy.orm import Session

from productivity_agent.infrastructure.db.models import EventRecord


@dataclass(slots=True)
class CalendarEventSnapshot:
    id: str
    title: str
    start: datetime
    end: datetime
    all_day: bool
    notes: str | None


def list_events(
    session: Session,
    *,
    start: datetime | None = None,
    end: datetime | None = None,
) -> list[CalendarEventSnapshot]:
    window_start = start or datetime.now(timezone.utc) - timedelta(days=1)
    window_end = end or datetime.now(timezone.utc) + timedelta(days=7)
    records = session.execute(select(EventRecord).order_by(EventRecord.start_at.asc())).scalars().all()
    events = [_to_snapshot(record) for record in records]
    return [event for event in events if event.start < window_end and event.end > window_start]


def summarize_upcoming(events: list[CalendarEventSnapshot], *, limit: int = 5) -> str:
    if not events:
        return "The calendar is open."

    visible = events[:limit]
    fragments = [f"{event.title} at {event.start.astimezone(timezone.utc).strftime('%a %H:%M UTC')}" for event in visible]
    if len(events) > limit:
        fragments.append(f"+{len(events) - limit} more")
    return ", ".join(fragments)


def _to_snapshot(record: EventRecord) -> CalendarEventSnapshot:
    return CalendarEventSnapshot(
        id=record.id,
        title=record.title,
        start=_parse_dt(record.start_at),
        end=_parse_dt(record.end_at),
        all_day=record.all_day,
        notes=record.notes,
    )
