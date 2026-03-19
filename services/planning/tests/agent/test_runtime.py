from __future__ import annotations

from types import SimpleNamespace

from productivity_agent.agent.agno.models import AgnoAction, AgnoAgentOutput, AgnoInsight
from productivity_agent.agent.models import AgentActionType, AgentRequest, AgentRoute
from productivity_agent.agent.runtime import PlanningAgentRuntime
from productivity_agent.infrastructure.db.base import SessionLocal, create_schema


def test_runtime_adapts_agno_calendar_response() -> None:
    create_schema()
    runtime = PlanningAgentRuntime(
        agno_runtime=_fake_agno_runtime(
            AgnoAgentOutput(
                route=AgentRoute.CALENDAR,
                summary="Calendar summary",
                rationale="Calendar rationale",
                insights=[AgnoInsight(title="Upcoming", body="Open afternoon.")],
            )
        )
    )
    session = SessionLocal()
    try:
        response = runtime.respond(AgentRequest(message="What is on my calendar tomorrow?"), session)
    finally:
        session.close()

    assert response.route is AgentRoute.CALENDAR
    assert response.summary == "Calendar summary"
    assert response.insights[0].title == "Upcoming"


def test_runtime_adapts_planning_actions() -> None:
    create_schema()
    runtime = PlanningAgentRuntime(
        agno_runtime=_fake_agno_runtime(
            AgnoAgentOutput(
                route=AgentRoute.PLANNING,
                summary="Prepared 1 block for Interview Prep.",
                rationale="Planning rationale",
                insights=[AgnoInsight(title="Assessment", body="One task still needs protected time.")],
                actions=[
                    AgnoAction(
                        type=AgentActionType.REVIEW_PROPOSAL,
                        label="Commit schedule proposal",
                        project_id="project-1",
                        commit=True,
                    )
                ],
                data={
                    "project_id": "project-1",
                    "blocks": [
                        {
                            "task_id": "task-1",
                            "task_name": "Deep work block",
                            "start": "2026-03-19T10:00:00+00:00",
                            "end": "2026-03-19T11:00:00+00:00",
                        }
                    ],
                },
            )
        )
    )
    session = SessionLocal()
    try:
        response = runtime.respond(AgentRequest(message="Schedule this project", project_id="project-1"), session)
    finally:
        session.close()

    assert response.route is AgentRoute.PLANNING
    assert response.data["project_id"] == "project-1"
    assert response.actions[0].type is AgentActionType.REVIEW_PROPOSAL


def test_runtime_adapts_coaching_response() -> None:
    create_schema()
    runtime = PlanningAgentRuntime(
        agno_runtime=_fake_agno_runtime(
            AgnoAgentOutput(
                route=AgentRoute.COACHING,
                summary="Focus on Interview Prep.",
                rationale="Coaching rationale",
                insights=[AgnoInsight(title="Agent take", body="It has been neglected.")],
            )
        )
    )
    session = SessionLocal()
    try:
        response = runtime.respond(AgentRequest(message="Which project is neglected right now?"), session)
    finally:
        session.close()

    assert response.route is AgentRoute.COACHING
    assert response.insights


def _fake_agno_runtime(content: AgnoAgentOutput):
    return SimpleNamespace(respond=lambda request, session: SimpleNamespace(**{
        "route": content.route,
        "summary": content.summary,
        "rationale": content.rationale,
        "insights": [SimpleNamespace(title=item.title, body=item.body) for item in content.insights],
        "actions": [
            SimpleNamespace(
                type=item.type,
                label=item.label,
                project_id=item.project_id,
                task_id=item.task_id,
                event_id=item.event_id,
                commit=item.commit,
                suggested_duration_minutes=item.suggested_duration_minutes,
                follow_up_message=item.follow_up_message,
            )
            for item in content.actions
        ],
        "data": content.data.model_dump(),
    }))
