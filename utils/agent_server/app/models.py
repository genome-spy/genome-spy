from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class HistoryMessage(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    role: Literal["user", "assistant"]
    text: str
    kind: str | None = None


class PlanRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    message: str
    history: list[HistoryMessage] = Field(default_factory=list)
    context: dict[str, Any]


class PlanResponse(BaseModel):
    type: Literal["answer", "clarify"]
    message: str


class ProviderResponse(BaseModel):
    type: Literal["answer", "clarify"]
    message: str


@dataclass(frozen=True, slots=True)
class ProviderStreamEvent:
    type: Literal["delta", "reasoning_delta", "heartbeat", "final"]
    delta: str | None = None
    reasoning: str | None = None
    response: ProviderResponse | None = None


class ProviderRequest(BaseModel):
    system_prompt: str
    context: dict[str, Any]
    history: list[HistoryMessage]
    message: str
