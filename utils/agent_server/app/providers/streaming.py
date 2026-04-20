from __future__ import annotations

import json
import logging
from typing import Any, AsyncIterator, Callable

import httpx

from app.models import ProviderResponse, ProviderStreamEvent, ToolCall
from app.providers.parsing import (
    _classify_stream_text,
    _looks_like_structured_response,
    _parse_tool_arguments,
)

logger = logging.getLogger(__name__)


async def iter_provider_stream_events(
    response: httpx.Response,
    parse_provider_response_text: Callable[[str, bool], ProviderResponse],
    normalize_provider_text: Callable[[str], str],
    truncate_logged_content: Callable[[str], str],
) -> AsyncIterator[ProviderStreamEvent]:
    """Yield normalized stream events from a provider SSE response."""
    text_parts: list[str] = []
    reasoning_parts: list[str] = []
    tool_calls_by_id: dict[str, ToolCall] = {}
    stream_mode: str | None = None
    final_snapshot_text = ""

    async for event_name, data_text in _iter_sse_events(response):
        logger.debug(
            "Provider raw SSE event %s from Responses API:\n%s",
            event_name,
            data_text,
        )
        if data_text == "[DONE]":
            break

        payload = _load_stream_event_payload(data_text)
        _collect_stream_tool_calls(tool_calls_by_id, payload, event_name)
        if event_name.endswith(".done"):
            snapshot_text = _extract_stream_text(payload, event_name)
            if snapshot_text:
                final_snapshot_text = normalize_provider_text(snapshot_text)
            continue

        text_delta = _extract_stream_text(payload, event_name)
        if text_delta:
            text_delta = normalize_provider_text(text_delta)
            text_parts.append(text_delta)
            if stream_mode is None:
                stream_mode = _classify_stream_text("".join(text_parts))
                if stream_mode == "prose":
                    yield ProviderStreamEvent(
                        type="delta",
                        delta="".join(text_parts),
                    )
            elif stream_mode == "prose":
                yield ProviderStreamEvent(
                    type="delta",
                    delta=text_delta,
                )

        reasoning_delta = _extract_stream_reasoning(payload, event_name)
        if reasoning_delta:
            reasoning_delta = normalize_provider_text(reasoning_delta)
            reasoning_parts.append(reasoning_delta)
            yield ProviderStreamEvent(
                type="reasoning_delta",
                reasoning=reasoning_delta,
            )

        if _is_stream_heartbeat(event_name, payload):
            yield ProviderStreamEvent(type="heartbeat")

    final_text = final_snapshot_text or "".join(text_parts).strip()
    if _looks_like_structured_response(final_text):
        final_text = ""
    if not final_text and reasoning_parts:
        final_text = "".join(reasoning_parts).strip()

    logger.debug(
        "Provider stream collected final text: parts=%d reasoning_parts=%d preview=%s",
        len(text_parts),
        len(reasoning_parts),
        truncate_logged_content(final_text),
    )
    if tool_calls_by_id:
        yield ProviderStreamEvent(
            type="final",
            response=ProviderResponse(
                type="tool_call",
                message=normalize_provider_text(final_text) if final_text else None,
                tool_calls=list(tool_calls_by_id.values()),
            ),
        )
        return

    yield ProviderStreamEvent(
        type="final",
        response=parse_provider_response_text(final_text, allow_repair=True),
    )


async def _iter_sse_events(
    response: httpx.Response,
) -> AsyncIterator[tuple[str, str]]:
    """Yield parsed SSE event names and data blocks."""
    event_name = "message"
    data_lines: list[str] = []

    async for line in response.aiter_lines():
        if line == "":
            if data_lines:
                yield event_name, "\n".join(data_lines)
                event_name = "message"
                data_lines = []
            continue

        if line.startswith(":"):
            continue

        field, separator, value = line.partition(":")
        if separator == "":
            continue

        if value.startswith(" "):
            value = value[1:]

        if field == "event":
            event_name = value
        elif field == "data":
            data_lines.append(value)

    if data_lines:
        yield event_name, "\n".join(data_lines)


def _load_stream_event_payload(data_text: str) -> Any:
    """Parse one SSE data payload when it is JSON."""
    try:
        return json.loads(data_text)
    except Exception:
        return data_text


def _extract_stream_text(payload: Any, event_name: str) -> str:
    """Extract text content from one stream event payload."""
    if isinstance(payload, str):
        return ""

    if not isinstance(payload, dict):
        return ""

    if isinstance(payload.get("delta"), str):
        return payload["delta"]

    if isinstance(payload.get("text"), str):
        return payload["text"]

    choices = payload.get("choices")
    if isinstance(choices, list) and choices:
        first_choice = choices[0]
        if isinstance(first_choice, dict):
            delta = first_choice.get("delta")
            if isinstance(delta, dict):
                if isinstance(delta.get("content"), str):
                    return delta["content"]
                if isinstance(delta.get("text"), str):
                    return delta["text"]

            if event_name.startswith("response.output_text"):
                message = first_choice.get("message")
                if isinstance(message, dict):
                    content = message.get("content")
                    if isinstance(content, str):
                        return content

    content = payload.get("content")
    if isinstance(content, str):
        return content

    return ""


def _extract_stream_reasoning(payload: Any, event_name: str) -> str:
    """Extract reasoning text from one stream event payload."""
    if isinstance(payload, str):
        return ""

    if not isinstance(payload, dict):
        return ""

    if isinstance(payload.get("reasoning_content"), str):
        return payload["reasoning_content"]

    if isinstance(payload.get("reasoning_summary"), str):
        return payload["reasoning_summary"]

    if "reasoning" in event_name and isinstance(payload.get("delta"), str):
        return payload["delta"]

    choices = payload.get("choices")
    if isinstance(choices, list) and choices:
        first_choice = choices[0]
        if isinstance(first_choice, dict):
            delta = first_choice.get("delta")
            if isinstance(delta, dict):
                reasoning_delta = delta.get("reasoning_content")
                if isinstance(reasoning_delta, str):
                    return reasoning_delta

    return ""


def _is_stream_heartbeat(event_name: str, payload: Any) -> bool:
    """Detect heartbeat-style stream events."""
    if "heartbeat" in event_name or "progress" in event_name:
        return True

    if isinstance(payload, dict):
        return payload.get("type") in {"heartbeat", "progress"}

    return False


def _collect_stream_tool_calls(
    tool_calls_by_id: dict[str, ToolCall], payload: Any, event_name: str
) -> None:
    """Collect tool calls surfaced by one stream event."""
    candidate_payloads: list[Any] = [payload]
    if isinstance(payload, dict):
        candidate_payloads.append(payload.get("item"))
        candidate_payloads.append(payload.get("response"))

    for candidate in candidate_payloads:
        tool_call = _extract_tool_call(candidate, event_name)
        if tool_call is not None:
            tool_calls_by_id[tool_call.call_id] = tool_call


def _extract_tool_call(payload: Any, event_name: str) -> ToolCall | None:
    """Build one tool call from a stream payload when present."""
    if not isinstance(payload, dict):
        return None

    item_type = payload.get("type")
    if item_type not in {"function_call", "tool_call"} and (
        "function_call" not in event_name
    ):
        return None

    call_id = payload.get("call_id") or payload.get("callId")
    if not isinstance(call_id, str):
        return None

    name = payload.get("name")
    if not isinstance(name, str):
        return None

    arguments = payload.get("arguments")
    if arguments is None and isinstance(payload.get("function"), dict):
        function = payload["function"]
        name = function.get("name") if isinstance(function.get("name"), str) else name
        arguments = function.get("arguments")

    return ToolCall(
        call_id=call_id,
        name=name,
        arguments=_parse_tool_arguments(arguments),
    )
