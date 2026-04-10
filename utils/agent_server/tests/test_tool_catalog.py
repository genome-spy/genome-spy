import json

from app.tool_catalog import build_responses_tool_definitions


def test_build_responses_tool_definitions_reads_generated_contract() -> None:
    tools = build_responses_tool_definitions()

    assert [tool["name"] for tool in tools] == [
        "expandViewNode",
        "collapseViewNode",
        "setViewVisibility",
        "clearViewVisibility",
        "submitIntentProgram",
    ]
    serialized = json.dumps(tools)
    assert "AgentIntentProgramStep" not in serialized
    assert tools[0]["parameters"]["type"] == "object"
    assert tools[-1]["parameters"]["type"] == "object"
    assert tools[-1]["strict"] is False
