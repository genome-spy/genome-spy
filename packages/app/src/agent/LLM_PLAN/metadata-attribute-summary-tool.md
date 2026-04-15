# Metadata Attribute Summary Draft

This document describes the agent-facing plan for exposing compact, current
metadata attribute summaries through an on-demand tool call.

The goal is to give the agent factual grounding about metadata values that are
currently present in the sample view without expanding the always-on context,
duplicating sample-view logic, or baking unstable visualization state into the
prompt snapshot.

## Code References

- Agent tool contracts: [`agentToolInputs.d.ts`](../agentToolInputs.d.ts)
- Agent tool execution entry points: [`agentTools.js`](../agentTools.js)
- Existing bounded read-only tool pattern: [`searchViewDatumsTool.js`](../searchViewDatumsTool.js)
- Tool catalog and generated provider-facing schemas: [`toolCatalog.js`](../toolCatalog.js)
- Agent context assembly: [`contextBuilder.js`](../contextBuilder.js)
- Attribute identifier and attribute info contract: [`types.d.ts`](../../sampleView/types.d.ts)
- Shared attribute info registry: [`compositeAttributeInfoSource.js`](../../sampleView/compositeAttributeInfoSource.js)
- Metadata attribute resolution: [`metadataView.js`](../../sampleView/metadata/metadataView.js)
- Metadata type inference: [`metadataUtils.js`](../../sampleView/metadata/metadataUtils.js)
- Sample-view state definitions: [`sampleState.d.ts`](../../sampleView/state/sampleState.d.ts)

## Status

- Planned:
  - Add one new read-only tool, `getMetadataAttributeSummary(attribute)`.
  - Keep v0 limited to one metadata attribute at a time.
  - Reuse existing `AttributeIdentifier` resolution and current sample-view
    metadata state.

- Explicitly deferred:
  - synonym generation such as `"male"` -> `"M"`
  - semantic normalization of category labels
  - cross-attribute comparisons
  - grouped summaries by current hierarchy level
  - selection-aware or provenance-aware summary modes
  - automatic inclusion of value summaries in the base agent context

## Why this exists

- The current agent context already exposes metadata attributes with stable
  identifiers, names, titles, descriptions, and data types.
- That is enough to reference an attribute, but not enough to reason from its
  actual values.
- This causes predictable failures when the user speaks in natural-language
  labels that do not literally appear in the metadata values.
  - Example: the user asks about males and females.
  - The metadata values are actually `"M"` and `"F"`.
  - The agent sees the attribute name and type, but not the present category
    values.
- The summary must be a tool call rather than static context because the
  relevant values can change with current visualization state, imported
  metadata, or future state-dependent visibility rules.
- The app already has the core primitives needed for a minimal solution:
  - stable `AttributeIdentifier` objects
  - shared attribute info lookup
  - current sample metadata entities in sample-view state
  - generated read-only tool plumbing

The first implementation should stay factual and bounded. It should expose what
values are currently present and what their basic shape is, but it should not
try to interpret those values for the model.

## User-Facing Intent

The system prompt should teach the agent to recognize prompts like:

- "Compute this separately for males and females."
- "Group samples by this metadata attribute."
- "What values does this metadata column contain?"
- "Is this attribute quantitative or categorical?"
- "What range does this metadata attribute have?"

From the agent's point of view, these requests mean:

1. Identify the referenced metadata attribute from the current context.
2. Use the attribute identifier already present in the context.
3. Call a read-only summary tool for that attribute.
4. Read the returned type and current value summary.
5. Use those facts when choosing filters, grouping actions, or wording the
   reply.

The agent should not guess the category values from the user prompt when the
visualization can provide exact current values.

### Current Agent Surface

What is available today:

- The agent context already exposes metadata attributes through
  [`contextBuilder.js`](../contextBuilder.js).
  - Each attribute already has a stable `id` that is an
    `AttributeIdentifier`.
  - Each attribute already exposes `name`, `title`, `description`, and
    `dataType`.
- Metadata attributes already resolve through the shared attribute info
  pipeline.
  - `SAMPLE_ATTRIBUTE` is already a first-class attribute kind.
  - `compositeAttributeInfoSource.getAttributeInfo(attribute)` already
    dispatches to the metadata-side implementation.
- Metadata attribute types are already resolved in sample-view logic.
  - Explicit type definitions can come from metadata definitions.
  - Missing types are inferred in `computeAttributeDefs(...)`.
- There is no dedicated agent tool yet for inspecting the current values of one
  metadata attribute.
- The current agent context should remain compact.
  - It should not embed category lists or numeric ranges for every attribute by
    default.

## Revision During Implementation

This is a living draft, not a fixed contract.

- Revise the summary shape if the real runtime state suggests a cleaner
  boundary than this draft assumes.
- Prefer a narrower output over a more configurable tool when the two are in
  tension.
- Keep v0 aligned with the current sample-view state model rather than
  designing for speculative future sources.
- Update this document during implementation if the real helper extraction
  points become clearer.

## What the agent should understand

- `getMetadataAttributeSummary(attribute)` is a factual grounding tool, not an
  analysis engine.
- The tool summarizes one metadata attribute at a time.
- The tool uses the current sample-view metadata state at call time.
- The tool returns compact value summaries, not semantic interpretations.
- The tool should be preferred over guessing category labels from prompt text.

The agent should not assume:

- that the tool returns inferred human-friendly aliases
- that the tool summarizes only the current selection
- that the tool explains why categories mean what they mean
- that the tool covers view-backed attributes such as `VALUE_AT_LOCUS` in v0

## Source of Truth

The source of truth for attribute identity should remain the existing
`AttributeIdentifier` shape in [`types.d.ts`](../../sampleView/types.d.ts).

The source of truth for metadata attribute resolution should remain the shared
attribute info pipeline in [`compositeAttributeInfoSource.js`](../../sampleView/compositeAttributeInfoSource.js)
and [`metadataView.js`](../../sampleView/metadata/metadataView.js).

The source of truth for current values should be the live sample metadata in
sample-view state, not the static view spec and not the existing context
snapshot.

The tool result should stay on-demand. It should not become part of the
always-on context snapshot unless later evaluation proves that the extra token
cost is justified.

## Proposed Shape

The tool result should be compact and explicit. A v0 nominal result should look
roughly like this:

```json
{
  "kind": "metadata_attribute_summary",
  "attribute": {
    "type": "SAMPLE_ATTRIBUTE",
    "specifier": "sex"
  },
  "title": "sex",
  "dataType": "nominal",
  "scope": "all_samples",
  "sampleCount": 412,
  "nonMissingCount": 412,
  "missingCount": 0,
  "distinctCount": 2,
  "categories": [
    { "value": "F", "count": 216 },
    { "value": "M", "count": 196 }
  ],
  "truncated": false
}
```

A v0 quantitative result should look roughly like this:

```json
{
  "kind": "metadata_attribute_summary",
  "attribute": {
    "type": "SAMPLE_ATTRIBUTE",
    "specifier": "age"
  },
  "title": "age",
  "dataType": "quantitative",
  "scope": "all_samples",
  "sampleCount": 412,
  "nonMissingCount": 401,
  "missingCount": 11,
  "min": 32,
  "max": 81,
  "mean": 57.3
}
```

The text returned alongside the structured content should stay brief, for
example:

- `Summarized metadata attribute sex with 2 observed categories.`
- `Summarized metadata attribute age across 401 non-missing samples.`

## Proposed Agent Contract

The minimal public contract should be:

- `getMetadataAttributeSummary(attribute)`

Input:

- `attribute: AttributeIdentifier`

The behavioral constraints for v0 should be:

- require `attribute.type === "SAMPLE_ATTRIBUTE"`
- summarize only one attribute per call
- compute the summary from current sample-view metadata state
- return compact first-order facts only

Possible later extensions should be additive and explicit rather than implied:

- `scope?: "all_samples" | "visible_samples"`
- `includeAllCategories?: boolean`
- `maxCategories?: number`

The important critique of the earlier plan is that it was too loose in three
places:

- It treated the problem as a metadata-heatmap concern rather than a metadata
  attribute concern.
  - The better abstraction is the attribute itself.
- It did not define whether the summary covers all samples or only visible
  samples.
  - v0 should choose one explicit scope and return it in the result.
- It risked drifting toward semantic normalization.
  - The app should expose exact present values, not invent aliases or map user
    language to categories.

## Proposed App Helpers

The implementation should reuse existing helpers and patterns as much as
possible.

Expected reuse path:

- validate that the input is a `SAMPLE_ATTRIBUTE`
- resolve attribute info through
  `sampleView.compositeAttributeInfoSource.getAttributeInfo(attribute)`
- read values from `sampleView.sampleHierarchy.sampleMetadata.entities`
- follow the error-handling and result-shaping pattern used by
  [`searchViewDatumsTool.js`](../searchViewDatumsTool.js)

If one small helper is needed, it should likely be a dedicated module such as:

- `metadataAttributeSummaryTool.js`

That helper should remain narrow:

- validate one attribute input
- resolve one metadata attribute
- collect current values from live sample metadata
- compute small reducers for quantitative and categorical summaries

## Implementation Steps

1. Define the tool contract in [`agentToolInputs.d.ts`](../agentToolInputs.d.ts).
   - Add `GetMetadataAttributeSummaryToolInput`.
   - Document that v0 accepts only `SAMPLE_ATTRIBUTE`.

2. Add runtime tool behavior.
   - Implement `getMetadataAttributeSummaryTool(runtime, input)`.
   - Register it in [`agentTools.js`](../agentTools.js).

3. Extend the tool runtime contract if needed.
   - Ensure the runtime can reach the current sample view.
   - Keep the tool logic dependent on app state, not on precomputed context.

4. Resolve and validate the target attribute.
   - Reject clearly if the identifier is not a metadata attribute.
   - Reject clearly if the attribute does not exist in current sample metadata.

5. Define the v0 scope explicitly.
   - Default to `all_samples`.
   - Return the scope in the result so the model does not need to infer it.

6. Implement bounded reducers.
   - For quantitative fields:
     - `sampleCount`
     - `nonMissingCount`
     - `missingCount`
     - `min`
     - `max`
     - `mean`
   - For nominal or ordinal fields:
     - `sampleCount`
     - `nonMissingCount`
     - `missingCount`
     - `distinctCount`
     - capped `categories`
     - `truncated`

7. Keep ordinal handling factual.
   - If stable ordering is cheaply available from an explicit scale domain,
     preserve it.
   - Otherwise report observed values without inventing an order.

8. Regenerate tool artifacts as required by the repo workflow.

9. Add focused tests.
   - valid nominal metadata summary such as `F` and `M`
   - valid quantitative metadata summary
   - missing values
   - unknown attribute
   - wrong attribute type
   - category truncation behavior
