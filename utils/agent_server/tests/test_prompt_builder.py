from app.models import HistoryMessage, ProviderRequest
from app.prompt_builder import build_provider_messages


def test_build_provider_messages_uses_poc_order() -> None:
    request = ProviderRequest(
        system_prompt="system prompt",
        context={"schemaVersion": 1, "viewRoot": {"title": "Example"}},
        history=[
            HistoryMessage(id="1", role="user", text="First question"),
            HistoryMessage(id="2", role="assistant", text="First answer"),
        ],
        message="Follow-up question",
    )

    messages = build_provider_messages(request)

    assert messages[0] == {"role": "system", "content": "system prompt"}
    assert messages[1]["role"] == "system"
    assert "schemaVersion" in messages[1]["content"]
    assert messages[2] == {"role": "user", "content": "First question"}
    assert messages[3] == {"role": "assistant", "content": "First answer"}
    assert messages[4] == {"role": "user", "content": "Follow-up question"}
