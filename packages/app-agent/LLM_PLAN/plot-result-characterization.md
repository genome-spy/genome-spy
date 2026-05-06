# Plot Result Characterization

Plan for making sample-attribute plot tool results more useful to the agent
without turning plotting tools into broad statistical analysis tools.

## Current Problem

The plotting tools now return durable records that identify what was plotted,
including normalized selection-backed attributes. That is enough for the agent
to know that a plot was shown, but not enough to understand what the plot
contains.

The current `summary` fields are also too vague:

- `groupCount` is useful but should be explicitly tied to visible leaf groups.
- `rowCount` is inconsistent across plot types.
  - Bar plots count rendered category/group rows.
  - Scatterplots count rendered points.
  - Boxplots count boxplot stats rows plus outlier rows, not samples.

The boxplot behavior is especially misleading. A boxplot for four samples in
two groups can report `rowCount: 2` when there are two stats rows and no
outliers. The agent may read that as two samples or two observations.

## Goal

Give the agent a compact factual characterization of the exact data shown in
the plot, while keeping the tool result small and deterministic.

The plot result should help the agent answer:

- What is visible in the plot?
- How many samples or points contributed?
- How are values distributed across current groups?
- Are there obvious descriptive differences that are worth mentioning?
- Is a deeper statistical follow-up needed?

The plot result should not make strong inferential claims such as statistical
significance.

## Preferred Design

Add a compact characterization directly to each plot result. Keep deeper
statistical comparison as a separate future tool.

Why direct plot-result characterization:

- It is derived from the exact rows used to render the plot.
- It avoids forcing an extra tool call after every plot.
- It reduces loop risk by making the first plot result self-explanatory.
- It keeps `getMetadataAttributeSummary` focused on independent attribute
  inspection.

Use a separate future tool for:

- p-values
- effect sizes
- confidence intervals
- pairwise group comparisons
- explicit user questions such as "is this significant?"

## Summary Field Revision

Replace or clarify the current generic `rowCount` field before adding richer
characterization.

Recommended fields:

- `groupCount`: number of visible leaf groups represented in the plot, or `1`
  for an ungrouped plot.
- `sampleCount`: number of visible samples considered for the plotted
  attribute or attribute pair.
- `plottedCount`: number of non-missing plotted samples or points.

Avoid exposing `rowCount` to the agent unless it has one stable meaning across
all plot types.

## Characterization Shapes

### Category counts

For `showCategoryCountsPlot`, characterize the rendered category counts:

- encoding summary:
  - use explicit channel roles so the agent does not confuse current groups
    with the plotted category attribute
  - when ungrouped, x has role `plotted_attribute` and y has role `count`
  - when grouped, x has role `current_sample_groups`, y has role `count`, and
    color has role `plotted_attribute`
- total non-missing plotted samples
- missing sample count if available
- category count
- top categories with `value`, `count`, and `share`
- when grouped:
  - per-group totals
  - top category per group
  - compact group/category count matrix if small enough
- truncation flag when category output is capped

### Attribute distribution

For `showAttributeDistributionPlot`, characterize the grouped quantitative
distribution:

- per group:
  - `sampleCount`
  - `nonMissingCount`
  - `missingCount`
  - `min`
  - `q1`
  - `median`
  - `q3`
  - `max`
  - `iqr`
  - `outlierCount`
- overall:
  - largest median difference between groups when at least two groups have
    non-missing values
  - group with highest median
  - group with lowest median
- cautions:
  - very small group sizes
  - empty groups
  - high missingness

This should reuse existing boxplot statistics where possible, but the exposed
counts must refer to contributing samples, not rendered stats rows.

### Attribute relationship

For `showAttributeRelationshipPlot`, characterize the rendered points:

- axis mapping for the ordered input attributes
  - first input attribute is the x axis
  - second input attribute is the y axis
- missing pair count if available
- x and y ranges
- Pearson correlation value when enough points are present
- group point counts when grouped
- cautions for very small point counts

Correlation is descriptive. The result should not present it as statistical
significance. Keep the correlation result numeric; the sign of `r` already
encodes direction. Do not emit qualitative strength labels unless their
thresholds are explicitly documented and validated for the intended domain.

Keep the relationship tool input as an ordered `attributes` array. Do not
rename the inputs to `xAttribute` and `yAttribute`; those names can pull the
agent toward treating one attribute as a grouping variable. Instead, make the
axis assignment explicit in the result and history record, for example:

```json
{
  "axisMapping": [
    { "axis": "x", "attributeIndex": 0, "title": "purity" },
    { "axis": "y", "attributeIndex": 1, "title": "weighted mean(purifiedLogR)" }
  ]
}
```

Pearson correlation is small enough to implement locally for this descriptive
plot characterization. If the agent starts exposing broader statistical
analysis, such as p-values, confidence intervals, Spearman correlation, rank
tests, or pairwise group comparisons, replace or back the local implementation
with an evaluated statistics package instead of growing bespoke math helpers.

## Accuracy Checks

Before implementing characterization, verify the counting contract against the
plot data builders:

- `buildHierarchyBarplotData`
  - Determine whether missing values are ignored or should be counted
    separately.
  - Confirm whether grouped rows represent category/group combinations.
- `buildHierarchyBoxplotData`
  - Confirm that stats rows are one row per non-empty group.
  - Confirm that outlier rows are additional render rows, not additional
    samples beyond the original sample set.
  - Add or expose contributing sample counts per group.
- `buildHierarchyScatterplotData`
  - Confirm that rows are plotted non-missing attribute pairs.
  - Add missing-pair counts if the agent should know how much data was omitted.

Tests should explicitly cover:

- grouped boxplots with no outliers
- grouped boxplots with outliers
- missing values in each plot type
- ungrouped plots
- the distinction between rendered rows and contributing samples

## Implementation Status

The first implementation slice is complete:

- `rowCount` was removed from the agent-facing plot summary.
- `sampleCount` and `plottedCount` now have stable meanings across plot types.
- Plot characterization is built in the app chart layer from the same data used
  to render the plot.
- The agent history record includes compact characterization but still omits
  full `namedData`.
- Scatterplot characterization includes the ordered-input axis mapping and
  descriptive Pearson correlation when enough points are present.
- Rendered row counts are not exposed to the agent because they are an
  implementation detail and were especially misleading for boxplots.

## Future Slices

1. Refactor generic factual summary helpers into the App package.
   - The current implementation has deliberate but real duplication between
     App plot characterization and the app-agent metadata summary reducers.
   - Move generic quantitative and categorical reducers to an App-owned module
     so they can support App UI, plot characterization, and agent tools.
   - Implemented location:
     `packages/app/src/utils/statistics/fieldSummary.js`.
   - App-agent imports the helpers through the existing `agentShared` surface;
     do not add another package subpath for this helper yet.
   - Keep the helpers independent from agent wording and tool contracts.
   - Include:
     - numeric coercion and missing-value handling
     - `sampleCount`, `nonMissingCount`, and `missingCount`
     - categorical counts, shares, truncation, and deterministic sorting
     - quantitative min/max/mean/quantiles/IQR
     - optional small helpers such as top category
   - Then update:
     - App plot characterization to use the shared reducers
     - `getMetadataAttributeSummary` to import the shared reducers instead of
       keeping app-agent-local copies
     - tests so the shared helper behavior has one source of truth

2. Keep plot-specific characterization in the App chart layer.
   - Do not move chart encoding, axis roles, boxplot group summaries, or
     scatterplot correlation into app-agent.
   - These are App/plot facts and may be useful for UI captions, tooltips,
     inspectors, exports, and non-agent workflows.
   - App-agent should only preserve and compact the App-produced plot record for
     model history.

3. Evaluate whether grouped category detail needs a bounded category/group
   matrix.
   - Start from observed prompts before adding this because it can grow quickly.

4. Evaluate whether a separate deeper comparison tool is needed.
   - Do this only after the factual characterization is working.
   - Keep statistical significance explicit and opt-in.

## Open Questions

- Should missing counts be computed against visible leaf-group samples, or only
  against samples where the relevant attribute accessor can run?
- Should boxplot characterization include whisker bounds in addition to
  quartiles?
