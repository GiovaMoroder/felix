from datetime import datetime

from pydantic import BaseModel, ConfigDict

from productivity_agent.domain.calendar.entities.calendar_event import CalendarEvent


class CalendarEventCreateRequest(BaseModel):
    title: str
    start: datetime
    end: datetime
    notes: str | None = None
    all_day: bool = False


class CalendarEventUpdateRequest(BaseModel):
    title: str | None = None
    start: datetime | None = None
    end: datetime | None = None
    notes: str | None = None
    all_day: bool | None = None


class CalendarEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    start: datetime
    end: datetime
    notes: str | None = None
    all_day: bool
    duration_minutes: int

    @classmethod
    def from_domain(cls, event: CalendarEvent) -> "CalendarEventResponse":
        return cls(
            id=event.id,
            title=event.title,
            start=event.time_range.start,
            end=event.time_range.end,
            notes=event.notes,
            all_day=event.all_day,
            duration_minutes=event.time_range.duration_minutes,
        )
