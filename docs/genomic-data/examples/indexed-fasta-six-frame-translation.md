# Indexed FASTA Six-Frame Translation

This example translates the visible reference sequence in all three reading
frames on both strands. A reference sequence track sits above the six
translation lanes.

EXAMPLE examples/docs/genomic-data/examples/indexed-fasta-six-frame-translation.json height=170 spechidden

!!! disclaimer ""

    The visualization uses a mirrored, indexed copy of UCSC's hg38 / GRCh38
    reference FASTA from
    [goldenPath/hg38/bigZips/latest/hg38.fa.gz](https://hgdownload.soe.ucsc.edu/goldenPath/hg38/bigZips/latest/hg38.fa.gz).
    UCSC states that its downloadable data files and database tables are freely
    available for public and commercial use, subject to any upstream
    restrictions noted for the original assembly data.

## What to notice

The `indexedFasta` source returns lazily loaded sequence chunks for the visible
region. These chunks are expanded into base-level rows with absolute genomic
coordinates. The concatenated reference and translation views inherit those
rows, so the two tracks remain aligned while panning.

The translation view uppercases bases, looks up nucleotide complements, and
uses four `window` `lead` operations to gather the following two bases and
complements. Rows without two following bases are removed before translation,
so a chunk's final two bases never form partial codons.

The forward and reverse views each assemble a codon and look up its amino acid
in the standard genetic code. Reverse codons concatenate the three complements
in reverse order. Their lanes use the absolute genomic position modulo three,
which keeps reading-frame assignments stable even when a lazy reload begins at
a different position.

Start codons are green and stop codons are red. The amino-acid blocks use
notched arrows with white outlines and 65-degree heads; their labels are placed
over the three-base spans.

## GenomeSpy Features

This example combines several GenomeSpy capabilities in one track:

- [Lazy data sources](../../grammar/data/lazy.md) load reference sequence only
  for the visible region.
- [`flattenSequence`](../../grammar/transform/flatten-sequence.md) and
  [`formula`](../../grammar/transform/formula.md) turn sequence chunks into
  base-level genomic rows.
- [`lookup`](../../grammar/transform/lookup.md) maps nucleotide complements and
  codons through root-level lookup tables.
- [`window`](../../grammar/transform/window.md) uses sorted `lead` values to
  create overlapping three-base windows without sequence-specific logic.
- [Named templates](../../grammar/import.md#repeating-with-named-templates)
  define the shared translation track, with each import supplying its strand.
- [`vconcat`](../../grammar/composition/concat.md) keeps the reference sequence
  and translation tracks separate while sharing their x scale.
- [`arrow`](../../grammar/mark/arrow.md) marks show the forward and reverse
  reading directions for each amino-acid block.
