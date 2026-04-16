import json

from app.tool_catalog import build_responses_tool_definitions


def test_build_responses_tool_definitions_reads_generated_contract() -> None:
    tools = build_responses_tool_definitions()
    names = {tool["name"] for tool in tools}

    assert "expandViewNode" in names
    assert "setViewVisibility" in names
    assert "submitIntentActions" in names
    serialized = json.dumps(tools)
    assert "AgentIntentBatchStep" not in serialized
    assert any(tool["parameters"]["type"] == "object" for tool in tools)
    assert any(
        tool["name"] == "jumpToInitialProvenanceState"
        and tool["parameters"]["properties"] == {}
        and tool["strict"] is True
        for tool in tools
    )
    assert any(tool["name"] == "submitIntentActions" and tool["strict"] is False for tool in tools)
