from __future__ import annotations

from datetime import datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from productivity_agent.application.use_cases.create_calendar_event import CreateCalendarEvent
from productivity_agent.application.use_cases.delete_calendar_event import DeleteCalendarEvent
from productivity_agent.application.use_cases.list_calendar_events import ListCalendarEvents
from productivity_agent.application.use_cases.update_calendar_event import UpdateCalendarEvent
from productivity_agent.infrastructure.db.base import SessionLocal
from productivity_agent.infrastructure.repositories.sqlalchemy_calendar_event_repository import (
    SqlAlchemyCalendarEventRepository,
)
from productivity_agent.interfaces.schemas.calendar_event import (
    CalendarEventCreateRequest,
    CalendarEventResponse,
    CalendarEventUpdateRequest,
)

router = APIRouter(prefix="/calendar/events", tags=["calendar"])


def get_session() -> Session:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


SessionDependency = Annotated[Session, Depends(get_session)]


@router.get("", response_model=list[CalendarEventResponse])
def list_events(
    session: SessionDependency,
    start: datetime | None = Query(default=None),
    end: datetime | None = Query(default=None),
) -> list[CalendarEventResponse]:
    window_start = start or datetime.utcnow() - timedelta(days=7)
    window_end = end or datetime.utcnow() + timedelta(days=30)

    repository = SqlAlchemyCalendarEventRepository(session)
    use_case = ListCalendarEvents(repository=repository)
    events = use_case.execute(start=window_start, end=window_end)
    return [CalendarEventResponse.from_domain(event) for event in events]


@router.post("", response_model=CalendarEventResponse, status_code=status.HTTP_201_CREATED)
def create_event(
    payload: CalendarEventCreateRequest,
    session: SessionDependency,
) -> CalendarEventResponse:
    repository = SqlAlchemyCalendarEventRepository(session)
    use_case = CreateCalendarEvent(repository=repository)
    event = use_case.execute(
        title=payload.title,
        start=payload.start,
        end=payload.end,
        notes=payload.notes,
        all_day=payload.all_day,
    )
    return CalendarEventResponse.from_domain(event)


@router.patch("/{event_id}", response_model=CalendarEventResponse)
def update_event(
    event_id: str,
    payload: CalendarEventUpdateRequest,
    session: SessionDependency,
) -> CalendarEventResponse:
    repository = SqlAlchemyCalendarEventRepository(session)
    use_case = UpdateCalendarEvent(repository=repository)

    try:
        event = use_case.execute(
            event_id=event_id,
            title=payload.title,
            start=payload.start,
            end=payload.end,
            notes=payload.notes,
            all_day=payload.all_day,
        )
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return CalendarEventResponse.from_domain(event)


@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_event(event_id: str, session: SessionDependency) -> Response:
    repository = SqlAlchemyCalendarEventRepository(session)
    use_case = DeleteCalendarEvent(repository=repository)
    deleted = use_case.execute(event_id=event_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unknown event: {event_id}",
        )

    return Response(status_code=status.HTTP_204_NO_CONTENT)
