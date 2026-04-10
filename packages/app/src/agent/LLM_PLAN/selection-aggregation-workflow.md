# Selection Aggregation Workflow (Draft)

This document describes the agent-facing flow for turning an interval selection
into an aggregated attribute descriptor that can be reused for derived metadata,
sorting, filtering, and plotting.

The important primitive is not the final `deriveMetadata` action. The important
primitive is the constructed aggregated `AttributeIdentifier`, because the same
descriptor can drive multiple consumers.

## Code References

- Selection menu construction: [`contextMenuBuilder.js`](../src/sampleView/contextMenuBuilder.js)
- Attribute resolution and value providers: [`viewAttributeInfoSource.js`](../src/sampleView/viewAttributeInfoSource.js)
- Aggregated value accessors: [`attributeAccessors.js`](../src/sampleView/attributeAggregation/attributeAccessors.js)
- Derived metadata intent builder: [`deriveMetadataUtils.js`](../src/sampleView/metadata/deriveMetadataUtils.js)
- Agent-facing view selectors: [`viewTree.js`](../src/agent/viewTree.js)
- Selection aggregation context: [`selectionAggregationContext.js`](../src/agent/selectionAggregationContext.js)
- Selection aggregation resolver: [`selectionAggregationWorkflow.js`](../src/agent/selectionAggregationWorkflow.js)
- Local agent execution: [`agentAdapter.js`](../src/agent/agentAdapter.js)

## Why this exists

- The current UI path is menu-driven and multi-step:
  - create an interval selection
  - inspect eligible views
  - choose a field
  - choose an aggregation op
  - optionally derive metadata or reuse the same attribute elsewhere
- The final payload is too nested for a local LLM to construct reliably.
- The app already contains the logic needed to build the canonical attribute
  descriptor, so the agent should not reimplement it.
- The old `viewWorkflow*` files are gone; the remaining resolver should stay
  thin and live in the agent folder.

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
4. Choose a view selector, field, and aggregation op.
5. Let the app build the canonical aggregated `AttributeIdentifier`.
6. Reuse that attribute for metadata, sorting, filtering, or plotting.

The agent should not need to invent the full nested reducer payload by hand.
It should understand the conceptual workflow and rely on the app for the
canonical construction.

## Revision During Implementation

This is a living plan, not a fixed contract.

- Revise the candidate shape when the shared helper extraction makes the real
  data flow clearer.
- Revise the resolver shape if the app ends up needing a different boundary
  than the draft currently suggests.
- Keep the plan aligned with the actual extracted helpers, tests, and
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

The agent should not duplicate these rules in prompt text or in a separate
resolver with its own parallel logic. The resolver itself belongs in the
agent folder, but it should stay thin and depend on shared sample-view
helpers for candidate discovery and attribute construction.

## Proposed Shape

The agent-facing flow should be split into two phases:

1. Discover candidates.
   - Return stable selection IDs.
   - Return view selectors, not raw view IDs.
   - Return eligible fields.
   - Return supported aggregation ops for each field.
   - Return short preview names where possible.

2. Resolve one candidate into a canonical aggregated attribute descriptor.
   - Build the `VALUE_AT_LOCUS` identifier in app code.
   - Build the derived metadata intent in app code if needed.
   - Reuse the same descriptor for other consumers.

The model should choose from compact IDs and labels. It should not author the
full nested payload that the reducer expects.

## Proposed Agent Contract

Prefer a small read-only tool that returns structured candidates:

```json
{
  "selectionId": "brush",
  "candidates": [
    {
      "candidateId": "beta-values/beta",
      "viewSelector": {
        "scope": ["beta-values"],
        "view": "beta-values"
      },
      "viewTitle": "Beta values",
      "field": "beta",
      "dataType": "quantitative",
      "supportedAggregations": ["count", "min", "max", "weightedMean", "variance"],
      "defaultName": "max(beta)"
    }
  ]
}
```

The agent can then choose a candidate and an aggregation op. App code should
materialize the final attribute identifier and any derived metadata action.

The second tool should be a resolver, not a parallel workflow engine. Its job is
to map one selected candidate + aggregation op into the canonical aggregated
`AttributeIdentifier` that the app already understands.

Suggested resolver shape:

```json
{
  "selectionId": "brush",
  "candidateId": "beta-values/beta",
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
attribute should come from app code, but the short natural-language preview can
be LLM-authored if that is easier and produces better wording. Downstream
consumers can then turn that descriptor into derived metadata, sort keys,
filters, or plotting encodings.

## Proposed App Helpers

Extract reusable helpers from the current UI code:

- `discoverIntervalAggregationCandidates(...)`
  - shared by the context menu and by the agent-facing tool
  - enumerates candidate view selectors, fields, and ops
  - should live in the non-agent sample-view codebase so the UI and agent both
    consume the same source of truth

- `buildAggregatedAttributeIdentifier(...)`
  - turns a chosen candidate into the canonical `AttributeIdentifier`
  - should be used by derived metadata, sort/filter/plot consumers, and any
    future agent workflow
  - should return the canonical `AttributeIdentifier` plus a compact preview
    title/description
  - should not mutate state
  - may accept or surface an LLM-generated description as an optional preview
    string, but should not depend on the wording for correctness

- `resolveSelectionAggregationWorkflow(...)`
  - lives in the agent folder
  - converts a compact request plus current agent context into a resolved
    selection aggregation workflow
  - should remain a thin wrapper around shared, deterministic helper logic

- `buildDerivedMetadataIntent(...)`
  - keeps building the actual provenance-backed mutation
  - should remain the single source of truth for the reducer payload

## Implementation Plan

1. Extract candidate discovery from the context menu code.
   - Move the menu eligibility logic into a pure helper.
   - Keep the context menu as a UI consumer of that helper.
   - Keep the agent-facing discovery tool as another consumer of the same
     helper.
   - Use selectors as the stable external identity for candidate views.
   - Land this as a separate `refactor(app)` commit so it can be cherry-picked
     to `master`.
   - Review the extracted code for code smells before continuing.

2. Extract canonical aggregated-attribute construction.
   - Build the `VALUE_AT_LOCUS` descriptor in one place.
   - Reuse the helper for derived metadata and any other consumer that needs the
     same attribute.
   - Keep this logic in the non-agent codebase.
   - Do not duplicate the construction in the agent layer.
   - Review the extracted code for code smells before continuing.

3. Replace the current resolver path with a thinner agent-facing shell.
   - Keep the prompt high-level.
   - Let the tool return compact candidates.
   - Let app code construct the final payload.
  - Keep the agent-side resolver thin and colocated with the agent code.
  - Remove the remaining `viewWorkflow*` references once their logic has
      moved into shared helpers.
   - Review the resulting agent-facing code for code smells before continuing.

4. Test the shared helpers directly.
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

- Should the agent-facing tool return candidate IDs only, or candidate IDs plus
  canonical attribute previews?
- Should the same helper also drive a sort/filter/plot suggestion tool?
- Which agent-context summaries still need to be surfaced for the planner and
  which can stay internal to the selection-aggregation resolver?
