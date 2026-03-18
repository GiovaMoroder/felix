from __future__ import annotations

from datetime import datetime
from typing import Protocol

from productivity_agent.domain.calendar.entities.calendar_event import CalendarEvent


class CalendarEventRepository(Protocol):
    def list_between(self, *, start: datetime, end: datetime) -> list[CalendarEvent]:
        ...

    def get(self, *, event_id: str) -> CalendarEvent | None:
        ...

    def save(self, *, event: CalendarEvent) -> CalendarEvent:
        ...

    def delete(self, *, event_id: str) -> bool:
        ...
