from __future__ import annotations

from datetime import timedelta, timezone

from sqlalchemy.orm import Session

from productivity_agent.agent.models import AgentAction, AgentActionType, AgentInsight, AgentRequest, AgentResponse, AgentRoute
from productivity_agent.agent.tools.calendar_tools import list_events, summarize_upcoming


def respond(request: AgentRequest, session: Session) -> AgentResponse:
    now = request.now or __import__("datetime").datetime.now(timezone.utc)
    events = list_events(session, start=now - timedelta(hours=2), end=now + timedelta(days=3))

    insights = [
        AgentInsight(
            title="Upcoming",
            body=summarize_upcoming(events),
        )
    ]
    if not events:
        actions = [
            AgentAction(
                type=AgentActionType.CREATE_EVENT,
                label="Create a focus block",
                payload={"suggested_duration_minutes": 60},
            )
        ]
        summary = "The calendar has room right now."
    else:
        actions = [
            AgentAction(
                type=AgentActionType.ASK_FOLLOW_UP,
                label="Ask for a calendar change",
                payload={"route": AgentRoute.CALENDAR.value},
            )
        ]
        summary = "I routed this to calendar operations because the request is about event state or availability."

    return AgentResponse(
        route=AgentRoute.CALENDAR,
        summary=summary,
        rationale="Calendar requests need direct access to event state and should stay separate from planning/coaching logic.",
        insights=insights,
        actions=actions,
        data={"event_count": len(events)},
    )
