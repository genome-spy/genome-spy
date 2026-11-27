# SELL Promoter–Enhancer Contact

Rao et al. identified a chromatin loop in GM12878 lymphoblastoid cells between
the _SELL_ promoter and a distal enhancer about 105 kb away. This example
shows that contact and two nearby loops in a rotated Hi-C map alongside
histone ChIP-seq tracks and gene annotations. [Rao et al. (2014), Figure 5](https://pmc.ncbi.nlm.nih.gov/articles/PMC5635824/#F5)

EXAMPLE examples/docs/examples/genomic-data/sell-promoter-enhancer.json height=480 spechidden

!!! disclaimer ""

    The hg19 contact map uses the GM12878 DpnII data from Rao et al. and the
    Aiden lab. GenomeSpy rebuilt the Juicer file with intrachromosomal contacts
    and recalculated normalization. [GEO GSE63525](https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GSE63525) ·
    [ENCODE ENCSR968KAY](https://www.encodeproject.org/experiments/ENCSR968KAY/) ·
    [File accessions and provenance](https://data.genomespy.app/datasets/geo-gm12878-dpnii-hic/v1/provenance.json)

    H3K4me1 and H3K4me3 signals come from the ENCODE/Broad Institute BigWigs for
    GM12878, served by UCSC. The H3K4me1 track uses the V2 signal file. The gene
    track shows the spans of six selected hg19 RefSeq transcripts (NM_006996.3,
    NM_000130.5, NM_003005.4, NM_000655.5, NM_000450.2, and NM_001320047.2).
    [H3K4me1 experiment ENCSR000AKF](https://www.encodeproject.org/experiments/ENCSR000AKF/) ·
    [ENCODE Broad Histone files](https://hgdownload.soe.ucsc.edu/goldenPath/hg19/encodeDCC/wgEncodeBroadHistone/) ·
    [UCSC RefSeq track](https://genome.ucsc.edu/cgi-bin/hgTrackUi?db=hg19&g=ncbiRefSeq)

## What to notice

The dashed guides trace each contact to its two anchors. The three heights
reflect spans of about 70 kb for SLC19A2–F5, 105 kb for the SELL contact, and
210 kb for SELP–FIRRM. SELL and SELP–FIRRM come from the combined GM12878 loop
list. SLC19A2–F5 comes from the replicate list.
[Combined loop list](https://ftp.ncbi.nlm.nih.gov/geo/series/GSE63nnn/GSE63525/suppl/GSE63525_GM12878_primary%2Breplicate_HiCCUPS_looplist.txt.gz) ·
[Replicate loop list](https://ftp.ncbi.nlm.nih.gov/geo/series/GSE63nnn/GSE63525/suppl/GSE63525_GM12878_replicate_HiCCUPS_looplist.txt.gz)

The authors pooled nine GM12878 experiments for their main map, yielding about
4.9 billion contacts. In the DpnII map shown here, sequencing coverage is lower
and the marked contacts can look similar to neighboring bins.

H3K4me1 signal is visible near the distal anchor on the left and in the _SELL_
gene body. H3K4me3 peaks near the _SELL_ promoter on the right. Each signal track
has its own vertical scale.

Pan or zoom along the shared chromosome 1 axis to inspect the signal peaks
and neighboring contacts. The bin size in the lower right shows the loaded
matrix resolution. Hover over a heatmap cell to read its contact value and
genomic bins.

## GenomeSpy Features

- A [lazy Juicer source](../../grammar/data/lazy.md#juicer-hic) streams the stored
  resolutions into a [`raster` mark](../../grammar/mark/raster.md).
- A shared [triangle projection](../../grammar/projection.md) places the raster,
  guides, points, and labels from the same matrix coordinates.
- [`displace2d`](../../grammar/transform/displace2d.md) separates contact labels
  around their projected anchors as you zoom.
- [Lazy BigWig sources](../../grammar/data/lazy.md#bigwig) fetch the signal tracks
  for the visible region.
- [`pileup`](../../grammar/transform/pileup.md) uses the measured gene symbols
  and gene spans to add rows as needed. Scroll the gene track to see rows
  beyond the first two.
- [`vconcat`](../../grammar/composition/concat.md) aligns the map, signals, and
  gene annotations on one [view-level locus scale](../../grammar/scale.md).
