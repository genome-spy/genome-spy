# Practical Genomic Data Examples

This page collects a few non-trivial genomic examples that are useful as
reference material.

## Linked examples

The example specs below are self-contained and focus on a single track or
layout.

- [Chromosome Ideogram from Cytobands](cytobands.md) shows a compact ideogram
  built from UCSC cytoband data with layered rectangles, ranged text labels, and
  dashed chromosome separators.
- [RefSeq Gene Annotations with Scored Labels](refseq-genes.md) shows a gene
  annotation track with transcript bodies, exon rectangles, scored labels, and
  strand arrows.
- [ASCAT Copy-Number Segmentation](ascat.md) shows vertically concatenated
  views for allele-specific copy numbers, LogR, and B-allele frequency, with
  ideogram and RefSeq gene annotation tracks.
- [ASCAT Algorithm in GenomeSpy](ascat-algorithm.md) visualizes the core ASCAT
  fit and shows how the estimates change when `rho` and `psi` are adjusted.
- [Sashimi Plot from Splice Junctions](sashimi-plot.md) shows IGV's
  splice-junction demo data as a lazy BigWig coverage track plus dome-shaped
  splice arcs from a BED file.
- [ClinVar Small-Variant Classifications](clinvar-variants.md) shows ClinVar
  variants from a lazy VCF source as a lollipop-like track colored by germline
  classification.

## More examples

For many more examples of visualizing genomic data, see
[Lazy data sources](../../grammar/data/lazy.md).

## Observable notebooks

The [Annotation
Tracks](https://observablehq.com/@tuner/annotation-tracks?collection=@tuner/genomespy)
notebook explains how to implement a chromosome ideogram and a gene annotation
track.

## Website examples

The [genomespy.app](https://genomespy.app/) main page showcases several
examples, some of which focus on genomic data.

- [GWAS Manhattan Plot](https://genomespy.app/examples/?spec=OCAC/ocac.json) ([spec](https://github.com/genome-spy/website-examples/blob/master/OCAC/ocac.json))
- [Multiple-Sequence Alignment](https://genomespy.app/examples/?spec=MSA/msa.json) ([spec](https://github.com/genome-spy/website-examples/blob/master/MSA/msa.json))
- [Structural Variants](https://genomespy.app/examples/?spec=SV/sv.json) ([spec](https://github.com/genome-spy/website-examples/blob/master/SV/sv.json))
- [Multiple Cell Lines](https://genomespy.app/examples/?spec=PARPiCL/parpicl.json) ([spec](https://github.com/genome-spy/website-examples/blob/master/PARPiCL/parpicl.json))
