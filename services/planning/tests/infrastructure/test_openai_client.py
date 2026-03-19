from __future__ import annotations

from types import SimpleNamespace

import pytest

from productivity_agent.infrastructure.ai.openai_client import OpenAIChatClient
from productivity_agent.infrastructure.settings import load_openai_settings


def test_openai_settings_require_api_key() -> None:
    with pytest.raises(RuntimeError):
        load_openai_settings({})


def test_openai_settings_read_model_and_base_url() -> None:
    settings = load_openai_settings(
        {
            "OPENAI_API_KEY": "test-key",
            "OPENAI_MODEL": "gpt-4.1-mini",
            "OPENAI_BASE_URL": "https://example.com/v1",
        }
    )

    assert settings.api_key == "test-key"
    assert settings.model == "gpt-4.1-mini"
    assert settings.base_url == "https://example.com/v1"


def test_openai_chat_client_returns_output_text() -> None:
    fake_client = SimpleNamespace(
        responses=SimpleNamespace(
            create=lambda **_: SimpleNamespace(output_text="planned response")
        )
    )
    client = OpenAIChatClient(client=fake_client, model="gpt-4.1-mini")

    result = client.generate_text(prompt="Plan my day", system_prompt="Be concise.")

    assert result == "planned response"
