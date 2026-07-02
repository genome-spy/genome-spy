# GENCODE Gene Annotations from GFF3

This example displays the human GENCODE release 43 comprehensive gene
annotation dataset for GRCh38.p13. It loads transcript annotations from a
tabix-indexed GFF3 file and renders transcript bodies, exons, UTR/CDS
intervals, and transcript labels in packed lanes.

EXAMPLE examples/docs/genomic-data/examples/gff3-gene-annotations.json height=360 spechidden

!!! disclaimer ""

    The visualization uses a sorted and bgzip-compressed copy of the GENCODE
    human [release 43 (GRCh38.p13) comprehensive gene annotation
    GFF3](https://www.gencodegenes.org/human/release_43.html). GENCODE states
    that all project data are open access.

## What to notice

The source data are hierarchical: each gene contains transcript features, and
each transcript contains child features such as exons, UTRs, and coding
sequence intervals. The spec flattens and projects these nested fields into
track-friendly rows before assigning lanes.

Transcript bodies are drawn as rules, exon intervals as outlined rectangles,
and UTR/CDS intervals as colored subfeatures. Transcript labels include strand
direction markers, which makes overlapping annotations easier to interpret.

## GenomeSpy Features

This example combines several GenomeSpy capabilities in one spec:

- [Lazy data sources](../../grammar/data/lazy.md) load visible GFF3 features
  from a tabix-indexed file.
- [`flatten`](../../grammar/transform/flatten.md) expands hierarchical GFF3
  feature arrays.
- [`project`](../../grammar/transform/project.md) extracts nested attributes
  such as transcript IDs, transcript names, exon numbers, and feature types.
- [`collect`](../../grammar/transform/collect.md) sorts transcript features
  before lane assignment.
- [`pileup`](../../grammar/transform/pileup.md) packs overlapping transcripts
  into separate lanes.
- [`layer`](../../grammar/composition/layer.md) combines transcript bodies,
  exon rectangles, UTR/CDS intervals, and transcript labels.
