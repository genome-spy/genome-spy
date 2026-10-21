# Categorical Clustered Heatmap

This synthetic heatmap shows imaginary z scores for four samples and four genes.
Each precomputed tree determines its axis's order. Matrix cells encode the original
sample and gene IDs on shared band scales, without numeric row/column positions
or separately maintained domain arrays.

EXAMPLE examples/docs/examples/generic/clustered-heatmap-band.json height=470

## Tree-owned domains

Each tree's [`dendrogram`](../../grammar/transform/dendrogram.md) transform reads
its leaf categories and structural `siblingOrder`. The numeric ranks order children
within each parent; shuffled input rows do not change the orientation. The transform
publishes the ordered categories through `param` with `push: "outer"`.

The common [`surround`](../../grammar/composition/surround.md) declares two
read-only output parameters, `sampleOrder` and `geneOrder`. Their expressions
supply its shared y and x band domains. The sample tree, gene tree, and matrix
keep separate data pipelines. A hidden tree still supplies its domain.

Categorical anchors and fractional offsets keep internal branches connected.
[`bandstep()`](../../grammar/expressions.md#bandstep) converts offsets to pixels
using the padded band step, including when the plot is resized or reversed.

The trees and scores are illustrative, and GenomeSpy does not compute clustering.
For a larger dataset with index-scale navigation, group gaps, and annotations,
see the [DepMap clustered heatmap](clustered-heatmap.md).
