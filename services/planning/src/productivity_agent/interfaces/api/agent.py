from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from productivity_agent.agent.models import AgentRequest, AgentResponse
from productivity_agent.agent.runtime import PlanningAgentRuntime
from productivity_agent.infrastructure.db.base import SessionLocal

router = APIRouter(prefix="/agent", tags=["agent"])


def get_session() -> Session:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


SessionDependency = Annotated[Session, Depends(get_session)]


@router.post("/respond", response_model=AgentResponse)
def respond(payload: AgentRequest, session: SessionDependency) -> AgentResponse:
    runtime = PlanningAgentRuntime()
    return runtime.respond(request=payload, session=session)
