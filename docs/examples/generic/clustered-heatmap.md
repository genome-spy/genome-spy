# Clustered Heatmap with Dendrograms

This example combines a heatmap with clustering trees on both axes and aligned
row annotations. It displays expression for 72 genes across 60 cancer cell
lines from ten lineages. Shared index scales keep the matrix, dendrogram leaves,
labels, and annotation strips aligned while panning and zooming.

EXAMPLE examples/docs/examples/generic/clustered-heatmap.json height=760 spechidden

!!! disclaimer ""

    Data: Broad DepMap (2024),
    [DepMap 24Q4 Public](https://doi.org/10.25452/figshare.plus.27993248.v1),
    licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
    GenomeSpy hosts a processed demonstration subset of 60 cell lines and
    72 protein-coding genes, with gene-wise standardization, computed Ward
    trees, and extracted cell-line annotations.
    The [reproducible recipe](https://github.com/genome-spy/genomespy-dataset-recipes/tree/875ca57dd130bdc2f9777ed63939e49042233f32/recipes/depmap-cell-line-rna-seq/)
    records selection and processing; the
    [data notice](https://data.genomespy.app/datasets/depmap-cell-line-rna-seq/v1/NOTICE.txt)
    accompanies the mirrored extract.

## Reading the heatmap

Rows are cell lines and columns are genes. Red indicates expression above a
gene's mean across the selected cell lines; blue indicates expression below
that mean. The values are z scores of the supplied log2(TPM + 1) expression,
so the colors emphasize each gene's variation across cell lines. The color
scale saturates at ±2.5, while tooltips retain the full numeric range.

The trees group similar expression profiles. Branch colors and gaps identify
four row groups and six gene groups cut from the hierarchies. These groups are
derived from expression and can span multiple cancer lineages. The three
annotation strips show cancer lineage, growth pattern, and primary/metastatic
sample origin. Gray sample-origin cells indicate unknown values.

## Preparing the data

GenomeSpy does not perform clustering. This visualization loads a wide
expression matrix, cell-line and gene metadata tables, and a precomputed tree
for each axis. The metadata links stable identifiers to labels, annotations,
and zero-based row or column positions; tree records contain node IDs, parent
IDs, and merge heights.

These files can be prepared with tools such as SciPy or R. Filter and normalize
the matrix as appropriate, cluster rows and columns, and choose a leaf order.
Export each hierarchy with identifiers that match the matrix and metadata,
then assign leaf positions in the chosen order. Optional hierarchy cuts can
supply branch groups and gap positions.

The [reproducible recipe](https://github.com/genome-spy/genomespy-dataset-recipes/tree/875ca57dd130bdc2f9777ed63939e49042233f32/recipes/depmap-cell-line-rna-seq/)
shows how these inputs were prepared for this example, using gene-wise z
scores, Euclidean distance, Ward linkage, and optimal leaf ordering.

## How the views stay aligned

The wide expression matrix is unfolded with
[`regexFold`](../../grammar/transform/regex-fold.md).
[`lookup`](../../grammar/transform/lookup.md) joins the cell-line and gene
metadata to the matrix and assigns the same leaf positions to each tree.
The [`dendrogram`](../../grammar/transform/dendrogram.md) transform converts the
precomputed hierarchy into edges for orthogonal
[`link` marks](../../grammar/mark/link.md).

A three-column [`concat`](../../grammar/composition/concat.md) grid places the
gene tree above the heatmap and the cell-line tree to its left. The matrix and
gene tree share an x [`index` scale](../../grammar/scale.md#index-scale); the
matrix, cell-line tree, labels, and annotation strips share the y scale. Each
tree excludes its quantitative merge-height axis from this scale sharing.
The dendrogram's fractional offsets are converted to pixels with
[`bandstep()`](../../grammar/expressions.md#bandstep), keeping branches connected
as the view changes size or zoom level. Explicit `gapPositions` on the index
scales separate the chosen hierarchy groups.

The annotation strips use native bottom [view titles](../../grammar/title.md)
with a shared named [style](../../grammar/config.md#named-styles-and-resets).
Their reserved bottom overhang leaves room for the rotated titles and gene
labels. [Collected legends](../../grammar/legend.md) place the expression ramp
and categorical keys below the complete composition and wrap on narrow canvases.
