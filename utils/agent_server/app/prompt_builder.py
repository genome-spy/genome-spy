from __future__ import annotations

import json
from typing import Any

from .models import HistoryMessage, ProviderRequest


def build_chat_completions_messages(request: ProviderRequest) -> list[dict[str, str]]:
    messages: list[dict[str, str]] = [
        {"role": "system", "content": request.system_prompt},
        {
            "role": "system",
            "content": (
                "Current GenomeSpy context snapshot:\n"
                + json.dumps(request.context, indent=2, ensure_ascii=True)
            ),
        },
    ]

    messages.extend(_build_text_messages(request.history))
    messages.append({"role": "user", "content": request.message})
    return messages


def build_responses_input(request: ProviderRequest) -> list[dict[str, Any]]:
    messages: list[dict[str, Any]] = [
        {
            "role": "developer",
            "content": [
                {
                    "type": "input_text",
                    "text": (
                        "Current GenomeSpy context snapshot:\n"
                        + json.dumps(request.context, indent=2, ensure_ascii=True)
                    ),
                }
            ],
        }
    ]

    messages.extend(_build_response_messages(request.history))
    messages.append(
        {
            "role": "user",
            "content": [
                {
                    "type": "input_text",
                    "text": request.message,
                }
            ],
        }
    )
    return messages


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
