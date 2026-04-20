from __future__ import annotations

import json
import logging
import os
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, AsyncIterator

import httpx

from app.config import Settings, describe_api_key_for_logs
from app.models import ProviderRequest, ProviderResponse, ProviderStreamEvent
from app.prompt_builder import build_prompt_ir, build_responses_input
from app.providers import ProviderError
from app.providers.parsing import (
    _normalize_provider_text,
    _parse_provider_response_text,
    _parse_responses_response,
    _truncate_logged_content,
)
from app.providers.streaming import iter_provider_stream_events

logger = logging.getLogger(__name__)
PREFLIGHT_LOG_PATH = Path(
    os.environ.get(
        "GENOMESPY_AGENT_PREFLIGHT_LOG_PATH",
        "/tmp/genomespy-agent-preflight.log",
    )
)


class BaseProvider(ABC):
    """Define the shared interface for upstream provider adapters."""

    @abstractmethod
    async def generate(self, request: ProviderRequest) -> ProviderResponse:
        """Generate one complete provider response for a relay turn.

        Args:
            request: Normalized provider request for the current relay turn.

        Returns:
            Final normalized provider response.

        Raises:
            NotImplementedError: Always raised by the abstract base implementation.
        """
        raise NotImplementedError

    async def generate_stream(
        self, request: ProviderRequest
    ) -> AsyncIterator[ProviderStreamEvent]:
        """Stream provider events for a relay turn.

        The default implementation falls back to `generate` and emits a single
        final event when a provider does not support incremental streaming.

        Args:
            request: Normalized provider request for the current relay turn.

        Returns:
            Async iterator of normalized provider stream events.
        """
        response = await self.generate(request)
        yield ProviderStreamEvent(type="final", response=response)


class OpenAIResponsesProvider(BaseProvider):
    """Implement relay requests against the OpenAI Responses API shape."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    async def generate(self, request: ProviderRequest) -> ProviderResponse:
        """Generate one complete response through the Responses API.

        Args:
            request: Normalized provider request for the current relay turn.

        Returns:
            Final normalized provider response parsed from the Responses API.

        Raises:
            ProviderError: If the HTTP request fails or the provider response
                is invalid.
        """
        payload = self._build_payload(request)
        response = await self._post_response(payload)
        response_json = _load_response_json(response)

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
        """Stream a response through the Responses API.

        Args:
            request: Normalized provider request for the current relay turn.

        Returns:
            Async iterator of normalized provider stream events.

        Raises:
            ProviderError: If the HTTP request fails or the provider response
                is invalid.
        """
        payload = self._build_payload(request, stream=True)
        async with httpx.AsyncClient(timeout=self._settings.timeout_seconds) as client:
            try:
                async with client.stream(
                    "POST",
                    self._endpoint,
                    json=payload,
                    headers=_build_auth_headers(self._settings),
                ) as response:
                    await _raise_for_error_response(
                        response, self._settings, self._endpoint
                    )
                    async for event in iter_provider_stream_events(
                        response,
                        parse_provider_response_text=_parse_provider_response_text,
                        normalize_provider_text=_normalize_provider_text,
                        truncate_logged_content=_truncate_logged_content,
                    ):
                        yield event
            except httpx.ReadTimeout as exc:
                raise _provider_request_failed(self._settings, exc) from exc
            except Exception as exc:
                if isinstance(exc, ProviderError):
                    raise
                raise _provider_request_failed(self._settings, exc) from exc

    @property
    def _endpoint(self) -> str:
        """Return the Responses API endpoint URL."""
        return self._settings.base_url + "/responses"

    def _build_payload(
        self, request: ProviderRequest, stream: bool = False
    ) -> dict[str, Any]:
        """Build the request payload sent to the provider."""
        prompt = build_prompt_ir(request)
        tools = [tool.model_dump() for tool in request.tools]
        payload: dict[str, Any] = {
            "model": self._settings.model,
            "instructions": prompt.instructions,
            "input": build_responses_input(prompt),
        }
        if stream:
            payload["stream"] = True
        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = "auto"
        _log_model_request(
            prompt.instructions,
            prompt.context_text,
            prompt.volatile_context_text,
            tools,
        )
        return payload

    async def _post_response(self, payload: dict[str, Any]) -> httpx.Response:
        """Send one non-streaming request to the provider."""
        async with httpx.AsyncClient(timeout=self._settings.timeout_seconds) as client:
            try:
                response = await client.post(
                    self._endpoint,
                    json=payload,
                    headers=_build_auth_headers(self._settings),
                )
            except httpx.ReadTimeout as exc:
                raise _provider_request_failed(self._settings, exc) from exc
            except Exception as exc:
                raise _provider_request_failed(self._settings, exc) from exc

        await _raise_for_error_response(response, self._settings, self._endpoint)
        return response


def _log_model_request(
    instructions: str,
    context_text: str,
    volatile_context_text: str | None,
    tools: list[dict[str, Any]],
) -> None:
    """Write a debug preflight snapshot for one provider request."""
    if not logger.isEnabledFor(logging.DEBUG):
        return

    volatile_dump = (
        "\n\nVolatile context:\n" + volatile_context_text
        if volatile_context_text
        else ""
    )
    dump = (
        "\n=== GenomeSpy agent preflight ===\n"
        + "Timestamp: "
        + datetime.now(timezone.utc).isoformat()
        + "\n"
        + "Instructions:\n"
        + instructions
        + "\n\nContext:\n"
        + context_text
        + volatile_dump
        + "\n\nTools:\n"
        + json.dumps(tools, ensure_ascii=False, indent=2)
        + "\n=== End preflight ===\n"
    )
    _append_preflight_log(dump)


def _append_preflight_log(text: str) -> None:
    """Append one entry to the preflight log file."""
    PREFLIGHT_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with PREFLIGHT_LOG_PATH.open("a", encoding="utf-8") as handle:
        handle.write(text)


def _build_auth_headers(settings: Settings) -> dict[str, str]:
    """Build authorization headers for the provider request."""
    return {
        "authorization": "Bearer " + settings.api_key,
        "content-type": "application/json",
    }


def _provider_request_failed(settings: Settings, exc: Exception) -> ProviderError:
    """Convert a transport failure into a provider-facing error."""
    if isinstance(exc, httpx.ReadTimeout):
        return ProviderError(
            "Provider request timed out after "
            + str(settings.timeout_seconds)
            + " seconds. Local models may need extra warm-up time on "
            + "their first request."
        )

    return ProviderError("Provider HTTP request failed: " + repr(exc))


async def _raise_for_error_response(
    response: httpx.Response, settings: Settings, endpoint: str
) -> None:
    """Raise a provider error for an HTTP error response."""
    if response.status_code < 400:
        return

    _log_provider_auth_diagnostic("responses", endpoint, settings, response.status_code)
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


def _load_response_json(response: httpx.Response) -> dict[str, Any]:
    """Parse the outer provider response body as a JSON object."""
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

    if not isinstance(response_json, dict):
        raise ProviderError("Provider response body must be a JSON object.")

    return response_json


def _log_provider_auth_diagnostic(
    provider_name: str, endpoint: str, settings: Settings, status_code: int
) -> None:
    """Log masked authentication details for unauthorized responses."""
    if status_code != 401:
        return

    logger.warning(
        (
            "Provider auth diagnostic: provider=%s endpoint=%s base_url=%s "
            "model=%s api_key=%s api_key_has_whitespace=%s "
            "authorization=Bearer <redacted>"
        ),
        provider_name,
        endpoint,
        settings.base_url,
        settings.model,
        describe_api_key_for_logs(settings.api_key),
        settings.api_key != settings.api_key.strip(),
    )
