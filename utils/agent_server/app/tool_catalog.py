from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

_REPO_ROOT = Path(__file__).resolve().parents[3]
_GENERATED_AGENT_DIR = _REPO_ROOT / "packages/app/src/agent/generated"
_TOOL_CATALOG_PATH = _GENERATED_AGENT_DIR / "generatedToolCatalog.json"
_TOOL_SCHEMA_PATH = _GENERATED_AGENT_DIR / "generatedToolSchema.json"


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
        strict = entry.get("strict")

        if not isinstance(tool_name, str) or not isinstance(input_type, str):
            raise ValueError("Generated tool catalog entry is missing names.")

        if not isinstance(description, str):
            raise ValueError(
                "Generated tool catalog entry is missing a description."
            )

        if not isinstance(strict, bool):
            raise ValueError(
                "Generated tool catalog entry is missing a strict flag."
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
                "parameters": _project_schema(
                    definitions[input_type], definitions
                ),
                "strict": strict,
            }
        )

    return tool_definitions


def _project_schema(
    schema: Any,
    definitions: dict[str, Any],
    excluded_definition_names: set[str] | None = None,
    visited: set[str] | None = None,
) -> Any:
    if excluded_definition_names is None:
        excluded_definition_names = {"AgentIntentProgramStep"}

    if visited is None:
        visited = set()

    if schema is None or not isinstance(schema, (dict, list)):
        return schema

    if isinstance(schema, list):
        return [
            _project_schema(item, definitions, excluded_definition_names, visited)
            for item in schema
        ]

    ref = schema.get("$ref")
    if isinstance(ref, str):
        ref_name = ref.replace("#/definitions/", "")
        if ref_name in excluded_definition_names or ref_name in visited:
            return {"type": "object"}

        ref_schema = definitions.get(ref_name)
        if not isinstance(ref_schema, dict):
            return {"type": "object"}

        visited.add(ref_name)
        projected = _project_schema(
            ref_schema, definitions, excluded_definition_names, visited
        )
        visited.remove(ref_name)
        return projected

    projected: dict[str, Any] = {}
    for key, value in schema.items():
        if key in {"definitions", "$schema"}:
            continue

        if key == "properties" and isinstance(value, dict):
            projected[key] = {
                property_name: _project_schema(
                    property_schema,
                    definitions,
                    excluded_definition_names,
                    visited,
                )
                for property_name, property_schema in value.items()
            }
            continue

        if key in {"items", "not", "if", "then", "else"}:
            projected[key] = _project_schema(
                value, definitions, excluded_definition_names, visited
            )
            continue

        if key in {"anyOf", "allOf", "oneOf"} and isinstance(value, list):
            projected[key] = [
                _project_schema(item, definitions, excluded_definition_names, visited)
                for item in value
            ]
            continue

        if key == "additionalProperties" and isinstance(value, dict):
            projected[key] = _project_schema(
                value, definitions, excluded_definition_names, visited
            )
            continue

        projected[key] = value

    if projected.get("type") == "object" and "properties" not in projected:
        projected["properties"] = {}

    return projected
