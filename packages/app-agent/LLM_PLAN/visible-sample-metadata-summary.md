# Visible Sample Metadata Summary

Current-state note and follow-up plan for agent-facing metadata summaries after
the visible-sample scope work landed.

## Current State

The visible-sample scope correction is implemented.

- `getMetadataAttributeSummary(attribute, scope)` is the shipped metadata
  summary tool.
- `scope: "visible_samples"` summarizes the current analysis-visible sample
  population from the active hierarchy.
- `scope: "visible_groups"` summarizes within the current visible leaf groups.
- The active analysis scope comes from `rootGroup`, not from the full loaded
  `sampleData.ids` universe.

This fixed the original bug where pooled summaries were computed from all known
samples instead of the samples currently represented in the analysis.

## Code References

- Tool contract: [`agentToolInputs.d.ts`](../src/agent/agentToolInputs.d.ts)
- Runtime summary sources: [`agentAdapter.js`](../src/agent/agentAdapter.js)
- Tool behavior: [`metadataAttributeSummaryTool.js`](../src/agent/metadataAttributeSummaryTool.js)
- Shared scope helpers: [`sampleHierarchyScope.js`](../src/agent/sampleHierarchyScope.js)
- Shared reducers: [`metadataSummaryReducers.js`](../src/agent/metadataSummaryReducers.js)
- Existing quantitative stats helper: [`boxplot.js`](../../app/src/utils/statistics/boxplot.js)
- Adapter tests: [`agentAdapter.test.js`](../src/agent/agentAdapter.test.js)
- Tool tests: [`agentTools.test.js`](../src/agent/agentTools.test.js)

## Shipped Contract

- `getMetadataAttributeSummary(attribute, scope: "visible_samples")`
  - pooled summary across the current visible samples
- `getMetadataAttributeSummary(attribute, scope: "visible_groups")`
  - per-group summary across the current visible leaf groups

The grouped path intentionally shipped as an explicit `scope` value rather than
as a separate tool.

## Source of Truth

The relevant `SampleHierarchy` boundaries are:

- `sampleData.ids`
  - full known sample universe
- `sampleMetadata.entities`
  - full backing metadata store
- `rootGroup`
  - current analysis-visible population after filtering and grouping
- `groupMetadata`
  - current active grouping levels

For agent-facing summaries that answer "what is true now", `rootGroup` is the
source of truth.

## Critique Of The Previous Plan

The earlier version of this note had three problems.

1. It mixed shipped scope correction with future summary-design work.
   The visible-sample bug is already solved, but the document still read partly
   like that work was in flight.

2. It overlapped too much with
   [`explanatory-affordance-context.md`](./explanatory-affordance-context.md).
   This note should stay focused on factual metadata summaries and their scope.
   Affordance-heavy explanation work belongs in the explanatory-context plan.

3. It listed many good prompt scenarios, but it did not turn them into a
   prioritized implementation slice.
   The missing piece is a concrete proposal for what additional statistics to
   compute by data type and what should remain out of scope for now.

## Scope Of This Plan

This note should cover:

- factual metadata summaries grounded in the visible hierarchy
- pooled versus grouped summary behavior
- additional summary statistics by attribute type
- prompt scenarios that justify those statistics

This note should not become the main plan for:

- always-on explanatory context
- prompt narration strategy
- broad affordance heuristics beyond what factual summaries need directly

Those belong in
[`explanatory-affordance-context.md`](./explanatory-affordance-context.md).

## Next Design Step

The next step is not another scope change. The next step is to enrich the
factual summary outputs so they support a wider range of agent questions while
remaining compact and deterministic.

The guiding rule should be:

- use type-driven factual summaries first
- prefer existing D3-based or app-level statistical helpers over new custom
  statistical implementations
- if D3 and existing app helpers are not enough, prefer a focused library over
  bespoke math code
- derive affordances later on top of those facts

That keeps the base summary layer stable and easier to test.

## Recommended Summary Model

Use a small set of type-driven summary shapes:

- binary / boolean
- categorical
- quantitative

If ordinal metadata is available distinctly, treat it as categorical in the
base summary layer unless an order-aware use case clearly requires more.

### Binary / boolean attributes

Recommended factual fields:

- `sampleCount`
- `nonMissingCount`
- `missingCount`
- `distinctCount`
- category rows with:
  - `value`
  - `count`
  - `share`
- optional compact convenience fields:
  - `positiveValue`
  - `positiveCount`
  - `positiveShare`

Why:

- binary attributes are common in cohort metadata
- they support very compact balance and filtering decisions
- they are more useful to the agent when kept simpler than generic
  high-cardinality categoricals

### Categorical attributes

Recommended factual fields:

- `sampleCount`
- `nonMissingCount`
- `missingCount`
- `distinctCount`
- top categories with:
  - `value`
  - `count`
  - `share`
- `truncated`
- optional:
  - `otherCount`
  - `otherShare`
  - `topCategoryShare`

Why:

- these support composition, dominance, sparsity, and grouping questions
- shares matter as much as counts for interpretation-heavy prompts
- truncation should stay explicit so the agent does not overread capped output

### Quantitative attributes

Recommended factual fields:

- `sampleCount`
- `nonMissingCount`
- `missingCount`
- `min`
- `max`
- `mean`
- `median`
- `q1`
- `q3`
- `iqr`
- optional later additions:
  - `p05`
  - `p95`

Why:

- quartiles and IQR are more robust than relying on mean alone
- these support thresholding, spread, skew, and outlier-adjacent reasoning
- this stays compact enough for prompt use without turning into a histogram API
- existing utilities already point toward this shape, for example
  [`boxplot.js`](../../app/src/utils/statistics/boxplot.js), which uses
  `d3-array` quantiles and Tukey-style boxplot statistics instead of bespoke
  hand-rolled percentile code

Implementation preference:

- reuse `d3-array` functions where they already fit the needed summary shape
- prefer adapting or reusing `boxplot.js`-style logic for quartiles, IQR,
  whiskers, and outlier-adjacent stats
- if D3 is not sufficient for a needed statistic, prefer evaluating a small
  existing stats library such as `simple-statistics` or `stdlib` before adding
  custom statistical code
- avoid writing new percentile or boxplot calculations from scratch in the
  agent layer unless there is a clear mismatch with existing utilities

Library preference order:

1. existing shared app utilities
2. `d3-array` and related D3 primitives already used in the repo
3. a focused external statistics library if a concrete missing function justifies it
4. custom implementation only as a last resort

## What Not To Add Yet

Do not add these in the first follow-up slice unless a concrete prompt need
forces them:

- full histograms
- arbitrary bucketized distributions
- many redundant spread metrics
- per-group cross-comparison prose
- free-form natural-language summaries inside the tool result

Those would add prompt weight faster than they add decision value.

## Prompt Scenarios That Justify The Next Slice

These scenarios are useful because they require more than simple "top category"
facts, but they still fit within bounded factual summaries.

### Cohort composition and filtering

- "What does the currently visible cohort look like in terms of diagnosis,
  sex, and tissue?"
- "After the age filter, what metadata values are still represented?"
- "Which diagnosis categories disappeared after the current filtering steps?"
- "How many samples are missing purity or age in the visible cohort?"
- "Is the current cohort dominated by one cancer type or still fairly mixed?"

Needed support:

- pooled summaries over the visible sample population
- missingness-aware summaries
- counts plus shares for categorical values

### Group comparison

- "After grouping by diagnosis, which groups are mostly blood versus bone
  marrow?"
- "Which diagnosis group has the oldest patients on average?"
- "Do the visible groups differ strongly in sample sex balance?"
- "Which groups have the widest age range?"
- "Are there groups where one tissue category clearly dominates?"

Needed support:

- grouped summaries over visible leaf groups
- per-group categorical counts and shares
- per-group quantitative summaries with quartiles or IQR

### Distribution and threshold planning

- "Would age be a sensible attribute for thresholding this cohort?"
- "Does purity have a narrow or wide visible range right now?"
- "What cutoff would roughly split the visible cohort into low and high
  mutation burden?"
- "Is there a long right tail in the current copy-number burden values?"
- "Are there obvious outliers in tumor purity among the visible samples?"

Needed support:

- quantitative summaries richer than min/max/mean
- quartiles and IQR
- stable missingness reporting

### Metadata quality and sparsity

- "Which clinically relevant metadata fields are mostly missing in the current
  cohort?"
- "Is smoking status populated enough to be useful for grouping?"
- "Does treatment response have too many rare categories to be a good split?"
- "Which visible groups have the most missing values for stage?"
- "Is this attribute too sparse to use confidently?"

Needed support:

- missingness rates
- distinct counts
- top-category concentration
- grouped missingness summaries

### Gene- and locus-adjacent cohort questions

- "Among the samples currently carrying this fusion, what diagnoses are most
  common?"
- "For samples with an ERG fusion in view, what tissues and age ranges do we
  see?"
- "After filtering to TP53-mutant samples, which clinical groups remain?"
- "Among samples with high EGFR expression, what diagnosis categories are most
  represented?"
- "For the visible CNV-amplified samples, is sex balance still roughly even?"

Needed support:

- the same visible-scope summary logic after genomic filters have already
  changed the hierarchy
- both categorical and quantitative summaries staying grounded in the active
  analysis state

### Regulatory / ENCODE-style prompts

- "For the visible experiments, which biosample types are most common?"
- "After filtering to this transcription factor, which cell lines are still in
  the dataset?"
- "Among the visible assays, is one lab or project dominating the current
  selection?"
- "When grouped by biosample type, which groups have the largest replicate
  counts?"
- "Are the currently visible experiments concentrated in a few tissues or
  spread broadly across biosamples?"

Needed support:

- categorical dominance and sparsity summaries
- grouped summaries that work for non-cancer metadata just as well

## Recommended Implementation Slice

The next practical slice should be:

1. Extend categorical summaries with shares and explicit truncation accounting.
2. Extend quantitative summaries with `median`, `q1`, `q3`, and `iqr`.
   - Prefer `d3-array` and existing app statistics helpers over bespoke
     implementations.
   - Check whether [`boxplot.js`](../../app/src/utils/statistics/boxplot.js)
     can be reused directly or factored into a shared utility boundary.
   - If a required statistic is awkward to express with current helpers, assess
     whether `simple-statistics` or `stdlib` gives a cleaner result than adding
     more hand-written statistical code.
3. Keep pooled and grouped output shapes parallel where possible.
4. Add focused tests for missingness, truncation, quartiles, and grouped
   summaries.
5. Let the explanatory-affordance plan consume these richer facts later.

This keeps the work incremental and lets the factual layer stabilize before
adding broader interpretation logic.

## Testing Priorities

Add or strengthen tests for:

- categorical shares in pooled summaries
- truncation with `otherCount` or equivalent accounting
- all-missing quantitative values
- quartile and IQR computation
- grouped quantitative summaries
- grouped missingness and grouped categorical dominance

## Follow-Up

After this slice lands, the next layer should be handled in
[`explanatory-affordance-context.md`](./explanatory-affordance-context.md):

- derived affordance hints
- always-on explanatory context
- prompt guidance for approximate versus exact claims
