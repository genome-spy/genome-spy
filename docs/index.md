# Introduction

![Logo](./img/do-it-swiftly.svg){ align=right }

GenomeSpy is a toolkit for interactive visualization of genomic and other data.
It provides a declarative [grammar](grammar/index.md) for mapping data to visual
channels, such as position and color, and for composing complex visualizations
from primitive graphical marks, such as [points](grammar/mark/point.md) and
[rectangles](grammar/mark/rect.md). The grammar is heavily inspired by
[Vega-Lite](https://vega.github.io/vega-lite/), with partial compatibility and
extensions for genome visualization.

Visualizations are rendered with a carefully crafted WebGL-based engine, which
enables fluid interaction and smooth animation for datasets with several
million data points. This performance comes from using GPU
[shader](https://en.wikipedia.org/wiki/Shader) programs for all
[scale](grammar/scale.md) transformations and mark rendering, but shaders are
an implementation detail hidden from end users.

The toolkit comprises two JavaScript packages:

1. The [**core**](grammar/index.md) library implements the visualization grammar
   and rendering engine and can be embedded in web pages or applications.
2. The [**app**](sample-collections/index.md) builds on the core library for
   interactive analysis of large sample collections, such as cancer cohorts. It
   repeats a visualization across samples and adds tools for filtering, sorting,
   grouping, and exploring metadata.

Check the [Getting Started](getting-started.md) page to get started with
GenomeSpy and make your own tailored visualizations.

## Genomic examples

GenomeSpy includes practical examples for common genomic visualization tasks:

- [Chromosome Ideogram from Cytobands](genomic-data/examples/cytobands.md)
  shows a compact ideogram built from UCSC cytoband intervals.
- [RefSeq Gene Annotations with Scored Labels](genomic-data/examples/refseq-genes.md)
  shows transcript structure, exon intervals, and dynamically fitted gene
  labels.
- [ClinVar Small-Variant Classifications](genomic-data/examples/clinvar-variants.md)
  shows ClinVar VCF variants colored by germline classification.
- [ASCAT Copy-Number Segmentation](genomic-data/examples/ascat.md) combines
  copy-number, LogR, BAF, ideogram, and gene annotation tracks.
- [Sashimi Plot from Splice Junctions](genomic-data/examples/sashimi-plot.md)
  combines BigWig coverage with splice-junction arcs.

See [Genomic Data Examples](genomic-data/examples/index.md) for the full list.

## Minimal interactive example

The example below introduces basic grammar concepts such as data transforms,
encodings, marks, and interactive zooming. You can zoom in using the mouse
wheel.

EXAMPLE examples/docs/index/interactive-overview.json

## About

GenomeSpy is developed by [Kari Lavikka](https://twitter.com/KariLavikka) in
[The Systems Biology of Drug Resistance in Cancer
group](https://www.helsinki.fi/en/researchgroups/systems-biology-of-drug-resistance-in-cancer)
at the [University of Helsinki](https://helsinki.fi/).

This project has received funding from the European Union's Horizon 2020
Research and Innovation Programme under Grant agreement No. 667403 (HERCULES)
and No. 965193 (DECIDER)
