# BAM Read Alignments

This example shows an IGV-like BAM alignment view built from GenomeSpy grammar
building blocks. It combines depth coverage, mismatch and insertion support,
read pileup, read direction, CIGAR operation overlays, per-read mismatch bases,
and zoom-dependent lazy loading.

EXAMPLE examples/docs/genomic-data/examples/bam-read-alignments.json height=600 spechidden

!!! disclaimer ""

    The example uses a small BAM slice derived from public Genome in a Bottle /
    NIST HG002 (NA24385) Illumina 300x whole-genome alignments. The slice covers
    `chr20:9950000-10100000` on GRCh38 and is downsampled for browser-based
    visualization. It is intended only as a visualization demo, not for clinical
    interpretation, diagnostic decisions, variant calling, biological
    inference, benchmarking, genealogy, or re-identification.

    Source attribution: Genome in a Bottle / NIST HG002 (NA24385) data, and
    Zook, J.M. et al. Extensive sequencing of seven human genomes to
    characterize benchmark reference materials. *Scientific Data* 3, 160025
    (2016).
    <https://doi.org/10.1038/sdata.2016.25>

## What to notice

The top track summarizes read depth from aligned CIGAR blocks and stacks
MD-derived mismatch support by alternate base. Insertions are summarized with
vertical rules because they are anchored between reference bases and have zero
reference width.

The read pileup uses arrow marks for strand direction and opacity for mapping
quality. The mapping-quality slider filters low-confidence alignments.
CIGAR-derived overlays mark deletions, skipped regions, insertions, and
soft-clipped ends.

Mismatching bases are extracted from MD tags and rendered as colored ranged
rectangles with base letters on top. Their opacity follows base quality, and the
base-quality slider can hide low-quality mismatch evidence. When the visible
region is wider than the configured BAM loading window, the read track fades in
a zoom-in message.

## GenomeSpy Features

This example combines several GenomeSpy capabilities in one alignment view:

- [Lazy data sources](../../grammar/data/lazy.md) load BAM alignments only for
  the visible region. The BAM loading window is controlled by an
  [`ExprRef`](../../grammar/types.md#exprref) so the same parameter can drive
  the zoom message.
- [Parameters](../../grammar/parameters.md) bind mapping-quality and
  base-quality thresholds to sliders.
- [`pileup`](../../grammar/transform/pileup.md) assigns reads to non-overlapping
  lanes.
- [`flattenCigar`](../../grammar/transform/flatten-cigar.md) expands CIGAR
  strings into operation rows for coverage and read overlays.
- [`alignmentMismatches`](../../grammar/transform/alignment-mismatches.md)
  extracts sparse mismatch rows from the read sequence, CIGAR string, and MD
  tag.
- [`coverage`](../../grammar/transform/coverage.md),
  [`aggregate`](../../grammar/transform/aggregate.md), and
  [`stack`](../../grammar/transform/stack.md) summarize depth and mismatch
  support.
- [`formula`](../../grammar/transform/formula.md) derives helper fields for
  mapping-quality and base-quality opacity.
- [`layer`](../../grammar/composition/layer.md) composes coverage, insertion
  summaries, read bodies, CIGAR annotations, and mismatch labels while keeping
  color and opacity scales independent where needed.
