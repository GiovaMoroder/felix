from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from productivity_agent.domain.calendar.entities.calendar_event import CalendarEvent
from productivity_agent.infrastructure.db.base import SessionLocal
from productivity_agent.infrastructure.db.models import AreaRecord, EventRecord, ProjectRecord, TaskRecord
from productivity_agent.infrastructure.repositories.sqlalchemy_calendar_event_repository import (
    SqlAlchemyCalendarEventRepository,
)
from productivity_agent.interfaces.schemas.work import (
    CreateProjectRequest,
    CreateTaskRequest,
    ScheduleProposalBlockResponse,
    ScheduleProposalRequest,
    ScheduleProposalResponse,
    UpdateProjectRequest,
    UpdateTaskRequest,
    WorkAreaResponse,
    WorkProjectResponse,
    WorkTaskResponse,
)

router = APIRouter(prefix="/work", tags=["work"])


def get_session() -> Session:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@router.get("/areas", response_model=list[WorkAreaResponse])
def list_work_areas(session: Session = Depends(get_session)) -> list[WorkAreaResponse]:
    statement = (
        select(AreaRecord)
        .options(joinedload(AreaRecord.projects).joinedload(ProjectRecord.tasks))
        .order_by(AreaRecord.name.asc())
    )
    areas = session.execute(statement).unique().scalars().all()
    return [_serialize_area(area) for area in areas]


@router.post("/projects", response_model=WorkProjectResponse, status_code=status.HTTP_201_CREATED)
def create_project(payload: CreateProjectRequest, session: Session = Depends(get_session)) -> WorkProjectResponse:
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Project name is required.")

    area_id = payload.area_id
    if area_id is None:
        area = session.execute(select(AreaRecord).order_by(AreaRecord.name.asc())).scalars().first()
        if area is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No areas available.")
        area_id = area.id

    if session.get(AreaRecord, area_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Unknown area: {area_id}")

    project = ProjectRecord(
        id=str(uuid4()),
        area_id=area_id,
        name=name,
        priority=payload.priority,
        status=payload.status,
        soft_deadline=payload.soft_deadline,
    )
    session.add(project)
    session.commit()
    session.refresh(project)
    project.tasks = []
    return _serialize_project(project)


@router.patch("/projects/{project_id}", response_model=WorkProjectResponse)
def update_project(
    project_id: str,
    payload: UpdateProjectRequest,
    session: Session = Depends(get_session),
) -> WorkProjectResponse:
    project = _load_project(session, project_id)

    if payload.name is not None:
        cleaned_name = payload.name.strip()
        if not cleaned_name:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Project name is required.")
        project.name = cleaned_name

    if payload.area_id is not None:
        if session.get(AreaRecord, payload.area_id) is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Unknown area: {payload.area_id}",
            )
        project.area_id = payload.area_id

    if payload.priority is not None:
        project.priority = payload.priority

    if payload.status is not None:
        project.status = payload.status

    project.soft_deadline = payload.soft_deadline
    project.updated_at = datetime.now(timezone.utc)
    session.commit()
    return _reload_project_response(session, project.id)


@router.delete("/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(project_id: str, session: Session = Depends(get_session)) -> None:
    project = _load_project(session, project_id)
    session.delete(project)
    session.commit()


@router.post(
    "/projects/{project_id}/tasks",
    response_model=WorkProjectResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_task(
    project_id: str,
    payload: CreateTaskRequest,
    session: Session = Depends(get_session),
) -> WorkProjectResponse:
    project = _load_project(session, project_id)
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Task name is required.")

    task = TaskRecord(
        id=str(uuid4()),
        project_id=project.id,
        name=name,
        estimate_minutes=max(15, payload.estimate_minutes),
        status="todo",
    )
    session.add(task)
    project.updated_at = datetime.now(timezone.utc)
    session.commit()
    return _reload_project_response(session, project.id)


@router.patch("/tasks/{task_id}", response_model=WorkProjectResponse)
def update_task(
    task_id: str,
    payload: UpdateTaskRequest,
    session: Session = Depends(get_session),
) -> WorkProjectResponse:
    task = session.get(TaskRecord, task_id)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Unknown task: {task_id}")

    if payload.name is not None:
        cleaned_name = payload.name.strip()
        if not cleaned_name:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Task name is required.")
        task.name = cleaned_name

    if payload.estimate_minutes is not None:
        task.estimate_minutes = max(15, payload.estimate_minutes)

    if payload.status is not None:
        task.status = payload.status
        if payload.status == "done":
            task.completed_at = datetime.now(timezone.utc)
        elif payload.status == "scheduled":
            if task.scheduled_start is None:
                task.scheduled_start = _round_up_half_hour(datetime.now(timezone.utc) + timedelta(hours=1))
            task.completed_at = None
        else:
            task.completed_at = None

    task.updated_at = datetime.now(timezone.utc)
    project = _load_project(session, task.project_id)
    project.updated_at = datetime.now(timezone.utc)
    session.commit()
    return _reload_project_response(session, project.id)


@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(task_id: str, session: Session = Depends(get_session)) -> None:
    task = session.get(TaskRecord, task_id)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Unknown task: {task_id}")

    project = _load_project(session, task.project_id)
    session.delete(task)
    project.updated_at = datetime.now(timezone.utc)
    session.commit()


@router.post("/tasks/{task_id}/breakdown", response_model=WorkProjectResponse)
def break_down_task(task_id: str, session: Session = Depends(get_session)) -> WorkProjectResponse:
    task = session.get(TaskRecord, task_id)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Unknown task: {task_id}")

    first_minutes = max(15, task.estimate_minutes // 2)
    second_minutes = max(15, task.estimate_minutes - first_minutes)
    base_name = task.name.replace(" (Part 1)", "").replace(" (Part 2)", "")

    task.name = f"{base_name} (Part 1)"
    task.estimate_minutes = first_minutes
    task.status = "todo"
    task.linked_event_id = None
    task.scheduled_start = None
    task.completed_at = None
    task.updated_at = datetime.now(timezone.utc)

    follow_up = TaskRecord(
        id=str(uuid4()),
        project_id=task.project_id,
        name=f"{base_name} (Part 2)",
        estimate_minutes=second_minutes,
        status="todo",
    )
    session.add(follow_up)

    project = _load_project(session, task.project_id)
    project.updated_at = datetime.now(timezone.utc)
    session.commit()
    return _reload_project_response(session, project.id)


@router.post("/projects/{project_id}/proposal", response_model=ScheduleProposalResponse)
def schedule_project_proposal(
    project_id: str,
    payload: ScheduleProposalRequest,
    session: Session = Depends(get_session),
) -> ScheduleProposalResponse:
    project = _load_project(session, project_id)
    tasks = sorted(project.tasks, key=_task_sort_key)
    candidates = [task for task in tasks if task.status in {"todo", "overdue"}]

    if not candidates:
        return ScheduleProposalResponse(
            project_id=project.id,
            committed=payload.commit,
            summary=f"{project.name} has no unscheduled work to place.",
            blocks=[],
        )

    existing_events = [
        _parse_event_range(row)
        for row in session.execute(select(EventRecord).order_by(EventRecord.start_at.asc())).scalars().all()
    ]
    planned_blocks: list[tuple[TaskRecord, datetime, datetime]] = []
    cursor = _round_up_half_hour(datetime.now(timezone.utc) + timedelta(hours=1))
    search_limit = datetime.now(timezone.utc) + timedelta(days=21)

    for task in candidates[:3]:
        slot = _find_open_slot(
            cursor=cursor,
            duration_minutes=task.estimate_minutes,
            busy_ranges=existing_events + [(start, end) for _, start, end in planned_blocks],
            search_limit=search_limit,
        )
        if slot is None:
            break

        start, end = slot
        planned_blocks.append((task, start, end))
        cursor = end + timedelta(minutes=30)

    if not planned_blocks:
        return ScheduleProposalResponse(
            project_id=project.id,
            committed=payload.commit,
            summary=f"I could not find a credible focus window for {project.name} in the next 3 weeks.",
            blocks=[],
        )

    if payload.commit:
        repository = SqlAlchemyCalendarEventRepository(session)
        for task, start, end in planned_blocks:
            event = CalendarEvent.create(
                title=task.name,
                start=start,
                end=end,
                notes=f"Project: {project.name}",
            )
            saved = repository.save(event=event)
            task.status = "scheduled"
            task.scheduled_start = start
            task.linked_event_id = saved.id
            task.updated_at = datetime.now(timezone.utc)
        project.updated_at = datetime.now(timezone.utc)
        session.commit()

    blocks = [
        ScheduleProposalBlockResponse(
            task_id=task.id,
            task_name=task.name,
            start=start,
            end=end,
            title=task.name,
        )
        for task, start, end in planned_blocks
    ]
    summary = (
        f"Prepared {len(blocks)} block{'s' if len(blocks) != 1 else ''} for {project.name}."
        if not payload.commit
        else f"Scheduled {len(blocks)} block{'s' if len(blocks) != 1 else ''} for {project.name}."
    )
    return ScheduleProposalResponse(
        project_id=project.id,
        committed=payload.commit,
        summary=summary,
        blocks=blocks,
    )


def _load_project(session: Session, project_id: str) -> ProjectRecord:
    statement = (
        select(ProjectRecord)
        .options(joinedload(ProjectRecord.tasks), joinedload(ProjectRecord.area))
        .where(ProjectRecord.id == project_id)
    )
    project = session.execute(statement).unique().scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Unknown project: {project_id}")
    return project


def _reload_project_response(session: Session, project_id: str) -> WorkProjectResponse:
    project = _load_project(session, project_id)
    return _serialize_project(project)


def _serialize_area(area: AreaRecord) -> WorkAreaResponse:
    projects = sorted(area.projects, key=lambda item: item.created_at)
    return WorkAreaResponse(
        id=area.id,
        name=area.name,
        projects=[_serialize_project(project) for project in projects],
    )


def _serialize_project(project: ProjectRecord) -> WorkProjectResponse:
    tasks = sorted(project.tasks, key=_task_sort_key)
    return WorkProjectResponse(
        id=project.id,
        name=project.name,
        area_id=project.area_id,
        priority=project.priority,
        status=project.status,
        soft_deadline=_format_deadline(project.soft_deadline),
        last_worked_on=_last_worked_on_label(project),
        agent_status=_agent_status(project),
        assessment=_project_assessment(project),
        tasks=[_serialize_task(task) for task in tasks],
    )


def _serialize_task(task: TaskRecord) -> WorkTaskResponse:
    return WorkTaskResponse(
        id=task.id,
        name=task.name,
        estimate_minutes=task.estimate_minutes,
        status=task.status,
        scheduled_label=_format_scheduled_label(task.scheduled_start),
        linked_event_id=task.linked_event_id,
    )


def _as_utc(stamp: datetime) -> datetime:
    # SQLite often round-trips tz-aware columns as naive datetimes.
    if stamp.tzinfo is None or stamp.tzinfo.utcoffset(stamp) is None:
        return stamp.replace(tzinfo=timezone.utc)
    return stamp.astimezone(timezone.utc)


def _agent_status(project: ProjectRecord) -> str:
    if project.status == "parked":
        return "Parked"
    if any(task.status == "overdue" for task in project.tasks):
        return "Neglected"

    last_touch = _project_last_touch(project)
    if last_touch is None:
        return "Active"
    if datetime.now(timezone.utc) - last_touch > timedelta(days=5):
        return "Neglected"
    return "On track"


def _project_assessment(project: ProjectRecord) -> str:
    open_tasks = [task for task in project.tasks if task.status != "done"]
    if project.status == "parked":
        return "This project is parked. If it becomes real again, restart with one tiny concrete task."
    if any(task.status == "overdue" for task in open_tasks):
        return "This project has slippage. The next move is to protect one credible block instead of letting urgency stay abstract."
    if any(task.status == "todo" for task in open_tasks):
        return "The work is defined, but it still needs protected time. A small scheduled block would make this project materially more real."
    if any(task.status == "scheduled" for task in open_tasks):
        return "This project has a live plan. The main risk is renegotiating the scheduled blocks away."
    return "This project is in good shape. Keep the cadence light and consistent."


def _last_worked_on_label(project: ProjectRecord) -> str:
    last_touch = _project_last_touch(project)
    if last_touch is None:
        return "Never"
    delta_days = (datetime.now(timezone.utc).date() - last_touch.date()).days
    if delta_days <= 0:
        return "Today"
    if delta_days == 1:
        return "1 day ago"
    return f"{delta_days} days ago"


def _project_last_touch(project: ProjectRecord) -> datetime | None:
    candidates = [
        _as_utc(stamp)
        for task in project.tasks
        for stamp in (task.completed_at, task.scheduled_start)
        if stamp
    ]
    return max(candidates) if candidates else None


def _format_deadline(deadline: date | None) -> str | None:
    if deadline is None:
        return None
    return deadline.isoformat()


def _format_scheduled_label(scheduled_start: datetime | None) -> str | None:
    if scheduled_start is None:
        return None
    return _as_utc(scheduled_start).strftime("%a %H:%M")


def _task_sort_key(task: TaskRecord) -> tuple[int, datetime]:
    order = {"overdue": 0, "todo": 1, "scheduled": 2, "done": 3}
    return (
        order.get(task.status, 9),
        task.scheduled_start or task.updated_at or task.created_at,
    )


def _parse_event_range(event: EventRecord) -> tuple[datetime, datetime]:
    return (
        datetime.fromisoformat(event.start_at),
        datetime.fromisoformat(event.end_at),
    )


def _find_open_slot(
    *,
    cursor: datetime,
    duration_minutes: int,
    busy_ranges: list[tuple[datetime, datetime]],
    search_limit: datetime,
) -> tuple[datetime, datetime] | None:
    candidate = cursor
    duration = timedelta(minutes=duration_minutes)

    while candidate < search_limit:
        candidate = _normalize_business_start(candidate)
        if candidate >= search_limit:
            return None

        end = candidate + duration
        business_end = datetime.combine(
            candidate.date(),
            time(hour=18, minute=0),
            tzinfo=candidate.tzinfo,
        )
        if end > business_end:
            candidate = _next_business_day(candidate)
            continue

        overlap = next(
            (
                (busy_start, busy_end)
                for busy_start, busy_end in busy_ranges
                if candidate < busy_end and end > busy_start
            ),
            None,
        )
        if overlap is None:
            return candidate, end

        candidate = _round_up_half_hour(overlap[1] + timedelta(minutes=15))

    return None


def _normalize_business_start(value: datetime) -> datetime:
    normalized = _round_up_half_hour(value)
    while normalized.weekday() >= 5:
        normalized = _next_business_day(normalized)

    business_start = datetime.combine(
        normalized.date(),
        time(hour=9, minute=0),
        tzinfo=normalized.tzinfo,
    )
    business_end = datetime.combine(
        normalized.date(),
        time(hour=18, minute=0),
        tzinfo=normalized.tzinfo,
    )

    if normalized < business_start:
        return business_start
    if normalized >= business_end:
        return _next_business_day(normalized)
    return normalized


def _next_business_day(value: datetime) -> datetime:
    next_day = value + timedelta(days=1)
    next_day = datetime.combine(next_day.date(), time(hour=9, minute=0), tzinfo=value.tzinfo)
    while next_day.weekday() >= 5:
        next_day = datetime.combine(
            (next_day + timedelta(days=1)).date(),
            time(hour=9, minute=0),
            tzinfo=value.tzinfo,
        )
    return next_day


def _round_up_half_hour(value: datetime) -> datetime:
    minute_bucket = 30 if value.minute > 0 and value.minute <= 30 else 60 if value.minute > 30 else 0
    if minute_bucket == 0:
        rounded = value.replace(minute=0, second=0, microsecond=0)
    elif minute_bucket == 30:
        rounded = value.replace(minute=30, second=0, microsecond=0)
    else:
        rounded = (value + timedelta(hours=1)).replace(minute=0, second=0, microsecond=0)

    if rounded < value.replace(second=0, microsecond=0):
        return rounded + timedelta(minutes=30)
    return rounded
