# Working with Genomic Data

![DNA](../img/DNA.svg){align="right" style="width: 25%"}

GenomeSpy includes features designed specifically for genomic data.

## Loading Genomic Data

GenomeSpy can load data from various [sources](../grammar/data/index.md), such
as CSV and JSON files. However, genomic data is often stored in specialized
formats such as Indexed FASTA, BigWig, and BigBed. GenomeSpy provides [built-in
support](../grammar/data/lazy.md) for these formats, so you can load and
visualize genomic data without additional tools or libraries.

- [Data sources](../grammar/data/index.md) gives the overall data-loading model
  and the distinction between eager and lazy sources.
- [Lazy data sources](../grammar/data/lazy.md) covers Indexed FASTA, BigWig,
  BigBed, VCF, GFF3, and BAM.

## Handling Genomic Coordinates

Genomic data is typically associated with coordinates that include chromosome
names and positions within each chromosome. GenomeSpy provides several
techniques for working with these coordinates, such as
[transforming](../grammar/transform/linearize-genomic-coordinate.md) between
different coordinate systems and visualizing data in the context of a reference
genome.

- [Genomic coordinates](./genomic-coordinates.md) explains assemblies, contigs,
  locus encoding, and coordinate counting.
- [Locus scale](../grammar/scale.md#locus-scale) documents chromosome-aware
  genomic axes.
- [Genome axis for loci](../grammar/scale.md#genome-axis-for-loci) shows how to
  configure the genome axis and grid.
- [linearizeGenomicCoordinate](../grammar/transform/linearize-genomic-coordinate.md)
  covers explicit coordinate linearization in the data flow.

## Data Transformations

Specialized transformations such as
[folding](../grammar/transform/regex-fold.md) tabular data, calculating
[coverage](../grammar/transform/coverage.md), and computing a [piled
up](../grammar/transform/pileup.md) layout help adapt GenomeSpy to many genomic
data visualization and analysis tasks.

- [Transforms overview](../grammar/transform/index.md) explains how
  transformation pipelines work in GenomeSpy.
- [regexFold](../grammar/transform/regex-fold.md) turns repeated tabular fields
  into tidy row-wise data.
- [coverage](../grammar/transform/coverage.md) computes coverage from genomic
  intervals.
- [pileup](../grammar/transform/pileup.md) lays out overlapping features into
  rows.
- [flattenCompressedExons](../grammar/transform/flatten-compressed-exons.md)
  expands compact exon encodings for gene models.
- [filterScoredLabels](../grammar/transform/filter-scored-labels.md) keeps
  labels readable while zooming.

## GPU-accelerated Rendering

Genomic datasets can be large and complex. GenomeSpy's GPU-accelerated
rendering lets you visualize, navigate, and explore them with high
performance.

- [Scale zooming and panning](../grammar/scale.md#zooming-and-panning) covers
  interactive navigation on genomic axes.
- [Multiscale composition](../grammar/composition/multiscale.md) helps build
  overview-detail views with semantic zooming.
- [Layer zoom-driven opacity](../grammar/composition/layer.md#zoom-driven-layer-opacity)
  gives lower-level control over zoom-dependent detail.
- [Point mark](../grammar/mark/point.md) documents geometric and semantic zoom
  techniques for dense point data.
