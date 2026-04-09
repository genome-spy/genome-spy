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
    assert tools[0]["parameters"]["$ref"] == "#/definitions/ExpandViewNodeToolInput"
    assert tools[-1]["parameters"]["$ref"] == (
        "#/definitions/SubmitIntentProgramToolInput"
    )
