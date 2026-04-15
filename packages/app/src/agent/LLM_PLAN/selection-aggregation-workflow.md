# Selection Aggregation Draft

This document describes the agent-facing flow for turning an interval selection
into an aggregated attribute descriptor that can be reused for derived metadata,
sorting, filtering, and plotting.

The important primitive is not the final `deriveMetadata` action. The important
primitive is the constructed aggregated `AttributeIdentifier`, because the same
descriptor can drive multiple consumers.

## Code References

- Selection menu construction: [`contextMenuBuilder.js`](../src/sampleView/contextMenuBuilder.js)
- Shared selection aggregation candidates: [`selectionAggregationCandidates.js`](../src/sampleView/selectionAggregationCandidates.js)
- Canonical aggregated attribute builder: [`selectionAggregationAttributes.js`](../src/sampleView/selectionAggregationAttributes.js)
- Attribute resolution and value providers: [`viewAttributeInfoSource.js`](../src/sampleView/viewAttributeInfoSource.js)
- Aggregated value accessors: [`attributeAccessors.js`](../src/sampleView/attributeAggregation/attributeAccessors.js)
- Derived metadata intent builder: [`deriveMetadataUtils.js`](../src/sampleView/metadata/deriveMetadataUtils.js)
- Agent-facing selection context: [`selectionAggregationContext.js`](../src/agent/selectionAggregationContext.js)
- Selection-aggregation resolver tool: [`selectionAggregationTool.js`](../src/agent/selectionAggregationTool.js)
- Local agent execution: [`agentAdapter.js`](../src/agent/agentAdapter.js)

## Status

- Implemented:
  - Candidate discovery is extracted to `selectionAggregationCandidates.js`
    and reused by the context menu and the agent context.
  - The agent context already exposes active interval selections and
    aggregatable fields through `selectionAggregationContext.js`.
  - `buildSelectionAggregationAttribute(candidateId, aggregation)` resolves
    a candidate row into the canonical attribute and a short preview.
  - The canonical `VALUE_AT_LOCUS` builder exists in
    `selectionAggregationAttributes.js`.
  - `buildDerivedMetadataIntent(...)` exists and is used by the derived
    metadata flow.
  - Tests cover candidate discovery, the attribute builder, and the agent
    selection context.

## Why this exists

- The current UI path is menu-driven and multi-step:
  - create an interval selection
  - inspect eligible views and fields
  - choose a field
  - choose an aggregation op
  - optionally derive metadata or reuse the same attribute elsewhere
- The final payload is too nested for a local LLM to construct reliably.
- The app already contains the logic needed to build the canonical attribute
  descriptor, so the agent should not reimplement it.
- The agent should work from compact candidate snapshots, not from raw nested
  payloads.

## User-Facing Intent

The system prompt should teach the agent to recognize prompts like:

- "Add mean beta values from chr2:100000-200000 to metadata"
- "Use the current brush to derive max beta values"
- "Sort by the aggregated value from this interval"

From the agent's point of view, these requests mean:

1. Identify the request as an aggregation-backed derived-attribute workflow.
2. Determine whether the interval is already represented by an active selection
   or needs one.
3. Ask for or inspect the current aggregation candidates.
4. Choose the matching candidate row and an aggregation op.
5. Resolve that row into the canonical aggregated `AttributeIdentifier`.
6. Reuse that attribute for metadata, sorting, filtering, or plotting.

The agent should not need to invent the full nested reducer payload by hand.
It should understand the conceptual flow and rely on the app for the canonical
construction.

### Current Agent Surface

What is available today:

- Read-only agent context already includes `selectionAggregation`.
  - `selectionAggregation.fields` lists one row per selection-field pair for
    the current active interval selections.
  - Each field summary already carries a stable `candidateId`,
    `viewSelector`, `field`, `dataType`, `supportedAggregations`, and a
    singular `selectionSelector`.
  - It does not duplicate `viewTitle` or field `description`; use `viewTree`
    and the sample-view helpers when richer labels are needed.
- The active selection declarations themselves come from `viewTree`.
  - The agent should read them from `parameterDeclarations`, not from
    `selectionAggregation`.
- There is no dedicated candidate-query tool.
  - The agent gets candidate information from the context snapshot returned by
    `getAgentContext(app)`.
  - If the agent needs a refreshed snapshot, it gets one on the next agent
    turn after the app rebuilds context.
- The available mutation entry point is `submitIntentActions`.
  - To make or update an interval selection, the agent uses an intent batch
    with `paramProvenance/paramChange`.
  - To turn the resolved view field into derived metadata, the agent uses
    `sampleView/deriveMetadata`.
  - `paramProvenance/expandPointSelection` exists, but it is for point
    selections and is not part of the interval-selection flow.
- `buildSelectionAggregationAttribute` resolves a candidate row into the
  canonical attribute preview.
  - It takes `candidateId` and `aggregation`.
  - It returns the canonical `VALUE_AT_LOCUS` attribute plus a short preview.
- `expandViewNode` / `collapseViewNode` are separate agent-context tools.
  - They are useful for the view tree, not for selection aggregation.

## Revision During Implementation

This is a living draft, not a fixed contract.

- Revise the candidate shape when the shared helper extraction makes the real
  data flow clearer.
- Revise the agent context shape if the agent needs a different boundary than
  the draft currently suggests.
- Keep the draft aligned with the actual extracted helpers, tests, and
  commit-splitting boundaries.
- Prefer updating this document during implementation over protecting the draft
  wording.

## What the agent should understand

- An interval selection can expose one or more candidate views and fields.
- Each candidate field can support one or more aggregation ops.
- The selected view + field + aggregation op can produce a reusable aggregated
  attribute descriptor.
- That descriptor can then be used by:
  - `sampleView/deriveMetadata`
  - sort operations
  - filter operations
  - plotting or derived encodings

## Source of Truth

The menu logic in `contextMenuBuilder.js` should remain the authoritative source
for which candidates are eligible.

The attribute construction logic in `viewAttributeInfoSource.js` and
`attributeAccessors.js` should remain the authoritative source for how an
aggregated attribute behaves.

The derived-metadata helper in `deriveMetadataUtils.js` should remain the
authoritative source for turning a resolved attribute into a provenance-backed
mutation.

The agent should not duplicate these rules in prompt text or in separate
parallel logic. The agent-facing context should stay thin and depend on shared
sample-view helpers for candidate discovery and attribute construction.

## Proposed Shape

The agent-facing flow should be split into two phases:

1. Discover candidates.
   - Return selection selector objects.
   - Return view selectors, not raw view IDs.
   - Return eligible fields.
   - Return supported aggregation ops for each field.
   - Return short preview names where possible.

2. Resolve one candidate into a canonical aggregated attribute descriptor.
   - Build the `VALUE_AT_LOCUS` identifier in app code.
   - Build the derived metadata intent in app code if needed.
   - Reuse the same descriptor for other consumers.

The model should choose from selector objects, candidate IDs, and labels. It
should not author the full nested payload that the reducer expects.

## Proposed Agent Contract

Prefer a small read-only tool that returns structured candidates:

```json
{
  "candidates": [
    {
      "candidateId": "brush@beta-values:beta",
      "viewSelector": {
        "scope": ["beta-values"],
        "view": "beta-values"
      },
      "field": "beta",
      "dataType": "quantitative",
      "supportedAggregations": ["count", "min", "max", "weightedMean", "variance"],
      "selectionSelector": {
        "scope": [],
        "param": "brush"
      },
      "defaultName": "max(beta)"
    }
  ]
}
```

The agent can then choose a candidate and an aggregation op. App code should
materialize the final attribute identifier and any derived metadata action.

The resolver tool should map one selected candidate row + aggregation op into
the canonical aggregated `AttributeIdentifier` that the app already
understands.

Suggested resolver shape:

```json
{
  "candidateId": "brush@beta-values:beta",
  "aggregation": "max"
}
```

Suggested resolver result:

```json
{
  "attribute": {
    "type": "VALUE_AT_LOCUS",
    "specifier": {
      "view": {
        "scope": ["beta-values"],
        "view": "beta-values"
      },
      "field": "beta",
      "interval": {
        "type": "selection",
        "selector": {
          "scope": [],
          "param": "brush"
        }
      },
      "aggregation": {
        "op": "max"
      }
    }
  },
  "title": "max(beta)",
  "description": "Aggregated beta values over the brush selection"
}
```

The resolver should not build the final `deriveMetadata` action. It should only
produce the reusable attribute descriptor and a short preview. The structured
attribute should come from app code. Downstream consumers can then turn that
descriptor into derived metadata, sort keys, filters, or plotting encodings.

## Proposed App Helpers

These helpers are already present or partially extracted:

- `discoverIntervalAggregationCandidates(...)`
  - Implemented as `getSelectionAggregationFieldInfos(...)` and the
    `getContextMenuFieldInfos(...)` alias.
  - Shared by the context menu and the agent-facing context.
  - Enumerates candidate view selectors, fields, and ops.

- `buildAggregatedAttributeIdentifier(...)`
  - Implemented as `buildSelectionAggregationAttributeIdentifier(...)`.
  - Turns a chosen candidate into the canonical `AttributeIdentifier`.
  - This is the right helper to reuse for derived metadata and any future
    agent workflow.

- `buildDerivedMetadataIntent(...)`
  - Implemented in `deriveMetadataUtils.js`.
  - Keeps building the actual provenance-backed mutation.
  - Remains the single source of truth for the reducer payload.

## Implementation Steps

1. Extract candidate discovery from the context menu code. Done.
   - Move the menu eligibility logic into a pure helper.
   - Keep the context menu as a UI consumer of that helper.
   - Keep the agent-facing discovery tool as another consumer of the same
     helper.
   - Use selectors as the stable external identity for candidate views.
   - Land this as a separate `refactor(app)` commit so it can be cherry-picked
     to `master`.
   - Review the extracted code for code smells before continuing.

2. Extract canonical aggregated-attribute construction. Partially done.
   - Build the `VALUE_AT_LOCUS` descriptor in one place.
   - Reuse the helper for derived metadata and any other consumer that needs the
     same attribute.
   - Keep this logic in the non-agent codebase.
   - Do not duplicate the construction in the agent layer.
   - Review the extracted code for code smells before continuing.

3. Feed the agent from the shared candidate snapshot and keep the agent-facing
   context thin. Partially done.
   - Keep the prompt high-level.
   - Let the tool return compact candidates.
   - Let app code construct the final payload.
   - Review the resulting agent-facing code for code smells before continuing.

4. Test the shared helpers directly. Mostly done.
   - Cover candidate discovery.
   - Cover aggregation op filtering by field type.
   - Cover attribute construction from a chosen candidate.
   - Cover reuse for derived metadata.

## Non-Goals

- Do not teach the LLM the full nested `AttributeIdentifier` structure.
- Do not duplicate context menu logic in a separate agent-only implementation.
- Do not make `deriveMetadata` the only supported consumer of the aggregated
  attribute.
- Do not expose menu prose as the primary API.

## Open Questions

- None at the moment.
