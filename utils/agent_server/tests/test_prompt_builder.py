from app.models import HistoryMessage, ProviderRequest, ToolCall
from app.prompt_builder import (
    build_chat_completions_messages,
    build_prompt_ir,
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

    prompt = build_prompt_ir(request)
    messages = build_responses_input(prompt)

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

    prompt = build_prompt_ir(request)
    messages = build_chat_completions_messages(prompt)

    assert messages[0] == {"role": "system", "content": "system prompt"}
    assert messages[1]["role"] == "system"
    assert "schemaVersion" in messages[1]["content"]
    assert messages[2] == {"role": "user", "content": "First question"}
    assert messages[3] == {"role": "assistant", "content": "First answer"}
    assert messages[4] == {"role": "user", "content": "Follow-up question"}


def test_build_responses_input_serializes_tool_turns() -> None:
    request = ProviderRequest(
        system_prompt="system prompt",
        context={"schemaVersion": 1, "viewRoot": {"title": "Example"}},
        history=[
            HistoryMessage(
                id="1",
                role="assistant",
                text="I should open it.",
                tool_calls=[
                    ToolCall(
                        call_id="call_1",
                        name="expandViewNode",
                        arguments={"selector": {"scope": [], "view": "track"}},
                    )
                ],
            ),
            HistoryMessage(
                id="2",
                role="tool",
                text="Expanded the requested view branch.",
                tool_call_id="call_1",
            ),
        ],
        message="What is there now?",
    )

    prompt = build_prompt_ir(request)
    messages = build_responses_input(prompt)

    assert messages[1]["id"] == "1"
    assert messages[1]["role"] == "assistant"
    assert messages[1]["content"][0] == {
        "type": "output_text",
        "text": "I should open it.",
    }
    assert messages[2] == {
        "type": "function_call",
        "call_id": "call_1",
        "name": "expandViewNode",
        "arguments": '{"selector": {"scope": [], "view": "track"}}',
    }
    assert messages[3] == {
        "type": "function_call_output",
        "call_id": "call_1",
        "output": "Expanded the requested view branch.",
    }


def test_build_chat_completions_messages_serializes_tool_turns() -> None:
    request = ProviderRequest(
        system_prompt="system prompt",
        context={"schemaVersion": 1, "viewRoot": {"title": "Example"}},
        history=[
            HistoryMessage(
                id="1",
                role="assistant",
                text="I should open it.",
                tool_calls=[
                    ToolCall(
                        call_id="call_1",
                        name="expandViewNode",
                        arguments={"selector": {"scope": [], "view": "track"}},
                    )
                ],
            ),
            HistoryMessage(
                id="2",
                role="tool",
                text="Expanded the requested view branch.",
                tool_call_id="call_1",
            ),
        ],
        message="What is there now?",
    )

    prompt = build_prompt_ir(request)
    messages = build_chat_completions_messages(prompt)

    assert messages[2]["role"] == "assistant"
    assert messages[2]["tool_calls"][0] == {
        "id": "call_1",
        "type": "function",
        "function": {
            "name": "expandViewNode",
            "arguments": '{"selector": {"scope": [], "view": "track"}}',
        },
    }
    assert messages[3] == {
        "role": "tool",
        "content": "Expanded the requested view branch.",
    }


def test_build_prompt_ir_separates_instructions_and_context() -> None:
    request = ProviderRequest(
        system_prompt="system prompt",
        context={"schemaVersion": 1, "viewRoot": {"title": "Example"}},
        history=[],
        message="Follow-up question",
    )

    prompt = build_prompt_ir(request)

    assert prompt.instructions == "system prompt"
    assert prompt.context["schemaVersion"] == 1
    assert prompt.context_text.startswith("Current GenomeSpy context snapshot:\n")
