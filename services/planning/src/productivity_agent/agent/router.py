from __future__ import annotations

from productivity_agent.agent.models import AgentRequest, AgentRoute


class AgentRouter:
    _CALENDAR_KEYWORDS = (
        "calendar",
        "event",
        "meeting",
        "today",
        "tomorrow",
        "move",
        "reschedule",
        "free slot",
        "availability",
    )
    _PLANNING_KEYWORDS = (
        "schedule",
        "plan my",
        "time block",
        "project",
        "task",
        "week",
        "focus",
        "proposal",
    )
    _COACHING_KEYWORDS = (
        "priority",
        "prioritize",
        "neglected",
        "stuck",
        "park",
        "worth it",
        "why",
        "brainstorm",
    )

    def route(self, request: AgentRequest) -> AgentRoute:
        message = request.message.lower()
        if any(keyword in message for keyword in self._COACHING_KEYWORDS):
            return AgentRoute.COACHING
        if request.project_id:
            return AgentRoute.PLANNING
        if any(keyword in message for keyword in self._CALENDAR_KEYWORDS):
            return AgentRoute.CALENDAR
        if any(keyword in message for keyword in self._PLANNING_KEYWORDS):
            return AgentRoute.PLANNING
        return AgentRoute.COACHING
