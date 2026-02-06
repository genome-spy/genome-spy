# LLM Data + Visualization Context (Draft)

This document outlines what the LLM needs to understand a GenomeSpy visualization and the data behind it. The goal is to provide enough structured context for intent planning and validation, without hard-coding domain semantics into the engine. For actions and provenance, see `packages/app/LLM_PLAN/action-schema.md`.

## Principles
- Keep the system data-agnostic; capture semantics in metadata.
- Prefer stable identifiers (view names, attribute identifiers) over labels.
- Provide compact summaries to keep prompts bounded.
- Make everything optional and discoverable; fall back to clarification when missing.

## Agent Context Needs (Data + Structure)
- Visualization structure: view hierarchy, encodings, data sources.
- Metadata dictionary: attribute names, types, optional descriptions.
- Scale summaries: scale type and data-domain (range only when meaningful, e.g., color schemes).

## Context Snapshot: High-Level Shape
- View hierarchy summary
- Data/metadata dictionary (attributes + types)
- Scale summaries (type + data-domain)

## View Hierarchy Summary
For each view (or subtree root):
- `id` / `name` / `title`
- View type (unit/concat/layer/sampleView)
- Encodings: channel, field, type, title, description (if present)
- Data source id (if named)

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

## Potential Schema Extensions
- `FieldDefBase.description?: string` in core spec (encodings).
- `SampleAttributeDef.description?: string` in sample view spec (metadata columns).
- `AttributeInfo.description?: string` in app to surface descriptions to UI and LLM context.

## Hierarchical Data Notes
LLMs generally handle hierarchical JSON well as long as the tree is compact and consistent.

Recommended structure:
- Use stable keys like `id`, `type`, `encodings`, `children`.
- Keep node payloads small (summary only).
- Avoid deep trees and large arrays in-line; provide details via separate lookups when needed.

Example (summary view tree):
```json
{
  "id": "root",
  "type": "concat",
  "children": [
    {
      "id": "sample-view",
      "type": "sampleView",
      "encodings": [],
      "children": [
        {
          "id": "cnv-track",
          "type": "unit",
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
