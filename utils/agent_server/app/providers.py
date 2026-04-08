from __future__ import annotations

import json
import logging
import re
from abc import ABC, abstractmethod
from typing import Any

import httpx

from .config import Settings
from .models import ProviderRequest, ProviderResponse
from .prompt_builder import build_provider_messages

logger = logging.getLogger(__name__)
MAX_LOGGED_PROVIDER_CONTENT = 4000


class ProviderError(RuntimeError):
    """Raised when the upstream provider returns an invalid response."""


class BaseProvider(ABC):
    @abstractmethod
    async def generate(self, request: ProviderRequest) -> ProviderResponse:
        raise NotImplementedError


class OpenAICompatibleProvider(BaseProvider):
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    async def generate(self, request: ProviderRequest) -> ProviderResponse:
        payload = {
            "model": self._settings.model,
            "messages": build_provider_messages(request),
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
        }
        headers = {
            "authorization": f"Bearer {self._settings.api_key}",
            "content-type": "application/json",
        }

        async with httpx.AsyncClient(
            timeout=self._settings.timeout_seconds
        ) as client:
            try:
                response = await client.post(
                    f"{self._settings.base_url}/chat/completions",
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
            raise ProviderError(
                "Provider response was not valid JSON: " + response.text[:500]
            ) from exc

        return _parse_provider_response(response_json)


def _parse_provider_response(payload: dict[str, Any]) -> ProviderResponse:
    try:
        message = payload["choices"][0]["message"]
    except (KeyError, IndexError, TypeError) as exc:
        raise ProviderError("Provider response is missing message content.") from exc

    if not isinstance(message, dict):
        raise ProviderError("Provider response message must be an object.")

    parsed = message.get("parsed")
    if isinstance(parsed, dict):
        try:
            return ProviderResponse.model_validate(parsed)
        except Exception as exc:
            raise ProviderError(
                "Provider response did not match the PoC schema."
            ) from exc

    content = _select_message_content(message)
    if isinstance(content, dict):
        parsed = content
    elif isinstance(content, list):
        parsed = _parse_message_parts(content)
    elif isinstance(content, str):
        parsed = _load_json_content(content)
    else:
        raise ProviderError(
            "Provider response content must be a string, list, or JSON object."
        )

    try:
        response = ProviderResponse.model_validate(parsed)
    except Exception as exc:
        raise ProviderError("Provider response did not match the PoC schema.") from exc

    return ProviderResponse(
        type=response.type,
        message=_normalize_provider_text(response.message),
    )


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
    return _load_json_content(text)


def _load_json_content(content: str) -> Any:
    try:
        return json.loads(content)
    except json.JSONDecodeError as exc:
        stripped = content.strip()
        fenced = _strip_json_code_fence(stripped)
        if fenced is not None:
            try:
                return json.loads(fenced)
            except json.JSONDecodeError:
                pass

        logger.error(
            "Provider response content was not valid JSON:\n%s",
            _truncate_logged_content(content),
        )
        raise ProviderError("Provider response was not valid JSON.") from exc


def _strip_json_code_fence(content: str) -> str | None:
    match = re.fullmatch(r"```(?:json)?\s*(.*?)\s*```", content, re.DOTALL)
    if match is None:
        return None
    return match.group(1)


def _truncate_logged_content(content: str) -> str:
    if len(content) <= MAX_LOGGED_PROVIDER_CONTENT:
        return content

    return content[:MAX_LOGGED_PROVIDER_CONTENT] + "\n[truncated]"


def _normalize_provider_text(text: str) -> str:
    return text.replace("\\r\\n", "\n").replace("\\n", "\n").replace("\\r", "\n")
