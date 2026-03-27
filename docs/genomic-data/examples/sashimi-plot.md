# Sashimi Plot from Splice Junctions

Sashimi plots, introduced by Katz et al. in [Quantitative visualization of
alternative exon expression from RNA-seq
data](https://pmc.ncbi.nlm.nih.gov/articles/PMC4542614/), summarize exon
coverage as read-density tracks and splice-junction support as arcs. This
example recreates [igv.js](https://github.com/igvteam/igv.js/)'s
[splice-junction
example](https://igv.org/web/release/3.8.0/examples/spliceJunctions.html) with
the same data, but uses GenomeSpy's declarative grammar to control filtering,
arc geometry and style, and label placement.

EXAMPLE examples/docs/genomic-data/examples/sashimi-plot.json height=220 spechidden

!!! disclaimer ""

    The example is based on igv.js's splice-junction sample data for chr15. The
    source files are hosted in IGV's data repository, and the original demo is
    available here: [splice junction example](https://igv.org/web/release/3.8.0/examples/spliceJunctions.html).

## What to notice

The height of each arc is derived from junction span, which is also used for
label placement. The arc stroke thickness and label text encode uniquely mapped
reads. A deterministic jitter term spreads labels and nudges arc heights to make
overlap more unlikely. The junction layer uses an `ExprRef`-driven y-scale
domain that depends on the current x-domain; zooming horizontally also changes
the shared arc-and-label heights and label positions, while the coverage track
stays independent.

## GenomeSpy Features

This example combines several GenomeSpy capabilities in one spec:

- [Lazy data sources](../../grammar/data/lazy.md) load the coverage track from a
  BigWig file.
- [Parameters](../../grammar/parameters.md) bind the minimum uniquely mapped
  reads threshold to a slider.
- [`filter`](../../grammar/transform/filter.md) removes low-support junctions.
- [`formula`](../../grammar/transform/formula.md) derives junction span and the
  adjusted arc height and deterministic label jitter.
- [`link`](../../grammar/mark/link.md) draws the dome-shaped splice arcs.
- [`text`](../../grammar/mark/text.md) labels the arcs with their junction
  scores.
- [`ExprRef`](../../grammar/types.md#exprref) expressions use the
  [scale functions](../../grammar/expressions.md#scale-functions) to couple the
  junction y-scale domain to the current x-domain, which keeps the shared arc
  height and label placement proportional to the visible genomic window.
- [`layer`](../../grammar/composition/layer.md) stacks the coverage and
  junction tracks while [`resolve`](../../grammar/composition/index.md#scale-and-axis-resolution)
  keeps the coverage y scale independent from the junction-layer y scale.
