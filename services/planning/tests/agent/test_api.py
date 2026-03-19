from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace

from fastapi.testclient import TestClient

from productivity_agent.agent.agno.models import AgnoAgentOutput
from productivity_agent.agent.models import AgentRoute
from productivity_agent.bootstrap.app import create_app
from productivity_agent.infrastructure.db.base import create_schema


def test_agent_endpoint_returns_structured_response() -> None:
    create_schema()
    app = create_app()

    from productivity_agent.interfaces.api import agent as agent_api

    app.dependency_overrides = {}
    original_runtime = agent_api.PlanningAgentRuntime
    agent_api.PlanningAgentRuntime = lambda: SimpleNamespace(
        respond=lambda request, session: SimpleNamespace(
            route=AgentRoute.PLANNING,
            summary="Prepared 1 block for a project.",
            rationale="Planning rationale",
            insights=[],
            actions=[],
            data={"project_id": "project-1", "blocks": []},
        )
    )

    client = TestClient(app)

    try:
        response = client.post(
            "/api/agent/respond",
            json={
                "message": "Schedule this project",
                "project_id": "project-1",
                "commit": False,
                "now": datetime(2026, 3, 19, 9, 0, tzinfo=timezone.utc).isoformat(),
            },
        )
    finally:
        agent_api.PlanningAgentRuntime = original_runtime

    assert response.status_code == 200
    body = response.json()
    assert body["route"] == "planning"
    assert "summary" in body
    assert "actions" in body
