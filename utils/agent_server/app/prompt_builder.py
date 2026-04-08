from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from .models import HistoryMessage, ProviderRequest


@dataclass(frozen=True)
class PromptIR:
    """Provider-neutral prompt data for a single request turn."""

    instructions: str
    context: dict[str, Any]
    context_text: str
    history: list[HistoryMessage]
    message: str


def build_prompt_ir(request: ProviderRequest) -> PromptIR:
    context_text = _build_context_text(request.context)
    return PromptIR(
        instructions=request.system_prompt,
        context=request.context,
        context_text=context_text,
        history=request.history,
        message=request.message,
    )


def build_chat_completions_messages(prompt: PromptIR) -> list[dict[str, str]]:
    messages: list[dict[str, str]] = [
        {"role": "system", "content": prompt.instructions},
        {
            "role": "system",
            "content": prompt.context_text,
        },
    ]

    messages.extend(_build_text_messages(prompt.history))
    messages.append({"role": "user", "content": prompt.message})
    return messages


def build_responses_input(prompt: PromptIR) -> list[dict[str, Any]]:
    messages: list[dict[str, Any]] = [
        {
            "role": "developer",
            "content": [
                {
                    "type": "input_text",
                    "text": prompt.context_text,
                }
            ],
        }
    ]

    messages.extend(_build_response_messages(prompt.history))
    messages.append(
        {
            "role": "user",
            "content": [
                {
                    "type": "input_text",
                    "text": prompt.message,
                }
            ],
        }
    )
    return messages


def _build_context_text(context: dict[str, Any]) -> str:
    return (
        "Current GenomeSpy context snapshot:\n"
        + json.dumps(context, indent=2, ensure_ascii=False, sort_keys=True)
    )


def _build_text_messages(history: list[HistoryMessage]) -> list[dict[str, str]]:
    messages: list[dict[str, str]] = []
    for message in history:
        messages.append(
            {
                "role": message.role,
                "content": message.text,
            }
        )

    return messages


def _build_response_messages(history: list[HistoryMessage]) -> list[dict[str, Any]]:
    messages: list[dict[str, Any]] = []
    for message in history:
        content_type = "output_text" if message.role == "assistant" else "input_text"
        content = [{"type": content_type, "text": message.text}]
        messages.append(
            {
                "id": message.id,
                "type": "message",
                "status": "completed",
                "role": message.role,
                "content": content,
            }
        )

    return messages
