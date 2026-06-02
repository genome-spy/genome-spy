from __future__ import annotations

import json
import logging
import math
from dataclasses import dataclass
from typing import Any

import tiktoken

from .models import ProviderResponse


@dataclass(frozen=True, slots=True)
class ThroughputDebugSummary:
    """Summarize estimated client-observed throughput for one relay response.

    The summary is based on relay-side token estimation and wall-clock request
    timing. It intentionally describes what the relay client experienced, not
    provider-native engine throughput.
    """

    model: str
    response_type: str
    request_duration_ms: int
    estimated_output_tokens: int
    estimated_output_tokens_per_second: float
    estimated_input_tokens: int | None = None
    estimated_total_tokens: int | None = None
    estimated_total_tokens_per_second: float | None = None


def summarize_response_throughput(
    response: ProviderResponse,
    duration_ms: int,
    model: str,
    *,
    estimated_input_tokens: int | None = None,
) -> ThroughputDebugSummary:
    """Estimate client-observed throughput for one completed provider response.

    Args:
        response: Final normalized provider response returned by the relay.
        duration_ms: End-to-end wall-clock duration observed by the relay.
        model: Model name used for tokenizer selection when available.
        estimated_input_tokens: Optional prompt-token estimate to include in the
            total-throughput fields.

    Returns:
        Compact throughput summary derived from relay-observed timing and token
        estimation.

    Raises:
        ValueError: If the model name is blank or duration is negative.
    """
    if not model.strip():
        raise ValueError("Model name must not be blank.")

    if duration_ms < 0:
        raise ValueError("Request duration must not be negative.")

    encoding = _resolve_encoding(model)
    estimated_output_tokens = _count_tokens(
        _build_response_text(response), encoding
    )
    duration_seconds = max(duration_ms, 1) / 1000
    estimated_output_tokens_per_second = (
        estimated_output_tokens / duration_seconds
    )
    estimated_total_tokens = (
        estimated_input_tokens + estimated_output_tokens
        if estimated_input_tokens is not None
        else None
    )
    estimated_total_tokens_per_second = (
        estimated_total_tokens / duration_seconds
        if estimated_total_tokens is not None
        else None
    )

    return ThroughputDebugSummary(
        model=model,
        response_type=response.type,
        request_duration_ms=duration_ms,
        estimated_output_tokens=estimated_output_tokens,
        estimated_output_tokens_per_second=estimated_output_tokens_per_second,
        estimated_input_tokens=estimated_input_tokens,
        estimated_total_tokens=estimated_total_tokens,
        estimated_total_tokens_per_second=estimated_total_tokens_per_second,
    )


def log_throughput_summary(
    logger: logging.Logger, summary: ThroughputDebugSummary
) -> None:
    """Log an estimated client-observed throughput summary."""
    logger.info("%s", format_throughput_summary(summary))


def format_throughput_summary(summary: ThroughputDebugSummary) -> str:
    """Format a readable throughput summary for logs and tests."""
    lines = [
        "Estimated client-observed throughput:",
        f"  model: {summary.model}",
        f"  response type: {summary.response_type}",
        f"  request duration ms: {summary.request_duration_ms}",
        f"  estimated output tokens: {summary.estimated_output_tokens}",
        (
            "  estimated output tokens/s: "
            + _format_rate(summary.estimated_output_tokens_per_second)
        ),
    ]

    if summary.estimated_input_tokens is not None:
        lines.append(
            f"  estimated input tokens: {summary.estimated_input_tokens}"
        )

    if summary.estimated_total_tokens is not None:
        lines.append(
            f"  estimated total tokens: {summary.estimated_total_tokens}"
        )

    if summary.estimated_total_tokens_per_second is not None:
        lines.append(
            "  estimated total tokens/s: "
            + _format_rate(summary.estimated_total_tokens_per_second)
        )

    return "\n".join(lines)


def _build_response_text(response: ProviderResponse) -> str:
    if response.type == "answer":
        return response.message or ""

    return json.dumps(
        [
            tool_call.model_dump(by_alias=True)
            for tool_call in response.tool_calls
        ],
        ensure_ascii=False,
        sort_keys=True,
    )


def _resolve_encoding(model: str) -> Any | None:
    try:
        return tiktoken.encoding_for_model(model)
    except Exception:
        try:
            return tiktoken.get_encoding("cl100k_base")
        except Exception:
            return None


def _count_tokens(text: str, encoding: Any | None) -> int:
    if encoding is not None:
        return len(encoding.encode(text))

    if not text:
        return 0

    return math.ceil(len(text) / 4)


def _format_rate(rate: float) -> str:
    return f"{rate:.2f}"
