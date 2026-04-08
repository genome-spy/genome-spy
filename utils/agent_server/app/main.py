from __future__ import annotations

from functools import lru_cache
import logging

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .config import Settings, load_settings
from .models import PlanRequest, PlanResponse, ProviderRequest
from .providers import BaseProvider, OpenAICompatibleProvider, ProviderError

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
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
    return OpenAICompatibleProvider(get_settings())


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/v1/plan", response_model=PlanResponse)
async def plan(request: PlanRequest) -> PlanResponse:
    settings = get_settings()
    if settings.debug:
        logger.warning(
            "Received /v1/plan request: message=%r history_length=%s context_keys=%s",
            request.message,
            len(request.history),
            sorted(request.context.keys()),
        )

    provider_request = ProviderRequest(
        system_prompt=settings.system_prompt,
        context=request.context,
        history=request.history,
        message=request.message,
    )

    try:
        response = await get_provider().generate(provider_request)
    except ProviderError as exc:
        logger.exception("ProviderError while handling /v1/plan.")
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Unexpected error while handling /v1/plan.")
        raise HTTPException(
            status_code=502,
            detail="Provider request failed: " + str(exc),
        ) from exc

    return PlanResponse(type=response.type, message=response.message)
