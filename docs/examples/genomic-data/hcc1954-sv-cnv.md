# HCC1954 Structural Variants and Copy Number

This example combines somatic structural variants (SVs) and copy-number (CN)
segments from the highly rearranged HCC1954/HCC1954BL breast-cancer cell-line
pair. It uses PacBio HiFi results from the CASTLE tumour-normal dataset: the
Severus somatic calls consumed by Wakhan and the corresponding
haplotype-specific CN solution.

EXAMPLE examples/docs/examples/genomic-data/hcc1954-sv-cnv.json height=320 spechidden

!!! disclaimer ""

    The source data are publicly released CASTLE supplementary data on Zenodo.
    The selected Wakhan source record,
    [17780982](https://doi.org/10.5281/zenodo.17780982), and the compact Severus
    callset, [18989691](https://doi.org/10.5281/zenodo.18989691), are licensed CC
    BY 4.0. The example uses Wakhan's `4.57_0.99_0.9` rank-1 solution (DNA purity
    1.00, cell purity 0.99, ploidy 4.57, confidence 0.90).

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
it by increasing its stroke width and opacity. Short feet at the arc endpoints
point in the breakend strand direction and use the same variant-allele-frequency
stroke-width scale. The lower track shows Wakhan copy-number segments colored by
their total copy number divided by the selected ploidy estimate: pale grey
represents copy number near the genome-wide ploidy, while blue and red indicate
lower and higher relative copy number.

The initial view covers a dense chromosome 21-22 region with a
chromothripsis-like pattern of structural variants. Pan and zoom to inspect other
rearranged regions, including chromosome 8q and chromosome 5-8 events. The
tooltips expose detailed SV annotations, phased haplotype information, and
supporting-read counts directly from the VCF.

## GenomeSpy features

This example combines:

- An eager [`vcf`](../../grammar/data/eager.md#vcf) data source for parsing the
  compressed callset in the browser.
- A self-input [`lookup`](../../grammar/transform/lookup.md) to match BND records
  using their `MATE_ID` and `ID`.
- [`link`](../../grammar/mark/link.md) marks for intra- and interchromosomal SV arcs.
- [`regexFold`](../../grammar/transform/regex-fold.md) to generate endpoint paws
  from paired breakpoint columns.
- [`rule`](../../grammar/mark/rule.md) marks with a pixel-valued
  [`xOffset`](../../grammar/mark/index.md#offset-channels) scale for
  strand-directed endpoint feet.
- A shared [`locus`](../../grammar/scale.md#locus-scale) x-scale to keep SV and
  CN positions aligned across vertically concatenated tracks.
- Conditional encodings and a point selection to emphasize the hovered arc.

## Data wrangling

The upper track reads the compressed Severus VCF directly. There is no separate
SV-to-TSV preprocessing step: the GenomeSpy dataflow parses the VCF and prepares
the link records in the browser:

1. Keep passing `DEL`, `DUP`, and `BND` records on canonical chromosomes.
2. Assign source-order numbers and derive a lookup key. A self-input lookup
   matches each BND's `MATE_ID` to the corresponding record's `ID`.
3. Keep one record from each BND pair. Use its mate's `CHROM` and `POS` for the
   second endpoint; deletions and duplications use their own `INFO.END`.
4. Derive the common endpoint and strand fields used by the link and breakpoint
   layers. `regexFold` then turns the two endpoints into breakpoint-marker rows.

Insertions and single-ended breakends are omitted because they do not form
two-ended arcs. VCF `INFO`, sample, and genotype fields remain available for
encodings and tooltips throughout the dataflow.

The CN track does use preprocessing: Wakhan's source segments were converted into
the TSV loaded by the example. Their one-based inclusive boundaries became
GenomeSpy's zero-based half-open intervals by subtracting one from `start` and
retaining `end`. The two haplotype segmentations were synchronized, then their
integer copy numbers were summed and divided by the selected ploidy (4.57) for
the color encoding. This ratio is a visual normalization of reconstructed
absolute CN, not a measured tumour-versus-normal log ratio.
