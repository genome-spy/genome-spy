from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class HistoryMessage(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    id: str
    role: Literal["user", "assistant", "tool"]
    text: str
    kind: str | None = None
    tool_call_id: str | None = Field(default=None, alias="toolCallId")
    name: str | None = None
    content: Any | None = None
    tool_calls: list["ToolCall"] = Field(default_factory=list, alias="toolCalls")


class ToolCall(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    call_id: str = Field(alias="callId")
    name: str
    arguments: Any


class AgentTurnRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    message: str
    history: list[HistoryMessage] = Field(default_factory=list)
    context: dict[str, Any]


class AgentTurnResponse(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    type: Literal["answer", "clarify", "tool_call"]
    message: str | None = None
    tool_calls: list[ToolCall] = Field(default_factory=list, alias="toolCalls")


class ProviderResponse(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    type: Literal["answer", "clarify", "tool_call"]
    message: str | None = None
    tool_calls: list[ToolCall] = Field(default_factory=list, alias="toolCalls")


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
