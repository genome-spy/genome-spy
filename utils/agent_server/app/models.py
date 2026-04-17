from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class HistoryMessage(BaseModel):
    """Represent one prior conversation item from the browser client."""

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
    """Represent one tool call emitted by the model or browser history."""

    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    call_id: str = Field(alias="callId")
    name: str
    arguments: Any


class ProviderToolDefinition(BaseModel):
    """Represent one provider-ready function tool definition."""

    model_config = ConfigDict(extra="ignore")

    type: Literal["function"]
    name: str
    description: str
    parameters: dict[str, Any]
    strict: bool


class AgentTurnRequest(BaseModel):
    """Represent the browser payload for one agent turn request."""

    model_config = ConfigDict(extra="ignore")

    message: str
    history: list[HistoryMessage] = Field(default_factory=list)
    context: dict[str, Any]
    tools: list[ProviderToolDefinition] = Field(default_factory=list)


class AgentTurnResponse(BaseModel):
    """Represent the relay response payload for one completed agent turn."""

    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    type: Literal["answer", "clarify", "tool_call"]
    message: str | None = None
    tool_calls: list[ToolCall] = Field(default_factory=list, alias="toolCalls")


class ProviderResponse(BaseModel):
    """Represent the normalized provider response used inside the relay."""

    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    type: Literal["answer", "clarify", "tool_call"]
    message: str | None = None
    tool_calls: list[ToolCall] = Field(default_factory=list, alias="toolCalls")


@dataclass(frozen=True, slots=True)
class ProviderStreamEvent:
    """Represent one normalized event emitted during a provider stream."""

    type: Literal["delta", "reasoning_delta", "heartbeat", "final"]
    delta: str | None = None
    reasoning: str | None = None
    response: ProviderResponse | None = None


class ProviderRequest(BaseModel):
    """Represent the normalized provider request built from browser input."""

    model_config = ConfigDict(extra="ignore")

    system_prompt: str
    context: dict[str, Any]
    history: list[HistoryMessage]
    message: str
    tools: list[ProviderToolDefinition] = Field(default_factory=list)
