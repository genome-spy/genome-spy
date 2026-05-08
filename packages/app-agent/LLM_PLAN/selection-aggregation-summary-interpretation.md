# Selection Aggregation Summary Interpretation

Plan for making `getAttributeSummary` harder to misinterpret when the input is a
`SELECTION_AGGREGATION` candidate.

## Problem

`getAttributeSummary` currently returns ordinary quantitative summary fields for
selection-derived attributes:

```json
{
  "min": 0,
  "max": 8,
  "mean": 0.206,
  "median": 0
}
```

For `aggregation: "count"`, these values summarize the per-sample counts
computed over the selected interval. The agent may incorrectly treat:

- `max: 8` as "8 samples"
- `mean * sampleCount` as "samples with at least one event"
- `mean` as a cohort fraction instead of the mean per-sample selected-item
  count

The missing affordance is the two-level nature of the result:

1. First, one value is computed per sample from the selected interval.
2. Then `getAttributeSummary` summarizes those per-sample values across visible
   samples or groups.

## Goals

- Make the two-level aggregation explicit in the response payload.
- Add direct fields for common count-style interpretations such as
  "how many samples have at least one selected item."
- Add a compact value distribution that prefers exact counts and falls back to
  bounded histograms when exact counts would be too long.
- Keep generated prose short and template-based.
- Avoid hard-to-generate data-specific descriptions.
- Preserve current summary fields for compatibility.

## Non-Goals

- Do not expose raw per-sample values.
- Do not make `getAttributeSummary` perform complex downstream analyses.
- Do not infer biology-specific concepts from generic selected-item counts.
- Do not replace grouping workflows; instead, point to them as the next step
  for deeper comparisons.
- Do not add app-specific agent affordances to `packages/app`; keep them in
  `packages/app-agent`.

## Proposed Payload Additions

For all quantitative summaries, add generic sign/count helpers:

```json
{
  "negativeCount": 0,
  "zeroCount": 980,
  "positiveCount": 213,
  "nonZeroCount": 213,
  "negativeShare": 0,
  "zeroShare": 0.8215,
  "positiveShare": 0.1785,
  "nonZeroShare": 0.1785
}
```

For count-like selection aggregation, `positiveCount` and `nonZeroCount` give
the number of samples with at least one selected item.

For `SELECTION_AGGREGATION` summaries, add a structured interpretation block:

```json
{
  "selectionAggregation": {
    "op": "count",
    "valueLevel": "sample",
    "summaryLevel": "visible_samples",
    "interpretation": "Each value was first aggregated over the selected interval for one sample; these summary statistics describe the distribution of those per-sample values across visible samples.",
    "nextStepHint": "For deeper comparison, first group samples with an intent action, then call getAttributeSummary again with scope: \"visible_groups\"."
  }
}
```

The prose fields should be static templates:

- `interpretation` explains the aggregate-of-aggregates semantics.
- `nextStepHint` points to grouping for deeper analysis.

For `scope: "visible_groups"`, use a grouped variant:

```json
{
  "selectionAggregation": {
    "op": "count",
    "valueLevel": "sample",
    "summaryLevel": "visible_groups",
    "interpretation": "Each value was first aggregated over the selected interval for one sample; each group summary describes the distribution of those per-sample values within that visible group.",
    "nextStepHint": "Compare group-level distributions; do not interpret a pooled mean as a sample count."
  }
}
```

## Value Distribution

Add a compact distribution for quantitative summaries when the app-agent has
the per-sample values available. This is an agent-facing helper built in
`packages/app-agent`, not in `packages/app`.

Prefer exact value counts whenever the distinct finite value count is small
enough:

```json
{
  "valueDistribution": {
    "kind": "value_counts",
    "distinctCount": 5,
    "counts": [
      { "value": 0, "count": 980, "share": 0.8215 },
      { "value": 1, "count": 180, "share": 0.1509 },
      { "value": 2, "count": 24, "share": 0.0201 }
    ]
  }
}
```

This is especially useful for `aggregation: "count"`, but the rule should stay
generic: if a continuous aggregation produces a compact set of repeated values,
exact counts are still better than bins.

When exact counts would be too long, return a bounded histogram:

```json
{
  "valueDistribution": {
    "kind": "histogram",
    "distinctCount": 841,
    "binning": {
      "start": -1,
      "stop": 1,
      "step": 0.1
    },
    "bins": [
      { "bin": [-1, -0.9], "count": 4, "share": 0.0034 },
      { "bin": [-0.9, -0.8], "count": 9, "share": 0.0075 }
    ]
  }
}
```

Bins should be half-open intervals `[start, end)`, except the final bin, which
includes its upper bound. Use a bounded bin count so histogram payloads are not
truncated.

Implementation options:

- Use exact counts when `distinctCount <= 20`.
- Use `vega-statistics` for nice numeric bins when exact counts exceed the cap.
  It is tree-shakeable and can be added as an app-agent dependency.
- Keep `d3-array` as a fallback only if adding `vega-statistics` is not worth
  the dependency.

## Implementation Steps

Before and after each step, record focused line counts and payload/schema sizes:

- `wc -l packages/app-agent/src/agent/attributeSummaryTool.js`
- `wc -l packages/app-agent/src/agent/attributeSummaryTool.test.js`
- `wc -l packages/app-agent/server/app/prompts/genomespy_system_prompt.md`
- `wc -c packages/app-agent/src/agent/generated/generatedToolSchema.json`

1. Add quantitative sign/count helpers.
   - Extend `buildQuantitativeSummary(...)` with zero/nonzero/positive/negative
     counts and shares.
   - Consider whether grouped quantitative summaries should receive the same
     helpers.
   - Measure success:
     - Tests show `nonZeroCount` and `positiveCount` are present for sparse
       count vectors.
     - Existing quantitative summary fields are unchanged.

2. Add selection-aggregation interpretation metadata.
   - Detect selection aggregation summaries from the resolved attribute:
     `attribute.type === "VALUE_AT_LOCUS"` and
     `attribute.specifier.aggregation.op` exists.
   - Build the agent-specific `selectionAggregation` block in
     `packages/app-agent`, close to the `getAttributeSummary` response shaping.
   - Add `selectionAggregation` with `op`, `valueLevel`, `summaryLevel`,
     `interpretation`, and `nextStepHint`.
   - Measure success:
     - Tests show pooled summaries mention `visible_samples`.
     - Tests show grouped summaries mention `visible_groups`.

3. Add generic value distribution.
   - Reuse the per-sample values already available in app-agent summary sources.
   - Return `valueDistribution.kind: "value_counts"` when the distinct finite
     value count is below the cap.
   - Return `valueDistribution.kind: "histogram"` with `{ "bin": [start, end],
     "count": n, "share": p }` entries when exact counts exceed the cap.
   - Prefer exact counts over histograms for every aggregation type, including
     continuous aggregations, whenever exact counts fit under the cap.
   - Measure success:
     - Sparse count summaries return exact zero/one/two frequencies.
     - Continuous summaries with many distinct values return bounded histogram
       bins.
     - Payload size remains bounded for high-cardinality values.

4. Update prompt/tool docs.
   - Tell the agent that `mean`, `max`, percentiles, and quartiles are summary
     statistics over per-sample interval-aggregated values.
   - Tell the agent to use `nonZeroCount` or `positiveCount` for "samples with
     at least one selected item" when the selection aggregation is `count`.
   - Tell the agent to prefer `valueDistribution` for exact or binned value
     frequencies.
   - Tell the agent to group first and then call `getAttributeSummary` with
     `scope: "visible_groups"` for deeper comparisons.

## Tests

- `getAttributeSummary` with a sparse count vector returns:
  - `zeroCount`
  - `nonZeroCount`
  - `positiveCount`
  - corresponding shares
- `getAttributeSummary` for `SELECTION_AGGREGATION` count includes
  `selectionAggregation.op: "count"` and the static interpretation text.
- Grouped selection aggregation summaries include the grouped interpretation
  block.
- Low-cardinality numeric summaries return `valueDistribution.kind:
  "value_counts"` with exact counts and shares.
- High-cardinality numeric summaries return `valueDistribution.kind:
  "histogram"` with bounded `{ "bin": [start, end], "count": n, "share": p }`
  bins.
- Existing categorical summaries are unchanged.

## Risks

- Extra fields may increase payload size. Mitigate by keeping prose short and
  using compact structured fields.
- Generic `nonZeroCount` may be misused for non-count continuous attributes.
  Mitigate through docs: for event presence, prefer it when the selection
  aggregation op is `count`.
- Exact value counts can grow large if not capped. Use histogram fallback when
  distinct finite values exceed the cap.
- Histograms can be over-interpreted as exact values. Mitigate with
  `kind: "histogram"`, `distinctCount`, and explicit bin intervals.
- Adding `vega-statistics` increases dependency surface. Mitigate by importing
  only the binning utility and measuring bundle/schema impact.

## Success Criteria

- The agent no longer interprets `mean * sampleCount` as affected sample count.
- The agent uses `nonZeroCount` or `positiveCount` to answer "how many samples
  have at least one selected item."
- The agent uses exact `valueDistribution` counts when available and treats
  histogram bins as approximate ranges.
- The response payload explicitly states that selection aggregation summaries
  are summaries of per-sample interval-aggregated values.
- The agent suggests grouping plus `scope: "visible_groups"` for deeper
  comparisons.
