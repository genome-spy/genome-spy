from __future__ import annotations

import logging
import math
from dataclasses import dataclass
from typing import Any

from .models import ProviderRequest
from .prompt_builder import (
    _build_context_text,
    _build_prompt_context,
    build_prompt_ir,
)

TiktokenModule = Any

try:
    import tiktoken as _tiktoken  # type: ignore[import-not-found]
except ImportError:  # pragma: no cover - exercised only when dependency is missing
    tiktoken: TiktokenModule | None = None
else:
    tiktoken = _tiktoken


@dataclass(frozen=True, slots=True)
class TokenDebugSummary:
    """Summarize token usage across the main prompt parts.

    The summary is intended for developer debugging of prompt size. It tracks
    the same canonical pieces the relay already assembles for a request turn and
    adds an optional per-top-level-key context breakdown to show which context
    branches dominate the budget.

    Attributes:
        model: Model name used to choose the tokenizer when possible.
        system_prompt: Estimated tokens for the system instructions.
        context: Estimated tokens for the serialized context snapshot.
        volatile_context: Estimated tokens for the serialized volatile context.
        history: Estimated tokens for the serialized conversation history.
        message: Estimated tokens for the current user message.
        total: Sum of the main prompt buckets.
        context_by_key: Estimated tokens for each top-level prompt-context key.
    """

    model: str
    system_prompt: int
    context: int
    volatile_context: int
    history: int
    message: int
    total: int
    context_by_key: dict[str, int]


def summarize_prompt_tokens(request: ProviderRequest, model: str) -> TokenDebugSummary:
    """Estimate token usage for the main relay prompt components.

    Builds the same provider-neutral prompt representation used by the relay and
    counts the major prompt buckets that developers care about most: system
    prompt, stable context snapshot, volatile context, history, and the current
    user message. The top-level context-key breakdown is included to help
    identify whether parts such as `viewRoot` dominate the prompt budget.

    Args:
        request: Provider request containing system prompt, stable context,
            volatile context, history, and current user message.
        model: Model name used for tokenizer selection when available.

    Returns:
        Compact token summary for the canonical prompt parts and context-key
        breakdown.

    Raises:
        ValueError: If the model name is blank.

    Example:
        >>> request = ProviderRequest(
        ...     system_prompt="system prompt",
        ...     context={"schemaVersion": 1, "viewRoot": {"title": "Example"}},
        ...     history=[],
        ...     message="What is shown here?",
        ... )
        >>> summary = summarize_prompt_tokens(request, "gpt-4.1-mini")
        >>> summary.model
        'gpt-4.1-mini'
    """
    if not model.strip():
        raise ValueError("Model name must not be blank.")

    prompt = build_prompt_ir(request)
    encoding = _resolve_encoding(model)
    history_messages = _build_history_texts(prompt.history)
    history_tokens = sum(_count_tokens(text, encoding) for text in history_messages)
    context_by_key = {
        key: _count_tokens(_build_context_text({key: value}), encoding)
        for key, value in _build_prompt_context(prompt.context).items()
    }

    system_prompt_tokens = _count_tokens(prompt.instructions, encoding)
    context_tokens = _count_tokens(prompt.context_text, encoding)
    volatile_context_tokens = (
        _count_tokens(prompt.volatile_context_text, encoding)
        if prompt.volatile_context_text
        else 0
    )
    message_tokens = _count_tokens(prompt.message, encoding)

    return TokenDebugSummary(
        model=model,
        system_prompt=system_prompt_tokens,
        context=context_tokens,
        volatile_context=volatile_context_tokens,
        history=history_tokens,
        message=message_tokens,
        total=(
            system_prompt_tokens
            + context_tokens
            + volatile_context_tokens
            + history_tokens
            + message_tokens
        ),
        context_by_key=context_by_key,
    )


def log_token_summary(logger: logging.Logger, summary: TokenDebugSummary) -> None:
    """Log a compact token-usage summary for one provider request.

    Args:
        logger: Logger that should receive the token summary.
        summary: Token breakdown for the current provider request.
    """
    logger.info("%s", format_token_summary(summary))


def format_token_summary(
    summary: TokenDebugSummary, *, max_context_keys: int = 5
) -> str:
    """Format a readable token-usage summary for logs and tests.

    Args:
        summary: Token breakdown for the current provider request.
        max_context_keys: Maximum number of ranked context keys to include.

    Returns:
        Multi-line string describing the main prompt buckets and the largest
        context contributors.
    """
    total = summary.total
    lines = [
        "Agent token usage:",
        f"  model: {summary.model}",
        f"  total: {total}",
        "  buckets:",
        (
            "    system = "
            + str(summary.system_prompt)
            + " ("
            + _format_percentage(summary.system_prompt, total)
            + ")"
        ),
        (
            "    context = "
            + str(summary.context)
            + " ("
            + _format_percentage(summary.context, total)
            + ")"
        ),
        (
            "    volatile context = "
            + str(summary.volatile_context)
            + " ("
            + _format_percentage(summary.volatile_context, total)
            + ")"
        ),
        (
            "    history = "
            + str(summary.history)
            + " ("
            + _format_percentage(summary.history, total)
            + ")"
        ),
        (
            "    message = "
            + str(summary.message)
            + " ("
            + _format_percentage(summary.message, total)
            + ")"
        ),
        "  context keys:",
        *_format_context_breakdown_lines(summary, max_context_keys=max_context_keys),
    ]
    return "\n".join(lines)


def _resolve_encoding(model: str) -> Any | None:
    if tiktoken is None:
        return None

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


def _format_context_breakdown_lines(
    summary: TokenDebugSummary, *, max_context_keys: int
) -> list[str]:
    if not summary.context_by_key:
        return ["    n/a = 0 (0.0% of context, 0.0% of total)"]

    sorted_items = sorted(
        summary.context_by_key.items(),
        key=lambda item: (-item[1], item[0]),
    )
    visible_items = sorted_items[:max_context_keys]
    lines = [
        (
            f"    {key} = {tokens} "
            f"({_format_percentage(tokens, summary.context)} of context, "
            f"{_format_percentage(tokens, summary.total)} of total)"
        )
        for key, tokens in visible_items
    ]

    if len(sorted_items) > max_context_keys:
        other_tokens = sum(tokens for _, tokens in sorted_items[max_context_keys:])
        lines.append(
            (
                f"    other = {other_tokens} "
                f"({_format_percentage(other_tokens, summary.context)} of context, "
                f"{_format_percentage(other_tokens, summary.total)} of total)"
            )
        )

    return lines


def _format_percentage(part: int, whole: int) -> str:
    if whole <= 0:
        return "0.0%"

    return f"{(part / whole) * 100:.1f}%"


def _build_history_texts(history: list[Any]) -> list[str]:
    texts: list[str] = []
    for message in history:
        if message.role == "tool":
            texts.append(_stringify_text(message.content, message.text))
            continue

        if message.text:
            texts.append(message.text)

        for tool_call in message.tool_calls:
            texts.append(tool_call.name)
            texts.append(_stringify_text(tool_call.arguments, "{}"))

    return texts


def _stringify_text(content: Any, fallback: str) -> str:
    if isinstance(content, str):
        return content

    if content is None:
        return fallback

    from json import dumps

    return dumps(content, ensure_ascii=False, sort_keys=True)
