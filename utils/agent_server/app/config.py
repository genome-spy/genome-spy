from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Literal, cast

DEFAULT_SYSTEM_PROMPT = (
    "You are an AI assistant in GenomeSpy, a visual analytics app for genomic "
    "data. Answer only from the provided context and conversation. If the user "
    "question is ambiguous, respond with a clarification question. Return JSON "
    'with keys "type" and "message", where "type" is either "answer" or '
    '"clarify".'
)


@dataclass(frozen=True)
class Settings:
    model: str
    base_url: str
    api_key: str
    timeout_seconds: float
    system_prompt: str
    api_style: Literal["responses", "chat_completions"]


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
            "GENOMESPY_AGENT_SYSTEM_PROMPT", DEFAULT_SYSTEM_PROMPT
        ),
        api_style=cast(Literal["responses", "chat_completions"], api_style),
    )
