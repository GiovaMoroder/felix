from __future__ import annotations

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from productivity_agent.domain.calendar.entities.calendar_event import CalendarEvent
from productivity_agent.domain.calendar.value_objects.time_range import TimeRange
from productivity_agent.infrastructure.db.models import EventRecord


class SqlAlchemyCalendarEventRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def list_between(self, *, start: datetime, end: datetime) -> list[CalendarEvent]:
        statement = (
            select(EventRecord)
            .where(EventRecord.end_at >= start.isoformat())
            .where(EventRecord.start_at <= end.isoformat())
            .order_by(EventRecord.start_at.asc())
        )
        rows = self.session.execute(statement).scalars().all()
        return [self._to_domain(row) for row in rows]

    def get(self, *, event_id: str) -> CalendarEvent | None:
        row = self.session.get(EventRecord, event_id)
        return self._to_domain(row) if row else None

    def save(self, *, event: CalendarEvent) -> CalendarEvent:
        row = self.session.get(EventRecord, event.id)
        if row is None:
            row = EventRecord(
                id=event.id,
                title=event.title,
                start_at="",
                end_at="",
                all_day=event.all_day,
            )

        row.title = event.title
        row.start_at = event.time_range.start.isoformat()
        row.end_at = event.time_range.end.isoformat()
        row.notes = event.notes
        row.all_day = event.all_day

        self.session.add(row)
        self.session.commit()
        return self._to_domain(row)

    def delete(self, *, event_id: str) -> bool:
        row = self.session.get(EventRecord, event_id)
        if row is None:
            return False

        self.session.delete(row)
        self.session.commit()
        return True

    def _to_domain(self, row: EventRecord) -> CalendarEvent:
        return CalendarEvent(
            id=row.id,
            title=row.title,
            time_range=TimeRange(
                start=datetime.fromisoformat(row.start_at),
                end=datetime.fromisoformat(row.end_at),
            ),
            notes=row.notes,
            all_day=row.all_day,
        )
