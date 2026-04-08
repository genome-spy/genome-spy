from app.models import HistoryMessage, ProviderRequest
from app.prompt_builder import (
    build_chat_completions_messages,
    build_responses_input,
)


def test_build_responses_input_uses_poc_order() -> None:
    request = ProviderRequest(
        system_prompt="system prompt",
        context={"schemaVersion": 1, "viewRoot": {"title": "Example"}},
        history=[
            HistoryMessage(id="1", role="user", text="First question"),
            HistoryMessage(id="2", role="assistant", text="First answer"),
        ],
        message="Follow-up question",
    )

    messages = build_responses_input(request)

    assert messages[0]["role"] == "developer"
    assert messages[0]["content"][0]["type"] == "input_text"
    assert "schemaVersion" in messages[0]["content"][0]["text"]
    assert messages[1]["id"] == "1"
    assert messages[1]["role"] == "user"
    assert messages[1]["content"][0] == {
        "type": "input_text",
        "text": "First question",
    }
    assert messages[2]["id"] == "2"
    assert messages[2]["role"] == "assistant"
    assert messages[3]["role"] == "user"
    assert messages[3]["content"][0] == {
        "type": "input_text",
        "text": "Follow-up question",
    }


def test_build_chat_completions_messages_uses_poc_order() -> None:
    request = ProviderRequest(
        system_prompt="system prompt",
        context={"schemaVersion": 1, "viewRoot": {"title": "Example"}},
        history=[
            HistoryMessage(id="1", role="user", text="First question"),
            HistoryMessage(id="2", role="assistant", text="First answer"),
        ],
        message="Follow-up question",
    )

    messages = build_chat_completions_messages(request)

    assert messages[0] == {"role": "system", "content": "system prompt"}
    assert messages[1]["role"] == "system"
    assert "schemaVersion" in messages[1]["content"]
    assert messages[2] == {"role": "user", "content": "First question"}
    assert messages[3] == {"role": "assistant", "content": "First answer"}
    assert messages[4] == {"role": "user", "content": "Follow-up question"}
