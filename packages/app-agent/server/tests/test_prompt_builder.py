import json

from app.models import HistoryMessage, ProviderRequest, ToolCall
from app.prompt_builder import (
    build_prompt_ir,
    build_responses_input,
)


def test_build_responses_input_places_context_before_history() -> None:
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
    assert messages[1]["id"] == "msg_1"
    assert messages[1]["role"] == "user"
    assert messages[1]["content"][0] == {
        "type": "input_text",
        "text": "First question",
    }
    assert messages[2]["id"] == "msg_2"
    assert messages[2]["role"] == "assistant"
    assert messages[3]["role"] == "user"
    assert messages[3]["content"][0] == {
        "type": "input_text",
        "text": "Follow-up question",
    }


def test_build_responses_input_places_volatile_context_late() -> None:
    request = ProviderRequest(
        system_prompt="system prompt",
        context={"schemaVersion": 1, "viewRoot": {"title": "Example"}},
        volatile_context={
            "selectionAggregation": {
                "fields": [{"selection": "brush", "field": "copyNumber"}]
            }
        },
        history=[
            HistoryMessage(id="1", role="user", text="First question"),
            HistoryMessage(id="2", role="assistant", text="First answer"),
        ],
        message="Use my current selection.",
    )

    prompt = build_prompt_ir(request)
    messages = build_responses_input(prompt)

    assert messages[0]["role"] == "developer"
    assert messages[0]["content"][0]["text"].startswith(
        "Current GenomeSpy context snapshot:\n"
    )
    assert "selectionAggregation" not in messages[0]["content"][0]["text"]
    assert messages[3]["role"] == "developer"
    assert messages[3]["content"][0]["type"] == "input_text"
    assert messages[3]["content"][0]["text"].startswith(
        "Current volatile GenomeSpy state:\n"
    )
    assert "selectionAggregation" in messages[3]["content"][0]["text"]
    assert messages[4]["role"] == "user"
    assert messages[4]["content"][0] == {
        "type": "input_text",
        "text": "Use my current selection.",
    }


def test_build_responses_input_omits_empty_volatile_context() -> None:
    request = ProviderRequest(
        system_prompt="system prompt",
        context={"schemaVersion": 1},
        volatile_context={},
        history=[],
        message="Follow-up question",
    )

    prompt = build_prompt_ir(request)
    messages = build_responses_input(prompt)

    assert len(messages) == 2
    assert messages[0]["role"] == "developer"
    assert messages[0]["content"][0]["type"] == "input_text"
    assert "schemaVersion" in messages[0]["content"][0]["text"]
    assert messages[1]["role"] == "user"
    assert messages[1]["content"][0] == {
        "type": "input_text",
        "text": "Follow-up question",
    }


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

    assert messages[0]["role"] == "developer"
    assert messages[0]["content"][0]["text"].startswith(
        "Current GenomeSpy context snapshot:\n"
    )
    assert messages[1]["id"] == "msg_1"
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


def test_build_prompt_ir_separates_instructions_and_context() -> None:
    request = ProviderRequest(
        system_prompt="system prompt",
        context={
            "schemaVersion": 1,
            "actionCatalog": [],
            "attributes": [],
            "viewWorkflows": {"workflows": []},
            "lifecycle": {"appInitialized": True},
            "viewRoot": {"title": "Example"},
        },
        volatile_context={
            "sampleSummary": {"totalSampleCount": 2, "groupCount": 1},
            "sampleGroupLevels": [{"level": 0, "title": "Diagnosis"}],
            "provenance": [{"summary": "Sort by purity"}],
        },
        history=[],
        message="Follow-up question",
    )

    prompt = build_prompt_ir(request)

    assert prompt.instructions == "system prompt"
    assert prompt.context["schemaVersion"] == 1
    assert prompt.volatile_context == request.volatile_context
    assert prompt.volatile_context_text is not None
    assert prompt.context_text.startswith("Current GenomeSpy context snapshot:\n")
    context_json = json.loads(
        prompt.context_text.removeprefix("Current GenomeSpy context snapshot:\n")
    )
    assert list(context_json) == [
        "schemaVersion",
        "actionCatalog",
        "attributes",
        "viewWorkflows",
        "lifecycle",
        "viewRoot",
    ]
    volatile_context_json = json.loads(
        prompt.volatile_context_text.removeprefix(
            "Current volatile GenomeSpy state:\n"
        )
    )
    assert list(volatile_context_json) == [
        "sampleSummary",
        "sampleGroupLevels",
        "provenance",
    ]
    assert prompt.context == request.context
