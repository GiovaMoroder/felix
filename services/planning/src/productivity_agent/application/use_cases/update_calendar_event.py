from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from productivity_agent.domain.calendar.entities.calendar_event import CalendarEvent
from productivity_agent.domain.calendar.repositories.calendar_event_repository import (
    CalendarEventRepository,
)


@dataclass(slots=True)
class UpdateCalendarEvent:
    repository: CalendarEventRepository

    def execute(
        self,
        *,
        event_id: str,
        title: str | None = None,
        start: datetime | None = None,
        end: datetime | None = None,
        notes: str | None = None,
        all_day: bool | None = None,
    ) -> CalendarEvent:
        event = self.repository.get(event_id=event_id)
        if event is None:
            raise LookupError(f"Unknown event: {event_id}")

        updated = event
        if title is not None:
            updated = updated.rename(title=title)
        if start is not None and end is not None:
            updated = updated.reschedule(start=start, end=end)
        if notes is not None:
            updated = updated.rewrite_notes(notes=notes)
        if all_day is not None:
            updated = updated.mark_all_day(all_day=all_day)

        return self.repository.save(event=updated)
