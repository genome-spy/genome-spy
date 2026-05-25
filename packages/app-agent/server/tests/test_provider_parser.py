from app.models import ProviderResponse, ToolCall
from app.providers.parsing import (
    _classify_stream_text,
    _parse_provider_response_text,
    _parse_responses_response,
)
from app.providers.streaming import _extract_stream_text, _extract_tool_call


def test_parse_responses_response_returns_normalized_shape() -> None:
    payload = {
        "output": [
            {
                "type": "message",
                "role": "assistant",
                "content": [
                    {
                        "type": "output_text",
                        "text": (
                            '{"type":"answer","message":"This view shows methylation."}'
                        ),
                    }
                ],
            }
        ]
    }

    response = _parse_responses_response(payload)

    assert response == ProviderResponse(
        type="answer", message="This view shows methylation."
    )


def test_parse_responses_response_falls_back_to_raw_text() -> None:
    payload = {
        "output": [
            {
                "type": "message",
                "role": "assistant",
                "content": [
                    {
                        "type": "output_text",
                        "text": "not json",
                    }
                ],
            }
        ]
    }

    response = _parse_responses_response(payload)

    assert response == ProviderResponse(type="answer", message="not json")


def test_parse_responses_response_accepts_answer_json_code_fence() -> None:
    payload = {
        "output": [
            {
                "type": "message",
                "role": "assistant",
                "content": [
                    {
                        "type": "output_text",
                        "text": "```json\n"
                        '{"type":"answer","message":"The top track shows segments."}'
                        "\n```",
                    }
                ],
            }
        ]
    }

    response = _parse_responses_response(payload)

    assert response == ProviderResponse(
        type="answer", message="The top track shows segments."
    )


def test_parse_responses_response_repairs_literal_line_breaks_in_json() -> None:
    payload = {
        "output": [
            {
                "type": "message",
                "role": "assistant",
                "content": [
                    {
                        "type": "output_text",
                        "text": """{
  "type": "answer",
  "message": "The visualization shows genomic tracks.

## Details

- The y-axis encodes methylation values."
}""",
                    }
                ],
            }
        ]
    }

    response = _parse_responses_response(payload)

    assert response == ProviderResponse(
        type="answer",
        message=(
            "The visualization shows genomic tracks.\n\n"
            "## Details\n\n"
            "- The y-axis encodes methylation values."
        ),
    )


def test_parse_responses_response_logs_normalized_shape() -> None:
    payload = {
        "output": [
            {
                "type": "message",
                "role": "assistant",
                "content": [
                    {
                        "type": "output_text",
                        "text": '{"type":"answer","message":"This is normalized."}',
                    }
                ],
            }
        ]
    }

    response = _parse_responses_response(payload)

    assert response.model_dump() == {
        "type": "answer",
        "message": "This is normalized.",
        "tool_calls": [],
    }


def test_parse_responses_response_returns_tool_call_shape() -> None:
    payload = {
        "output": [
            {
                "type": "function_call",
                "call_id": "call_123",
                "name": "expandViewNode",
                "arguments": '{"selector":{"scope":[],"view":"track"}}',
            }
        ]
    }

    response = _parse_responses_response(payload)

    assert response == ProviderResponse(
        type="tool_call",
        message=None,
        tool_calls=[
            ToolCall(
                call_id="call_123",
                name="expandViewNode",
                arguments={"selector": {"scope": [], "view": "track"}},
            )
        ],
    )


def test_parse_responses_response_decodes_nested_json_argument_strings() -> None:
    payload = {
        "output": [
            {
                "type": "function_call",
                "call_id": "call_123",
                "name": "zoomToScale",
                "arguments": (
                    '{"scaleName":"x_at_root","domain":'
                    '"[{\\"chrom\\": \\"chr17\\", \\"pos\\": 43044294}, '
                    '{\\"chrom\\": \\"chr17\\", \\"pos\\": 43125364}]"}'
                ),
            }
        ]
    }

    response = _parse_responses_response(payload)

    assert response.tool_calls[0].arguments == {
        "scaleName": "x_at_root",
        "domain": [
            {"chrom": "chr17", "pos": 43044294},
            {"chrom": "chr17", "pos": 43125364},
        ],
    }


def test_extract_stream_tool_call_decodes_nested_json_argument_strings() -> None:
    tool_call = _extract_tool_call(
        {
            "type": "function_call",
            "call_id": "call_123",
            "name": "zoomToScale",
            "arguments": {
                "scaleName": "x_at_root",
                "domain": (
                    '[{"chrom": "chr17", "pos": 43044294}, '
                    '{"chrom": "chr17", "pos": 43125364}]'
                ),
            },
        },
        "response.output_item.done",
    )

    assert tool_call is not None
    assert tool_call.arguments == {
        "scaleName": "x_at_root",
        "domain": [
            {"chrom": "chr17", "pos": 43044294},
            {"chrom": "chr17", "pos": 43125364},
        ],
    }


def test_parse_responses_response_suppresses_structured_tool_message() -> None:
    payload = {
        "output": [
            {
                "type": "message",
                "role": "assistant",
                "content": [
                    {
                        "type": "output_text",
                        "text": (
                            '"selector": {"scope": [], "view": "reference-sequence"}, '
                            '"visibility": true'
                        ),
                    }
                ],
            },
            {
                "type": "function_call",
                "call_id": "call_123",
                "name": "setViewVisibility",
                "arguments": (
                    '{"selector":{"scope":[],"view":"reference-sequence"},'
                    '"visibility":true}'
                ),
            },
        ]
    }

    response = _parse_responses_response(payload)

    assert response == ProviderResponse(
        type="tool_call",
        message=None,
        tool_calls=[
            ToolCall(
                call_id="call_123",
                name="setViewVisibility",
                arguments={
                    "selector": {"scope": [], "view": "reference-sequence"},
                    "visibility": True,
                },
            )
        ],
    )


def test_parse_responses_response_suppresses_xml_tool_message() -> None:
    payload = {
        "output": [
            {
                "type": "message",
                "role": "assistant",
                "content": [
                    {
                        "type": "output_text",
                        "text": (
                            "<function=submitIntentAction> <parameter=action> "
                            '{"actionType": "sampleView/sortBy"} </parameter> '
                            "</function>"
                        ),
                    }
                ],
            },
            {
                "type": "function_call",
                "call_id": "call_123",
                "name": "submitIntentAction",
                "arguments": (
                    '{"action":{"actionType":"sampleView/sortBy"},'
                    '"note":"Sort samples."}'
                ),
            },
        ]
    }

    response = _parse_responses_response(payload)

    assert response.message is None
    assert response.tool_calls[0].name == "submitIntentAction"


def test_parse_responses_response_keeps_natural_tool_message() -> None:
    payload = {
        "output": [
            {
                "type": "message",
                "role": "assistant",
                "content": [
                    {
                        "type": "output_text",
                        "text": "I'll sort the samples by age.",
                    }
                ],
            },
            {
                "type": "function_call",
                "call_id": "call_123",
                "name": "submitIntentAction",
                "arguments": (
                    '{"action":{"actionType":"sampleView/sortBy"},'
                    '"note":"Sort samples."}'
                ),
            },
        ]
    }

    response = _parse_responses_response(payload)

    assert response.message == "I'll sort the samples by age."
    assert response.tool_calls[0].name == "submitIntentAction"


def test_parse_provider_response_text_repairs_decoded_inner_json() -> None:
    text = """{
  "type": "answer",
  "message": "Genomic coordinates are encoded on the x axis.

## Details

- The x axis represents the genomic position of CpG sites."
}"""

    response = _parse_provider_response_text(text, allow_repair=True)

    assert response == ProviderResponse(
        type="answer",
        message=(
            "Genomic coordinates are encoded on the x axis.\n\n"
            "## Details\n\n"
            "- The x axis represents the genomic position of CpG sites."
        ),
    )


def test_parse_provider_response_text_uses_last_fenced_json_block() -> None:
    text = (
        "```json\n"
        '{"type":"answer","message":"First copy should be ignored."}'
        "\n```"
        "```json\n"
        '{"type":"answer","message":"The parsed copy should win."}'
        "\n```"
    )

    response = _parse_provider_response_text(text)

    assert response == ProviderResponse(
        type="answer",
        message="The parsed copy should win.",
    )


def test_extract_stream_text_returns_text_deltas() -> None:
    payload = {
        "type": "response.output_text.delta",
        "delta": "The x axis encodes genomic coordinates.",
    }

    assert _extract_stream_text(payload, "response.output_text.delta") == (
        "The x axis encodes genomic coordinates."
    )


def test_extract_stream_text_keeps_generic_reasoning_named_deltas() -> None:
    payload = {
        "type": "response.reasoning.delta",
        "delta": "Checking the view context.",
    }

    assert _extract_stream_text(payload, "response.reasoning.delta") == (
        "Checking the view context."
    )


def test_extract_stream_text_ignores_xml_tool_call_markup() -> None:
    payload = {
        "type": "response.output_text.delta",
        "delta": (
            "<tool_call> <function=zoomToScale> <parameter=scaleName>"
            "x_at_root</parameter> </function> </tool_call>"
        ),
    }

    assert _extract_stream_text(payload, "response.output_text.delta") == ""


def test_extract_stream_text_keeps_done_snapshot_text() -> None:
    payload = {
        "type": "response.output_text.done",
        "text": '{"type":"answer","message":"Done."}',
    }

    assert _extract_stream_text(payload, "response.output_text.done") == (
        '{"type":"answer","message":"Done."}'
    )


def test_classify_stream_text_distinguishes_prose_and_structured_json() -> None:
    assert _classify_stream_text("The x axis encodes genomic coordinates.") == ("prose")
    assert _classify_stream_text('   {"type":"answer"}') == "structured"
    assert (
        _classify_stream_text('"selector": {"scope": [], "view": "reference-sequence"}')
        == "structured"
    )
