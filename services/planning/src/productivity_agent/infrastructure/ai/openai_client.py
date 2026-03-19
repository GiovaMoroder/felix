from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from openai import OpenAI

from productivity_agent.infrastructure.settings import OpenAISettings, get_openai_settings


class ResponsesApi(Protocol):
    def create(self, *, model: str, input: list[dict[str, str]]) -> object:
        ...


class OpenAIProtocol(Protocol):
    responses: ResponsesApi


@dataclass(slots=True)
class OpenAIChatClient:
    client: OpenAIProtocol
    model: str

    def generate_text(self, *, prompt: str, system_prompt: str | None = None) -> str:
        messages: list[dict[str, str]] = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        response = self.client.responses.create(model=self.model, input=messages)
        output_text = getattr(response, "output_text", None)
        if not output_text:
            raise RuntimeError("OpenAI response did not include output_text.")
        return output_text


def build_openai_chat_client(settings: OpenAISettings | None = None) -> OpenAIChatClient:
    resolved = settings or get_openai_settings()
    client = OpenAI(
        api_key=resolved.api_key,
        base_url=resolved.base_url,
    )
    return OpenAIChatClient(client=client, model=resolved.model)
