from __future__ import annotations

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


class AgentRoute(str, Enum):
    CALENDAR = "calendar"
    PLANNING = "planning"
    COACHING = "coaching"


class AgentActionType(str, Enum):
    OPEN_PROJECT = "open_project"
    REVIEW_PROPOSAL = "review_proposal"
    CREATE_EVENT = "create_event"
    ASK_FOLLOW_UP = "ask_follow_up"


class AgentRequest(BaseModel):
    message: str = Field(min_length=1)
    commit: bool = False
    project_id: str | None = None
    now: datetime | None = None
    timezone: str | None = None
    range_start: datetime | None = None
    range_end: datetime | None = None


class AgentAction(BaseModel):
    type: AgentActionType
    label: str
    payload: dict[str, str | bool | int | None] = Field(default_factory=dict)


class AgentInsight(BaseModel):
    title: str
    body: str


class AgentResponse(BaseModel):
    route: AgentRoute
    summary: str
    rationale: str
    insights: list[AgentInsight] = Field(default_factory=list)
    actions: list[AgentAction] = Field(default_factory=list)
    data: dict[str, object] = Field(default_factory=dict)
