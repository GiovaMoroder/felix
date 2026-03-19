from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Mapping

from dotenv import load_dotenv

SERVICE_ROOT = Path(__file__).resolve().parents[3]
ENV_FILE = SERVICE_ROOT / ".env"


@dataclass(frozen=True, slots=True)
class OpenAISettings:
    api_key: str
    model: str
    base_url: str | None = None


def load_environment() -> None:
    load_dotenv(dotenv_path=ENV_FILE, override=False)


def load_openai_settings(env: Mapping[str, str] | None = None) -> OpenAISettings:
    source = env or os.environ

    api_key = source.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError(
            "OPENAI_API_KEY is not set. Add it to services/planning/.env or your shell environment."
        )

    model = source.get("OPENAI_MODEL", "gpt-4.1-mini").strip() or "gpt-4.1-mini"
    base_url = source.get("OPENAI_BASE_URL", "").strip() or None
    return OpenAISettings(api_key=api_key, model=model, base_url=base_url)


@lru_cache(maxsize=1)
def get_openai_settings() -> OpenAISettings:
    load_environment()
    return load_openai_settings()
