# Practical Genomic Data Examples

This page collects a few non-trivial genomic examples that are useful as
reference material.

## Example specifications

The example specs below are self-contained and focus on a single track or
layout.

### Chromosome ideogram from cytobands

This example shows a chromosome ideogram built from UCSC cytoband data. The
rectangles encode the band intervals and staining categories, the labels use
[ranged text](../../grammar/mark/text.md#ranged-text) to squeeze band names into
the available space, and the dashed separators mark chromosome boundaries. The
spec loads UCSC's gzipped cytoband file directly, and because the file has no
header line, the TSV columns are declared explicitly.

EXAMPLE examples/docs/genomic-data/examples/cytobands.json height=60 spechidden

!!! disclaimer ""

    The visualization uses a mirrored copy of UCSC's hg38 cytoband track,
    distributed as
    [cytoBand.txt.gz](https://hgdownload.soe.ucsc.edu/goldenPath/hg38/database/cytoBand.txt.gz).
    UCSC states that its downloadable data files and database tables are freely
    available for public and commercial use.

### RefSeq gene annotations with scored labels

This example shows a RefSeq gene annotation track for hg38. Transcript bodies
and exons are packed into lanes to reduce overlap, and the gene symbols use
[measureText](../../grammar/transform/measure-text.md) and
[filterScoredLabels](../../grammar/transform/filter-scored-labels.md) to keep the
most useful gene names visible as the view changes. The prioritized gene symbols
act as landmarks for navigating the genome, and the small arrows visible at
high zoom levels indicate transcript direction. It uses a custom tooltip
handler for RefSeq gene summaries. Of the roughly 30,000 gene symbols, only the
highest-scoring ones in the visible genomic region are shown when there is room.
The familiar gene symbols act as landmarks and help with navigation around the
genome.

EXAMPLE examples/docs/genomic-data/examples/scored-refSeq-genes.json height=110 spechidden

!!! disclaimer ""

    The gene annotation track was inspired by
    [HiGlass](https://higlass.io). The genes are
    [scored](https://docs.higlass.io/data_preparation.html#gene-annotation-tracks)
    by their [citation counts](https://www.nature.com/articles/d41586-017-07291-9),
    overlapping isoforms are merged into a single virtual isoform that includes
    all exons, and the annotations were preprocessed with
    [compressGeneAnnotations.py](https://github.com/genome-spy/genome-spy/blob/master/utils/compressGeneAnnotations.py).

### ASCAT Copy-Number Segmentation

The [ASCAT Copy-Number Segmentation](ascat.md) page expands on a
more complex GenomeSpy visualization built from ASCAT's simulated example
data. It shows vertically concatenated views for allele-specific copy numbers,
LogR, and B-allele frequency, and adds ideogram and RefSeq gene annotations.

### ASCAT Algorithm in GenomeSpy

The [ASCAT Algorithm in GenomeSpy](ascat-algorithm.md) page visualizes the
core ASCAT fit. It starts from the segmented `logRMean` and `bafMean` values,
estimates raw major/minor copy numbers from the current `rho` and `psi`
values, rounds them to integers, and shows how the fit changes when you adjust
the parameters.

## More examples

For many more examples of visualizing genomic data, see
[Lazy data sources](../../grammar/data/lazy.md).

## Observable notebooks

The [Annotation
Tracks](https://observablehq.com/@tuner/annotation-tracks?collection=@tuner/genomespy)
notebook explains how to implement a chromosome ideogram and a gene annotation
track.

## Website examples

The [genomespy.app](https://genomespy.app/) main page showcases several
examples, some of which focus on genomic data.

- [GWAS Manhattan Plot](https://genomespy.app/examples/?spec=OCAC/ocac.json) ([spec](https://github.com/genome-spy/website-examples/blob/master/OCAC/ocac.json))
- [Multiple-Sequence Alignment](https://genomespy.app/examples/?spec=MSA/msa.json) ([spec](https://github.com/genome-spy/website-examples/blob/master/MSA/msa.json))
- [Structural Variants](https://genomespy.app/examples/?spec=SV/sv.json) ([spec](https://github.com/genome-spy/website-examples/blob/master/SV/sv.json))
- [Multiple Cell Lines](https://genomespy.app/examples/?spec=PARPiCL/parpicl.json) ([spec](https://github.com/genome-spy/website-examples/blob/master/PARPiCL/parpicl.json))
