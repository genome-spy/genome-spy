from __future__ import annotations

import logging
from functools import lru_cache

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .config import Settings, load_settings
from .models import PlanRequest, PlanResponse, ProviderRequest
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


@app.post("/v1/plan", response_model=PlanResponse)
async def plan(request: PlanRequest) -> PlanResponse:
    provider_request = ProviderRequest(
        system_prompt=get_settings().system_prompt,
        context=request.context,
        history=request.history,
        message=request.message,
    )

    try:
        response = await get_provider().generate(provider_request)
    except ProviderError as exc:
        logger.warning("Provider request failed: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Unexpected provider failure")
        raise HTTPException(
            status_code=502,
            detail="Provider request failed: " + str(exc),
        ) from exc

    return PlanResponse(type=response.type, message=response.message)
