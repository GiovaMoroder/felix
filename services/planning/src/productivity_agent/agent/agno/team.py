from __future__ import annotations

from sqlalchemy.orm import Session

from agno.agent import Agent
from agno.models.openai import OpenAIChat
from agno.team import Team
from agno.team.mode import TeamMode

from productivity_agent.agent.agno.models import AgnoAgentOutput
from productivity_agent.agent.agno.tools import (
    build_calendar_tools,
    build_coaching_tools,
    build_planning_tools,
)
from productivity_agent.infrastructure.settings import get_openai_settings


def _shared_model() -> OpenAIChat:
    settings = get_openai_settings()
    return OpenAIChat(
        id=settings.model,
        api_key=settings.api_key,
        base_url=settings.base_url,
        temperature=0.2,
    )


def build_calendar_agent(session: Session) -> Agent:
    return Agent(
        name="CalendarAgent",
        role="Handles calendar operations, availability checks, and event mutations.",
        model=_shared_model(),
        tools=build_calendar_tools(session),
        markdown=False,
        output_schema=AgnoAgentOutput,
        instructions=[
            "You are the calendar specialist.",
            "Use tools to inspect or modify events.",
            "Only perform writes when the user clearly asked for them.",
            "Return concise structured output with route=calendar.",
            "Use actions to suggest the next concrete step when helpful.",
            "Route must be exactly one of: calendar, planning, coaching.",
            "Resolve relative dates using the provided current datetime, timezone, and visible calendar range.",
            "Do not assume the current year; use the provided context.",
        ],
    )


def build_planning_agent(session: Session) -> Agent:
    return Agent(
        name="PlanningAgent",
        role="Builds schedule proposals from projects and tasks, then commits them when explicitly asked.",
        model=_shared_model(),
        tools=build_planning_tools(session),
        markdown=False,
        output_schema=AgnoAgentOutput,
        instructions=[
            "You are the scheduling specialist.",
            "Prefer realistic plans over dense plans.",
            "Use build_project_schedule with commit=False by default.",
            "Use commit=True only when the user explicitly wants the schedule applied.",
            "Return structured output with route=planning and include proposal blocks in data when available.",
            "Route must be exactly one of: calendar, planning, coaching.",
            "Resolve relative dates using the provided current datetime, timezone, and visible calendar range.",
            "Do not assume the current year; use the provided context.",
        ],
    )


def build_coaching_agent(session: Session) -> Agent:
    return Agent(
        name="CoachingAgent",
        role="Prioritizes work, identifies neglected projects, and guides project-level decisions.",
        model=_shared_model(),
        tools=build_coaching_tools(session),
        markdown=False,
        output_schema=AgnoAgentOutput,
        instructions=[
            "You are the prioritization and coaching specialist.",
            "Be concrete and opinionated, but avoid unnecessary mutations.",
            "Only park or reprioritize a project when the user clearly asks.",
            "Return structured output with route=coaching.",
            "For general conversation that does not fit calendar or planning, use route=coaching.",
            "When you mention dates or urgency, ground them in the provided current datetime and timezone.",
        ],
    )


def build_agent_team(session: Session) -> Team:
    return Team(
        name="ProductivityAgentTeam",
        mode=TeamMode.route,
        respond_directly=True,
        members=[
            build_calendar_agent(session),
            build_planning_agent(session),
            build_coaching_agent(session),
        ],
        model=_shared_model(),
        markdown=False,
        output_schema=AgnoAgentOutput,
        instructions=[
            "Route the user to the best specialist for the request.",
            "Use the calendar specialist for event and availability operations.",
            "Use the planning specialist for scheduling projects and tasks.",
            "Use the coaching specialist for prioritization, neglect, and brainstorm questions.",
            "Return only the specialist's structured answer.",
            "Route must be exactly one of: calendar, planning, coaching.",
            "For general conversation, default to coaching.",
            "All relative dates must be resolved against the provided current datetime and timezone.",
        ],
    )
