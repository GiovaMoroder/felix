from __future__ import annotations

from dataclasses import asdict, is_dataclass
from typing import Any, Callable

from sqlalchemy.orm import Session

from productivity_agent.agent.agno.models import AgnoAgentOutput
from productivity_agent.agent.agno.team import build_agent_team
from productivity_agent.agent.models import AgentAction, AgentInsight, AgentRequest, AgentResponse, AgentRoute


class AgnoPlanningAgentRuntime:
    def __init__(self, team_factory: Callable[[Session], Any] | None = None) -> None:
        self._team_factory = team_factory or build_agent_team

    def respond(self, request: AgentRequest, session: Session) -> AgentResponse:
        team = self._team_factory(session)
        payload = self._build_prompt(request)
        run_response = team.run(payload)
        normalized = self._normalize_output(run_response.content)
        return AgentResponse(
            route=self._normalize_route(normalized.route),
            summary=normalized.summary,
            rationale=normalized.rationale,
            insights=[AgentInsight(title=item.title, body=item.body) for item in normalized.insights],
            actions=[
                AgentAction(
                    type=item.type,
                    label=item.label,
                    payload={
                        "project_id": item.project_id,
                        "task_id": item.task_id,
                        "event_id": item.event_id,
                        "commit": item.commit,
                        "suggested_duration_minutes": item.suggested_duration_minutes,
                        "follow_up_message": item.follow_up_message,
                    },
                )
                for item in normalized.actions
            ],
            data=normalized.data.model_dump(),
        )

    def _build_prompt(self, request: AgentRequest) -> str:
        lines = [f"User message: {request.message.strip()}"]
        if request.project_id:
            lines.append(f"Selected project id: {request.project_id}")
        if request.now:
            lines.append(f"Current datetime: {request.now.isoformat()}")
        if request.timezone:
            lines.append(f"User timezone: {request.timezone}")
        if request.range_start and request.range_end:
            lines.append(
                f"Visible calendar range: {request.range_start.isoformat()} to {request.range_end.isoformat()}"
            )
        lines.append(
            "Respond with structured output containing summary, rationale, insights, actions, and data."
        )
        lines.append(
            "Resolve any relative dates like today, tomorrow, this week, or next week against the provided current datetime and timezone."
        )
        lines.append("Prefer absolute ISO datetimes when choosing tool arguments.")
        if request.commit:
            lines.append("The user explicitly approved committing the proposal or mutation if appropriate.")
        return "\n".join(lines)

    def _normalize_output(self, content: Any) -> AgnoAgentOutput:
        if isinstance(content, AgnoAgentOutput):
            return content
        if hasattr(content, "model_dump"):
            return AgnoAgentOutput.model_validate(content.model_dump())
        if isinstance(content, dict):
            return AgnoAgentOutput.model_validate(content)
        if is_dataclass(content):
            return AgnoAgentOutput.model_validate(asdict(content))
        return AgnoAgentOutput(
            route="coaching",
            summary=str(content),
            rationale="The Agno team returned unstructured content, so it was normalized into a fallback response.",
        )

    def _normalize_route(self, route: Any) -> AgentRoute:
        try:
            return AgentRoute(route)
        except Exception:
            return AgentRoute.COACHING
