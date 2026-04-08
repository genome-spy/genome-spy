from __future__ import annotations

from abc import ABC, abstractmethod
import json
import logging
from typing import Any

import httpx

from .config import Settings
from .models import ProviderRequest, ProviderResponse
from .prompt_builder import build_provider_messages

logger = logging.getLogger(__name__)


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
        content = payload["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise ProviderError("Provider response is missing message content.") from exc

    if not isinstance(content, str):
        raise ProviderError("Provider response content must be a string.")

    try:
        parsed = json.loads(content)
    except json.JSONDecodeError as exc:
        raise ProviderError("Provider response was not valid JSON.") from exc

    try:
        return ProviderResponse.model_validate(parsed)
    except Exception as exc:
        raise ProviderError("Provider response did not match the PoC schema.") from exc
