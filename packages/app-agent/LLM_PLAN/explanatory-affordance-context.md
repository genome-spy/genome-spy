# Explanatory Affordance Context

This document describes the next design step for agent-facing descriptive
context.

The goal is not to send more statistics to the model for their own sake. The
goal is to give the agent enough grounded context to explain, with reasonable
accuracy, what the human is currently looking at and what kinds of next actions
would make sense.

The important missing layer is affordances.

Instead of only knowing facts like:

- attribute `age` has mean `57.3`
- attribute `sex` has categories `F` and `M`

the agent should also know compact derived cues like:

- `age` is usable for thresholding and likely quantitative grouping
- `age` is skewed and has a wide visible range
- `sex` is low-cardinality and good for grouping
- the current visible cohort is dominated by category `F`
- the current display is grouped by `diagnosis`, so grouped summaries are more
  relevant than pooled summaries

Those cues are closer to how a human interprets a visualization and chooses the
next step.

## Code References

- Agent context assembly: [`contextBuilder.js`](../src/agent/contextBuilder.js)
- View normalization and semantic descriptions: [`viewTree.js`](../src/agent/viewTree.js)
- Metadata summary sources: [`agentAdapter.js`](../src/agent/agentAdapter.js)
- Shared scope helpers: [`sampleHierarchyScope.js`](../src/agent/sampleHierarchyScope.js)
- Metadata summary tool: [`metadataAttributeSummaryTool.js`](../src/agent/metadataAttributeSummaryTool.js)
- Shared metadata reducers: [`metadataSummaryReducers.js`](../src/agent/metadataSummaryReducers.js)
- Tool contracts: [`agentToolInputs.d.ts`](../src/agent/agentToolInputs.d.ts)
- Agent context and tool types: [`types.d.ts`](../src/agent/types.d.ts)
- Relay prompt assembly: [`../server/app/prompt_builder.py`](../server/app/prompt_builder.py)
- System prompt instructions: [`../server/app/prompts/genomespy_system_prompt.md`](../server/app/prompts/genomespy_system_prompt.md)

## Status

- Implemented:
  - The base agent context already includes:
    - view structure
    - metadata attribute registry
    - searchable views
    - sample counts
    - provenance
    - selection aggregation candidates
  - `getMetadataAttributeSummary(attribute, scope)` is the shipped factual
    metadata summary tool.
  - `scope: "visible_samples"` returns pooled summaries across the current
    analysis-visible population from `rootGroup`.
  - `scope: "visible_groups"` returns grouped summaries across the current
    visible leaf groups from the active hierarchy.
  - Shared helper traversal for visible samples and visible groups already
    exists in `sampleHierarchyScope.js`.

- Missing:
  - a compact always-on explanation layer that helps the model describe what is
    visually salient now
  - derived affordance cues that tell the model how an attribute is likely to
    be useful
  - prompt guidance that clearly separates approximate explanatory context from
    precise tool-backed facts

## Why this exists

The current design is factual but not yet explanatory enough.

The agent can already inspect:

- the current view hierarchy
- the current attribute list
- current visible sample counts
- current metadata summaries through tools

That is enough for exact tool-grounded workflows such as:

- "retain samples with age above 60"
- "group by diagnosis"
- "what values does sex contain?"

But it is still weak for explanation-heavy requests such as:

- "what am I looking at?"
- "why does this view look dominated by one category?"
- "what would be a meaningful grouping here?"
- "does this attribute look useful for splitting the cohort?"

Raw descriptive statistics do not solve that by themselves.

The missing step is to derive compact, grounded summaries that describe what an
attribute or view affords:

- whether it is good for grouping, filtering, labeling, or thresholding
- whether the visible distribution looks skewed, balanced, sparse, or dominated
- whether the current visualization is pooled or grouped
- which attributes are visually prominent in the current analysis state

## Design Goal

The agent should be able to do both of these well:

1. Explain the current visualization approximately the way a careful human would
   summarize it.
2. Decide when to ask for more precise tool-backed facts before taking action.

This means the system needs two layers:

- a compact always-on explanatory layer
- an on-demand precise statistics layer

## Design Principles

- Prefer compact explanatory summaries over raw large tables.
- Keep the always-on context small enough for local models.
- Separate factual measurements from derived affordance hints.
- Keep exact numbers tool-backed when actions depend on them.
- Ground summaries in the current analysis-visible cohort, not the full loaded
  cohort.
- Avoid pretending that affordance hints are exact truths. They are summaries
  for planning and explanation.
- Reuse the shipped `scope`-based metadata summary tool and existing
  view/context assembly instead of creating a second parallel context pipeline.

## Current Problems

### 1. Statistics without affordances

The current metadata summary tools return factual summaries, but they do not
explicitly tell the model how those summaries should guide interpretation.

Examples of missing cues:

- low-cardinality categorical attribute suitable for grouping
- heavily imbalanced binary attribute
- quantitative attribute with narrow visible range
- distribution with substantial missingness
- grouped display where per-group summaries matter more than pooled summaries

### 2. Too little always-on explanatory context

The base context contains structural and semantic information, but not a compact
"what seems important right now" layer.

This causes the model to do too much inference from:

- raw attribute lists
- view descriptions
- sample counts
- tool results returned ad hoc

That increases the chance of brittle explanation, especially on smaller local
models.

### 3. Insufficient separation between approximate explanation and exact action grounding

The model needs both:

- approximate cues for narration and prioritization
- exact values for filters, grouping, sorting, and thresholds

If these are not separated, the prompt either becomes too heavy or the model is
forced to infer too much from sparse facts.

## Proposed Context Layers

### Layer 1: always-on explanatory affordances

Add a new compact derived section to the agent context.

Recommended top-level name:

- `explanatoryContext`

This section should summarize the current analysis state in a way that supports
fast interpretation, not exact measurement.

Suggested contents:

- `cohort`
  - visible sample count
  - full sample count
  - whether the current analysis is grouped
  - active grouping levels
- `prominentAttributes`
  - a small capped list of the most visible or actionable attributes
  - role hints such as `group`, `filter`, `label`, `threshold`
  - compact structure hints such as `low_cardinality`, `high_cardinality`,
    `quantitative`, `skewed`, `missing_values_present`
- `viewSummary`
  - focus branch title
  - whether the current display is pooled, grouped, layered, or faceted
  - the main encodings or dimensions carrying signal
  - which metadata dimensions appear visually important

This layer should be compact and intentionally approximate.

It should help the model answer:

- what is visible
- what seems important
- what kinds of next actions are plausible

without requiring a tool round for every explanation turn.

### Layer 2: on-demand precise summaries

Keep the existing metadata summary tool as the exact factual layer:

- `getMetadataAttributeSummary(attribute, scope: "visible_samples")`
- `getMetadataAttributeSummary(attribute, scope: "visible_groups")`

These should remain the source of truth before:

- threshold-based filtering
- exact categorical filtering
- grouping decisions that depend on present categories
- explanations that quote specific counts or ranges

The tools should be upgraded to support explanatory interpretation better, but
they must remain factual in shape and stable in scope.

The current scope semantics are already implemented and should stay stable:

- `visible_samples`
  - pooled summary over the current visible samples
- `visible_groups`
  - per-group summary over the current visible leaf groups

## Proposed Summary Shape

Each metadata summary should expose two distinct sublayers:

- factual measurements
- derived affordances

The factual layer is what the tool computed from the current visible samples or
visible groups.

The affordance layer is a compact interpretation aid built from those facts.

Example pooled categorical shape:

```json
{
  "kind": "metadata_attribute_summary",
  "attribute": {
    "type": "SAMPLE_ATTRIBUTE",
    "specifier": "sex"
  },
  "title": "sex",
  "dataType": "nominal",
  "scope": "visible_samples",
  "sampleCount": 412,
  "nonMissingCount": 412,
  "missingCount": 0,
  "distinctCount": 2,
  "categories": [
    { "value": "F", "count": 216, "share": 0.524 },
    { "value": "M", "count": 196, "share": 0.476 }
  ],
  "truncated": false,
  "affordances": {
    "goodForGrouping": true,
    "goodForFiltering": true,
    "categoryStructure": "binary",
    "balance": "balanced"
  }
}
```

Example pooled quantitative shape:

```json
{
  "kind": "metadata_attribute_summary",
  "attribute": {
    "type": "SAMPLE_ATTRIBUTE",
    "specifier": "age"
  },
  "title": "age",
  "dataType": "quantitative",
  "scope": "visible_samples",
  "sampleCount": 412,
  "nonMissingCount": 401,
  "missingCount": 11,
  "min": 32,
  "q1": 49,
  "median": 57,
  "q3": 66,
  "max": 81,
  "mean": 57.3,
  "affordances": {
    "goodForThresholding": true,
    "goodForQuantitativeGrouping": true,
    "distributionShape": "right_skewed",
    "rangeClass": "wide"
  }
}
```

The factual values stay explicit.

The affordance fields should be compact and enumerable. They should not become
free-form natural-language essays.

## Proposed Affordance Categories

The v1 affordance layer should stay simple and bounded.

### Categorical attributes

Potential affordances:

- `goodForGrouping`
- `goodForFiltering`
- `categoryStructure`
  - `binary`
  - `low_cardinality`
  - `medium_cardinality`
  - `high_cardinality`
- `balance`
  - `balanced`
  - `moderately_imbalanced`
  - `top_category_dominant`
- `missingness`
  - `none`
  - `some`
  - `substantial`

### Quantitative attributes

Potential affordances:

- `goodForThresholding`
- `goodForQuantitativeGrouping`
- `distributionShape`
  - `roughly_symmetric`
  - `left_skewed`
  - `right_skewed`
  - `heavy_tailed`
- `rangeClass`
  - `narrow`
  - `moderate`
  - `wide`
- `missingness`
  - `none`
  - `some`
  - `substantial`

### Grouped summaries

Grouped summaries should also expose compact cues, for example:

- whether group compositions differ materially
- whether one group is dominated by a category that others are not
- whether the grouped quantitative ranges overlap strongly or weakly

These should remain bounded and secondary to the raw per-group numbers.

## View-Level Explanatory Context

Metadata summaries alone are not enough to explain what the user sees.

The view tree already carries structural detail, encodings, and descriptions.
What is missing is a compact summary of visual salience and interpretation.

Add a derived explanation-focused summary, for example:

- whether the current focus is a pooled cohort view or grouped cohort view
- which encodings or dimensions are visually primary
- whether the user is likely comparing categories, ranges, or trends
- which metadata attributes are central to the visible grouping

This summary should be derived from the existing view tree and sample hierarchy
rather than hand-authored separately.

## Prompt Contract

The system prompt should explicitly teach the model that:

- always-on explanatory affordances are approximate interpretation aids
- tool-backed metadata summaries are the source of exact current values
- grouped metadata summaries should be preferred for "by group" explanations
  and decisions
- the model should not invent exact values when only affordance summaries are
  available

The model should be encouraged to:

1. use always-on explanatory context for quick narration
2. call summary tools when exact values or thresholds matter
3. favor grouped summaries when the current visible hierarchy is grouped

## Proposed Implementation Steps

1. Extend the metadata reducers in [`metadataSummaryReducers.js`](../src/agent/metadataSummaryReducers.js).
   - Add richer quantitative summaries:
     - `median`
     - `q1`
     - `q3`
     - `iqr`
     - optional simple skew/outlier heuristics
   - Add richer categorical summaries:
     - category shares
     - optional `otherCount` or `otherShare` when truncated
     - compact balance and cardinality classification helpers

2. Add affordance builders on top of those factual summaries.
   - Keep them deterministic and enumerable.
   - Do not mix them into the low-level reducers if a clearer helper boundary
     emerges.

3. Upgrade the metadata summary tool.
   - In practice, this means upgrading
     `getMetadataAttributeSummary(attribute, scope)`.
   - Preserve its current scope semantics:
     - `visible_samples`
     - `visible_groups`
   - Add affordance fields alongside the factual summaries.

4. Add a new compact always-on context section in [`contextBuilder.js`](../src/agent/contextBuilder.js).
   - Keep the output capped and local-model-friendly.
   - Include only the most relevant visible attributes and view cues.

5. Add a derived view-level explanation summary.
   - Reuse the existing `viewRoot`, sample summary, and grouping state.
   - Avoid duplicating large parts of the view tree in a second format.

6. Update prompt instructions in the relay server prompt.
   - Clarify approximate versus exact context.
   - Mention grouped metadata summaries explicitly.

7. Add focused tests.
   - all-missing quantitative values
   - numeric strings
   - binary vs high-cardinality categoricals
   - strongly imbalanced categories
   - grouped summaries with divergent group structure
   - token-budget-sensitive always-on context capping

## Recommended Scope for v1

The first implementation should focus on the smallest useful slice:

- enrich pooled and grouped metadata summaries with:
  - percentages
  - quartiles
  - compact affordances
- add one new compact always-on context section for explanatory affordances
- update the system prompt to teach the separation between approximation and
  exactness

This v1 should not attempt:

- free-form narrative summaries embedded in the context
- semantic synonym mapping such as `"male"` -> `"M"`
- full chart-understanding heuristics for every view type
- unbounded per-attribute or per-group statistics in the base context

## Success Criteria

The new design should help the agent answer these better than the current
system:

- "What am I looking at?"
- "Why does this view seem dominated by one group?"
- "Would this attribute be a sensible way to split the cohort?"
- "What seems like the next useful grouping or filter?"

And it should still support exact workflows safely:

- "keep samples with age above 60"
- "retain only males"
- "show this by diagnosis"
- "what are the most common tissues in each visible group?"

## Open Questions

- How should "prominent attribute" selection be defined for the always-on
  context:
  - by visibility in the current sample view
  - by current grouping usage
  - by likely action relevance
- Should grouped-summary affordances stay lightweight in v1, or should they
  include direct cross-group comparison flags immediately?
- Should view-level affordances live entirely under one `explanatoryContext`
  field, or should metadata and view summaries remain separate top-level
  sections?
