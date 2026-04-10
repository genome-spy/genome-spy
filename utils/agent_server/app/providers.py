from __future__ import annotations

import json
import logging
import os
import re
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, AsyncIterator

import httpx

from .config import Settings, describe_api_key_for_logs
from .models import ProviderRequest, ProviderResponse, ProviderStreamEvent, ToolCall
from .prompt_builder import (
    build_chat_completions_messages,
    build_prompt_ir,
    build_responses_input,
)

logger = logging.getLogger(__name__)
MAX_LOGGED_PROVIDER_CONTENT = 4000
ENABLE_RESPONSES_TOOLS = True
PREFLIGHT_LOG_PATH = Path(
    os.environ.get(
        "GENOMESPY_AGENT_PREFLIGHT_LOG_PATH",
        "/tmp/genomespy-agent-preflight.log",
    )
)


class ProviderError(RuntimeError):
    """Raised when the upstream provider returns an invalid response."""


class BaseProvider(ABC):
    @abstractmethod
    async def generate(self, request: ProviderRequest) -> ProviderResponse:
        raise NotImplementedError

    async def generate_stream(
        self, request: ProviderRequest
    ) -> AsyncIterator[ProviderStreamEvent]:
        response = await self.generate(request)
        yield ProviderStreamEvent(type="final", response=response)


def _build_auth_headers(settings: Settings) -> dict[str, str]:
    return {
        "authorization": "Bearer " + settings.api_key,
        "content-type": "application/json",
    }


def _log_provider_auth_diagnostic(
    provider_name: str, endpoint: str, settings: Settings, status_code: int
) -> None:
    if status_code != 401:
        return

    logger.warning(
        (
            "Provider auth diagnostic: provider=%s endpoint=%s base_url=%s "
            "api_style=%s model=%s api_key=%s api_key_has_whitespace=%s "
            "authorization=Bearer <redacted>"
        ),
        provider_name,
        endpoint,
        settings.base_url,
        settings.api_style,
        settings.model,
        describe_api_key_for_logs(settings.api_key),
        settings.api_key != settings.api_key.strip(),
    )


class OpenAIResponsesProvider(BaseProvider):
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    async def generate(self, request: ProviderRequest) -> ProviderResponse:
        prompt = build_prompt_ir(request)
        tools = _build_responses_tools()
        payload = {
            "model": self._settings.model,
            "instructions": prompt.instructions,
            "input": build_responses_input(prompt),
        }
        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = "auto"
        _log_model_request(prompt.instructions, prompt.context_text, tools)
        endpoint = self._settings.base_url + "/responses"
        headers = _build_auth_headers(self._settings)

        async with httpx.AsyncClient(
            timeout=self._settings.timeout_seconds
        ) as client:
            try:
                response = await client.post(
                    endpoint,
                    json=payload,
                    headers=headers,
                )
            except httpx.ReadTimeout as exc:
                raise ProviderError(
                    "Provider request timed out after "
                    + str(self._settings.timeout_seconds)
                    + " seconds. Local models may need extra warm-up time on "
                    + "their first request."
                ) from exc
            except Exception as exc:
                raise ProviderError(
                    "Provider HTTP request failed: " + repr(exc)
                ) from exc

        if response.status_code >= 400:
            _log_provider_auth_diagnostic(
                "responses", endpoint, self._settings, response.status_code
            )
            body_preview = response.text.strip()
            logger.error(
                "Provider request failed with status %s: %s",
                response.status_code,
                body_preview,
            )
            raise ProviderError(
                "Provider returned HTTP "
                + str(response.status_code)
                + ": "
                + (body_preview or "no response body")
            )

        try:
            response_json = response.json()
        except Exception as exc:
            logger.warning(
                "Provider raw outer response from Responses API: %r",
                response.text,
            )
            raise ProviderError(
                "Provider response was not valid JSON: "
                + _truncate_logged_content(response.text)
            ) from exc

        logger.debug(
            "Provider raw outer response from Responses API: %r",
            response.text,
        )
        response_payload = _parse_responses_response(response_json)
        logger.debug(
            "Provider parsed response from Responses API: %r",
            response_payload.model_dump(),
        )
        return response_payload

    async def generate_stream(
        self, request: ProviderRequest
    ) -> AsyncIterator[ProviderStreamEvent]:
        prompt = build_prompt_ir(request)
        tools = _build_responses_tools()
        payload = {
            "model": self._settings.model,
            "instructions": prompt.instructions,
            "input": build_responses_input(prompt),
            "stream": True,
        }
        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = "auto"
        _log_model_request(prompt.instructions, prompt.context_text, tools)
        endpoint = self._settings.base_url + "/responses"
        headers = _build_auth_headers(self._settings)

        async with httpx.AsyncClient(
            timeout=self._settings.timeout_seconds
        ) as client:
            try:
                async with client.stream(
                    "POST",
                    endpoint,
                    json=payload,
                    headers=headers,
                ) as response:
                    if response.status_code >= 400:
                        _log_provider_auth_diagnostic(
                            "responses", endpoint, self._settings, response.status_code
                        )
                        body = await response.aread()
                        body_preview = body.decode("utf-8", errors="replace").strip()
                        logger.error(
                            "Provider request failed with status %s: %s",
                            response.status_code,
                            body_preview,
                        )
                        raise ProviderError(
                            "Provider returned HTTP "
                            + str(response.status_code)
                            + ": "
                            + (body_preview or "no response body")
                        )

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
                        _collect_stream_tool_calls(
                            tool_calls_by_id, payload, event_name
                        )
                        if event_name.endswith(".done"):
                            snapshot_text = _extract_stream_text(payload, event_name)
                            if snapshot_text:
                                final_snapshot_text = snapshot_text
                            continue

                        text_delta = _extract_stream_text(payload, event_name)
                        if text_delta:
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
                        (
                            "Provider stream collected final text: "
                            "parts=%d reasoning_parts=%d preview=%s"
                        ),
                        len(text_parts),
                        len(reasoning_parts),
                        _truncate_logged_content(final_text),
                    )
                    if tool_calls_by_id:
                        yield ProviderStreamEvent(
                            type="final",
                            response=ProviderResponse(
                                type="tool_call",
                                message=(
                                    _normalize_provider_text(final_text)
                                    if final_text
                                    else None
                                ),
                                tool_calls=list(tool_calls_by_id.values()),
                            ),
                        )
                        return
                    yield ProviderStreamEvent(
                        type="final",
                        response=_parse_provider_response_text(
                            final_text, allow_repair=True
                        ),
                    )
            except httpx.ReadTimeout as exc:
                raise ProviderError(
                    "Provider request timed out after "
                    + str(self._settings.timeout_seconds)
                    + " seconds. Local models may need extra warm-up time on "
                    + "their first request."
                ) from exc
            except Exception as exc:
                raise ProviderError(
                    "Provider HTTP request failed: " + repr(exc)
                ) from exc


class OpenAIChatCompletionsProvider(BaseProvider):
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    async def generate(self, request: ProviderRequest) -> ProviderResponse:
        prompt = build_prompt_ir(request)
        payload = {
            "model": self._settings.model,
            "messages": build_chat_completions_messages(prompt),
        }
        _log_model_request(prompt.instructions, prompt.context_text, [])
        endpoint = self._settings.base_url + "/chat/completions"
        headers = _build_auth_headers(self._settings)

        async with httpx.AsyncClient(
            timeout=self._settings.timeout_seconds
        ) as client:
            try:
                response = await client.post(
                    endpoint,
                    json=payload,
                    headers=headers,
                )
            except httpx.ReadTimeout as exc:
                raise ProviderError(
                    "Provider request timed out after "
                    + str(self._settings.timeout_seconds)
                    + " seconds. Local models may need extra warm-up time on "
                    + "their first request."
                ) from exc
            except Exception as exc:
                raise ProviderError(
                    "Provider HTTP request failed: " + repr(exc)
                ) from exc

        if response.status_code >= 400:
            _log_provider_auth_diagnostic(
                "chat_completions", endpoint, self._settings, response.status_code
            )
            body_preview = response.text.strip()
            logger.error(
                "Provider request failed with status %s: %s",
                response.status_code,
                body_preview,
            )
            raise ProviderError(
                "Provider returned HTTP "
                + str(response.status_code)
                + ": "
                + (body_preview or "no response body")
            )

        try:
            response_json = response.json()
        except Exception as exc:
            logger.warning(
                "Provider raw outer response from Responses API: %r",
                response.text,
            )
            raise ProviderError(
                "Provider response was not valid JSON: "
                + _truncate_logged_content(response.text)
            ) from exc

        logger.debug(
            "Provider raw outer response from Responses API: %r",
            response.text,
        )
        response_payload = _parse_chat_completions_response(response_json)
        logger.debug(
            "Provider parsed response from Responses API: %r",
            response_payload.model_dump(),
        )
        return response_payload

    async def generate_stream(
        self, request: ProviderRequest
    ) -> AsyncIterator[ProviderStreamEvent]:
        prompt = build_prompt_ir(request)
        payload = {
            "model": self._settings.model,
            "messages": build_chat_completions_messages(prompt),
            "response_format": {
                "type": "json_schema",
                "json_schema": {
                    "name": "genomespy_plan_response",
                    "strict": True,
                    "schema": {
                        "type": "object",
                        "additionalProperties": False,
                        "required": ["type", "message"],
                        "properties": {
                            "type": {
                                "type": "string",
                                "enum": ["answer", "clarify"],
                            },
                            "message": {"type": "string"},
                        },
                    },
                },
            },
            "stream": True,
        }
        _log_model_request(prompt.instructions, prompt.context_text, [])
        endpoint = self._settings.base_url + "/chat/completions"
        headers = _build_auth_headers(self._settings)

        async with httpx.AsyncClient(
            timeout=self._settings.timeout_seconds
        ) as client:
            try:
                async with client.stream(
                    "POST",
                    endpoint,
                    json=payload,
                    headers=headers,
                ) as response:
                    if response.status_code >= 400:
                        _log_provider_auth_diagnostic(
                            "chat_completions",
                            endpoint,
                            self._settings,
                            response.status_code,
                        )
                        body = await response.aread()
                        body_preview = body.decode("utf-8", errors="replace").strip()
                        logger.error(
                            "Provider request failed with status %s: %s",
                            response.status_code,
                            body_preview,
                        )
                        raise ProviderError(
                            "Provider returned HTTP "
                            + str(response.status_code)
                            + ": "
                            + (body_preview or "no response body")
                        )

                    text_parts: list[str] = []
                    reasoning_parts: list[str] = []
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
                        if event_name.endswith(".done"):
                            snapshot_text = _extract_stream_text(payload, event_name)
                            if snapshot_text:
                                final_snapshot_text = snapshot_text
                            continue

                        text_delta = _extract_stream_text(payload, event_name)
                        if text_delta:
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
                            reasoning_parts.append(reasoning_delta)
                            yield ProviderStreamEvent(
                                type="reasoning_delta",
                                reasoning=reasoning_delta,
                            )

                        if _is_stream_heartbeat(event_name, payload):
                            yield ProviderStreamEvent(type="heartbeat")

                    final_text = final_snapshot_text or "".join(text_parts).strip()
                    if not final_text and reasoning_parts:
                        final_text = "".join(reasoning_parts).strip()

                    logger.debug(
                        (
                            "Provider stream collected final text: "
                            "parts=%d reasoning_parts=%d preview=%s"
                        ),
                        len(text_parts),
                        len(reasoning_parts),
                        _truncate_logged_content(final_text),
                    )
                    yield ProviderStreamEvent(
                        type="final",
                        response=_parse_provider_response_text(
                            final_text, allow_repair=True
                        ),
                    )
            except httpx.ReadTimeout as exc:
                raise ProviderError(
                    "Provider request timed out after "
                    + str(self._settings.timeout_seconds)
                    + " seconds. Local models may need extra warm-up time on "
                    + "their first request."
                ) from exc
            except Exception as exc:
                raise ProviderError(
                    "Provider HTTP request failed: " + repr(exc)
                ) from exc


def _build_responses_tools() -> list[dict[str, Any]]:
    if not ENABLE_RESPONSES_TOOLS:
        return []

    from .tool_catalog import build_responses_tool_definitions

    return build_responses_tool_definitions()


def _log_model_request(
    instructions: str, context_text: str, tools: list[dict[str, Any]]
) -> None:
    dump = (
        "\n=== GenomeSpy agent preflight ===\n"
        + "Timestamp: "
        + datetime.now(timezone.utc).isoformat()
        + "\n"
        + "Instructions:\n"
        + instructions
        + "\n\nContext:\n"
        + context_text
        + "\n\nTools:\n"
        + json.dumps(tools, ensure_ascii=False, indent=2)
        + "\n=== End preflight ===\n"
    )
    _append_preflight_log(dump)


def _append_preflight_log(text: str) -> None:
    PREFLIGHT_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with PREFLIGHT_LOG_PATH.open("a", encoding="utf-8") as handle:
        handle.write(text)


async def _iter_sse_events(
    response: httpx.Response,
) -> AsyncIterator[tuple[str, str]]:
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
    try:
        return json.loads(data_text)
    except Exception:
        return data_text


def _extract_stream_text(payload: Any, event_name: str) -> str:
    if isinstance(payload, str):
        return ""

    if not isinstance(payload, dict):
        return ""

    if isinstance(payload.get("delta"), str):
        return _normalize_provider_text(payload["delta"])

    if isinstance(payload.get("text"), str):
        return _normalize_provider_text(payload["text"])

    choices = payload.get("choices")
    if isinstance(choices, list) and choices:
        first_choice = choices[0]
        if isinstance(first_choice, dict):
            delta = first_choice.get("delta")
            if isinstance(delta, dict):
                if isinstance(delta.get("content"), str):
                    return _normalize_provider_text(delta["content"])
                if isinstance(delta.get("text"), str):
                    return _normalize_provider_text(delta["text"])

            if event_name.startswith("response.output_text"):
                message = first_choice.get("message")
                if isinstance(message, dict):
                    content = message.get("content")
                    if isinstance(content, str):
                        return _normalize_provider_text(content)

    content = payload.get("content")
    if isinstance(content, str):
        return _normalize_provider_text(content)

    return ""


def _extract_stream_reasoning(payload: Any, event_name: str) -> str:
    if isinstance(payload, str):
        return ""

    if not isinstance(payload, dict):
        return ""

    if isinstance(payload.get("reasoning_content"), str):
        return _normalize_provider_text(payload["reasoning_content"])

    if isinstance(payload.get("reasoning_summary"), str):
        return _normalize_provider_text(payload["reasoning_summary"])

    if "reasoning" in event_name and isinstance(payload.get("delta"), str):
        return _normalize_provider_text(payload["delta"])

    choices = payload.get("choices")
    if isinstance(choices, list) and choices:
        first_choice = choices[0]
        if isinstance(first_choice, dict):
            delta = first_choice.get("delta")
            if isinstance(delta, dict):
                reasoning_delta = delta.get("reasoning_content")
                if isinstance(reasoning_delta, str):
                    return _normalize_provider_text(reasoning_delta)

    return ""


def _is_stream_heartbeat(event_name: str, payload: Any) -> bool:
    if "heartbeat" in event_name or "progress" in event_name:
        return True

    if isinstance(payload, dict):
        return payload.get("type") in {"heartbeat", "progress"}

    return False


def _collect_stream_tool_calls(
    tool_calls_by_id: dict[str, ToolCall], payload: Any, event_name: str
) -> None:
    candidate_payloads: list[Any] = [payload]
    if isinstance(payload, dict):
        candidate_payloads.append(payload.get("item"))
        candidate_payloads.append(payload.get("response"))

    for candidate in candidate_payloads:
        tool_call = _extract_tool_call(candidate, event_name)
        if tool_call is not None:
            tool_calls_by_id[tool_call.call_id] = tool_call


def _extract_tool_call(payload: Any, event_name: str) -> ToolCall | None:
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


def _parse_responses_response(payload: dict[str, Any]) -> ProviderResponse:
    output_text = payload.get("output_text")
    if isinstance(output_text, str):
        logger.warning(
            "Provider extracted inner output_text from Responses API: %r",
            output_text,
        )
        return _parse_provider_response_text(output_text, allow_repair=True)

    try:
        output = payload["output"]
    except KeyError as exc:
        raise ProviderError("Provider response is missing output content.") from exc

    if not isinstance(output, list):
        raise ProviderError("Provider response output must be a list.")

    tool_calls = _extract_function_calls(output)
    if tool_calls:
        text = _extract_output_text(output, allow_missing=True)
        if _looks_like_structured_response(text):
            text = ""
        logger.warning(
            "Provider extracted tool calls from Responses API: %r",
            [tool_call.model_dump(by_alias=True) for tool_call in tool_calls],
        )
        return ProviderResponse(
            type="tool_call",
            message=_normalize_provider_text(text) if text else None,
            tool_calls=tool_calls,
        )

    text = _extract_output_text(output)
    logger.warning(
        "Provider extracted inner output_text from Responses API: %r",
        text,
    )
    return _parse_provider_response_text(text, allow_repair=True)


def _parse_chat_completions_response(payload: dict[str, Any]) -> ProviderResponse:
    try:
        message = payload["choices"][0]["message"]
    except (KeyError, IndexError, TypeError) as exc:
        raise ProviderError("Provider response is missing message content.") from exc

    if not isinstance(message, dict):
        raise ProviderError("Provider response message must be an object.")

    parsed = message.get("parsed")
    if isinstance(parsed, dict):
        return _parse_provider_response_payload(parsed)

    tool_calls = _extract_chat_tool_calls(message)
    if tool_calls:
        content = _select_message_content(message)
        if isinstance(content, list):
            text = _parse_message_parts(content)
        elif isinstance(content, str):
            text = content
        elif isinstance(content, dict):
            text = json.dumps(content, ensure_ascii=False, sort_keys=True)
        else:
            text = ""

        if _looks_like_structured_response(text):
            text = ""

        return ProviderResponse(
            type="tool_call",
            message=_normalize_provider_text(text) if text else None,
            tool_calls=tool_calls,
        )

    content = _select_message_content(message)
    if isinstance(content, dict):
        parsed = content
    elif isinstance(content, list):
        parsed = _parse_message_parts(content)
    elif isinstance(content, str):
        return _parse_provider_response_text(content, allow_repair=True)
    else:
        raise ProviderError(
            "Provider response content must be a string, list, or JSON object."
        )

    return _parse_provider_response_payload(_ensure_object_payload(parsed))


def _parse_provider_response_payload(payload: dict[str, Any]) -> ProviderResponse:
    try:
        response = ProviderResponse.model_validate(payload)
    except Exception as exc:
        raise ProviderError("Provider response did not match the PoC schema.") from exc

    return ProviderResponse(
        type=response.type,
        message=(
            _normalize_provider_text(response.message)
            if response.message is not None
            else None
        ),
        tool_calls=response.tool_calls,
    )


def _parse_provider_response_text(
    text: str, allow_repair: bool = False
) -> ProviderResponse:
    if not _looks_like_structured_response(text):
        return ProviderResponse(type="answer", message=_normalize_provider_text(text))

    try:
        return _parse_provider_response_payload(
            _ensure_object_payload(_load_json_content(text, allow_repair))
        )
    except ProviderError:
        # Some local OpenAI-compatible models ignore structured-output hints.
        # Treat plain prose as a usable read-only answer instead of failing
        # the entire chat turn.
        return ProviderResponse(type="answer", message=_normalize_provider_text(text))


def _ensure_object_payload(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ProviderError("Provider response payload must be a JSON object.")

    return payload


def _extract_output_text(items: list[Any], allow_missing: bool = False) -> str:
    for item in items:
        if not isinstance(item, dict):
            continue

        if item.get("type") == "message" and item.get("role") == "assistant":
            content = item.get("content")
            if isinstance(content, list):
                text = _extract_text_from_content_items(content)
                if text:
                    return text
            elif isinstance(content, str):
                return content
        elif item.get("type") == "output_text" and isinstance(item.get("text"), str):
            return item["text"]

    if allow_missing:
        return ""

    raise ProviderError("Provider response did not include assistant output text.")


def _extract_text_from_content_items(items: list[Any]) -> str:
    text_parts: list[str] = []
    for item in items:
        if not isinstance(item, dict):
            continue

        item_type = item.get("type")
        if item_type in {"output_text", "text"} and isinstance(item.get("text"), str):
            text_parts.append(item["text"])

    if not text_parts:
        raise ProviderError("Provider response did not include text content.")

    return "".join(text_parts)


def _extract_function_calls(items: list[Any]) -> list[ToolCall]:
    tool_calls: list[ToolCall] = []
    for item in items:
        if not isinstance(item, dict):
            continue

        item_type = item.get("type")
        if item_type not in {"function_call", "tool_call"}:
            continue

        call_id = item.get("call_id") or item.get("callId")
        name = item.get("name")
        arguments = item.get("arguments")

        if not isinstance(call_id, str) or not isinstance(name, str):
            continue

        tool_calls.append(
            ToolCall(
                call_id=call_id,
                name=name,
                arguments=_parse_tool_arguments(arguments),
            )
        )

    return tool_calls


def _extract_chat_tool_calls(message: dict[str, Any]) -> list[ToolCall]:
    tool_calls = message.get("tool_calls")
    if not isinstance(tool_calls, list):
        return []

    parsed_calls: list[ToolCall] = []
    for tool_call in tool_calls:
        if not isinstance(tool_call, dict):
            continue

        call_id = tool_call.get("id") or tool_call.get("call_id")
        function = tool_call.get("function")
        if not isinstance(call_id, str) or not isinstance(function, dict):
            continue

        name = function.get("name")
        if not isinstance(name, str):
            continue

        parsed_calls.append(
            ToolCall(
                call_id=call_id,
                name=name,
                arguments=_parse_tool_arguments(function.get("arguments")),
            )
        )

    return parsed_calls


def _parse_tool_arguments(arguments: Any) -> Any:
    if isinstance(arguments, str):
        try:
            return json.loads(arguments)
        except Exception:
            return arguments

    return arguments


def _select_message_content(message: dict[str, Any]) -> Any:
    content = message.get("content")
    if isinstance(content, str) and content.strip() == "":
        reasoning_content = message.get("reasoning_content")
        if isinstance(reasoning_content, str) and reasoning_content.strip() != "":
            return reasoning_content

    if content is not None:
        return content

    reasoning_content = message.get("reasoning_content")
    if reasoning_content is not None:
        return reasoning_content

    return content


def _parse_message_parts(parts: list[Any]) -> Any:
    text = "".join(
        part["text"]
        for part in parts
        if isinstance(part, dict) and isinstance(part.get("text"), str)
    )
    return _load_json_content(text, allow_repair=True)


def _load_json_content(content: str, allow_repair: bool = False) -> Any:
    try:
        return json.loads(content)
    except json.JSONDecodeError as exc:
        candidates = _extract_json_candidates(content)
        for candidate in reversed(candidates):
            try:
                return json.loads(candidate)
            except json.JSONDecodeError:
                if allow_repair:
                    repaired = _repair_json_string_content(candidate)
                    if repaired != candidate:
                        try:
                            return json.loads(repaired)
                        except json.JSONDecodeError:
                            pass
                continue

        logger.warning(
            "Provider raw outer response from Responses API: %r",
            _truncate_logged_content(content),
        )
        raise ProviderError("Provider response was not valid JSON.") from exc


def _looks_like_structured_response(text: str) -> bool:
    stripped = text.lstrip()
    return bool(stripped) and (
        stripped.startswith("{")
        or stripped.startswith("[")
        or stripped.startswith("```")
        or re.match(r'^"[^"]+"\s*:', stripped) is not None
    )


def _classify_stream_text(text: str) -> str | None:
    if _looks_like_structured_response(text):
        return "structured"

    return "prose"


def _extract_json_candidates(content: str) -> list[str]:
    candidates: list[str] = []
    stripped = content.strip()
    if stripped:
        candidates.append(stripped)

    fenced_blocks = re.findall(
        r"```(?:json)?\s*(.*?)\s*```",
        content,
        re.DOTALL,
    )
    candidates.extend(block.strip() for block in fenced_blocks if block.strip())

    balanced = _extract_balanced_json_object(content)
    if balanced is not None:
        candidates.append(balanced)

    seen: set[str] = set()
    unique_candidates: list[str] = []
    for candidate in candidates:
        if candidate not in seen:
            seen.add(candidate)
            unique_candidates.append(candidate)

    return unique_candidates


def _extract_balanced_json_object(content: str) -> str | None:
    start_index = content.find("{")
    if start_index < 0:
        return None

    depth = 0
    in_string = False
    escape = False
    for index in range(start_index, len(content)):
        char = content[index]
        if in_string:
            if escape:
                escape = False
            elif char == "\\":
                escape = True
            elif char == '"':
                in_string = False
            continue

        if char == '"':
            in_string = True
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return content[start_index : index + 1].strip()

    return None


def _repair_json_string_content(content: str) -> str:
    repaired: list[str] = []
    in_string = False
    escape = False
    for char in content:
        if in_string:
            if escape:
                repaired.append(char)
                escape = False
            elif char == "\\":
                repaired.append(char)
                escape = True
            elif char == '"':
                repaired.append(char)
                in_string = False
            elif char == "\n":
                repaired.append("\\n")
            elif char == "\r":
                repaired.append("\\r")
            elif char == "\t":
                repaired.append("\\t")
            elif char == "\b":
                repaired.append("\\b")
            elif char == "\f":
                repaired.append("\\f")
            else:
                repaired.append(char)
        else:
            repaired.append(char)
            if char == '"':
                in_string = True
                escape = False

    return "".join(repaired)


def _truncate_logged_content(content: str) -> str:
    if len(content) <= MAX_LOGGED_PROVIDER_CONTENT:
        return content

    return content[:MAX_LOGGED_PROVIDER_CONTENT] + "\n[truncated]"


def _normalize_provider_text(text: str) -> str:
    return text.replace("\\r\\n", "\n").replace("\\n", "\n").replace("\\r", "\n")
