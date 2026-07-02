# Indexed FASTA Sequence Track

This example shows how to render reference bases from an indexed FASTA file.
GenomeSpy fetches sequence chunks only for the visible genomic region, splits
the sequence into individual bases, and draws each nucleotide as a colored
rectangle with a text label.

EXAMPLE examples/docs/genomic-data/examples/indexed-fasta-sequence-track.json height=60 spechidden

!!! disclaimer ""

    The visualization uses a mirrored, indexed copy of UCSC's hg38 / GRCh38
    reference FASTA from
    [goldenPath/hg38/bigZips/latest/hg38.fa.gz](https://hgdownload.soe.ucsc.edu/goldenPath/hg38/bigZips/latest/hg38.fa.gz).
    UCSC states that its downloadable data files and database tables are freely
    available for public and commercial use, subject to any upstream
    restrictions noted for the original assembly data.

## What to notice

The example is zoomed to a short chr7 interval so individual bases fit on the
screen. The `indexedFasta` source returns sequence chunks with chromosome,
start, and sequence fields. The spec then expands each chunk into base-level
rows and computes each base-pair position before encoding the result on a
`locus` scale.

The rectangle layer provides a compact color-coded sequence overview, while the
[text](../../grammar/mark/text.md) layer uses ranged text to fit the base
letters inside the rectangles at close zoom levels. Both layers use the same
base-level rows, keeping labels and colored cells aligned during pan and zoom.

## GenomeSpy Features

This example combines several GenomeSpy capabilities in one compact track:

- [Lazy data sources](../../grammar/data/lazy.md) load reference sequence only
  for the visible region.
- [`flattenSequence`](../../grammar/transform/flatten-sequence.md) expands each
  FASTA sequence chunk into one row per base.
- [`formula`](../../grammar/transform/formula.md) converts chunk-relative base
  offsets into genomic positions.
- The [`locus` scale](../../grammar/scale.md#locus-scale) places bases by
  chromosome and position.
- [`layer`](../../grammar/composition/layer.md) combines nucleotide rectangles
  with readable base labels.
- [`text`](../../grammar/mark/text.md) uses ranged placement to fit nucleotide
  letters inside each base-pair rectangle.
