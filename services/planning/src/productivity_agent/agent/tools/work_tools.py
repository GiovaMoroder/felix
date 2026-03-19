from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from productivity_agent.infrastructure.db.models import AreaRecord, ProjectRecord, TaskRecord


@dataclass(slots=True)
class TaskSnapshot:
    id: str
    name: str
    estimate_minutes: int
    status: str
    scheduled_start: datetime | None
    completed_at: datetime | None
    linked_event_id: str | None


@dataclass(slots=True)
class ProjectSnapshot:
    id: str
    area_id: str
    area_name: str
    name: str
    priority: str
    status: str
    soft_deadline: str | None
    tasks: list[TaskSnapshot]
    updated_at: datetime | None


def list_projects(session: Session) -> list[ProjectSnapshot]:
    statement = (
        select(ProjectRecord)
        .options(joinedload(ProjectRecord.area), joinedload(ProjectRecord.tasks))
        .order_by(ProjectRecord.updated_at.desc(), ProjectRecord.created_at.desc())
    )
    projects = session.execute(statement).unique().scalars().all()
    return [_project_snapshot(project) for project in projects]


def get_project(session: Session, project_id: str) -> ProjectSnapshot | None:
    statement = (
        select(ProjectRecord)
        .options(joinedload(ProjectRecord.area), joinedload(ProjectRecord.tasks))
        .where(ProjectRecord.id == project_id)
    )
    project = session.execute(statement).unique().scalar_one_or_none()
    if project is None:
        return None
    return _project_snapshot(project)


def neglected_projects(projects: list[ProjectSnapshot], *, now: datetime) -> list[ProjectSnapshot]:
    return [project for project in projects if project.status == "active" and _is_neglected(project, now=now)]


def unscheduled_tasks(project: ProjectSnapshot) -> list[TaskSnapshot]:
    return [task for task in project.tasks if task.status in {"todo", "overdue"}]


def project_assessment(project: ProjectSnapshot, *, now: datetime) -> str:
    if project.status == "parked":
        return "This project is parked. Restart only if it is genuinely active again."
    if any(task.status == "overdue" for task in project.tasks):
        return "There is slippage here. Protect one real block instead of letting the work stay abstract."
    if _is_neglected(project, now=now):
        return "This project has gone cold. Either schedule it this week or explicitly de-scope it."
    if any(task.status == "scheduled" for task in project.tasks):
        return "The project has momentum. The main risk is renegotiating the scheduled work away."
    return "The work is defined but still unscheduled. A small protected block would make it materially more real."


def top_projects(projects: list[ProjectSnapshot], *, limit: int = 3) -> list[ProjectSnapshot]:
    priority_rank = {"high": 0, "medium": 1, "low": 2}
    status_rank = {"active": 0, "parked": 1, "done": 2}
    return sorted(
        projects,
        key=lambda item: (
            priority_rank.get(item.priority, 9),
            status_rank.get(item.status, 9),
            len(unscheduled_tasks(item)) == 0,
            item.updated_at or datetime.min.replace(tzinfo=timezone.utc),
        ),
    )[:limit]


def _project_snapshot(project: ProjectRecord) -> ProjectSnapshot:
    return ProjectSnapshot(
        id=project.id,
        area_id=project.area_id,
        area_name=project.area.name,
        name=project.name,
        priority=project.priority,
        status=project.status,
        soft_deadline=project.soft_deadline.isoformat() if project.soft_deadline else None,
        tasks=[
            TaskSnapshot(
                id=task.id,
                name=task.name,
                estimate_minutes=task.estimate_minutes,
                status=task.status,
                scheduled_start=task.scheduled_start,
                completed_at=task.completed_at,
                linked_event_id=task.linked_event_id,
            )
            for task in project.tasks
        ],
        updated_at=project.updated_at,
    )


def _last_touch(project: ProjectSnapshot) -> datetime | None:
    candidates = [
        stamp
        for task in project.tasks
        for stamp in (task.completed_at, task.scheduled_start)
        if stamp is not None
    ]
    if not candidates:
        return None
    normalized = []
    for stamp in candidates:
        if stamp.tzinfo is None or stamp.tzinfo.utcoffset(stamp) is None:
            normalized.append(stamp.replace(tzinfo=timezone.utc))
        else:
            normalized.append(stamp.astimezone(timezone.utc))
    return max(normalized)


def _is_neglected(project: ProjectSnapshot, *, now: datetime) -> bool:
    if any(task.status == "overdue" for task in project.tasks):
        return True
    last_touch = _last_touch(project)
    if last_touch is None:
        return False
    return (now - last_touch.astimezone(timezone.utc)).days > 5
