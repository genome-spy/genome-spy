# Visible Sample Metadata Summary Draft

This document describes the plan for changing agent-facing metadata summary
tools so they reflect the current analysis-visible sample population rather
than the full loaded cohort.

The current metadata summary tool is useful, but it is scoped too broadly. It
summarizes metadata across all known samples, even after filtering or grouping
has changed which samples are currently present in the active analysis state.

## Code References

- Metadata summary tool: [`metadataAttributeSummaryTool.js`](../src/agent/metadataAttributeSummaryTool.js)
- Agent runtime bridge: [`agentAdapter.js`](../src/agent/agentAdapter.js)
- Agent tool contracts: [`agentToolInputs.d.ts`](../src/agent/agentToolInputs.d.ts)
- Agent tool execution entry points: [`agentTools.js`](../src/agent/agentTools.js)
- Agent context summary counts: [`contextBuilder.js`](../src/agent/contextBuilder.js)
- Intent execution result summary counts: [`intentProgramExecutor.js`](../src/agent/intentProgramExecutor.js)
- Sample hierarchy state: [`sampleState.d.ts`](../../sampleView/state/sampleState.d.ts)
- Group traversal helpers: [`sampleSlice.js`](../../sampleView/state/sampleSlice.js)

## Status

- Implemented:
  - `getMetadataAttributeSummary(attribute)` exists as a read-only tool.
  - It returns compact categorical or quantitative summaries for one metadata
    attribute.

- Problem:
  - The tool currently uses all known sample ids rather than the current
    analysis-visible sample population.

- Planned:
  - Change pooled metadata summaries to use visible samples from the current
    hierarchy.
  - Design grouped metadata summaries based on the current visible hierarchy.

## Why this exists

- The user experiences the current visualization through the active sample
  hierarchy, not through the full loaded metadata table.
- Filtering, grouping, and related actions change the current analysis
  population.
- After such actions, the agent should reason from the currently included
  samples.
- The current metadata summary tool does not yet do that.

This causes failures in workflows like:

- filter samples by age and then ask for the most common tissue types
- group samples and then ask for statistics by group

In both cases, the agent needs metadata summaries grounded in the current
analysis state.

## User-Facing Intent

The system should support prompts like:

- "retain samples with age below 40 and then tell me the most common tissue types"
- "what are the most common tissue types in the current filtered cohort?"
- "give me statistics by groups"
- "after grouping by diagnosis, what are the most common tissue types in each group?"

From the agent's point of view, these requests mean:

1. Use the current analysis-visible sample population, not the full cohort.
2. If the request is pooled, summarize over the visible samples.
3. If the request is grouped, summarize over the visible leaf groups.

## Revision During Implementation

This is a living draft, not a fixed contract.

- Revise helper boundaries if a clearer shared traversal primitive emerges.
- Keep the default scope aligned with the analysis state represented by the
  sample hierarchy.
- Prefer explicit tool contracts over implicit tool behavior when pooled and
  grouped summaries diverge.

## What the agent should understand

- `sampleData.ids` describes all known samples.
- `rootGroup` describes the current analysis-visible sample population and
  grouping structure.
- Metadata summaries that answer "what is true now" should default to the
  population represented by `rootGroup`.
- Grouped summaries should use the current visible leaf groups, not arbitrary
  inferred partitions.

The agent should not assume:

- that the full loaded cohort is always the right scope
- that grouping can be reconstructed from metadata alone when the hierarchy
  already defines it
- that pooled summaries are enough for "by group" requests

## Source of Truth

The source of truth for the current analysis-visible sample population should be
the `rootGroup` inside `SampleHierarchy`.

The source of truth for current grouping levels should be `groupMetadata`
combined with the visible leaf groups under `rootGroup`.

`sampleData.ids` and `sampleMetadata.entities` remain the full backing store,
but agent-facing summaries should derive their active sample scope from the
hierarchy.

## Interpretation of `SampleHierarchy`

The sample hierarchy has two different roles that must not be conflated:

- `sampleData.ids` and `sampleMetadata.entities`
  - the full known sample universe and metadata store
- `rootGroup`
  - the current analysis population after filtering, grouping, and related
    actions

Leaf `SampleGroup.samples` arrays are the concrete list of sample ids that are
currently included in the active analysis state.

This means:

- full-cohort metadata access should read from `sampleData.ids`
- analysis-visible metadata access should read from `rootGroup`

For agent tools that answer questions about the current state of the analysis,
`rootGroup` is the right default scope.

## Critique of the Current Plan

The earlier plan was directionally correct, but it needed three clarifications:

1. "Visible" needed a stricter meaning.
   - Here, "visible" means analysis-visible: the samples currently represented
     by the active hierarchy, not viewport visibility or UI clipping.

2. Grouped summaries needed to be part of the tool design now.
   - The user examples already require both pooled and grouped summaries.

3. The pooled summary tool should not silently become polymorphic.
   - A separate grouped-summary tool is easier for the agent to reason about.

## Proposed Shape

The recommended agent-facing shape is:

1. Keep pooled summaries:
   - `getMetadataAttributeSummary(attribute)`
   - summarize over the current analysis-visible sample population

2. Add grouped summaries:
   - `getGroupedMetadataAttributeSummary(attribute)`
   - summarize over the visible leaf groups in the current hierarchy

Both tools should remain bounded and factual.

## Proposed Agent Contract

### Pooled summary

- `getMetadataAttributeSummary(attribute)`
  - returns a pooled summary over visible samples
  - default scope: `visible_samples`

### Grouped summary

- `getGroupedMetadataAttributeSummary(attribute)`
  - returns one summary per visible leaf group
  - default scope: `visible_groups`

This is preferable to one polymorphic tool that sometimes returns pooled output
and sometimes grouped output depending on the current state.

## Proposed App Helpers

Add shared agent-side helpers to:

- collect distinct visible sample ids from `rootGroup`
- collect visible leaf groups from `rootGroup`

These helpers should live in `packages/app-agent/src/agent/` so the agent layer owns
its own view of analysis-visible scope.

They should be reused by:

- pooled metadata summaries
- grouped metadata summaries
- any future agent-facing tool that should reflect the current analysis state

## Implementation Steps

1. Add a shared agent-side hierarchy traversal helper.
   - Return distinct visible sample ids from `rootGroup`.
   - Return visible leaf groups from `rootGroup`.

2. Change `getMetadataAttributeSummary` to use visible sample ids by default.
   - Replace the current `sampleData.ids` scope with ids collected from
     `rootGroup`.
   - Report the scope explicitly in the result, for example
     `scope: "visible_samples"`.

3. Keep the full-cohort scope as a later explicit extension only.
   - Do not keep it as the default.

4. Add a separate grouped metadata summary tool.
   - Base it on visible leaf groups from `rootGroup`.
   - Use `groupMetadata` to describe active grouping levels.

5. Return compact grouped summaries.
   - For categorical attributes:
     - `sampleCount`
     - `distinctCount`
     - capped categories
   - For quantitative attributes:
     - `sampleCount`
     - `nonMissingCount`
     - `min`
     - `max`
     - `mean`

6. Keep grouped outputs bounded.
   - Cap categories per group.
   - Consider capping the number of returned groups.
   - Include truncation flags where needed.

7. Update the system prompt after the tool behavior is settled.
   - Tell the agent that pooled summaries reflect the current analysis-visible
     population.
   - Tell the agent to use grouped summaries for "by group" requests.

## Success Criteria

The design should support:

- filter first, then summarize
  - "retain samples with age below 40"
  - "what are the most common tissue types?"
  - summary reflects only the retained population

- group first, then summarize
  - "group by diagnosis"
  - "what are the most common tissue types by group?"
  - grouped summary reflects the visible leaf groups in the current hierarchy
