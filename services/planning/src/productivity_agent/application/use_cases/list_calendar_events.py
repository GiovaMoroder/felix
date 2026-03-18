from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from productivity_agent.domain.calendar.entities.calendar_event import CalendarEvent
from productivity_agent.domain.calendar.repositories.calendar_event_repository import (
    CalendarEventRepository,
)


@dataclass(slots=True)
class ListCalendarEvents:
    repository: CalendarEventRepository

    def execute(self, *, start: datetime, end: datetime) -> list[CalendarEvent]:
        return self.repository.list_between(start=start, end=end)
