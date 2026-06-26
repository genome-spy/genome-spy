# RefSeq Gene Annotations with Scored Labels

This example shows a RefSeq gene annotation track for hg38. Transcript bodies
and exons are packed into lanes to reduce overlap, and the gene symbols use
[measureText](../../grammar/transform/measure-text.md) and
[filterScoredLabels](../../grammar/transform/filter-scored-labels.md) to keep
the most useful labels visible as the view changes. The prioritized gene
symbols act as landmarks for navigating the genome, and the small arrows
visible at high zoom levels indicate transcript direction.

EXAMPLE examples/docs/genomic-data/examples/scored-refSeq-genes.json height=110 spechidden

!!! disclaimer ""

    The gene annotation track was inspired by
    [HiGlass](https://higlass.io). The genes are
    [scored](https://docs.higlass.io/data_preparation.html#gene-annotation-tracks)
    by their [citation counts](https://www.nature.com/articles/d41586-017-07291-9),
    overlapping isoforms are merged into a single virtual isoform that includes
    all exons, and the annotations were preprocessed with
    [compressGeneAnnotations.py](https://github.com/genome-spy/genome-spy/blob/master/utils/compressGeneAnnotations.py).

## What to notice

GenomeSpy's hierarchical dataflow lets the symbol labels update dynamically as
the user pans and zooms. The view has two main layer groups:

- Transcripts
  - Exon rectangles
  - Body rules
- Symbols
  - Labels
  - Strand arrows

Of the roughly 30,000 gene symbols, only the highest-scoring symbols in the
visible genomic region are shown when there is room.

The transcript layer fades in only after the view is zoomed close enough. This
keeps the overview uncluttered while still showing exon structure and
transcript direction at detailed scales. The custom tooltip handler fetches
RefSeq gene summaries for visible labels.

### Data and Label Selection

The source file contains one compressed row per gene symbol. Overlapping
isoforms have already been merged into a single interval with a compressed exon
list, which keeps the data compact enough for an annotation track that spans the
whole genome. The spec linearizes genomic coordinates before sorting and lane
assignment so the transforms can compare intervals across chromosomes.

Label selection is separate from transcript rendering. First, the symbol text is
measured in pixels. Then `filterScoredLabels` watches the visible genomic domain,
tries higher-scoring genes first, and keeps labels that fit without overlap in
their lanes. This lets familiar genes remain visible as landmarks without
filling the track with every annotation in the current region.

## GenomeSpy Features

This example combines several GenomeSpy capabilities in one spec:

- [`linearizeGenomicCoordinate`](../../grammar/transform/linearize-genomic-coordinate.md)
  converts chromosome and base-pair positions into sortable coordinates used by
  later transforms.
- [`collect`](../../grammar/transform/collect.md) sorts genes before lane
  assignment.
- [`pileup`](../../grammar/transform/pileup.md) packs transcripts into lanes
  and prefers strand-specific ordering.
- [`flattenCompressedExons`](../../grammar/transform/flatten-compressed-exons.md)
  expands compressed exon intervals into individual exon items.
- [Semantic zooming](../../grammar/composition/layer.md#zoom-driven-layer-opacity)
  fades transcript bodies, exons, and strand arrows in as the horizontal scale
  reaches detailed genomic ranges.
- [`measureText`](../../grammar/transform/measure-text.md) measures label
  widths for fitting.
- [`filterScoredLabels`](../../grammar/transform/filter-scored-labels.md)
  chooses high-scoring labels that fit in the visible region.
- The `search` channel exposes gene symbols to GenomeSpy's search behavior.
