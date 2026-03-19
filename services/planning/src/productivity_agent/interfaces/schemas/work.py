from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel


class WorkTaskResponse(BaseModel):
    id: str
    name: str
    estimate_minutes: int
    status: str
    scheduled_label: str | None = None
    linked_event_id: str | None = None


class WorkProjectResponse(BaseModel):
    id: str
    name: str
    area_id: str
    priority: str
    status: str
    soft_deadline: str | None = None
    last_worked_on: str
    agent_status: str
    assessment: str
    tasks: list[WorkTaskResponse]


class WorkAreaResponse(BaseModel):
    id: str
    name: str
    projects: list[WorkProjectResponse]


class CreateProjectRequest(BaseModel):
    name: str
    area_id: str | None = None
    priority: str = "medium"
    status: str = "active"
    soft_deadline: date | None = None


class UpdateProjectRequest(BaseModel):
    name: str | None = None
    area_id: str | None = None
    priority: str | None = None
    status: str | None = None
    soft_deadline: date | None = None


class CreateTaskRequest(BaseModel):
    name: str
    estimate_minutes: int = 30


class UpdateTaskRequest(BaseModel):
    name: str | None = None
    estimate_minutes: int | None = None
    status: str | None = None


class ScheduleProposalRequest(BaseModel):
    commit: bool = False


class ScheduleProposalBlockResponse(BaseModel):
    task_id: str
    task_name: str
    start: datetime
    end: datetime
    title: str


class ScheduleProposalResponse(BaseModel):
    project_id: str
    committed: bool
    summary: str
    blocks: list[ScheduleProposalBlockResponse]
