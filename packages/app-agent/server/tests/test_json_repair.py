import pytest

from app.json_repair import load_json_with_repair, repair_json


@pytest.mark.parametrize(
    ("source", "expected"),
    [
        ("{'key': 'string', 'key2': false}", {"key": "string", "key2": False}),
        (
            "{'key': 'string', 'key2': false, \"key3\": null}",
            {"key": "string", "key2": False, "key3": None},
        ),
        (
            '{"text": "The quick brown fox won\\\'t jump"}',
            {"text": "The quick brown fox won't jump"},
        ),
    ],
)
def test_load_json_with_repair_normalizes_quotes(
    source: str, expected: dict[str, object]
) -> None:
    assert load_json_with_repair(source) == expected


@pytest.mark.parametrize(
    ("source", "expected"),
    [
        (
            '{"key": TRUE, "key2": FALSE, "key3": Null}',
            {"key": True, "key2": False, "key3": None},
        ),
        ("[TRUE, FALSE, Null]", [True, False, None]),
    ],
)
def test_load_json_with_repair_normalizes_literals(
    source: str, expected: object
) -> None:
    assert load_json_with_repair(source) == expected


@pytest.mark.parametrize(
    ("source", "expected"),
    [
        ('{"key":"",}', {"key": ""}),
        ('{"outer":{"inner":1,},}', {"outer": {"inner": 1}}),
        ("[1, 2, 3,]", [1, 2, 3]),
    ],
)
def test_load_json_with_repair_removes_trailing_commas(
    source: str, expected: object
) -> None:
    assert load_json_with_repair(source) == expected


@pytest.mark.parametrize(
    ("source", "expected"),
    [
        ("{foo: 1}", {"foo": 1}),
        ("{foo_bar: {'nested-key': TRUE}}", {"foo_bar": {"nested-key": True}}),
    ],
)
def test_load_json_with_repair_quotes_unquoted_keys(
    source: str, expected: dict[str, object]
) -> None:
    assert load_json_with_repair(source) == expected


@pytest.mark.parametrize(
    ("source", "expected"),
    [
        (
            '{"value_1": true, COMMENT "value_2": "data"}',
            {"value_1": True, "value_2": "data"},
        ),
        (
            '{// comment\n"value_1": true, /* remove me */ "value_2": "data"}',
            {"value_1": True, "value_2": "data"},
        ),
    ],
)
def test_load_json_with_repair_strips_comments(
    source: str, expected: dict[str, object]
) -> None:
    assert load_json_with_repair(source) == expected


def test_repair_json_combines_requested_repairs() -> None:
    repaired = repair_json(
        "{foo: 'bar', enabled: TRUE, note: 'line 1\nline 2',}"
    )

    assert load_json_with_repair(repaired) == {
        "foo": "bar",
        "enabled": True,
        "note": "line 1\nline 2",
    }


@pytest.mark.parametrize(
    ("source", "expected"),
    [
        ('```json\n{"key": true}\n```', {"key": True}),
        (' - {"test_key": ["test_value", "test_value2"] }', {"test_key": ["test_value", "test_value2"]}),
    ],
)
def test_load_json_with_repair_extracts_json_from_wrappers(
    source: str, expected: object
) -> None:
    assert load_json_with_repair(source) == expected


@pytest.mark.parametrize(
    ("source", "expected"),
    [
        ("string", ""),
        ("\n", ""),
        ("[", []),
        ("]", []),
        ("{", {}),
    ],
)
def test_load_json_with_repair_handles_scalar_and_standalone_inputs(
    source: str, expected: object
) -> None:
    assert load_json_with_repair(source) == expected


def test_load_json_with_repair_quotes_unquoted_string_values() -> None:
    assert load_json_with_repair(
        '{ "words": abcdef, "numbers": 12345, "words2": ghijkl }'
    ) == {
        "words": "abcdef",
        "numbers": 12345,
        "words2": "ghijkl",
    }


def test_load_json_with_repair_skips_garbage_tokens_between_fields() -> None:
    assert load_json_with_repair(
        '{"value_1": true, SHOULD_NOT_EXIST AAAA "value_2": "data"}'
    ) == {
        "value_1": True,
        "value_2": "data",
    }


def test_load_json_with_repair_repairs_doubled_quotes() -> None:
    assert load_json_with_repair(
        '{""answer"":[{""traits"":\'\'Female aged 60+\'\'}]}'
    ) == {
        "answer": [{"traits": "Female aged 60+"}],
    }
