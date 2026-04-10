# LLM Data + Visualization Context (Draft)

This document outlines what the LLM needs to understand a GenomeSpy visualization and the data behind it. The goal is to provide enough structured context for intent planning and validation, without hard-coding domain semantics into the engine. For actions and provenance, see [`action-schema.md`](./action-schema.md).

## Code References
- Context assembly: [`contextBuilder.js`](../src/agent/contextBuilder.js)
- View hierarchy normalization: [`viewTree.js`](../src/agent/viewTree.js)
- Selection and field summaries: [`selectionAggregationContext.js`](../src/agent/selectionAggregationContext.js)
- Workflow clarification and field resolution: [`selectionAggregationWorkflow.js`](../src/agent/selectionAggregationWorkflow.js)
- App transport boundary: [`agentAdapter.js`](../src/agent/agentAdapter.js)

## Principles
- Keep the system data-agnostic; capture semantics in metadata.
- Prefer stable identifiers (view names, attribute identifiers) over labels.
- Provide compact summaries to keep prompts bounded.
- Make everything optional and discoverable; fall back to clarification when missing.
- Keep collapsed branches compact in the always-on context; expand them on
  demand through retrieval tools instead of inlining every hidden detail.
- The product phases and data-access policy are summarized in
  [`index.md`](./index.md) and [`infrastructure.md`](./infrastructure.md).

## Agent Context Needs (Data + Structure)
- Visualization structure: view hierarchy, encodings, data sources.
- Static parameter declarations from the view spec: which selections or bound variables exist, which views they belong to, and whether they are persistent or clearable.
- Metadata dictionary: attribute names, types, optional descriptions.
- Scale summaries: scale type and data-domain (range only when meaningful, e.g., color schemes).

Parameter declarations are part of the visualization spec and stay fixed for
the current visualization. The current values for adjustable parameters live in
`paramProvenance`, which is the dynamic interaction state.

User-language mapping for parameter declarations:
- interval selections correspond to brushing or dragging a range
- point selections correspond to clicking individual items
- clearable selections correspond to clearing the brush or click selection

## Context Snapshot: High-Level Shape
- View hierarchy summary
- Data/metadata dictionary (attributes + types)
- Parameter declarations from the spec
- Scale summaries (type + data-domain)

## View Hierarchy Summary
For each view (or subtree root):
- `type` / `name` / `title`
- View type (unit/concat/layer/sampleView)
- Encodings: channel, field, type, title, description (if present)
- Data source id or selector (if named)
- Static parameter declarations attached to the view (selector, param name, type, persistence, clearability)

Rationale: disambiguates "where" an action should apply and helps resolve field names.

## Data + Metadata Dictionary
From SampleView metadata and attribute definitions:
- Attribute name
- Attribute type (nominal/ordinal/quantitative)
- Optional title and description
- Optional domain summary (top categories or min/max)

Rationale: enables mapping natural-language queries to valid attribute filters and groupings.

## Attribute Registry (View-Backed + Metadata)
Use `CompositeAttributeInfoSource` to expose:
- Attribute identifier `{ type, specifier }`
- Human title
- Data type
- Optional description
- Optional view location (if view-backed)

Rationale: gives the LLM a stable, unambiguous handle when composing intents.

## Scale Summaries
For each encoding with a scale:
- Scale type (linear/log/symlog/etc.)
- Data-domain (not pixel domain)
- Color scheme or explicit range when meaningful

Rationale: helps interpret what values mean in context (e.g., log scale).

## Domain Semantics (Optional)
GenomeSpy remains generic; domain knowledge can be attached via:
- `description` on `FieldDef` and `SampleAttributeDef`
- Optional markdown docs per subtree with definitions/thresholds

Rationale: lets LLM answer domain questions without encoding domain logic into the engine.

## Data Semantics Guidance
- GenomeSpy is data-agnostic; domain semantics should come from metadata, not hard-coded rules.
- Proposed addition: `description` on field definitions and sample attributes to describe meaning/thresholds.
- Optional markdown documentation per subtree could provide deeper domain context.
  - Prefer markdown with optional structured front-matter to extract definitions.
- Public vs controlled-access handling lives in [`infrastructure.md`](./infrastructure.md).

## Potential Schema Extensions
- `FieldDefBase.description?: string` in core spec (encodings).
- `SampleAttributeDef.description?: string` in sample view spec (metadata columns).
- `AttributeInfo.description?: string` in app to surface descriptions to UI and LLM context.

## Hierarchical Data Notes
LLMs generally handle hierarchical JSON well as long as the tree is compact and consistent.

For the normalized view-tree IR, see [`view-tree.md`](./view-tree.md).

Recommended structure:
- Use stable keys like `type`, `name`, `selector`, `parameterDeclarations`, `encodings`, `children`.
- Keep node payloads small (summary only).
- Avoid deep trees and large arrays in-line; provide details via separate lookups when needed.

Example (summary view tree):
```json
{
  "type": "vconcat",
  "title": "viewRoot",
  "children": [
    {
      "type": "sampleView",
      "name": "samples",
      "selector": { "scope": [], "view": "samples" },
      "parameterDeclarations": [],
      "children": [
        {
          "type": "unit",
          "name": "cnv-track",
          "selector": { "scope": [], "view": "cnv-track" },
          "encodings": [
            { "channel": "x", "field": "position", "type": "locus" },
            { "channel": "y", "field": "log2_copy_ratio", "type": "quantitative" }
          ]
        }
      ]
    }
  ]
}
```
