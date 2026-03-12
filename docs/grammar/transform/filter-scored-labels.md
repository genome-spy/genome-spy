# Filter Scored Lables

The `"filterScoredLabels"` transform fits prioritized elements such as labels
into the available space, dynamically adjusting as the scale domain changes
(such as during zooming). It is particularly suited for gene annotation tracks,
where genes have an associated importance or score, such as their popularity or
relevance, and only the most significant labels should be displayed when space
is limited. This transform is typically used in conjunction with the
[`measureText`](measure-text.md) transform to calculate the width of each label.

For an usage example, check the [Annotation
Tracks](https://observablehq.com/@tuner/annotation-tracks?collection=@tuner/genomespy)
notebook or the [example](#example) below.

## Parameters

SCHEMA FilterScoredLabelsParams

## Example

Zoom in to see how the labels are filtered based on their score and the available
space.

EXAMPLE examples/docs/grammar/transform/filter-scored-labels/filter-scored-labels.json height=100
