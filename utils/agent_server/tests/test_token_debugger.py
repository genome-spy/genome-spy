from app.models import HistoryMessage, ProviderRequest, ToolCall
from app.token_debugger import summarize_prompt_tokens


def test_summarize_prompt_tokens_includes_main_buckets() -> None:
    request = ProviderRequest(
        system_prompt="You are a helpful GenomeSpy assistant.",
        context={
            "schemaVersion": 1,
            "sampleSummary": {"sampleCount": 2},
            "toolCatalog": [{"name": "expandViewNode"}],
            "viewRoot": {"title": "Example"},
        },
        history=[
            HistoryMessage(id="1", role="user", text="What is in this chart?"),
            HistoryMessage(
                id="2",
                role="assistant",
                text="I should inspect the collapsed node.",
                tool_calls=[
                    ToolCall(
                        call_id="call_1",
                        name="expandViewNode",
                        arguments={"selector": {"scope": [], "view": "track"}},
                    )
                ],
            ),
            HistoryMessage(
                id="3",
                role="tool",
                text="Expanded the requested view branch.",
                tool_call_id="call_1",
            ),
        ],
        message="What does the beta-value track encode?",
    )

    summary = summarize_prompt_tokens(request, "gpt-4.1-mini")

    assert summary.model == "gpt-4.1-mini"
    assert summary.system_prompt > 0
    assert summary.context > 0
    assert summary.history > 0
    assert summary.message > 0
    assert summary.total == (
        summary.system_prompt
        + summary.context
        + summary.history
        + summary.message
    )


def test_summarize_prompt_tokens_breaks_context_down_by_key() -> None:
    request = ProviderRequest(
        system_prompt="system prompt",
        context={
            "schemaVersion": 1,
            "attributes": [{"name": "sample_id"}],
            "viewRoot": {"title": "Example"},
        },
        history=[],
        message="Follow-up question",
    )

    summary = summarize_prompt_tokens(request, "gpt-4.1-mini")

    assert "schemaVersion" in summary.context_by_key
    assert "attributes" in summary.context_by_key
    assert "viewRoot" in summary.context_by_key
    assert summary.context_by_key["viewRoot"] > 0


def test_summarize_prompt_tokens_excludes_tool_catalog_from_context_breakdown() -> None:
    request = ProviderRequest(
        system_prompt="system prompt",
        context={
            "schemaVersion": 1,
            "toolCatalog": [{"name": "expandViewNode"}],
            "viewRoot": {"title": "Example"},
        },
        history=[],
        message="Follow-up question",
    )

    summary = summarize_prompt_tokens(request, "gpt-4.1-mini")

    assert "toolCatalog" not in summary.context_by_key


def test_summarize_prompt_tokens_rejects_blank_model_name() -> None:
    request = ProviderRequest(
        system_prompt="system prompt",
        context={"schemaVersion": 1},
        history=[],
        message="Follow-up question",
    )

    try:
        summarize_prompt_tokens(request, "   ")
    except ValueError as exc:
        assert str(exc) == "Model name must not be blank."
    else:
        raise AssertionError("Expected ValueError for blank model name.")
