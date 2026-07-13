# Multiple Sequence Alignment

This example visualizes the `16SRNA_Deino_87seq.aln` nucleotide alignment used
in the [NCBI Multiple Sequence Alignment Viewer
tutorial](https://www.ncbi.nlm.nih.gov/tools/msaviewer/tutorial1/). The top
track is a sequence logo that summarizes the bases and information content at
each alignment position. The lower track shows the aligned bases for each
sequence, with zoom-dependent labels.

EXAMPLE examples/docs/genomic-data/examples/msa.json height=400 spechidden

!!! disclaimer ""

    The alignment file `16SRNA_Deino_87seq.aln` is identified by the NCBI
    tutorial and is available from the
    [NCBI FTP server](ftp://ftp.ncbi.nlm.nih.gov/toolbox/gbench/samples/16SRNA_Deino_87seq.aln).
    NCBI states that it places no restrictions on the use or distribution of
    molecular data in its databases, but original submitters may claim
    intellectual-property rights in submitted data. This dataset is used here for
    demonstration and visualization purposes.

## What to notice

The sequence logo encodes the frequency of each base in a column and uses the
stack transform's information-content offset to make conserved positions taller.
Its multiscale overview includes colored rectangles behind the logo letters;
those rectangles fade out as the view reaches base-level detail. Gap characters
are omitted from the logo letters but still affect the information content
calculation. The lower alignment track preserves one row per input sequence and
colors bases and gaps separately.

The initial view focuses on alignment positions 190–230. Pan and zoom to move
through the full alignment. At higher zoom levels, the base letters fit inside
their position bands and become readable; at lower zoom levels, the colored
rectangles provide a compact overview.

## GenomeSpy Features

This example combines several GenomeSpy capabilities in one alignment view:

- [FASTA data](../../grammar/data/eager.md#fasta) loads the aligned sequences
  with their identifiers.
- [`flattenSequence`](../../grammar/transform/flatten-sequence.md) expands
  each sequence into one row per aligned position.
- [`aggregate`](../../grammar/transform/aggregate.md),
  [`formula`](../../grammar/transform/formula.md), and
  [`stack`](../../grammar/transform/stack.md) count bases and prepare the
  sequence-logo layout.
- [`multiscale`](../../grammar/composition/multiscale.md) cross-fades the
  sequence-logo overview and detail levels according to units per pixel.
- [`text`](../../grammar/mark/text.md) uses `logoLetters` and `fitToBand` to
  render bases inside their stacked or aligned position bands.
- [`vconcat`](../../grammar/composition/concat.md) keeps the information logo
  and sequence alignment in separate tracks while sharing the x scale.
