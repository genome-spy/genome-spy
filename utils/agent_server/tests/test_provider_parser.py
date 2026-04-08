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
