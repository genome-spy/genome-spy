# Plotting Tool Token Optimization

Plan for revising agent-facing plotting tools so plot requests are easier for
the model to choose and the tool schema plus system prompt stay compact.

## Current State

- Plotting is exposed through one union-shaped tool,
  `showSampleAttributePlot`.
- The tool currently covers category counts, grouped value distributions, and
  quantitative relationships.
- The generated provider schema is large because the plot union repeats
  `PlotAttributeIdentifier` and its nested `VALUE_AT_LOCUS` shape in each
  branch.
- The system prompt also needs several plotting-specific rules because one
  tool name hides several analytic intents.
- Current tool count is modest, but `showSampleAttributePlot` is one of the
  largest provider tool definitions.

## Goals

- Make plotting decisions more obvious for GPT and local models.
- Reduce repeated JSON Schema text in every agent turn.
- Keep the system prompt shorter by moving intent distinctions into tool names
  and compact tool descriptions.
- Preserve browser-side validation before executing tool calls.
- Keep advanced selection-derived attributes available without forcing their
  full nested shape into every plotting schema.

## Proposed Tool Shape

Replace the single plot union with a few focused tools grouped by analytic
intent:

- `showCategoryCountsPlot`
  - For bar plots, category counts, and category distributions.
  - Input: one categorical attribute.
- `showAttributeDistributionPlot`
  - For histograms, boxplots, violin plots, density plots, and quantitative
    distributions.
  - Input: one quantitative attribute plus a small `kind` enum when multiple
    distribution renderings are supported.
  - Uses current sample groups automatically when present.
- `showAttributeRelationshipPlot`
  - For scatterplots, correlations, and other two-variable quantitative
    relationships.
  - Input: an ordered two-item `attributes` array and a small optional `kind`
    enum.
  - Keep the array shape instead of `xAttribute`/`yAttribute`. Axis-named
    fields can seduce the model into treating one attribute as a grouping
    variable or as an independent/dependent semantic assignment. The array
    means "compare these two quantitative attributes"; rendering can still map
    the first item to x and the second to y.

Add separate tools only when the workflow or argument shape is meaningfully
different. New renderings that share the same arguments should be new `kind`
enum values, not new tools.

## Attribute References

Prefer compact attribute candidates in plotting tool inputs and in
`GetMetadataAttributeSummaryToolInput`:

- Simple sample metadata can still use a compact candidate such as
  `{ "kind": "sampleMetadata", "attribute": "age" }`.
- Selection-derived or view-backed values should use candidates produced by
  context or by a resolver/build tool, for example
  `{ "kind": "selectionAggregation", "candidateId": "..." }`.
- Plotting tools and `getMetadataAttributeSummary` should translate candidates
  to the internal canonical `AttributeIdentifier` before calling app APIs.
- Tool results may return a canonical `AttributeIdentifier` for diagnostics or
  downstream Redux actions, but model-facing plotting and summary inputs should
  prefer the compact candidate form.

Avoid repeating the full selection aggregation schema inside each plotting
or summary tool. If a full `VALUE_AT_LOCUS` object remains necessary for Redux
actions, keep that complexity in the action path and do not force it into every
agent-facing analysis tool.

Redux actions are a separate contract. `submitIntentActions` can continue to
accept canonical action payloads for now because those payloads are real app
state and provenance contracts. Candidate-to-action compilation can be a later
agent macro layer, not part of the first plotting cleanup.

## Schema Strategy

- Keep provider-facing plot schemas shallow.
- Use short enums for plot variants within one analytic family.
- Move cross-field validation into browser-side validators when provider
  schemas would otherwise become large.
- Keep strict provider schemas for simple required fields, but do not rely on
  provider strictness as the only guardrail.
- Consider `$defs` and `$ref` for OpenAI provider schemas if they reduce token
  use in practice.
- Keep an inlined-schema fallback for local OpenAI-compatible servers if refs
  prove unreliable.

For local models such as Qwen through oMLX, assume the schema is mostly prompt
guidance plus server-side parsing support. Small shallow schemas are preferable
to large inlined schemas and also preferable to deeply indirect schemas that
the model may not follow.

## Prompt Strategy

After splitting the tools, replace the long plotting section in the system
prompt with short routing rules:

- Category/count request: call `showCategoryCountsPlot`.
- Distribution/boxplot/histogram request: call
  `showAttributeDistributionPlot`.
- Relationship/correlation/scatterplot request: call
  `showAttributeRelationshipPlot`.
- If grouping is required, first submit the grouping action, wait for refreshed
  context, then call the plot tool.
- If a plot depends on a selection-derived attribute, build or resolve that
  attribute before plotting.

The prompt should not repeat full payload examples for every plot kind. Keep
examples in tool descriptions or on-demand docs only when they materially
improve tool use.

## Implementation Steps

### Phase 1: Split the Tool

1. Record baseline sizes before editing:
   - serialized `showSampleAttributePlot` provider definition
   - serialized full provider tool-definition array
   - system prompt token estimate, if available
2. Add focused plotting input types in `agentToolInputs.d.ts`.
3. Replace `showSampleAttributePlot` catalog exposure with the focused tools.
4. Keep one shared runtime helper that converts focused tool inputs into the
   existing `SampleAttributePlotRequest` consumed by `AgentApi`.
5. Regenerate tool catalog, schema, and type artifacts.
6. Update `agentTools.js`, `toolCatalog` tests, and session-controller tests.
7. Measure the same schema and prompt sizes again.
8. Evaluate model behavior before making deeper schema changes.

### Later Phases

After the split is measured and tested, make further reductions only where the
measurements show a real gain:

- Move cross-field validation into browser-side validators when provider
  schemas would otherwise become large.
- Consider compact handles for selection-derived attributes.
- Extend `GetMetadataAttributeSummaryToolInput` to accept the same candidate
  shape as plotting tools, so summaries can cover selection-derived values and
  not only sample metadata.
- Consider `$defs` and `$ref` for OpenAI provider schemas if they reduce token
  use in practice.
- Keep an inlined-schema fallback for local OpenAI-compatible servers if refs
  prove unreliable.
- Trim the plotting section of `genomespy_system_prompt.md` after the focused
  tool names are stable.

Measure the relevant provider schema size after every substantial change. A
substantial change includes splitting or merging tools, changing a shared input
type, changing reference/inlining behavior, or adding a new plot family.

## Success Criteria

- The plotting tool definitions are materially smaller than the current
  `showSampleAttributePlot` definition.
- The system prompt loses most plot-union-specific wording.
- Local model prompts expose simple tool names and shallow argument shapes.
- Existing plot behavior remains available through the focused tools.
- Invalid plot requests are rejected with clear browser-side validation errors.

## Relevant Files

- [`agentToolInputs.d.ts`](../src/agent/agentToolInputs.d.ts)
- [`agentTools.js`](../src/agent/agentTools.js)
- [`toolCatalog.js`](../src/agent/toolCatalog.js)
- [`generatedToolCatalog.json`](../src/agent/generated/generatedToolCatalog.json)
- [`generatedToolSchema.json`](../src/agent/generated/generatedToolSchema.json)
- [`genomespy_system_prompt.md`](../server/app/prompts/genomespy_system_prompt.md)
- [`agentSessionController.js`](../src/agent/agentSessionController.js)
- [`chatMessage.js`](../src/agent/chatMessage.js)
