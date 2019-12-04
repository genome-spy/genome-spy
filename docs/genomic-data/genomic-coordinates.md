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

## Coordinate counting

The `offset` property allows for aligning and adjusting for
different coordinate notations: zero or one based, closed or half-open.
The offset is added to the final coordinate.

GenomeSpy expects **half-open**, **zero-based** coordinates.

Read more about coordinates at the [UCSC Genome Browser Blog](http://genome.ucsc.edu/blog/the-ucsc-genome-browser-coordinate-counting-systems/).
