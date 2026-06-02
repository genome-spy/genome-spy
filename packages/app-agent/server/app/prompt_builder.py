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
    volatile_context: dict[str, Any]
    volatile_context_text: str | None
    history: list[HistoryMessage]
    message: str


def build_prompt_ir(request: ProviderRequest) -> PromptIR:
    """Build the provider-neutral prompt representation for one turn.

    Normalizes the request into the relay's shared prompt structure so provider
    adapters can build their own payloads from one consistent source.

    Args:
        request: Provider request containing the system prompt, stable context,
            volatile context, history, and current user message.

    Returns:
        PromptIR containing the canonical prompt pieces for the current turn.
    """
    context_text = _build_context_text(request.context)
    volatile_context_text = _build_volatile_context_text(request.volatile_context)
    return PromptIR(
        instructions=request.system_prompt,
        context=request.context,
        context_text=context_text,
        volatile_context=request.volatile_context,
        volatile_context_text=volatile_context_text,
        history=request.history,
        message=request.message,
    )


def build_responses_input(prompt: PromptIR) -> list[dict[str, Any]]:
    """Build Responses API input items from the shared prompt structure.

    Converts the provider-neutral prompt representation into the structured
    message list expected by the Responses API. Stable history and context are
    emitted before the volatile context block, which keeps high-churn browser
    state near the current user message.

    Args:
        prompt: Shared prompt representation for the current turn.

    Returns:
        Responses API input items ready for request serialization.
    """
    messages: list[dict[str, Any]] = []
    messages.append(_build_developer_text_item(prompt.context_text))

    volatile_context_history_index = _get_volatile_context_history_insertion_index(
        prompt
    )
    for index, history_message in enumerate(prompt.history):
        if index == volatile_context_history_index and prompt.volatile_context_text:
            messages.append(_build_developer_text_item(prompt.volatile_context_text))
        messages.extend(_build_response_messages([history_message]))

    # Keep volatile browser state after the stable prompt prefix and prior
    # conversation, immediately before the current user message when present.
    # This preserves prompt-cache reuse for stable context and makes the state
    # read as the current snapshot that follows the earlier conversation.
    if (
        volatile_context_history_index == len(prompt.history)
        and prompt.volatile_context_text
    ):
        messages.append(_build_developer_text_item(prompt.volatile_context_text))
    if prompt.message:
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


def _get_volatile_context_history_insertion_index(prompt: PromptIR) -> int:
    """Return the history index before which volatile context should be inserted.

    Normal user turns keep volatile context after all previous conversation and
    just before the current user message. Continuation turns after tool calls
    keep rejected tool outputs after volatile context so the rejection remains
    the most recent actionable item.
    """
    if prompt.message:
        return len(prompt.history)

    last_successful_tool_result_index = -1
    last_rejected_tool_result_index = -1
    for index, message in enumerate(prompt.history):
        if message.role != "tool":
            continue

        if message.rejected is True:
            last_rejected_tool_result_index = index
        else:
            last_successful_tool_result_index = index

    if last_successful_tool_result_index >= 0:
        return last_successful_tool_result_index + 1

    if last_rejected_tool_result_index >= 0:
        return last_rejected_tool_result_index

    return len(prompt.history)


def _build_context_text(context: dict[str, Any]) -> str:
    return "Current GenomeSpy context snapshot:\n" + json.dumps(
        context, indent=2, ensure_ascii=False
    )


def _build_volatile_context_text(volatile_context: dict[str, Any]) -> str | None:
    """Serialize browser-owned volatile state as an opaque late prompt block.

    GenomeSpy App decides which fields belong in volatile context. The Python
    relay deliberately does not inspect those fields because this keeps the
    server independent of browser-side interaction details. The relay only
    serializes the object after conversation history and stable context, close
    to the current user message, so high-churn interaction state does not
    invalidate more of the prompt prefix than necessary.
    """
    if not volatile_context:
        return None

    return "Current volatile GenomeSpy state:\n" + json.dumps(
        volatile_context, indent=2, ensure_ascii=False
    )


def _build_developer_text_item(text: str) -> dict[str, Any]:
    return {
        "role": "developer",
        "content": [
            {
                "type": "input_text",
                "text": text,
            }
        ],
    }


def _build_response_messages(history: list[HistoryMessage]) -> list[dict[str, Any]]:
    messages: list[dict[str, Any]] = []
    for message in history:
        if message.role == "tool":
            messages.append(_build_tool_output_message(message))
            continue

        if message.tool_calls:
            messages.extend(_build_assistant_tool_messages(message))
            continue

        messages.append(_build_standard_message(message))

    return messages


def _build_tool_output_message(message: HistoryMessage) -> dict[str, Any]:
    return {
        "type": "function_call_output",
        "call_id": message.tool_call_id or message.id,
        "output": _stringify_tool_output(message),
    }


def _build_assistant_tool_messages(message: HistoryMessage) -> list[dict[str, Any]]:
    messages: list[dict[str, Any]] = []
    if message.text:
        messages.append(_build_standard_message(message))

    messages.extend(
        {
            "type": "function_call",
            "call_id": tool_call.call_id,
            "name": tool_call.name,
            "arguments": _stringify_tool_arguments(tool_call.arguments),
        }
        for tool_call in message.tool_calls
    )
    return messages


def _build_standard_message(message: HistoryMessage) -> dict[str, Any]:
    content_type = "output_text" if message.role == "assistant" else "input_text"
    response_message: dict[str, Any] = {
        "id": _normalize_message_id(message.id),
        "type": "message",
        "status": "completed",
        "role": message.role,
        "content": [{"type": content_type, "text": message.text}],
    }
    if message.role == "assistant" and message.phase is not None:
        response_message["phase"] = message.phase

    return response_message


def _stringify_content(content: Any, fallback: str) -> str:
    if isinstance(content, str):
        return content

    if content is None:
        return fallback

    return json.dumps(content, ensure_ascii=False, sort_keys=True)


def _stringify_tool_arguments(arguments: Any) -> str:
    """Return valid JSON for historical function-call arguments.

    Some providers return malformed tool-call argument strings. Those may still
    be useful for local validation and rejection handling in the browser, but
    sending the malformed string back through a strict Responses API causes the
    next turn to fail before the model can repair the call. For request history,
    keep valid JSON as-is and fall back to `{}` when the original argument
    string is not valid JSON.
    """
    if isinstance(arguments, str):
        try:
            parsed = json.loads(arguments)
        except Exception:
            return "{}"
        return json.dumps(parsed, ensure_ascii=False, sort_keys=True)

    return _stringify_content(arguments, "{}")


def _stringify_tool_output(message: HistoryMessage) -> str:
    if message.content is None:
        return message.text

    if not message.text:
        return _stringify_content(message.content, "")

    return json.dumps(
        {
            "message": message.text,
            "content": message.content,
        },
        ensure_ascii=False,
        sort_keys=True,
    )


def _normalize_message_id(message_id: str) -> str:
    if message_id.startswith("msg"):
        return message_id

    return "msg_" + message_id
