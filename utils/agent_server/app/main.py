from __future__ import annotations

import json
import logging
import os
import time
from contextlib import asynccontextmanager
from functools import lru_cache
from typing import AsyncIterator

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from .config import Settings, describe_api_key_for_logs, load_settings
from .models import (
    AgentTurnRequest,
    AgentTurnResponse,
    ProviderRequest,
    ProviderResponse,
)
from .providers import (
    BaseProvider,
    OpenAIResponsesProvider,
    ProviderError,
)
from .token_debugger import log_token_summary, summarize_prompt_tokens

logger = logging.getLogger(__name__)
startup_logger = logging.getLogger("uvicorn.error")


@lru_cache
def get_settings() -> Settings:
    """Return the cached relay settings.

    Loads the settings once per process and reuses the same immutable settings
    object across request handling.
    """
    return load_settings()


@lru_cache
def get_provider() -> BaseProvider:
    """Return the cached provider implementation for current settings."""
    return OpenAIResponsesProvider(get_settings())


def log_startup_summary() -> None:
    """Log the relay startup configuration summary.

    Emits a single startup log line that captures the selected provider, model,
    base URL, and sanitized API-key metadata for debugging deployment issues.
    """
    settings = get_settings()
    provider = get_provider()
    api_key_source = (
        "GENOMESPY_AGENT_API_KEY"
        if os.environ.get("GENOMESPY_AGENT_API_KEY") is not None
        else "default"
    )
    startup_logger.info(
        (
            "GenomeSpy agent server startup: provider=%s base_url=%s "
            "model=%s api_key_source=%s api_key=%s "
            "streaming=%s timeout_seconds=%s"
        ),
        provider.__class__.__name__,
        settings.base_url,
        settings.model,
        api_key_source,
        describe_api_key_for_logs(settings.api_key),
        settings.enable_streaming,
        settings.timeout_seconds,
    )


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    log_startup_summary()
    yield


app = FastAPI(
    title="GenomeSpy Agent Server",
    version="0.0.1",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8080",
        "http://127.0.0.1:8080",
    ],
    allow_credentials=False,
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    """Return the relay health status."""
    return {"status": "ok"}


@app.post(
    "/v1/agent-turn",
    response_model=AgentTurnResponse,
    response_model_exclude_defaults=True,
)
async def agent_turn(
    request: AgentTurnRequest,
    http_request: Request,
    stream: bool = Query(default=False),
) -> AgentTurnResponse | StreamingResponse:
    """Handle one browser-to-model agent turn.

    Builds the provider request from the browser payload, logs prompt-token
    diagnostics, and returns either a normal response or an SSE stream.

    Args:
        request: Browser request payload for the current agent turn.
        http_request: Incoming FastAPI request used to inspect client headers.
        stream: Whether the caller explicitly requested server-sent events.

    Returns:
        Final agent-turn payload or a streaming SSE response, depending on the request.

    Raises:
        HTTPException: If the upstream provider request fails before a
            non-streaming response is returned.
    """
    settings = get_settings()
    provider_request = ProviderRequest(
        system_prompt=settings.system_prompt,
        context=request.context,
        volatile_context=request.volatile_context,
        history=request.history,
        message=request.message,
        tools=request.tools,
    )
    log_token_summary(
        startup_logger,
        summarize_prompt_tokens(provider_request, settings.model),
    )

    should_stream = settings.enable_streaming and (
        stream or "text/event-stream" in http_request.headers.get("accept", "")
    )

    if should_stream:
        return StreamingResponse(
            _stream_plan(provider_request),
            media_type="text/event-stream",
            headers={
                "cache-control": "no-cache",
                "x-accel-buffering": "no",
            },
        )

    response = await _generate_plan(provider_request)
    return AgentTurnResponse(
        type=response.type,
        message=response.message,
        toolCalls=response.tool_calls,
    )


async def _generate_plan(provider_request: ProviderRequest) -> ProviderResponse:
    try:
        return await get_provider().generate(provider_request)
    except ProviderError as exc:
        logger.warning("Provider request failed: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Unexpected provider failure")
        raise HTTPException(
            status_code=502,
            detail="Provider request failed: " + str(exc),
        ) from exc


async def _stream_plan(
    provider_request: ProviderRequest,
) -> AsyncIterator[str]:
    started_at = time.perf_counter()
    yield _encode_sse_event("start", {"status": "working"})

    try:
        async for event in get_provider().generate_stream(provider_request):
            if event.type == "delta" and event.delta:
                yield _encode_sse_event("delta", {"delta": event.delta})
            elif event.type == "reasoning_delta" and event.reasoning:
                yield _encode_sse_event("reasoning_delta", {"delta": event.reasoning})
            elif event.type == "heartbeat":
                yield _encode_sse_event("heartbeat", {"status": "working"})
            elif event.type == "final":
                if event.response is None:
                    raise ProviderError("Provider stream ended without a response.")

                duration_ms = round((time.perf_counter() - started_at) * 1000)
                yield _encode_sse_event(
                    "final",
                    {
                        "response": {
                            "type": event.response.type,
                            "message": event.response.message,
                            **(
                                {
                                    "toolCalls": [
                                        tool_call.model_dump(by_alias=True)
                                        for tool_call in event.response.tool_calls
                                    ]
                                }
                                if event.response.tool_calls
                                else {}
                            ),
                        },
                        "trace": {
                            "message": provider_request.message,
                            "totalMs": duration_ms,
                        },
                    },
                )
            else:
                logger.debug("Ignoring unknown provider stream event: %s", event)
    except ProviderError as exc:
        logger.warning("Provider stream failed: %s", exc)
        yield _encode_sse_event("error", {"message": str(exc)})
    except Exception as exc:
        logger.exception("Unexpected provider stream failure")
        yield _encode_sse_event(
            "error",
            {
                "message": "Provider request failed: " + str(exc),
            },
        )


def _encode_sse_event(event_name: str, payload: dict[str, object]) -> str:
    return (
        "event: "
        + event_name
        + "\n"
        + "data: "
        + json.dumps(payload, ensure_ascii=False)
        + "\n\n"
    )
