# View Data Summary Tool (Draft)

This document describes the minimal zeroth-version plan for exposing compact
view-backed data summaries to the GenomeSpy agent.

The goal is to give the agent factual grounding about one visible view's data
without creating a broad analytics subsystem, expanding the always-on context,
or duplicating logic that already exists in the view and collector pipeline.

## Code References

- Agent tool contracts: [`agentToolInputs.d.ts`](../agentToolInputs.d.ts)
- Agent tool execution entry points: [`agentTools.js`](../agentTools.js)
- Existing bounded data-read tool: [`searchViewDatumsTool.js`](../searchViewDatumsTool.js)
- Tool catalog and generated provider-facing schemas: [`toolCatalog.js`](../toolCatalog.js)
- Agent context assembly: [`contextBuilder.js`](../contextBuilder.js)
- Agent adapter runtime bridge: [`agentAdapter.js`](../agentAdapter.js)
- View selector creation and resolution: [`viewSelectors.js`](../../core/src/view/viewSelectors.js)
- Collector wiring in the view pipeline: [`flowBuilder.js`](../../core/src/view/flowBuilder.js)
- Collector implementation: [`collector.js`](../../core/src/data/collector.js)

## Status

- Planned:
  - Add one new read-only tool, `summarizeViewData(selector)`.
  - Keep v0 limited to one resolved view and compact first-order statistics.
  - Reuse existing selector resolution, collector access, and generated tool plumbing.

- Explicitly deferred:
  - grouped summaries
  - between-group comparisons
  - selection-aware summaries
  - histograms and richer distribution descriptors
  - tool-side interpretation of patterns

## Why this exists

- The current agent sees the visualization structure, scales, and available
  actions, but it has very little factual grounding about the data values that back a given view.
- That makes the agent reasonably good at navigation and manipulation, but
  weak at interpretation.
- The app already has the core primitives needed for a minimal solution:
  - resolve a view from a selector
  - access collector-backed data for the resolved view
  - expose bounded read-only tools through the current agent tool system
- The first implementation should be small and factual rather than ambitious.
  The model can interpret compact statistics, but the app should not try to
  build a second analytics layer inside the tool.

## User-Facing Intent

The system prompt should teach the agent to recognize prompts like:

- "What kind of values are in this track?"
- "How many rows back this view?"
- "What categories are present here?"
- "Is this variable tightly ranged or spread out?"

From the agent's point of view, these requests mean:

1. Identify the relevant view.
2. Use a read-only summary tool on that view.
3. Read compact factual statistics from the tool result.
4. Use those facts to answer in plain language.

The agent should not need to inspect raw collector rows unless a different tool
is explicitly designed for that purpose.

### Current Agent Surface

What is available today:

- The agent already has a generated tool surface through
  [`agentToolInputs.d.ts`](../agentToolInputs.d.ts) and
  [`toolCatalog.js`](../toolCatalog.js).
- Read-only view data access already exists in a narrow form through
  [`searchViewDatumsTool.js`](../searchViewDatumsTool.js).
  - It resolves a view selector.
  - It accesses collector-backed data from that view.
  - It returns bounded structured output.
- The current agent context already exposes searchable views through
  [`contextBuilder.js`](../contextBuilder.js), but it does not provide compact
  descriptive summaries of view-backed data.
- There is no dedicated summary tool for one resolved view yet.

## Revision During Implementation

This is a living draft, not a fixed contract.

- Revise field-selection details if the real encoding metadata suggests a
  cleaner minimal boundary than the draft assumes.
- Prefer narrow output over flexible output when the two are in tension.
- Keep v0 intentionally small even if the implementation reveals obvious next
  extensions.
- Update this document during implementation if the real reuse boundaries or
  helper extraction points become clearer.

## What the agent should understand

The agent should understand the following:

- `summarizeViewData(selector)` is a factual grounding tool, not an analysis
  engine.
- The tool summarizes one resolved view at a time.
- The tool uses the current collector-backed data for that view.
- The tool returns compact statistics, not prose interpretation.
- The tool should be preferred over guessing from scales alone when the user
  asks about data values or distributions in a visible view.

The agent should not assume:

- that the tool compares groups
- that the tool summarizes only the active selection
- that the tool explains causality or significance
- that every datum key in the collector will be returned

## Source of Truth

The source of truth for the tool contract should be:

- [`agentToolInputs.d.ts`](../agentToolInputs.d.ts) for the public input shape
- generated tool catalog/schema artifacts for validation and provider exposure
- the resolved view plus its collector-backed data as the runtime data source

The summary should not become part of the always-on context snapshot. It should
remain a read-only on-demand tool result.

## Proposed Shape

The tool result should be compact and explicit. A v0 result should look roughly
like this:

```json
{
  "kind": "view_data_summary",
  "selector": {
    "scope": [],
    "view": "methylation-track"
  },
  "rowCount": 18234,
  "fields": [
    {
      "field": "beta",
      "type": "quantitative",
      "validCount": 18234,
      "missingCount": 0,
      "min": 0.02,
      "max": 0.94,
      "mean": 0.47
    },
    {
      "field": "sampleGroup",
      "type": "nominal",
      "distinctCount": 3,
      "missingCount": 0,
      "topCategories": [
        { "value": "A", "count": 120 },
        { "value": "B", "count": 98 },
        { "value": "C", "count": 76 }
      ]
    }
  ]
}
```

The text returned alongside the structured content should stay brief, for
example:

- `Summarized 2 fields from 18,234 rows in the requested view.`

## Proposed Agent Contract

The minimal public contract should be:

- `summarizeViewData(selector)`

Input:

- `selector: ViewSelector`

No optional parameters in v0.

Possible later extensions should be additive on the same tool rather than a
new parallel family of tools:

- `fields?: string[]`
- `selectionMode?: "all" | "selected"`
- `groupBy?: string`
- `includeDistribution?: boolean`

The critical behavioral rule for v0 is:

- summarize only one resolved view
- summarize only view-linked fields
- return compact first-order facts

## Proposed App Helpers

The implementation should reuse existing helpers and patterns as much as
possible.

Expected reuse path:

- resolve the view through `runtime.resolveViewSelector(selector)`
- access data through `view.getCollector()?.getData()`
- follow the error-handling and result-shaping pattern used by
  [`searchViewDatumsTool.js`](../searchViewDatumsTool.js)

If one small helper is needed, it should likely be a dedicated module such as:

- `summarizeViewDataTool.js`

That helper should remain narrow:

- resolve one view
- validate collector availability
- select a bounded set of view-linked fields
- compute tiny reducers for numeric and categorical summaries

## Implementation Steps

1. Define the tool contract in [`agentToolInputs.d.ts`](../agentToolInputs.d.ts).
   - Add `SummarizeViewDataToolInput`.
   - Add `summarizeViewData` to `AgentToolInputs`.

2. Add runtime tool behavior.
   - Implement `summarizeViewDataTool(runtime, input)`.
   - Register it in [`agentTools.js`](../agentTools.js).

3. Resolve the target view and validate access.
   - Reject clearly if the selector does not resolve.
   - Reject clearly if the resolved view does not expose collector-backed data.

4. Select the fields to summarize.
   - Use only fields already linked to the target view.
   - Do not summarize arbitrary datum keys by default.

5. Implement minimal reducers.
   - Quantitative fields:
     - `validCount`
     - `missingCount`
     - `min`
     - `max`
     - `mean`
   - Nominal or ordinal fields:
     - `distinctCount`
     - `missingCount`
     - capped `topCategories`

6. Return compact structured output plus one short text summary.

7. Regenerate tool artifacts as required by the repo workflow.

8. Add focused tests.
   - resolved view with collector data
   - unresolved selector
   - missing collector
   - quantitative summary
   - categorical summary
   - bounded category output

## Non-Goals

Do not include these in v0:

- grouped summaries
- between-group comparisons
- selected-region-only summaries
- histograms
- quartiles
- skewness or richer shape descriptors
- tool-side interpretation of the summary
- generic whole-dataset profiling

## Open Questions

- What is the smallest reliable definition of "view-linked fields" across the
  views we care about first?
- Should v0 summarize only explicit encoding fields, or also search fields when
  they are available and clearly tied to the same view?
- Is there already one helper in the codebase that cleanly exposes the view's
  relevant fields, or should the first version start from a narrower heuristic?
- For fuse-specific use cases, which one view should be the first target for
  validating that the minimal summary is genuinely useful?
