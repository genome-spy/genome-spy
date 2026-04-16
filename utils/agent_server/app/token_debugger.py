from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

from .models import ProviderRequest
from .prompt_builder import _build_context_text, _build_prompt_context, build_prompt_ir

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
        history: Estimated tokens for the serialized conversation history.
        message: Estimated tokens for the current user message.
        total: Sum of the main prompt buckets.
        context_by_key: Estimated tokens for each top-level prompt-context key.
    """

    model: str
    system_prompt: int
    context: int
    history: int
    message: int
    total: int
    context_by_key: dict[str, int]


def summarize_prompt_tokens(
    request: ProviderRequest, model: str
) -> TokenDebugSummary:
    """Estimate token usage for the main relay prompt components.

    Builds the same provider-neutral prompt representation used by the relay and
    counts the major prompt buckets that developers care about most: system
    prompt, context snapshot, history, and the current user message. The
    top-level context-key breakdown is included to help identify whether parts
    such as `viewRoot` dominate the prompt budget.

    Args:
        request: Provider request containing system prompt, context, history,
            and current user message.
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
    message_tokens = _count_tokens(prompt.message, encoding)

    return TokenDebugSummary(
        model=model,
        system_prompt=system_prompt_tokens,
        context=context_tokens,
        history=history_tokens,
        message=message_tokens,
        total=system_prompt_tokens + context_tokens + history_tokens + message_tokens,
        context_by_key=context_by_key,
    )


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
    """Count tokens, or estimate them when no tokenizer is available."""
    if encoding is not None:
        return len(encoding.encode(text))

    if not text:
        return 0

    return math.ceil(len(text) / 4)


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
