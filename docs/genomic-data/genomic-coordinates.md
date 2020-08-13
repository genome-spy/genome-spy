# Genomic coordinates

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

## Supported genomes

By default, GenomeSpy loads genomes from _genomespy.app_. The following
assemblies are provided: `hg38`, `hg19`, `hg18`, `mm10`, `mm9`, and `dm6`.

## Custom genomes

At minimum, a custom genome needs a list of contigs and their sizes, which
can be loaded from a `chrom.sizes` file or provided inline.
[Cytoband](tracks.md#cytoband-track) and [Gene
annotation](tracks.md#gene-annotations) tracks require additional files.

### As files

The `baseUrl` property specifies the location of genomes:

```json
{
  "genome": {
    "name": "hg99",
    "baseUrl": "https://your.site/genomes/"
  },
  ...
}
```

The directory must have the following structure:

```
hg99/hg99.chrom.sizes
hg99/cytoBand.hg99.txt (optional)
hg99/refSeq_genes_scored_compressed.hg99.txt (optional)
```

### Inline

Example:

```json
{
  "genome": {
    "contigs": [
      "name": "chr3R", "size": "32079331",
      "name": "chr3L", "size": "28110227",
      "name": "chr2R", "size": "25286936",
      "name": "chrX",  "size": "23542271",
      "name": "chr2L", "size": "23513712",
      "name": "chrY",  "size": "3667352",
      "name": "chr4",  "size": "1348131",
    ]
  },
  ...
}
```

Cytobands and genome annotations cannot be provided inline.

## Encoding genomic coordinates

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

## Coordinate counting

The `offset` property allows for aligning and adjusting for
different coordinate notations: zero or one based, closed or half-open.
The offset is added to the final coordinate.

GenomeSpy expects **half-open**, **zero-based** coordinates.

Read more about coordinates at the [UCSC Genome Browser Blog](http://genome.ucsc.edu/blog/the-ucsc-genome-browser-coordinate-counting-systems/).
