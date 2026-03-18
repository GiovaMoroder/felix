from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from productivity_agent.domain.calendar.entities.calendar_event import CalendarEvent
from productivity_agent.domain.calendar.repositories.calendar_event_repository import (
    CalendarEventRepository,
)


@dataclass(slots=True)
class CreateCalendarEvent:
    repository: CalendarEventRepository

    def execute(
        self,
        *,
        title: str,
        start: datetime,
        end: datetime,
        notes: str | None = None,
        all_day: bool = False,
    ) -> CalendarEvent:
        event = CalendarEvent.create(
            title=title,
            start=start,
            end=end,
            notes=notes,
            all_day=all_day,
        )
        return self.repository.save(event=event)
