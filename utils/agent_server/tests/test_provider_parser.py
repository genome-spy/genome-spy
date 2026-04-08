import pytest

from app.models import ProviderResponse
from app.providers import (
    ProviderError,
    _parse_chat_completions_response,
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


def test_parse_responses_response_rejects_invalid_json() -> None:
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

    with pytest.raises(ProviderError, match="valid JSON"):
        _parse_responses_response(payload)


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
