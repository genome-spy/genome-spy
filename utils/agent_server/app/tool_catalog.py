from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

_REPO_ROOT = Path(__file__).resolve().parents[3]
_TOOL_CATALOG_PATH = _REPO_ROOT / "packages/app/src/agent/generatedToolCatalog.json"
_TOOL_SCHEMA_PATH = _REPO_ROOT / "packages/app/src/agent/generatedToolSchema.json"


@lru_cache(maxsize=1)
def load_generated_tool_catalog() -> list[dict[str, Any]]:
    with _TOOL_CATALOG_PATH.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)

    if not isinstance(payload, list):
        raise ValueError("Generated tool catalog must be a list.")

    return payload


@lru_cache(maxsize=1)
def load_generated_tool_schema() -> dict[str, Any]:
    with _TOOL_SCHEMA_PATH.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)

    if not isinstance(payload, dict):
        raise ValueError("Generated tool schema must be an object.")

    return payload


@lru_cache(maxsize=1)
def build_responses_tool_definitions() -> list[dict[str, Any]]:
    catalog = load_generated_tool_catalog()
    schema = load_generated_tool_schema()
    definitions = schema.get("definitions")
    if not isinstance(definitions, dict):
        raise ValueError("Generated tool schema is missing definitions.")

    tool_definitions: list[dict[str, Any]] = []
    for entry in catalog:
        if not isinstance(entry, dict):
            raise ValueError("Generated tool catalog entries must be objects.")

        tool_name = entry.get("toolName")
        input_type = entry.get("inputType")
        description = entry.get("description")

        if not isinstance(tool_name, str) or not isinstance(input_type, str):
            raise ValueError("Generated tool catalog entry is missing names.")

        if not isinstance(description, str):
            raise ValueError(
                "Generated tool catalog entry is missing a description."
            )

        if input_type not in definitions:
            raise ValueError(
                "Generated tool schema is missing definition for " + input_type
            )

        tool_definitions.append(
            {
                "type": "function",
                "name": tool_name,
                "description": description,
                "parameters": {
                    "$schema": schema.get("$schema"),
                    "$ref": "#/definitions/" + input_type,
                    "definitions": definitions,
                },
                "strict": True,
            }
        )

    return tool_definitions

