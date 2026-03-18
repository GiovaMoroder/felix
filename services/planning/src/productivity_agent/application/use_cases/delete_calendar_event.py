from __future__ import annotations

from dataclasses import dataclass

from productivity_agent.domain.calendar.repositories.calendar_event_repository import (
    CalendarEventRepository,
)


@dataclass(slots=True)
class DeleteCalendarEvent:
    repository: CalendarEventRepository

    def execute(self, *, event_id: str) -> bool:
        return self.repository.delete(event_id=event_id)
