# Examples

This page collects non-trivial examples that are useful as reference material
and demonstrate the capabilities of GenomeSpy.

## Genomic data examples

The example specs below mostly display a single dataset to keep the examples
simple and focused. Gene annotation track, etc. are omitted from the examples.

EXAMPLE_GALLERY examples/docs/examples/genomic-data

- [Chromosome Ideogram from Cytobands](genomic-data/cytobands.md) cytobands.json
- [RefSeq Gene Annotations with Scored Labels](genomic-data/refseq-genes.md) scored-refSeq-genes.json
- [ASCAT Copy-Number Segmentation](genomic-data/ascat.md) ASCAT.json
- [Interactive ASCAT-like Purity/Ploidy Fitting](genomic-data/ascat-algorithm.md) ASCAT-algorithm.json
- [HCC1954 Structural Variants and Copy Number](genomic-data/hcc1954-sv-cnv.md) hcc1954-sv-cnv.json
- [TCGA Ovarian Cancer GISTIC2 Copy-Number Landscape](genomic-data/tcga-ov-gistic.md) tcga-ov-gistic.json
- [Sashimi Plot from Splice Junctions](genomic-data/sashimi-plot.md) sashimi-plot.json
- [PIK3CA Mutation Lollipop Plot](genomic-data/pik3ca-tcga-brca-lollipop.md) pik3ca-tcga-brca-lollipop.json
- [ClinVar Small-Variant Classifications](genomic-data/clinvar-variants.md) clinvar-variants.json
- [GENCODE Gene Annotations from GFF3](genomic-data/gencode-gff3-gene-annotations.md) gff3-gene-annotations.json
- [Indexed FASTA Six-Frame Translation](genomic-data/indexed-fasta-six-frame-translation.md) indexed-fasta-six-frame-translation.json
- [BAM Read Alignments](genomic-data/bam-read-alignments.md) bam-read-alignments.json
- [Multiple Sequence Alignment](genomic-data/multiple-sequence-alignment.md) msa.json
- [SPI1 Binding-QTL Dynseq Track](genomic-data/dynseq-spi1-bqtl.md) dynseq-spi1-bqtl.json
- [Composing a Genome Browser](genomic-data/genome-browser.md) genome-browser.json

## Generic visualization examples

EXAMPLE_GALLERY examples/docs/examples/generic

- [Set Intersections with an UpSet Plot](generic/upsetr-mutations.md) upsetr-mutations.json

## More examples

For more examples of visualizing genomic data, see [Lazy data
sources](../grammar/data/lazy.md).

## Observable notebooks

The [Annotation
Tracks](https://observablehq.com/@tuner/annotation-tracks?collection=@tuner/genomespy)
notebook explains how to implement a chromosome ideogram and a gene annotation
track.

## Website examples

The [genomespy.app](https://genomespy.app/) main page showcases several
examples, some of which focus on genomic data.

- [GWAS Manhattan Plot](https://genomespy.app/examples/?spec=OCAC/ocac.json) ([spec](https://github.com/genome-spy/website-examples/blob/master/OCAC/ocac.json))
- [Multiple Cell Lines](https://genomespy.app/examples/?spec=PARPiCL/parpicl.json) ([spec](https://github.com/genome-spy/website-examples/blob/master/PARPiCL/parpicl.json))
