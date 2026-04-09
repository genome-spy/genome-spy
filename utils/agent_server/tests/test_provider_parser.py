from app.models import ProviderResponse
from app.providers import (
    _extract_stream_text,
    _parse_chat_completions_response,
    _parse_provider_response_text,
    _parse_responses_response,
)


def test_parse_responses_response_returns_normalized_shape() -> None:
    payload = {
        "output": [
            {
                "type": "message",
                "role": "assistant",
                "content": [
                    {
                        "type": "output_text",
                        "text": (
                            '{"type":"answer","message":"This view shows '
                            'methylation."}'
                        ),
                    }
                ],
            }
        ]
    }

    response = _parse_responses_response(payload)

    assert response == ProviderResponse(
        type="answer", message="This view shows methylation."
    )


def test_parse_responses_response_falls_back_to_raw_text() -> None:
    payload = {
        "output": [
            {
                "type": "message",
                "role": "assistant",
                "content": [
                    {
                        "type": "output_text",
                        "text": "not json",
                    }
                ],
            }
        ]
    }

    response = _parse_responses_response(payload)

    assert response == ProviderResponse(type="answer", message="not json")


def test_parse_responses_response_accepts_json_code_fence() -> None:
    payload = {
        "output": [
            {
                "type": "message",
                "role": "assistant",
                "content": [
                    {
                        "type": "output_text",
                        "text": "```json\n"
                        '{"type":"clarify","message":"Which track do you mean?"}'
                        "\n```",
                    }
                ],
            }
        ]
    }

    response = _parse_responses_response(payload)

    assert response == ProviderResponse(
        type="clarify", message="Which track do you mean?"
    )


def test_parse_responses_response_repairs_literal_line_breaks_in_json() -> None:
    payload = {
        "output": [
            {
                "type": "message",
                "role": "assistant",
                "content": [
                    {
                        "type": "output_text",
                        "text": """{
  "type": "answer",
  "message": "The visualization shows genomic tracks.

## Details

- The y-axis encodes methylation values."
}""",
                    }
                ],
            }
        ]
    }

    response = _parse_responses_response(payload)

    assert response == ProviderResponse(
        type="answer",
        message=(
            "The visualization shows genomic tracks.\n\n"
            "## Details\n\n"
            "- The y-axis encodes methylation values."
        ),
    )


def test_parse_responses_response_logs_normalized_shape() -> None:
    payload = {
        "output": [
            {
                "type": "message",
                "role": "assistant",
                "content": [
                    {
                        "type": "output_text",
                        "text": '{"type":"answer","message":"This is normalized."}',
                    }
                ],
            }
        ]
    }

    response = _parse_responses_response(payload)

    assert response.model_dump() == {
        "type": "answer",
        "message": "This is normalized.",
    }


def test_parse_provider_response_text_repairs_decoded_inner_json() -> None:
    text = """{
  "type": "answer",
  "message": "Genomic coordinates are encoded on the x axis.

## Details

- The x axis represents the genomic position of CpG sites."
}"""

    response = _parse_provider_response_text(text, allow_repair=True)

    assert response == ProviderResponse(
        type="answer",
        message=(
            "Genomic coordinates are encoded on the x axis.\n\n"
            "## Details\n\n"
            "- The x axis represents the genomic position of CpG sites."
        ),
    )


def test_parse_chat_completions_response_prefers_parsed_payload() -> None:
    payload = {
        "choices": [
            {
                "message": {
                    "content": "ignored text",
                    "parsed": {
                        "type": "answer",
                        "message": "This view shows methylation.",
                    },
                }
            }
        ]
    }

    response = _parse_chat_completions_response(payload)

    assert response == ProviderResponse(
        type="answer", message="This view shows methylation."
    )


def test_parse_chat_completions_response_uses_reasoning_content_when_content_is_empty(
) -> None:
    payload = {
        "choices": [
            {
                "message": {
                    "content": "",
                    "reasoning_content": (
                        '{ "type": "answer", "message": "This is the answer." }'
                    ),
                }
            }
        ]
    }

    response = _parse_chat_completions_response(payload)

    assert response == ProviderResponse(
        type="answer", message="This is the answer."
    )


def test_parse_chat_completions_response_normalizes_escaped_line_breaks() -> None:
    payload = {
        "choices": [
            {
                "message": {
                    "content": (
                        '{"type":"answer","message":"Line 1\\\\n- item 1\\\\n- item 2"}'
                    )
                }
            }
        ]
    }

    response = _parse_chat_completions_response(payload)

    assert response == ProviderResponse(
        type="answer",
        message="Line 1\n- item 1\n- item 2",
    )


def test_parse_chat_completions_response_falls_back_to_raw_text() -> None:
    payload = {
        "choices": [
            {
                "message": {
                    "content": (
                        "The beta values are shown as rectangles with a y-axis "
                        "from 0 to 100%."
                    )
                }
            }
        ]
    }

    response = _parse_chat_completions_response(payload)

    assert response == ProviderResponse(
        type="answer",
        message="The beta values are shown as rectangles with a y-axis from 0 to 100%.",
    )


def test_parse_provider_response_text_uses_last_fenced_json_block() -> None:
    text = (
        "```json\n"
        '{"type":"answer","message":"First copy should be ignored."}'
        "\n```"
        "```json\n"
        '{"type":"answer","message":"The parsed copy should win."}'
        "\n```"
    )

    response = _parse_provider_response_text(text)

    assert response == ProviderResponse(
        type="answer",
        message="The parsed copy should win.",
    )


def test_extract_stream_text_ignores_structured_output_deltas() -> None:
    payload = {
        "type": "response.output_text.delta",
        "delta": "{",
    }

    assert _extract_stream_text(payload, "response.output_text.delta") == ""


def test_extract_stream_text_keeps_done_snapshot_text() -> None:
    payload = {
        "type": "response.output_text.done",
        "text": '{"type":"answer","message":"Done."}',
    }

    assert _extract_stream_text(payload, "response.output_text.done") == (
        '{"type":"answer","message":"Done."}'
    )
