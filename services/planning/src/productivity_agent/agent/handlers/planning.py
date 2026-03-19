from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from productivity_agent.agent.models import AgentAction, AgentActionType, AgentInsight, AgentRequest, AgentResponse, AgentRoute
from productivity_agent.agent.tools.planning_tools import build_schedule_proposal
from productivity_agent.agent.tools.work_tools import get_project, list_projects, top_projects


def respond(request: AgentRequest, session: Session) -> AgentResponse:
    now = request.now or datetime.now(timezone.utc)
    project = get_project(session, request.project_id) if request.project_id else None
    if project is None:
        projects = top_projects(list_projects(session), limit=3)
        insights = [
            AgentInsight(
                title=item.name,
                body=f"{item.priority.title()} priority in {item.area_name}. {len([task for task in item.tasks if task.status in {'todo', 'overdue'}])} unscheduled tasks.",
            )
            for item in projects
        ]
        return AgentResponse(
            route=AgentRoute.PLANNING,
            summary="I routed this to planning because it is about turning projects and tasks into scheduled work.",
            rationale="Planning needs both project state and calendar availability, so it should run separately from raw calendar operations.",
            insights=insights,
            actions=[
                AgentAction(
                    type=AgentActionType.OPEN_PROJECT,
                    label=f"Open {item.name}",
                    payload={"project_id": item.id},
                )
                for item in projects
            ],
            data={"project_ids": [item.id for item in projects]},
        )

    blocks, summary = build_schedule_proposal(session, project=project, now=now, commit=request.commit)
    insights = [
        AgentInsight(
            title="Assessment",
            body=f"{project.name} has {len([task for task in project.tasks if task.status in {'todo', 'overdue'}])} tasks still needing protected time.",
        )
    ]
    if blocks:
        insights.extend(
            AgentInsight(
                title=block.task_name,
                body=f"{block.start.astimezone(timezone.utc).strftime('%a %H:%M UTC')} for {(block.end - block.start).seconds // 60} minutes.",
            )
            for block in blocks
        )

    actions = []
    if blocks and not request.commit:
        actions.append(
            AgentAction(
                type=AgentActionType.REVIEW_PROPOSAL,
                label="Commit schedule proposal",
                payload={"project_id": project.id, "commit": True},
            )
        )

    return AgentResponse(
        route=AgentRoute.PLANNING,
        summary=summary,
        rationale="Planning is the capability that converts task backlogs into concrete time blocks.",
        insights=insights,
        actions=actions,
        data={
            "project_id": project.id,
            "blocks": [
                {
                    "task_id": block.task_id,
                    "task_name": block.task_name,
                    "start": block.start.isoformat(),
                    "end": block.end.isoformat(),
                }
                for block in blocks
            ],
        },
    )
