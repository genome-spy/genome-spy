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


def build_chat_completions_messages(prompt: PromptIR) -> list[dict[str, Any]]:
    messages: list[dict[str, Any]] = [
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
    prompt_context = _build_prompt_context(context)
    return (
        "Current GenomeSpy context snapshot:\n"
        + json.dumps(prompt_context, indent=2, ensure_ascii=False)
    )


def _build_prompt_context(context: dict[str, Any]) -> dict[str, Any]:
    prompt_context = dict(context)
    prompt_context.pop("toolCatalog", None)
    return prompt_context


def _build_text_messages(history: list[HistoryMessage]) -> list[dict[str, Any]]:
    messages: list[dict[str, Any]] = []
    for message in history:
        if message.role == "tool":
            messages.append(
                {
                    "role": "tool",
                    "content": _stringify_content(message.content, message.text),
                }
            )
        elif message.tool_calls:
            content: dict[str, Any] = {
                "role": "assistant",
                "content": message.text,
                "tool_calls": [
                    {
                        "id": tool_call.call_id,
                        "type": "function",
                        "function": {
                            "name": tool_call.name,
                            "arguments": _stringify_content(
                                tool_call.arguments, "{}"
                            ),
                        },
                    }
                    for tool_call in message.tool_calls
                ],
            }
            messages.append(content)
        else:
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
        if message.role == "tool":
            output = _stringify_content(message.content, message.text)
            messages.append(
                {
                    "type": "function_call_output",
                    "call_id": message.tool_call_id or message.id,
                    "output": output,
                }
            )
            continue

        if message.tool_calls:
            if message.text:
                messages.append(
                    {
                        "id": _normalize_message_id(message.id),
                        "type": "message",
                        "status": "completed",
                        "role": "assistant",
                        "content": [
                            {
                                "type": "output_text",
                                "text": message.text,
                            }
                        ],
                    }
                )

            messages.extend(
                {
                    "type": "function_call",
                    "call_id": tool_call.call_id,
                    "name": tool_call.name,
                    "arguments": _stringify_content(tool_call.arguments, "{}"),
                }
                for tool_call in message.tool_calls
            )
            continue

        content_type = "output_text" if message.role == "assistant" else "input_text"
        content = [{"type": content_type, "text": message.text}]
        messages.append(
            {
                "id": _normalize_message_id(message.id),
                "type": "message",
                "status": "completed",
                "role": message.role,
                "content": content,
            }
        )

    return messages


def _stringify_content(content: Any, fallback: str) -> str:
    if isinstance(content, str):
        return content

    if content is None:
        return fallback

    return json.dumps(content, ensure_ascii=False, sort_keys=True)


def _normalize_message_id(message_id: str) -> str:
    if message_id.startswith("msg"):
        return message_id

    return "msg_" + message_id
