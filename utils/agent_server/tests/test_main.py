from fastapi.testclient import TestClient

from app.config import load_default_system_prompt
from app.main import app
from app.models import ProviderResponse


class StubProvider:
    async def generate(self, request):  # type: ignore[no-untyped-def]
        assert request.message == "How are methylation levels encoded?"
        assert request.history[0].text == "What is in this visualization?"
        assert request.context["schemaVersion"] == 1
        return ProviderResponse(
            type="answer",
            message="The beta-value track encodes it.",
        )


class FailingProvider:
    async def generate(self, request):  # type: ignore[no-untyped-def]
        raise RuntimeError("boom")


def test_plan_endpoint_returns_normalized_response(monkeypatch) -> None:
    monkeypatch.setenv("GENOMESPY_AGENT_MODEL", "test-model")
    monkeypatch.setattr("app.main.get_provider", lambda: StubProvider())
    client = TestClient(app)

    response = client.post(
        "/v1/plan",
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


def test_plan_endpoint_reports_provider_failure(monkeypatch) -> None:
    monkeypatch.setenv("GENOMESPY_AGENT_MODEL", "test-model")
    monkeypatch.setattr("app.main.get_provider", lambda: FailingProvider())
    client = TestClient(app)

    response = client.post(
        "/v1/plan",
        json={
            "message": "What is in this visualization?",
            "history": [],
            "context": {"schemaVersion": 1},
        },
    )

    assert response.status_code == 502
    assert response.json() == {"detail": "Provider request failed: boom"}


def test_default_system_prompt_is_markdown_text() -> None:
    prompt = load_default_system_prompt()

    assert "genomespy_plan_response" in prompt
    assert "message" in prompt
