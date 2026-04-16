import json

from app.tool_catalog import build_responses_tool_definitions


def test_build_responses_tool_definitions_reads_generated_contract() -> None:
    tools = build_responses_tool_definitions()

    assert [tool["name"] for tool in tools] == [
        "expandViewNode",
        "collapseViewNode",
        "setViewVisibility",
        "jumpToProvenanceState",
        "jumpToInitialProvenanceState",
        "buildSelectionAggregationAttribute",
        "searchViewDatums",
        "submitIntentActions",
    ]
    serialized = json.dumps(tools)
    assert "AgentIntentBatchStep" not in serialized
    assert tools[0]["parameters"]["type"] == "object"
    assert tools[3]["name"] == "jumpToProvenanceState"
    assert tools[3]["parameters"]["type"] == "object"
    assert tools[4]["name"] == "jumpToInitialProvenanceState"
    assert tools[4]["parameters"]["type"] == "object"
    assert tools[4]["parameters"]["properties"] == {}
    assert tools[4]["strict"] is True
    assert tools[5]["parameters"]["type"] == "object"
    assert tools[5]["strict"] is True
    assert tools[-1]["parameters"]["type"] == "object"
    assert tools[-1]["strict"] is False
