# Selection Aggregation

Short current-state note for interval-selection aggregation and derived
metadata.

## Current Shape

- Candidate discovery lives in sample-view code and is reused by the context
  menu and the agent-facing selection context.
- `selectionAggregationContext.js` exposes compact candidate rows in the
  volatile agent context.
- `buildSelectionAggregationAttribute(candidateId, aggregation)` resolves a
  chosen row into the canonical aggregated `AttributeIdentifier`.
- `buildDerivedMetadataIntent(...)` turns a resolved attribute into a
  provenance-backed metadata mutation.

## What The Agent Sees

- interval selection candidates
- stable candidate ids
- view selectors
- field names
- supported aggregations
- short preview names

The agent should choose a candidate and aggregation op. App code should build
the final attribute descriptor and any mutation action.

## Boundary Rule

The agent should not duplicate the selection-aggregation construction logic.
Use the sample-view helpers and the existing agent context snapshot instead.

## Relevant Files

- [`selectionAggregationContext.js`](../src/agent/selectionAggregationContext.js)
- [`selectionAggregationTool.js`](../src/agent/selectionAggregationTool.js)
- [`contextMenuBuilder.js`](../src/sampleView/contextMenuBuilder.js)
- [`selectionAggregationCandidates.js`](../src/sampleView/selectionAggregationCandidates.js)
- [`selectionAggregationAttributes.js`](../src/sampleView/selectionAggregationAttributes.js)
- [`deriveMetadataUtils.js`](../src/sampleView/metadata/deriveMetadataUtils.js)

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
