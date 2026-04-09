from __future__ import annotations

import json
import logging
import time
from functools import lru_cache
from typing import AsyncIterator

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from .config import Settings, load_settings
from .models import PlanRequest, PlanResponse, ProviderRequest, ProviderResponse
from .providers import (
    BaseProvider,
    OpenAIChatCompletionsProvider,
    OpenAIResponsesProvider,
    ProviderError,
)

logger = logging.getLogger(__name__)

app = FastAPI(title="GenomeSpy Agent Server", version="0.0.1")
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


@lru_cache
def get_settings() -> Settings:
    return load_settings()


@lru_cache
def get_provider() -> BaseProvider:
    settings = get_settings()
    if settings.api_style == "chat_completions":
        return OpenAIChatCompletionsProvider(settings)
    return OpenAIResponsesProvider(settings)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/v1/plan", response_model=PlanResponse, response_model_exclude_defaults=True)
async def plan(
    request: PlanRequest,
    http_request: Request,
    stream: bool = Query(default=False),
) -> PlanResponse | StreamingResponse:
    settings = get_settings()
    provider_request = ProviderRequest(
        system_prompt=settings.system_prompt,
        context=request.context,
        history=request.history,
        message=request.message,
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
    return PlanResponse(
        type=response.type,
        message=response.message,
        tool_calls=response.tool_calls,
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
                yield _encode_sse_event(
                    "reasoning_delta", {"delta": event.reasoning}
                )
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
