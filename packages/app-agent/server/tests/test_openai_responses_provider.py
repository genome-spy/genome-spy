import pytest

from app.config import Settings
from app.models import ProviderRequest, ProviderResponse
from app.providers import ProviderError
from app.providers.openai_responses import (
    OpenAIResponsesProvider,
    _build_unexpected_role_fallback_payload,
)


def test_build_unexpected_role_fallback_payload_moves_developer_messages_into_instructions() -> None:
    payload = {
        "model": "test-model",
        "instructions": "system prompt",
        "input": [
            {
                "role": "developer",
                "content": [{"type": "input_text", "text": "context"}],
            },
            {
                "role": "user",
                "content": [{"type": "input_text", "text": "hello"}],
            },
        ],
    }

    fallback_payload = _build_unexpected_role_fallback_payload(
        payload,
        ProviderError("Provider returned HTTP 400: Unexpected message role."),
    )

    assert fallback_payload is not None
    assert fallback_payload["instructions"] == "system prompt\n\ncontext"
    assert fallback_payload["input"] == [
        {
            "role": "user",
            "content": [{"type": "input_text", "text": "hello"}],
        }
    ]


def test_build_unexpected_role_fallback_payload_ignores_other_errors() -> None:
    payload = {"input": [{"role": "developer"}]}

    fallback_payload = _build_unexpected_role_fallback_payload(
        payload,
        ProviderError("Provider returned HTTP 500: boom"),
    )

    assert fallback_payload is None


@pytest.mark.anyio
async def test_generate_retries_with_unexpected_role_fallback(monkeypatch) -> None:
    provider = OpenAIResponsesProvider(
        Settings(
            model="test-model",
            base_url="http://127.0.0.1:8000/v1",
            api_key="placeholder",
            timeout_seconds=10.0,
            system_prompt="system prompt",
            enable_streaming=False,
            prefer_responses_role_compat=False,
            enable_token_debug_logs=True,
            enable_throughput_debug_logs=True,
            evo2_base_url="http://127.0.0.1:8001",
            alphagenome_base_url="http://127.0.0.1:8002",
            cors_origins=("http://localhost:8080",),
        )
    )
    request = ProviderRequest(
        system_prompt="system prompt",
        context={"schemaVersion": 1},
        history=[],
        message="hello",
    )
    observed_payloads = []

    class StubResponse:
        text = '{"output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":"ok"}]}]}'

        def json(self):  # type: ignore[no-untyped-def]
            return {
                "output": [
                    {
                        "type": "message",
                        "role": "assistant",
                        "content": [{"type": "output_text", "text": "ok"}],
                    }
                ]
            }

    async def stub_post_response(payload):  # type: ignore[no-untyped-def]
        observed_payloads.append(payload)
        if len(observed_payloads) == 1:
            raise ProviderError(
                'Provider returned HTTP 400: {"error":{"message":"Unexpected message role."}}'
            )
        return StubResponse()

    monkeypatch.setattr(provider, "_post_response", stub_post_response)

    response = await provider.generate(request)

    assert response == ProviderResponse(type="answer", message="ok")
    assert len(observed_payloads) == 2
    assert observed_payloads[0]["input"][0]["role"] == "developer"
    assert observed_payloads[1]["instructions"].startswith("system prompt\n\n")
    assert observed_payloads[1]["input"][0]["role"] == "user"


@pytest.mark.anyio
async def test_generate_prefers_role_compat_payload_when_enabled(
    monkeypatch,
) -> None:
    provider = OpenAIResponsesProvider(
        Settings(
            model="test-model",
            base_url="http://127.0.0.1:8000/v1",
            api_key="placeholder",
            timeout_seconds=10.0,
            system_prompt="system prompt",
            enable_streaming=False,
            prefer_responses_role_compat=True,
            enable_token_debug_logs=True,
            enable_throughput_debug_logs=True,
            evo2_base_url="http://127.0.0.1:8001",
            alphagenome_base_url="http://127.0.0.1:8002",
            cors_origins=("http://localhost:8080",),
        )
    )
    request = ProviderRequest(
        system_prompt="system prompt",
        context={"schemaVersion": 1},
        history=[],
        message="hello",
    )
    observed_payloads = []

    class StubResponse:
        text = '{"output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":"ok"}]}]}'

        def json(self):  # type: ignore[no-untyped-def]
            return {
                "output": [
                    {
                        "type": "message",
                        "role": "assistant",
                        "content": [{"type": "output_text", "text": "ok"}],
                    }
                ]
            }

    async def stub_post_response(payload):  # type: ignore[no-untyped-def]
        observed_payloads.append(payload)
        return StubResponse()

    monkeypatch.setattr(provider, "_post_response", stub_post_response)

    response = await provider.generate(request)

    assert response == ProviderResponse(type="answer", message="ok")
    assert len(observed_payloads) == 1
    assert observed_payloads[0]["instructions"].startswith("system prompt\n\n")
    assert observed_payloads[0]["input"][0]["role"] == "user"
