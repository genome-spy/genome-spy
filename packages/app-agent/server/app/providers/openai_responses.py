from __future__ import annotations

import asyncio
import json
import logging
import os
import re
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
EMPTY_FINAL_ANSWER_RETRY_DELAY_SECONDS = 1.0
EMPTY_FINAL_ANSWER_MAX_RETRIES = 1
RATE_LIMIT_RETRY_FALLBACK_DELAY_SECONDS = 2.0
RATE_LIMIT_MAX_RETRIES = 1
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
        total_attempts = max(
            EMPTY_FINAL_ANSWER_MAX_RETRIES,
            RATE_LIMIT_MAX_RETRIES,
        )
        for attempt in range(total_attempts + 1):
            try:
                response = await self._post_response(payload)
                response_json = _load_response_json(response)

                logger.debug(
                    "Provider raw outer response from Responses API: %r",
                    response.text,
                )
                try:
                    response_payload = _parse_responses_response(response_json)
                except ProviderError as exc:
                    if _is_empty_final_answer_error(exc):
                        logger.warning(
                            "Provider returned an empty final answer from non-streaming Responses API payload: output_text=%r output=%r",
                            _truncate_logged_content(
                                response_json.get("output_text", "")
                                if isinstance(
                                    response_json.get("output_text"), str
                                )
                                else ""
                            ),
                            _truncate_logged_content(
                                json.dumps(
                                    response_json.get("output", []),
                                    ensure_ascii=False,
                                )
                            ),
                        )
                        if attempt < EMPTY_FINAL_ANSWER_MAX_RETRIES:
                            logger.warning(
                                "Retrying non-streaming provider request after empty final answer (attempt %d/%d).",
                                attempt + 1,
                                EMPTY_FINAL_ANSWER_MAX_RETRIES + 1,
                            )
                            await asyncio.sleep(
                                EMPTY_FINAL_ANSWER_RETRY_DELAY_SECONDS
                            )
                            continue
                    raise
                logger.debug(
                    "Provider parsed response from Responses API: %r",
                    response_payload.model_dump(),
                )
                return response_payload
            except ProviderError as exc:
                retry_delay_seconds = _get_rate_limit_retry_delay_seconds(exc)
                if (
                    retry_delay_seconds is not None
                    and attempt < RATE_LIMIT_MAX_RETRIES
                ):
                    logger.warning(
                        "Retrying non-streaming provider request after rate limit (attempt %d/%d, delay %.3fs).",
                        attempt + 1,
                        RATE_LIMIT_MAX_RETRIES + 1,
                        retry_delay_seconds,
                    )
                    await asyncio.sleep(retry_delay_seconds)
                    continue
                raise

        raise AssertionError("Unreachable provider retry state.")

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
        total_attempts = max(
            EMPTY_FINAL_ANSWER_MAX_RETRIES,
            RATE_LIMIT_MAX_RETRIES,
        )
        for attempt in range(total_attempts + 1):
            yielded_substantive_event = False
            async with httpx.AsyncClient(
                timeout=self._settings.timeout_seconds
            ) as client:
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
                            if event.type != "heartbeat":
                                yielded_substantive_event = True
                            yield event
                    return
                except httpx.ReadTimeout as exc:
                    raise _provider_request_failed(self._settings, exc) from exc
                except Exception as exc:
                    retry_delay_seconds = (
                        _get_rate_limit_retry_delay_seconds(exc)
                        if isinstance(exc, ProviderError)
                        else None
                    )
                    if (
                        retry_delay_seconds is not None
                        and not yielded_substantive_event
                        and attempt < RATE_LIMIT_MAX_RETRIES
                    ):
                        logger.warning(
                            "Retrying streaming provider request after rate limit (attempt %d/%d, delay %.3fs).",
                            attempt + 1,
                            RATE_LIMIT_MAX_RETRIES + 1,
                            retry_delay_seconds,
                        )
                        await asyncio.sleep(retry_delay_seconds)
                        continue
                    if (
                        isinstance(exc, ProviderError)
                        and _is_empty_final_answer_error(exc)
                        and not yielded_substantive_event
                        and attempt < EMPTY_FINAL_ANSWER_MAX_RETRIES
                    ):
                        logger.warning(
                            "Retrying streaming provider request after empty final answer (attempt %d/%d).",
                            attempt + 1,
                            EMPTY_FINAL_ANSWER_MAX_RETRIES + 1,
                        )
                        await asyncio.sleep(
                            EMPTY_FINAL_ANSWER_RETRY_DELAY_SECONDS
                        )
                        continue
                    if isinstance(exc, ProviderError):
                        raise
                    raise _provider_request_failed(self._settings, exc) from exc

        raise AssertionError("Unreachable provider retry state.")

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


def _is_empty_final_answer_error(error: ProviderError) -> bool:
    """Detect relay errors caused by an upstream empty final answer."""
    return "empty final answer" in str(error)


def _get_rate_limit_retry_delay_seconds(
    error: ProviderError,
) -> float | None:
    """Parse a safe retry delay from a provider rate-limit error."""
    message = str(error)
    if "HTTP 429" not in message and "rate limit" not in message.lower():
        return None

    seconds_match = re.search(
        r"Please try again in\s+([0-9]+(?:\.[0-9]+)?)s",
        message,
        re.IGNORECASE,
    )
    if seconds_match:
        return float(seconds_match.group(1))

    milliseconds_match = re.search(
        r"Please try again in\s+([0-9]+(?:\.[0-9]+)?)ms",
        message,
        re.IGNORECASE,
    )
    if milliseconds_match:
        return float(milliseconds_match.group(1)) / 1000.0

    return RATE_LIMIT_RETRY_FALLBACK_DELAY_SECONDS


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
