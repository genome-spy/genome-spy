import logging

from _pytest.logging import LogCaptureFixture

from app.config import Settings, describe_api_key_for_logs, load_settings
from app.providers import _log_provider_auth_diagnostic


def test_describe_api_key_for_logs_returns_masked_fingerprint() -> None:
    summary = describe_api_key_for_logs("sk-test-1234567890")

    assert summary.startswith("len=18 sha256=")
    assert "sk-test-1234567890" not in summary


def test_load_settings_logs_masked_api_key(
    caplog: LogCaptureFixture, monkeypatch
) -> None:
    monkeypatch.setenv("GENOMESPY_AGENT_MODEL", "test-model")
    monkeypatch.setenv("GENOMESPY_AGENT_API_KEY", "sk-test-1234567890")

    with caplog.at_level(logging.INFO):
        settings = load_settings()

    assert settings.api_key == "sk-test-1234567890"
    assert "api_key_source=GENOMESPY_AGENT_API_KEY" in caplog.text
    assert "api_key=len=18 sha256=" in caplog.text
    assert "sk-test-1234567890" not in caplog.text


def test_load_settings_defaults_to_responses(monkeypatch) -> None:
    monkeypatch.setenv("GENOMESPY_AGENT_MODEL", "test-model")
    monkeypatch.delenv("GENOMESPY_AGENT_API_STYLE", raising=False)

    settings = load_settings()

    assert settings.api_style == "responses"


def test_provider_auth_diagnostic_logs_masked_api_key(
    caplog: LogCaptureFixture,
) -> None:
    settings = Settings(
        model="gpt-4.1-mini",
        base_url="https://api.openai.com/v1",
        api_key="sk-test-1234567890",
        timeout_seconds=10,
        system_prompt="system prompt",
        api_style="responses",
        enable_streaming=True,
    )

    with caplog.at_level(logging.WARNING):
        _log_provider_auth_diagnostic(
            "responses", "https://api.openai.com/v1/responses", settings, 401
        )

    assert "provider=responses" in caplog.text
    assert "endpoint=https://api.openai.com/v1/responses" in caplog.text
    assert "api_key=len=18 sha256=" in caplog.text
    assert "api_key_has_whitespace=False" in caplog.text
    assert "sk-test-1234567890" not in caplog.text
