# Working with Genomic Data

## Genomic coordinates

To support easy visualization of genomic data, GenomeSpy provides a specific
genomic coordinate system, which maps the discrete chromosomes or contigs
onto a concatenated, continuous linear axis.

To activate the genomic coordinate system, add `genome` property to the
root level configuration object:

```json
{
  "genome": {
    "name": "hg38"
  },
  ...
}
```

Currently, GenomeSpy has built-in support for `hg19` and `hg38` assemblies.

TODO: How to specify custom genomes, cytobands and gene annotations.

With the genomic coordinate system enabled, you can encode the genomic coordinates
conveniently:

```json
{
  ...,
  "encoding": {
    "x": {
      "chrom": "Chr",
      "pos": "Pos",
      "offset": -1.0,
      "type": "quantitative"
    },
    ...
  }
}
```

The example above specifies that the chromosome and the
intra-chromosomal position is read from the `Chr` and `Pos` columns,
respectively.

### Coordinate counting

The `offset` property allows for aligning and adjusting for
different coordinate notations: zero or one based, closed or half-open.
The offset is added to the final coordinate.

GenomeSpy expects **half-open**, **zero-based** coordinates.

Read more about coordinates at the [UCSC Genome Browser Blog](http://genome.ucsc.edu/blog/the-ucsc-genome-browser-coordinate-counting-systems/).

## Genome Tracks

GenomeSpy provides three tracks, that are intended to be used with genomic
data. To add any of these tracks to your view specification, use the
[import](#TODO) directive.

### Genome axis track

Name: `genomeAxis`

Genome axis track displays the chromosome boundaries, names, and
intra-chromosomal coordinates.

### Cytoband track

Name: `cytobands`

Cytoband track displays the cytobands if the [genome
configuration](coordinate-system.md#genomic-coordinates) provides them.

### Gene annotations

Name: `geneAnnotation`

Gene track displays [RefSeq gene](https://www.ncbi.nlm.nih.gov/refseq/rsg/)
annotations. As it is impractical to show all 20 000 gene symbols at the same
time, gene track uses score-based prioritization to display only the most
popular genes of the currently visible region. For profound discussion on the
popularity metric, read more in "[The most popular genes in the human
genome](https://www.nature.com/articles/d41586-017-07291-9)" in Nature.

To save some precious screen estate, the isoforms of the genes in the
provided annotation are unioned. Thus, each gene is displayed as a single
"super isoform" (there are a few exceptions, though).

Hovering the gene symbols with the mouse pointer fetches gene summary
information from RefSeq and displays it in a tooltip. Clicking the right
mouse button on a gene symbol opens a context-menu that provides shortcuts to
certain databases for further information about the gene.

!!! note "How the scoring is actually done"

    * Follow https://docs.higlass.io/data_preparation.html#gene-annotation-tracks
    * Use `utils/compressGeneAnnotations.py` to compress the data.
    * TODO: then what?

### Example

This example displays cytobands, gene annotations, and genomic coordinates
using the `hg38` genome assembly. It also imports a COSMIC [Cancer Gene
Census](https://cancer.sanger.ac.uk/census) track from _genomespy.app_
website.

<div class="embed-example">
    <div class="embed-container" style="height: 140px"></div>
    <div class="embed-spec">

```json
{
  "genome": { "name": "hg38" },
  "concat": [
    { "import": { "name": "cytobands" } },
    { "import": { "name": "geneAnnotation" } },
    {
      "import": {
        "url": "https://genomespy.app/tracks/cosmic/census_hg38.json"
      }
    },
    { "import": { "name": "genomeAxis" } }
  ]
}
```

</div>
</div>
