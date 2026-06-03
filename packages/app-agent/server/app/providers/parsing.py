from __future__ import annotations

import json
import logging
import re
from typing import Any

from app.json_repair import load_json_with_repair
from app.models import ProviderResponse, ToolCall
from app.providers import ProviderError

logger = logging.getLogger(__name__)
MAX_LOGGED_PROVIDER_CONTENT = 4000


def _parse_responses_response(payload: dict[str, Any]) -> ProviderResponse:
    """Normalize a Responses API payload into the relay shape."""
    output_text = payload.get("output_text")
    if isinstance(output_text, str):
        logger.debug(
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
        if _looks_like_structured_response(text) or _looks_like_tool_markup(text):
            text = ""
        logger.debug(
            "Provider extracted tool calls from Responses API: %r",
            [tool_call.model_dump(by_alias=True) for tool_call in tool_calls],
        )
        return ProviderResponse(
            type="tool_call",
            message=_normalize_provider_text(text) if text else None,
            tool_calls=tool_calls,
        )

    text = _extract_output_text(output)
    logger.debug(
        "Provider extracted inner output_text from Responses API: %r",
        text,
    )
    return _parse_provider_response_text(text, allow_repair=True)


def _parse_provider_response_text(
    text: str, allow_repair: bool = False
) -> ProviderResponse:
    """Parse provider text as structured output or plain prose."""
    if not _looks_like_structured_response(text):
        return ProviderResponse(
            type="answer",
            message=_require_non_empty_answer_message(
                _normalize_provider_text(text),
                _truncate_logged_content(text),
            ),
        )

    try:
        payload = _ensure_object_payload(_load_json_content(text, allow_repair))
    except ProviderError as exc:
        # Some local OpenAI-compatible models ignore structured-output hints.
        # Treat plain prose as a usable read-only answer instead of failing
        # the entire chat turn.
        normalized_text = _normalize_provider_text(text)
        if _looks_like_structured_response(normalized_text) or _looks_like_tool_markup(
            normalized_text
        ):
            raise ProviderError("Provider returned an empty final answer.") from exc

        return ProviderResponse(
            type="answer",
            message=_require_non_empty_answer_message(
                normalized_text,
                _truncate_logged_content(text),
            ),
        )

    return _parse_provider_response_payload(payload)


def _parse_provider_response_payload(payload: dict[str, Any]) -> ProviderResponse:
    """Validate a structured provider payload against the relay schema."""
    try:
        response = ProviderResponse.model_validate(payload)
    except Exception as exc:
        raise ProviderError("Provider response did not match the PoC schema.") from exc

    normalized_message = (
        _normalize_provider_text(response.message)
        if response.message is not None
        else None
    )
    if response.type == "answer":
        normalized_message = _require_non_empty_answer_message(
            normalized_message,
            _truncate_logged_content(json.dumps(payload, ensure_ascii=False)),
        )

    return ProviderResponse(
        type=response.type,
        message=normalized_message,
        tool_calls=response.tool_calls,
    )


def _require_non_empty_answer_message(
    message: str | None, logged_source: str
) -> str:
    """Require answer responses to carry non-empty text."""
    if isinstance(message, str):
        normalized = message.strip()
        if normalized:
            return normalized

    logger.warning("Provider returned an empty final answer: %r", logged_source)
    raise ProviderError("Provider returned an empty final answer.")


def _ensure_object_payload(payload: Any) -> dict[str, Any]:
    """Require the parsed payload to be a JSON object."""
    if not isinstance(payload, dict):
        raise ProviderError("Provider response payload must be a JSON object.")

    return payload


def _extract_output_text(items: list[Any], allow_missing: bool = False) -> str:
    """Extract assistant text from Responses API output items."""
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
    """Join text fragments from message content items."""
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
    """Collect tool calls from Responses API output items."""
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


def _parse_tool_arguments(arguments: Any) -> Any:
    """Decode stringified tool arguments when possible."""
    if isinstance(arguments, str):
        try:
            return _parse_nested_tool_argument_json(load_json_with_repair(arguments))
        except Exception:
            return arguments

    return _parse_nested_tool_argument_json(arguments)


def _parse_nested_tool_argument_json(value: Any) -> Any:
    """Decode nested JSON object or array strings in tool arguments."""
    if isinstance(value, dict):
        return {
            key: _parse_nested_tool_argument_json(item) for key, item in value.items()
        }

    if isinstance(value, list):
        return [_parse_nested_tool_argument_json(item) for item in value]

    if isinstance(value, str):
        stripped = value.strip()
        if not stripped.startswith(("{", "[")):
            return value

        # oMLX/Qwen may serialize one structured parameter, such as a domain
        # array, as a JSON string inside an otherwise valid arguments object.
        try:
            return _parse_nested_tool_argument_json(load_json_with_repair(stripped))
        except Exception:
            return value

    return value


def _load_json_content(content: str, allow_repair: bool = False) -> Any:
    """Parse JSON content, optionally retrying repaired candidates."""
    try:
        return json.loads(content)
    except json.JSONDecodeError as exc:
        candidates = _extract_json_candidates(content)
        for candidate in reversed(candidates):
            try:
                return json.loads(candidate)
            except json.JSONDecodeError:
                if allow_repair:
                    try:
                        return load_json_with_repair(candidate)
                    except json.JSONDecodeError:
                        pass
                continue

        logger.warning(
            "Provider raw outer response from Responses API: %r",
            _truncate_logged_content(content),
        )
        raise ProviderError("Provider response was not valid JSON.") from exc


def _extract_json_candidates(content: str) -> list[str]:
    """Extract likely JSON snippets from mixed provider text."""
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
    """Extract the first balanced JSON object from text."""
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

def _looks_like_structured_response(text: str) -> bool:
    """Detect text that appears to be structured output."""
    stripped = text.lstrip()
    return bool(stripped) and (
        stripped.startswith("{")
        or stripped.startswith("[")
        or stripped.startswith("```")
        or re.match(r'^"[^"]+"\s*:', stripped) is not None
    )


def _looks_like_tool_markup(text: str) -> bool:
    """Return whether text appears to be XML-style tool-call markup."""
    stripped = text.lstrip()
    # oMLX/Qwen can surface its chat-template tool-call markup as text in
    # addition to structured function-call items. Treat it as internal.
    return bool(stripped) and (
        stripped.startswith("<tool_call")
        or stripped.startswith("<function=")
        or "</tool_call>" in stripped
    )


def _classify_stream_text(text: str) -> str | None:
    """Classify stream text as prose or structured output."""
    if _looks_like_structured_response(text):
        return "structured"

    return "prose"


def _truncate_logged_content(content: str) -> str:
    """Trim logged provider content to a safe preview length."""
    if len(content) <= MAX_LOGGED_PROVIDER_CONTENT:
        return content

    return content[:MAX_LOGGED_PROVIDER_CONTENT] + "\n[truncated]"


def _normalize_provider_text(text: str) -> str:
    """Normalize escaped newlines in provider text."""
    return text.replace("\\r\\n", "\n").replace("\\n", "\n").replace("\\r", "\n")
