from __future__ import annotations

from sqlalchemy.orm import Session

from productivity_agent.agent.agno.runtime import AgnoPlanningAgentRuntime
from productivity_agent.agent.models import AgentRequest, AgentResponse


class PlanningAgentRuntime:
    def __init__(self, agno_runtime: AgnoPlanningAgentRuntime | None = None) -> None:
        self._agno_runtime = agno_runtime or AgnoPlanningAgentRuntime()

    def respond(self, request: AgentRequest, session: Session) -> AgentResponse:
        return self._agno_runtime.respond(request, session)
