# Chromosome Ideogram from Cytobands

This example shows a chromosome ideogram built from UCSC cytoband data. The
rectangles encode band intervals and staining categories, the labels use
[ranged text](../../grammar/mark/text.md#ranged-text) to squeeze band names into
the available space, and dashed separators mark chromosome boundaries.

The spec loads UCSC's gzipped cytoband file directly. Because the file has no
header line, the TSV columns are declared explicitly.

EXAMPLE examples/docs/genomic-data/examples/cytobands.json height=60 spechidden

!!! disclaimer ""

    The visualization uses a mirrored copy of UCSC's hg38 cytoband track,
    distributed as
    [cytoBand.txt.gz](https://hgdownload.soe.ucsc.edu/goldenPath/hg38/database/cytoBand.txt.gz).
    UCSC states that its downloadable data files and database tables are freely
    available for public and commercial use.

## What to notice

The ideogram has three layers:

- Background rectangles for cytobands
- Text labels for band names
- Dashed rules between chromosomes

The cytoband labels inherit the same genomic intervals as the rectangles, so
GenomeSpy can hide labels that do not fit in the available width. A filter
removes unlocalized and unplaced scaffolds so the track stays focused on primary
chromosomes.

### Data and Encoding

The cytoband file contains one row per band with chromosome, start, end, band
name, and `gieStain` category. The genomic interval is encoded with `x` and
`x2`, and the same interval is reused by both the rectangle and text layers.
This keeps the band shape and label placement aligned during pan and zoom.

The `gieStain` field drives the band colors. The rectangle layer maps staining
categories to grayscale, red centromere, green stalk, and black variable
regions. The text layer uses a separate color scale for the same categories so
labels stay readable on dark bands.

## GenomeSpy Features

This example combines several GenomeSpy capabilities in one compact track:

- The [`locus` scale](../../grammar/scale.md#locus-scale) maps chromosome names
  and base-pair positions onto a continuous genomic axis.
- [`layer`](../../grammar/composition/layer.md) combines the cytoband
  rectangles, labels, and chromosome separators.
- [`text`](../../grammar/mark/text.md#ranged-text) labels use ranged text
  placement because they inherit both `x` and `x2`.
- [`filter`](../../grammar/transform/filter.md) removes scaffolds whose names
  contain underscores.
- Independent color scales let the background rectangles and foreground labels
  use different color ranges for the same `gieStain` categories.
