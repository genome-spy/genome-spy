from __future__ import annotations

import os
from dataclasses import dataclass
from importlib import resources
from typing import Literal, cast


@dataclass(frozen=True)
class Settings:
    model: str
    base_url: str
    api_key: str
    timeout_seconds: float
    system_prompt: str
    api_style: Literal["responses", "chat_completions"]
    enable_streaming: bool


def load_default_system_prompt() -> str:
    return resources.files(__package__).joinpath(
        "prompts/genomespy_system_prompt.md"
    ).read_text(encoding="utf-8").strip()


def load_settings() -> Settings:
    api_style = os.environ.get("GENOMESPY_AGENT_API_STYLE", "responses")
    if api_style not in {"responses", "chat_completions"}:
        raise ValueError(
            "GENOMESPY_AGENT_API_STYLE must be one of: responses, chat_completions"
        )

    return Settings(
        model=os.environ["GENOMESPY_AGENT_MODEL"],
        base_url=os.environ.get(
            "GENOMESPY_AGENT_BASE_URL", "http://127.0.0.1:11434/v1"
        ).rstrip("/"),
        api_key=os.environ.get("GENOMESPY_AGENT_API_KEY", "ollama"),
        timeout_seconds=float(
            os.environ.get("GENOMESPY_AGENT_TIMEOUT_SECONDS", "180")
        ),
        system_prompt=os.environ.get(
            "GENOMESPY_AGENT_SYSTEM_PROMPT", load_default_system_prompt()
        ),
        api_style=cast(Literal["responses", "chat_completions"], api_style),
        enable_streaming=_load_bool_env("GENOMESPY_AGENT_ENABLE_STREAMING", True),
    )


def _load_bool_env(name: str, default: bool) -> bool:
    raw_value = os.environ.get(name)
    if raw_value is None:
        return default

    normalized = raw_value.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True

    if normalized in {"0", "false", "no", "off"}:
        return False

    raise ValueError(
        name + " must be one of: true, false, yes, no, on, off, 1, 0"
    )
