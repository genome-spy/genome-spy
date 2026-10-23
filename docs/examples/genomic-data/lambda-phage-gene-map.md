# Lambda Phage Gene Map

This example recreates a [gbdraw](https://github.com/satoshikawato/gbdraw)
lambda phage plot using GenomeSpy's declarative grammar. Forward and reverse
coding sequences appear on opposite sides of the genome backbone, with
underlined product labels connected to their gene midpoints.

EXAMPLE examples/docs/examples/genomic-data/lambda-phage-gene-map.json height=450 spechidden

!!! disclaimer ""

    Data: NCBI/NLM RefSeq
    [NC_001416.1](https://www.ncbi.nlm.nih.gov/nuccore/NC_001416.1)
    (GenBank snapshot, 2023-01-11). The
    [preparation recipe](https://github.com/genome-spy/genomespy-dataset-recipes/tree/7e143f47849d977d83cb124fa896ca171b7f8046/recipes/refseq-lambda-phage-cds/)
    mirrors all 73 CDS features as zero-based, half-open intervals, preserving
    strands, product names, and overlaps; sequences and translations are omitted.
    Reuse follows
    [NCBI's molecular data usage policy and disclaimer](https://www.ncbi.nlm.nih.gov/About/disclaimer.html),
    including rights asserted by submitters.

## What to notice

The initial view spans 5,000–32,000 bp. Zooming and panning reveal the rest of
the 48,502 bp reference genome. Arrowheads stay inside their intervals, so
genuine overlaps between adjacent genes remain visible. Hovering a gene shows
its product, identifiers, strand, and source coordinates.

Label placement responds to the visible region and plot width. The spec
measures product names, clamps their text bounds to the viewport, and uses
`pileup` spacing to leave eight pixels between labels. Sorting those
intervals by their left edge, gene midpoint, and locus tag keeps labels in a
stable order when several become flush with the viewport edge.

Vertical concatenation separates the label and arrow tracks while sharing the
genomic x scale. A non-zoomable index y scale gives label lanes 20-pixel steps;
a band scale places arrows in two strand rows. The label viewport fills the
remaining container height above the arrows.

Bottom anchoring keeps the lowest labels next to the arrows, including when
the labels need less space than the viewport. When labels overflow, scroll
vertically to inspect higher lanes. Changes in the lane count or viewport size
preserve the scroll distance from the bottom, keeping the arrow track steady
while navigating.

White rectangles interrupt leaders that pass through another label. Short
connectors restore each label's own leader below its underline. Vertical rules
clip only horizontally so leaders meet across the track boundary.

## GenomeSpy Features

- An [`index` scale](../../grammar/scale.md#index-scale) aligns gene intervals
  and label anchors while allowing zooming across the full reference.
- [`arrow`](../../grammar/mark/arrow.md) marks encode genomic intervals and
  strand direction.
- [`measureText`](../../grammar/transform/measure-text.md) supplies label
  widths in pixels.
- [`collect`](../../grammar/transform/collect.md) caches text measurements
  before viewport-dependent calculations and sorts occupied label intervals.
- [`pileup`](../../grammar/transform/pileup.md) assigns non-overlapping label
  lanes using pixel intervals and separate spacing.
- [`vconcat`](../../grammar/composition/concat.md) separates the label and arrow
  tracks, while [`layer`](../../grammar/composition/layer.md) combines marks
  within each track.
- A [scrollable viewport](../../grammar/composition/concat.md#scrollable-viewports)
  with `anchor: "end"` keeps the label track aligned to its bottom edge.
