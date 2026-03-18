from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import datetime
from uuid import uuid4

from productivity_agent.domain.calendar.value_objects.time_range import TimeRange


@dataclass(frozen=True, slots=True)
class CalendarEvent:
    id: str
    title: str
    time_range: TimeRange
    notes: str | None = None
    all_day: bool = False

    @classmethod
    def create(
        cls,
        *,
        title: str,
        start: datetime,
        end: datetime,
        notes: str | None = None,
        all_day: bool = False,
    ) -> "CalendarEvent":
        cleaned_title = title.strip()
        if not cleaned_title:
            raise ValueError("Event title is required.")

        return cls(
            id=str(uuid4()),
            title=cleaned_title,
            time_range=TimeRange(start=start, end=end),
            notes=notes.strip() if notes else None,
            all_day=all_day,
        )

    def reschedule(self, *, start: datetime, end: datetime) -> "CalendarEvent":
        return replace(self, time_range=TimeRange(start=start, end=end))

    def rename(self, *, title: str) -> "CalendarEvent":
        cleaned_title = title.strip()
        if not cleaned_title:
            raise ValueError("Event title is required.")

        return replace(self, title=cleaned_title)

    def rewrite_notes(self, *, notes: str | None) -> "CalendarEvent":
        cleaned_notes = notes.strip() if notes else None
        return replace(self, notes=cleaned_notes)

    def mark_all_day(self, *, all_day: bool) -> "CalendarEvent":
        return replace(self, all_day=all_day)
