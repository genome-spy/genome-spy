# LLM Action + State Context (Draft)

This document defines the LLM-facing structure for actions, interaction state, and provenance. It complements `data-schema.md`, which focuses on view hierarchy and data encodings.

## Action Catalog
From intent actions and action info sources:
- Action type
- Required payload fields
- Attribute requirements
- Human-readable description

Rationale: enables programmatic validation of LLM-proposed steps.

### Auto-Extraction Strategy
You can auto-extract most of the catalog by combining:
- Action type strings from slice action creators.
- Payload shapes from `payloadTypes.d.ts` (or a `.ts` wrapper) via JSON Schema generation.
- Human-readable titles from `actionInfo` / `paramActionInfo`.

What is still needed:
- A small action catalog map that links **action type -> payload type name -> description**.
- Optional usage examples (e.g., from JSDoc `@example` or catalog entries).

### Minimal Action Catalog Shape
Store a single source of truth that connects action types to payload types and documentation.
This enables JSON Schema generation and optional Markdown exports without hand-maintained docs.

Example:
```js
{
  sortBy: {
    type: sampleSlice.actions.sortBy.type,
    payloadType: "SortBy",
    title: "Sort by attribute",
    description: "Sort samples by an attribute.",
    example: "{\"attribute\": {\"type\": \"SAMPLE_ATTRIBUTE\", \"specifier\": \"age\"}}"
  }
}
```

## Param/Selection State
From `paramProvenance`:
- Selector key + view scope
- Param type (value/point/interval)
- Current value(s)

Rationale: necessary for commands like "filter to the current brush".

## Provenance Summary
Use action info to provide:
- Recent actions in natural language
- Optional grouping into multi-step "programs"

Rationale: keeps the LLM aware of current state and avoids redundant steps.

## Composition Notes
- Multi-step requests should be represented as an ordered "intent program".
- Validate each step against the action catalog before execution.
- Execute sequences via `IntentPipeline.submit(actions)` to ensure ordering and rollback.
