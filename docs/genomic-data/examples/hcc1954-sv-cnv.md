# HCC1954 Structural Variants and Copy Number

This example combines somatic structural variants (SVs) and copy-number (CN)
segments from the highly rearranged HCC1954/HCC1954BL breast-cancer cell-line
pair. It uses PacBio HiFi results from the CASTLE tumour-normal dataset: the
exact Severus somatic calls consumed by Wakhan, and Wakhan's rank-1
haplotype-specific CN solution.

EXAMPLE examples/docs/genomic-data/examples/hcc1954-sv-cnv.json height=320 spechidden

!!! disclaimer ""

    The example TSV files are derived from publicly released CASTLE supplementary
    data on Zenodo. The selected Wakhan source record, [17780982](https://doi.org/10.5281/zenodo.17780982),
    and the inspected compact Severus callset, [18989691](https://doi.org/10.5281/zenodo.18989691),
    are licensed CC BY 4.0. The example uses Wakhan's `4.57_0.99_0.9` rank-1
    solution (DNA purity 1.00, cell purity 0.99, ploidy 4.57, confidence 0.90).

    Source attribution: Keskus et al., [Severus detects somatic structural
    variation and complex rearrangements in cancer genomes using long-read
    sequencing](https://doi.org/10.1038/s41587-025-02618-8), *Nature
    Biotechnology* 44, 247-257 (2026); Ahmad et al., [Wakhan: reconstruction
    of chromosome-scale copy number profiles of tumor genomes with long-read
    sequencing](https://doi.org/10.64898/2025.12.11.25342098); and Akdemir et al.,
    [Disruption of chromatin folding domains by somatic genomic rearrangements
    in human cancer](https://doi.org/10.1038/s41588-019-0564-y).

## What to notice

The upper track shows paired Severus breakends, deletions, and duplications.
Arc stroke width encodes variant allele frequency. Hovering an arc emphasizes
it by increasing its stroke width and opacity. The lower track shows Wakhan
copy-number segments colored by their total copy number divided by the selected
ploidy estimate: pale grey represents copy number near the genome-wide ploidy,
while blue and red indicate lower and higher relative copy number.

The initial view covers a dense chromosome 21-22 region with a
chromothripsis-like pattern of structural variants. Pan and zoom to inspect other
rearranged regions, including chromosome 8q and chromosome 5-8 events. The
source tables retain detailed SV annotations, phased haplotype information,
supporting-read counts, and the two haplotype-specific absolute CN states, which
are shown in tooltips.

## GenomeSpy features

This example combines:

- [`link`](../../grammar/mark/link.md) marks for intra- and interchromosomal SV arcs.
- [`regexFold`](../../grammar/transform/regex-fold.md) to generate endpoint paws
  from paired breakpoint columns.
- A shared [`locus`](../../grammar/scale.md#locus-scale) x-scale to keep SV and
  CN positions aligned across vertically concatenated tracks.
- Conditional encodings and a point selection to emphasize the hovered arc.

## Data wrangling

The example uses the Severus VCF that was consumed by the selected Wakhan run,
rather than a separately released SV callset. BND mates are paired with
`MATE_ID`; insertions and single-ended breakends are omitted because they cannot
form two-ended arcs. Each displayed SV endpoint is converted to a zero-based
interbase breakpoint boundary, matching Wakhan's CN-segment boundaries.

Wakhan's source segments use one-based inclusive boundaries. They are converted
to GenomeSpy's zero-based half-open intervals by subtracting one from `start`
and retaining `end`. The two haplotype segmentations are synchronized, then
their integer copy numbers are summed and divided by the selected ploidy (4.57)
for the color encoding. This ratio is a visual normalization of reconstructed
absolute CN, not a measured tumour-versus-normal log ratio.
