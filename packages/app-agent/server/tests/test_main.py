from _pytest.logging import LogCaptureFixture
from fastapi.testclient import TestClient

from app.config import load_default_system_prompt
from app.main import (
    app,
    get_provider,
    get_settings,
)
from app.models import ProviderResponse, ProviderStreamEvent, ToolCall
from app.providers.openai_responses import OpenAIResponsesProvider


class StubProvider:
    async def generate(self, request):  # type: ignore[no-untyped-def]
        assert request.message == "How are methylation levels encoded?"
        assert request.history[0].text == "What is in this visualization?"
        assert request.context["schemaVersion"] == 1
        assert request.volatile_context == {}
        return ProviderResponse(
            type="answer",
            message="The beta-value track encodes it.",
        )


class FailingProvider:
    async def generate(self, request):  # type: ignore[no-untyped-def]
        raise RuntimeError("boom")


class ToolCallProvider:
    async def generate(self, request):  # type: ignore[no-untyped-def]
        return ProviderResponse(
            type="tool_call",
            tool_calls=[
                ToolCall(
                    call_id="call_1",
                    name="expandViewNode",
                    arguments={"selector": {"scope": [], "view": "track"}},
                )
            ],
        )


class ToolAwareProvider:
    async def generate(self, request):  # type: ignore[no-untyped-def]
        assert len(request.tools) == 1
        assert request.tools[0].name == "expandViewNode"
        assert request.tools[0].strict is True
        assert request.tools[0].parameters["type"] == "object"
        assert request.volatile_context["selectionAggregation"]["fields"] == []
        return ProviderResponse(type="answer", message="Tools arrived.")


class StreamingProvider:
    async def generate(self, request):  # type: ignore[no-untyped-def]
        return ProviderResponse(
            type="answer",
            message="The beta-value track encodes it.",
        )

    async def generate_stream(self, request):  # type: ignore[no-untyped-def]
        yield ProviderStreamEvent(type="delta", delta="{")
        yield ProviderStreamEvent(
            type="reasoning_delta", reasoning="Checking the schema."
        )
        yield ProviderStreamEvent(
            type="delta",
            delta=('"type":"answer","message":"The beta-value track encodes it."}'),
        )
        yield ProviderStreamEvent(
            type="final",
            response=ProviderResponse(
                type="answer",
                message="The beta-value track encodes it.",
            ),
        )


class StubMlResponse:
    def __init__(self, url: str, payload: dict) -> None:
        self._url = url
        self._payload = payload
        self.status_code = 200
        self.text = ""

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict:
        return {
            "proxiedUrl": self._url,
            "payload": self._payload,
        }


class StubMlClient:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict]] = []

    async def post(self, url: str, json: dict) -> StubMlResponse:
        self.calls.append((url, json))
        return StubMlResponse(url, json)


def reset_settings_cache() -> None:
    get_settings.cache_clear()


def reset_provider_cache() -> None:
    get_provider.cache_clear()


def test_get_provider_uses_responses_by_default(monkeypatch) -> None:
    monkeypatch.setenv("GENOMESPY_AGENT_MODEL", "test-model")
    reset_settings_cache()
    reset_provider_cache()

    try:
        provider = get_provider()
    finally:
        reset_provider_cache()

    assert isinstance(provider, OpenAIResponsesProvider)


def test_agent_turn_endpoint_returns_normalized_response(monkeypatch) -> None:
    monkeypatch.setenv("GENOMESPY_AGENT_MODEL", "test-model")
    reset_settings_cache()
    monkeypatch.setattr("app.main.get_provider", lambda: StubProvider())
    client = TestClient(app)

    response = client.post(
        "/v1/agent-turn",
        json={
            "message": "How are methylation levels encoded?",
            "history": [
                {
                    "id": "msg_001",
                    "role": "user",
                    "text": "What is in this visualization?",
                }
            ],
            "context": {"schemaVersion": 1},
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "type": "answer",
        "message": "The beta-value track encodes it.",
    }


def test_evo2_proxy_posts_to_evo2_endpoint(monkeypatch) -> None:
    monkeypatch.setenv("GENOMESPY_AGENT_MODEL", "test-model")
    monkeypatch.setenv("ML_EVO2_BASE_URL", "http://dgx.example:8011")
    reset_settings_cache()
    client = TestClient(app)
    ml_client = StubMlClient()
    client.app.state.ml_client = ml_client

    response = client.post(
        "/v1/evo2",
        json={"task": "score", "variants": [{"chrom": "chr17", "pos": 1}]},
    )

    assert response.status_code == 200
    assert ml_client.calls == [
        (
            "http://dgx.example:8011/evo2",
            {"task": "score", "variants": [{"chrom": "chr17", "pos": 1}]},
        )
    ]


def test_alphagenome_proxy_posts_to_alphagenome_endpoint(monkeypatch) -> None:
    monkeypatch.setenv("GENOMESPY_AGENT_MODEL", "test-model")
    monkeypatch.setenv("ML_ALPHAGENOME_BASE_URL", "http://dgx.example:8002")
    reset_settings_cache()
    client = TestClient(app)
    ml_client = StubMlClient()
    client.app.state.ml_client = ml_client

    response = client.post(
        "/v1/alphagenome",
        json={"task": "score", "seq": "ACGT", "snvs": [], "heads": ["atac"]},
    )

    assert response.status_code == 200
    assert ml_client.calls == [
        (
            "http://dgx.example:8002/alphagenome",
            {
                "task": "score",
                "seq": "ACGT",
                "snvs": [],
                "heads": ["atac"],
            },
        )
    ]


def test_agent_turn_endpoint_logs_token_summary(
    caplog: LogCaptureFixture, monkeypatch
) -> None:
    monkeypatch.setenv("GENOMESPY_AGENT_MODEL", "test-model")
    reset_settings_cache()
    monkeypatch.setattr("app.main.get_provider", lambda: StubProvider())
    client = TestClient(app)

    with caplog.at_level("INFO", logger="uvicorn.error"):
        response = client.post(
            "/v1/agent-turn",
            json={
                "message": "How are methylation levels encoded?",
                "history": [
                    {
                        "id": "msg_001",
                        "role": "user",
                        "text": "What is in this visualization?",
                    }
                ],
                "context": {
                    "schemaVersion": 1,
                    "viewRoot": {"title": "Example"},
                },
            },
        )

    assert response.status_code == 200
    assert "Agent token usage:" in caplog.text
    assert "  total: " in caplog.text
    assert "  buckets:" in caplog.text
    assert "    context = " in caplog.text
    assert "    message = " in caplog.text
    assert "  context keys:" in caplog.text
    assert "    viewRoot = " in caplog.text
    assert "%" in caplog.text


def test_agent_turn_endpoint_logs_estimated_throughput(
    caplog: LogCaptureFixture, monkeypatch
) -> None:
    monkeypatch.setenv("GENOMESPY_AGENT_MODEL", "test-model")
    reset_settings_cache()
    monkeypatch.setattr("app.main.get_provider", lambda: StubProvider())
    client = TestClient(app)

    with caplog.at_level("INFO", logger="uvicorn.error"):
        response = client.post(
            "/v1/agent-turn",
            json={
                "message": "How are methylation levels encoded?",
                "history": [
                    {
                        "id": "msg_001",
                        "role": "user",
                        "text": "What is in this visualization?",
                    }
                ],
                "context": {"schemaVersion": 1},
            },
    )

    assert response.status_code == 200
    assert "Estimated client-observed throughput:" in caplog.text
    assert "  estimated output tokens: " in caplog.text
    assert "  estimated output tokens/s: " in caplog.text
    assert "  estimated input tokens: " in caplog.text


def test_agent_turn_endpoint_can_disable_debug_logs(
    caplog: LogCaptureFixture, monkeypatch
) -> None:
    monkeypatch.setenv("GENOMESPY_AGENT_MODEL", "test-model")
    monkeypatch.setenv("GENOMESPY_AGENT_ENABLE_TOKEN_DEBUG_LOGS", "false")
    monkeypatch.setenv("GENOMESPY_AGENT_ENABLE_THROUGHPUT_DEBUG_LOGS", "false")
    reset_settings_cache()
    monkeypatch.setattr("app.main.get_provider", lambda: StubProvider())
    client = TestClient(app)

    with caplog.at_level("INFO", logger="uvicorn.error"):
        response = client.post(
            "/v1/agent-turn",
            json={
                "message": "How are methylation levels encoded?",
                "history": [
                    {
                        "id": "msg_001",
                        "role": "user",
                        "text": "What is in this visualization?",
                    }
                ],
                "context": {"schemaVersion": 1},
            },
        )

    assert response.status_code == 200
    assert "Agent token usage:" not in caplog.text
    assert "Estimated client-observed throughput:" not in caplog.text


def test_agent_turn_endpoint_returns_tool_call_response(monkeypatch) -> None:
    monkeypatch.setenv("GENOMESPY_AGENT_MODEL", "test-model")
    reset_settings_cache()
    monkeypatch.setattr("app.main.get_provider", lambda: ToolCallProvider())
    client = TestClient(app)

    response = client.post(
        "/v1/agent-turn",
        json={
            "message": "Expand the collapsed node.",
            "history": [],
            "context": {"schemaVersion": 1},
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "type": "tool_call",
        "toolCalls": [
            {
                "callId": "call_1",
                "name": "expandViewNode",
                "arguments": {
                    "selector": {
                        "scope": [],
                        "view": "track",
                    }
                },
            }
        ],
    }


def test_agent_turn_endpoint_passes_tools_to_provider(monkeypatch) -> None:
    monkeypatch.setenv("GENOMESPY_AGENT_MODEL", "test-model")
    reset_settings_cache()
    monkeypatch.setattr("app.main.get_provider", lambda: ToolAwareProvider())
    client = TestClient(app)

    response = client.post(
        "/v1/agent-turn",
        json={
            "message": "Expand the collapsed node.",
            "history": [],
            "context": {"schemaVersion": 1},
            "volatileContext": {"selectionAggregation": {"fields": []}},
            "tools": [
                {
                    "type": "function",
                    "name": "expandViewNode",
                    "description": "Expand a collapsed view branch.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "selector": {
                                "type": "object",
                                "properties": {
                                    "scope": {
                                        "type": "array",
                                        "items": {"type": "string"},
                                    },
                                    "view": {"type": "string"},
                                },
                                "required": ["scope", "view"],
                                "additionalProperties": False,
                            }
                        },
                        "required": ["selector"],
                        "additionalProperties": False,
                    },
                    "strict": True,
                }
            ],
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "type": "answer",
        "message": "Tools arrived.",
    }


def test_agent_turn_endpoint_reports_provider_failure(monkeypatch) -> None:
    monkeypatch.setenv("GENOMESPY_AGENT_MODEL", "test-model")
    reset_settings_cache()
    monkeypatch.setattr("app.main.get_provider", lambda: FailingProvider())
    client = TestClient(app)

    response = client.post(
        "/v1/agent-turn",
        json={
            "message": "What is in this visualization?",
            "history": [],
            "context": {"schemaVersion": 1},
        },
    )

    assert response.status_code == 502
    assert response.json() == {"detail": "Provider request failed: boom"}


def test_agent_turn_endpoint_streams_sse_events(monkeypatch) -> None:
    monkeypatch.setenv("GENOMESPY_AGENT_MODEL", "test-model")
    reset_settings_cache()
    monkeypatch.setattr("app.main.get_provider", lambda: StreamingProvider())
    client = TestClient(app)

    response = client.post(
        "/v1/agent-turn?stream=true",
        json={
            "message": "What is in this visualization?",
            "history": [],
            "context": {"schemaVersion": 1},
        },
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert "event: start" in response.text
    assert "event: delta" in response.text
    assert "event: reasoning_delta" in response.text
    assert "event: final" in response.text
    assert '"type": "answer"' in response.text
    assert "```json" not in response.text


def test_agent_turn_endpoint_ignores_streaming_when_disabled(monkeypatch) -> None:
    monkeypatch.setenv("GENOMESPY_AGENT_MODEL", "test-model")
    monkeypatch.setenv("GENOMESPY_AGENT_ENABLE_STREAMING", "false")
    reset_settings_cache()
    monkeypatch.setattr("app.main.get_provider", lambda: StubProvider())
    client = TestClient(app)

    response = client.post(
        "/v1/agent-turn?stream=true",
        json={
            "message": "How are methylation levels encoded?",
            "history": [
                {
                    "id": "msg_001",
                    "role": "user",
                    "text": "What is in this visualization?",
                }
            ],
            "context": {"schemaVersion": 1},
        },
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/json")
    assert response.json() == {
        "type": "answer",
        "message": "The beta-value track encodes it.",
    }


def test_default_system_prompt_is_markdown_text() -> None:
    prompt = load_default_system_prompt()

    assert "genomespy_plan_response" in prompt
    assert "message" in prompt
    assert "getSampleGroups" in prompt
    assert "getIntentActionDocs" in prompt
    assert "getIntentActionTypeDocs" in prompt
    assert "includeSchema" not in prompt
