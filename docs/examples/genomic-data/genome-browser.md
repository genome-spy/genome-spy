# Composing a Genome Browser

This example builds a genome-browser-like visualization by importing existing
track specifications and stacking them vertically. The imported cytoband,
six-frame translation, BAM alignment, and gene annotation views can also be used
independently.

EXAMPLE examples/docs/examples/genomic-data/genome-browser.json height=600

!!! disclaimer ""

    This composed view uses the data sources described in the individual
    [cytoband](cytobands.md), [six-frame
    translation](indexed-fasta-six-frame-translation.md), [BAM
    alignment](bam-read-alignments.md), and [RefSeq gene
    annotation](refseq-genes.md) examples. See those pages for source details
    and applicable disclaimers.

## What to notice

The parent view supplies the genomic region and a shared x-axis for the whole
composition. Its view-level scale and axis properties take precedence over the
standalone defaults in the imported tracks, so the tracks remain aligned and
pan and zoom together.

Because the tracks are imported rather than copied, improvements to the
standalone visualizations are automatically available in the composed genome
browser.

## GenomeSpy Features

- [View imports](../../grammar/import.md) reuse complete visualization
  specifications as tracks.
- [`vconcat`](../../grammar/composition/concat.md) stacks the imported tracks
  vertically.
- [View-level scale properties](../../grammar/scale.md) set the shared genomic
  domain for the composition.
- [View-level axis properties](../../grammar/axis.md#resolution) place one
  shared x-axis above the tracks.
- [`resolve`](../../grammar/composition/index.md#scale-axis-and-legend-resolution)
  makes the x-axis shared across the imported tracks.
