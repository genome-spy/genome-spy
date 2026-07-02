# ClinVar Small-Variant Classifications

This example shows ClinVar small variants in a zoomed DSG2 region on hg38. It
recreates the small-variant classification view described in NCBI's
["New ClinVar graphical display"](https://ncbiinsights.ncbi.nlm.nih.gov/2022/08/30/clinvar-graphical-view/)
post: each variant is placed by genomic position, while vertical position and
color encode the germline classification.

EXAMPLE examples/docs/genomic-data/examples/clinvar-variants.json height=130 spechidden

!!! disclaimer ""

    The visualization uses a mirrored copy of the ClinVar GRCh38 VCF release
    from NCBI's
    [ClinVar FTP downloads](https://www.ncbi.nlm.nih.gov/clinvar/docs/maintenance_use/).
    ClinVar asks that redistributed data be attributed to ClinVar as the data
    source.

## What to notice

The track uses a lollipop-like encoding for variant classifications. Each
variant has a point at its classification row and a rule that connects it to the
uncertain-significance baseline. This makes pathogenic, benign, uncertain, and
conflicting classifications easy to compare across the visible locus.

The source VCF stores clinical significance values in the `CLNSIG` INFO field.
The spec normalizes those values by replacing underscores, taking the first
slash-delimited classification, and grouping conflicting interpretations under a
single category.

## GenomeSpy Features

This example combines several GenomeSpy capabilities in one compact track:

- [Lazy data sources](../../grammar/data/lazy.md) load only the visible VCF
  records from a tabix-indexed file.
- [`formula`](../../grammar/transform/formula.md) and
  [`regexExtract`](../../grammar/transform/regex-extract.md) derive a
  user-facing germline classification from `CLNSIG`.
- [`filter`](../../grammar/transform/filter.md) keeps the classification
  categories shown in the track.
- The [`locus` scale](../../grammar/scale.md#locus-scale) maps VCF chromosome
  and position fields to genomic coordinates.
- [`layer`](../../grammar/composition/layer.md) combines the baseline, rules,
  and points.
- Ordinal position and color scales use the same classification domain so the
  rows and colors stay aligned.
