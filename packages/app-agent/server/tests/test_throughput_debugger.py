from app.models import ProviderResponse, ToolCall
from app.throughput_debugger import (
    format_throughput_summary,
    summarize_response_throughput,
)


def test_summarize_response_throughput_for_answer_response() -> None:
    summary = summarize_response_throughput(
        ProviderResponse(type="answer", message="The beta-value track encodes it."),
        2000,
        "gpt-4.1-mini",
        estimated_input_tokens=120,
    )

    assert summary.model == "gpt-4.1-mini"
    assert summary.response_type == "answer"
    assert summary.request_duration_ms == 2000
    assert summary.estimated_output_tokens > 0
    assert summary.estimated_output_tokens_per_second > 0
    assert summary.estimated_input_tokens == 120
    assert (
        summary.estimated_total_tokens
        == summary.estimated_input_tokens + summary.estimated_output_tokens
    )
    assert summary.estimated_total_tokens_per_second is not None
    assert summary.estimated_total_tokens_per_second > 0


def test_summarize_response_throughput_for_tool_call_response() -> None:
    summary = summarize_response_throughput(
        ProviderResponse(
            type="tool_call",
            tool_calls=[
                ToolCall(
                    call_id="call_1",
                    name="expandViewNode",
                    arguments={"selector": {"scope": [], "view": "track"}},
                )
            ],
        ),
        500,
        "gpt-4.1-mini",
    )

    assert summary.response_type == "tool_call"
    assert summary.estimated_output_tokens > 0
    assert summary.estimated_input_tokens is None
    assert summary.estimated_total_tokens is None
    assert summary.estimated_total_tokens_per_second is None


def test_format_throughput_summary_marks_estimation_clearly() -> None:
    summary = summarize_response_throughput(
        ProviderResponse(type="answer", message="ok"),
        250,
        "gpt-4.1-mini",
        estimated_input_tokens=50,
    )

    formatted = format_throughput_summary(summary)

    assert "Estimated client-observed throughput:" in formatted
    assert "  request duration ms: 250" in formatted
    assert "  estimated output tokens: " in formatted
    assert "  estimated output tokens/s: " in formatted
    assert "  estimated input tokens: 50" in formatted
    assert "  estimated total tokens: " in formatted
    assert "  estimated total tokens/s: " in formatted


def test_summarize_response_throughput_rejects_invalid_inputs() -> None:
    response = ProviderResponse(type="answer", message="ok")

    try:
        summarize_response_throughput(response, -1, "gpt-4.1-mini")
    except ValueError as exc:
        assert str(exc) == "Request duration must not be negative."
    else:
        raise AssertionError("Expected ValueError for negative duration.")

    try:
        summarize_response_throughput(response, 1, "   ")
    except ValueError as exc:
        assert str(exc) == "Model name must not be blank."
    else:
        raise AssertionError("Expected ValueError for blank model name.")
