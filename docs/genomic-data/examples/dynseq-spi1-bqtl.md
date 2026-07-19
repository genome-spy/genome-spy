# SPI1 Binding-QTL Dynseq Track

This example compares base-resolution sequence contribution scores for the
reference C and alternate G alleles of the SPI1 binding QTL rs5764238 in
GM12878. Letter height represents the projected DeepSHAP contribution score
from the SPI1 ChIP-seq BPNet model; negative scores extend below zero. It
recreates the reference-versus-alternate SPI1 ChIP plot in the
[dynseq SPI1 bQTL notebook](https://github.com/kundajelab/dynseq-paper/blob/main/SPI1_bQTL/SPI1_bQTL_recreate.ipynb).

EXAMPLE examples/docs/genomic-data/examples/dynseq-spi1-bqtl.json height=285 spechidden

!!! disclaimer ""

    The visualization loads the original `chip_imp_ref.bw` and `chip_imp_alt.bw`
    directly from the pinned [dynseq-paper source revision](https://github.com/kundajelab/dynseq-paper/tree/febc9180d72e92302d35c549002e0d56c79c536e/SPI1_bQTL/bigwigs).
    The score values and missing-value gaps are not modified. The Zenodo source
    data are distributed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

    Source attribution: [dynseq tracks data, Zenodo record 6582100](https://doi.org/10.5281/zenodo.6582100);
    Nair et al., [The dynseq browser track shows context-specific features at
    nucleotide resolution](https://doi.org/10.1038/s41588-022-01194-w), *Nature
    Genetics* 54, 1581–1583 (2022); and Tehranchi et al., [Pooled ChIP-Seq Links
    Variation in Transcription Factor Binding to Complex Disease Risk](https://doi.org/10.1016/j.cell.2016.03.041),
    *Cell* 165, 730–741 (2016).

## What to notice

The reference bases come from a lazy indexed hg38 FASTA source and are expanded
to uppercase, base-level rows once for both tracks. Each allele-track template
then loads its corresponding BigWig and uses `coordinateLookup` to join scores
to those bases. The alternate track displays G at rs5764238. The initial 110 bp
view focuses on the variant and motif. You can pan or zoom out across the full
2,114 bp score window.

## GenomeSpy Features

This example combines:

- [Lazy data sources](../../grammar/data/lazy.md) for indexed FASTA and BigWig.
- [`coordinateLookup`](../../grammar/transform/coordinate-lookup.md) to match
  base positions to BigWig score positions.
- [`flattenSequence`](../../grammar/transform/flatten-sequence.md) to expand
  reference-sequence chunks to base-level rows.
- [`text`](../../grammar/mark/text.md) marks with `logoLetters` to scale base
  characters between zero and their signed contribution scores.
