# Aggregating Samples

!!! note "Developer Documentation"

    This page is intended for users who develop tailored visualizations
    using the GenomeSpy app.

`aggregateSamples` adds one or more summary tracks to a sample view. Use it to
compare patterns across sample subgroups in addition to inspecting individual
samples.

In the GenomeSpy [paper](https://doi.org/10.1093/gigascience/giae040), a
summary track shows a copy-number landscape above the main heatmap. The summary
is computed separately for each visible group, making recurrent amplification
and deletion patterns easier to compare between groups.

Each entry in `aggregateSamples` is a normal unit or layer spec. It may define
its own `transform`, `encoding`, and `params`. GenomeSpy prepends a
`mergeFacets` transform automatically and removes the `sample` channel from the
summary encoding.

## `sampleCount` { #sample-count }

Aggregate tracks receive the `sampleCount` parameter. It contains the number of
samples in the current group and can normalize summary values.

```json title="Normalizing an aggregate"
{
  "type": "formula",
  "expr": "datum.coverage / sampleCount",
  "as": "coverage"
}
```

## Examples

The examples below use synthetic toy data for demonstration purposes.

### Copy-number landscape

This example shows per-sample segments with layered aggregate amplification and
deletion tracks.

The two aggregate layers first select positive or negative `logR` values. Each
then uses the [`"coverage"` transform](../grammar/transform/coverage.md) to
split overlapping segments into non-overlapping intervals and sum their `logR`
values. Dividing that sum by `sampleCount` normalizes the track by the number of
samples in the current group.

EXAMPLE examples/app/copy-numbers.json runtime=app height=300 spechidden

#### Further reading

This technique was used in the GenomeSpy paper to visualize the copy-number landscape
of the DECIDER cohort.

- [Spec from the GenomeSpy paper](https://github.com/HautaniemiLab/genomespy-paper-2024-spec/blob/main/cnv-segments.json)

### Mean z-score example

This example aggregates each gene's z-scores with the
[`"aggregate"` transform](../grammar/transform/aggregate.md). It displays the
mean z-score for the samples in the current group as a bar extending from zero,
using the same color scale as the per-sample heatmap.

EXAMPLE examples/app/expression-zscores.json runtime=app height=300 spechidden
