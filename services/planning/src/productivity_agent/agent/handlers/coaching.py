from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from productivity_agent.agent.models import AgentAction, AgentActionType, AgentInsight, AgentRequest, AgentResponse, AgentRoute
from productivity_agent.agent.tools.work_tools import get_project, list_projects, neglected_projects, project_assessment, top_projects


def respond(request: AgentRequest, session: Session) -> AgentResponse:
    now = request.now or datetime.now(timezone.utc)
    if request.project_id:
        project = get_project(session, request.project_id)
        if project is not None:
            insights = [
                AgentInsight(title="Agent take", body=project_assessment(project, now=now)),
                AgentInsight(
                    title="Concrete next move",
                    body="Either schedule one small block this week or explicitly park the project so it stops creating background guilt.",
                ),
            ]
            return AgentResponse(
                route=AgentRoute.COACHING,
                summary=f"I routed this to coaching because the request is about priority and direction for {project.name}.",
                rationale="Coaching should reason about priorities and tradeoffs without automatically mutating the calendar.",
                insights=insights,
                actions=[
                    AgentAction(
                        type=AgentActionType.OPEN_PROJECT,
                        label="Open project planning",
                        payload={"project_id": project.id},
                    )
                ],
                data={"project_id": project.id},
            )

    projects = list_projects(session)
    neglected = neglected_projects(projects, now=now)
    top = top_projects(projects, limit=3)
    insights = []
    if neglected:
        insights.extend(
            AgentInsight(
                title=f"Neglected: {project.name}",
                body=project_assessment(project, now=now),
            )
            for project in neglected[:2]
        )
    else:
        insights.extend(
            AgentInsight(
                title=item.name,
                body=project_assessment(item, now=now),
            )
            for item in top
        )

    return AgentResponse(
        route=AgentRoute.COACHING,
        summary="I routed this to coaching because the request is about what matters, not just how to place blocks.",
        rationale="Coaching is the right capability for prioritization, neglect detection, and brainstorm-style guidance.",
        insights=insights,
        actions=[
            AgentAction(
                type=AgentActionType.OPEN_PROJECT,
                label=f"Review {item.name}",
                payload={"project_id": item.id},
            )
            for item in top
        ],
        data={"neglected_project_ids": [project.id for project in neglected]},
    )
