from __future__ import annotations

from pydantic import BaseModel, Field

from productivity_agent.agent.models import AgentActionType, AgentRoute


class AgnoAction(BaseModel):
    type: AgentActionType
    label: str
    project_id: str | None = None
    task_id: str | None = None
    event_id: str | None = None
    commit: bool = False
    suggested_duration_minutes: int | None = None
    follow_up_message: str | None = None


class AgnoInsight(BaseModel):
    title: str
    body: str


class AgnoBlock(BaseModel):
    task_id: str
    task_name: str
    start: str
    end: str


class AgnoData(BaseModel):
    project_id: str | None = None
    event_count: int | None = None
    neglected_project_ids: list[str] = Field(default_factory=list)
    project_ids: list[str] = Field(default_factory=list)
    blocks: list[AgnoBlock] = Field(default_factory=list)
    response: str | None = None


class AgnoAgentOutput(BaseModel):
    route: AgentRoute
    summary: str
    rationale: str
    insights: list[AgnoInsight] = Field(default_factory=list)
    actions: list[AgnoAction] = Field(default_factory=list)
    data: AgnoData = Field(default_factory=AgnoData)
