import pytest

from app.models import ProviderResponse
from app.providers import ProviderError, _parse_provider_response


def test_parse_provider_response_returns_normalized_shape() -> None:
    payload = {
        "choices": [
            {
                "message": {
                    "content": (
                        '{"type":"answer","message":"This view shows methylation."}'
                    )
                }
            }
        ]
    }

    response = _parse_provider_response(payload)

    assert response == ProviderResponse(
        type="answer", message="This view shows methylation."
    )


def test_parse_provider_response_rejects_invalid_json() -> None:
    payload = {
        "choices": [
            {
                "message": {
                    "content": "not json"
                }
            }
        ]
    }

    with pytest.raises(ProviderError, match="valid JSON"):
        _parse_provider_response(payload)


def test_parse_provider_response_accepts_json_code_fence() -> None:
    payload = {
        "choices": [
            {
                "message": {
                    "content": (
                        "```json\n"
                        '{"type":"clarify","message":"Which track do you mean?"}'
                        "\n```"
                    )
                }
            }
        ]
    }

    response = _parse_provider_response(payload)

    assert response == ProviderResponse(
        type="clarify", message="Which track do you mean?"
    )


def test_parse_provider_response_prefers_parsed_payload() -> None:
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

    response = _parse_provider_response(payload)

    assert response == ProviderResponse(
        type="answer", message="This view shows methylation."
    )


def test_parse_provider_response_uses_reasoning_content_when_content_is_empty() -> None:
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

    response = _parse_provider_response(payload)

    assert response == ProviderResponse(
        type="answer", message="This is the answer."
    )


def test_parse_provider_response_normalizes_escaped_line_breaks() -> None:
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

    response = _parse_provider_response(payload)

    assert response == ProviderResponse(
        type="answer",
        message="Line 1\n- item 1\n- item 2",
    )
