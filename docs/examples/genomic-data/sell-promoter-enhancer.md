# SELL Promoter–Enhancer Contact

Rao et al. identified a chromatin loop connecting the _SELL_ promoter to an
enhancer about 105 kb away in GM12878 lymphoblastoid cells. The rotated Hi-C map
shows this contact and two nearby loops. Histone ChIP-seq signals and gene
annotations share the genomic axis, so you can see which features lie near each
end of a contact. [Rao et al. (2014), Figure 5](https://pmc.ncbi.nlm.nih.gov/articles/PMC5635824/#F5)

EXAMPLE examples/docs/examples/genomic-data/sell-promoter-enhancer.json height=480 spechidden

!!! disclaimer ""

    The hg19 Hi-C map uses GM12878 DpnII data from Rao et al. and the Aiden lab.
    The file was rebuilt for this GenomeSpy example with only intrachromosomal
    contacts and recalculated normalization, following the [dataset recipe](https://github.com/genome-spy/genomespy-dataset-recipes/tree/main/recipes/geo-gm12878-dpnii-hic).
    Source records are in [GEO GSE63525](https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GSE63525)
    and [ENCODE ENCSR968KAY](https://www.encodeproject.org/experiments/ENCSR968KAY/).

    SELL and SELP–FIRRM come from the [combined GM12878 loop list](https://ftp.ncbi.nlm.nih.gov/geo/series/GSE63nnn/GSE63525/suppl/GSE63525_GM12878_primary%2Breplicate_HiCCUPS_looplist.txt.gz).
    SLC19A2–F5 comes from the [replicate loop list](https://ftp.ncbi.nlm.nih.gov/geo/series/GSE63nnn/GSE63525/suppl/GSE63525_GM12878_replicate_HiCCUPS_looplist.txt.gz).

    Histone signals use [ENCODE/Broad GM12878 BigWigs](https://hgdownload.soe.ucsc.edu/goldenPath/hg19/encodeDCC/wgEncodeBroadHistone/),
    including the V2 signal file for [H3K4me1](https://www.encodeproject.org/experiments/ENCSR000AKF/).
    Gene spans come from [hg19 RefSeq](https://genome.ucsc.edu/cgi-bin/hgTrackUi?db=hg19&g=ncbiRefSeq).

## What to notice

Click the **SELL** marker or label to keep its anchor guides visible. Follow the
left guide to the distal enhancer region, where H3K4me1 signal is visible. The
right guide falls near the _SELL_ promoter and an H3K4me3 peak. Each histone
track has its own vertical scale.

With SELL selected, hover over another marker or label to compare its anchors.
The higher marker for SELP–FIRRM reflects a longer genomic span, about 210 kb
compared with 105 kb for SELL and 70 kb for SLC19A2–F5. Click elsewhere in the
contact map to clear the selection.

The authors pooled nine GM12878 experiments for their main map, yielding about
4.9 billion contacts and reaching about 1 kb resolution. The DpnII map shown here
has lower sequencing coverage and bins of 5 kb or larger, so the annotated
contacts can be harder to distinguish from neighboring bins.

Pan and zoom along chromosome 1 to inspect the region. The label in the lower
right reports the loaded bin size.

## GenomeSpy Features

- A [lazy Juicer source](../../grammar/data/lazy.md#juicer-hic) streams the stored
  resolutions into a [`raster` mark](../../grammar/mark/raster.md).
- A shared [triangle projection](../../grammar/projection.md) places the raster,
  guides, points, and labels from their matrix coordinates.
- [Point selections](../../grammar/parameters.md#point-selection) connect
  contact markers and labels to [annotations spanning the lower
  tracks](../../grammar/composition/concat.md#track-annotations).
- [`displace2d`](../../grammar/transform/displace2d.md) separates contact labels
  around their projected anchors as you zoom.
- [Lazy BigWig sources](../../grammar/data/lazy.md#bigwig) fetch the signal tracks
  for the visible region.
- [`pileup`](../../grammar/transform/pileup.md) uses the measured gene symbols
  and gene spans to add rows inside a [scrollable
  viewport](../../grammar/composition/concat.md#scrollable-viewports).
- [`vconcat`](../../grammar/composition/concat.md) aligns the map, signals, and
  gene annotations on one [view-level locus scale](../../grammar/scale.md).
