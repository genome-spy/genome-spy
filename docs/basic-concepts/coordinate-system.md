---
title: Coordinate system
---

Just as genome browsers, GenomeSpy has a horizontally scrollable viewport.
The horizontal axis is always quantitative and linear. In other words, it
is used for presenting numeric values, e.g. quantities or coordinates on the
scrollable viewport.

## Real numbers

By default, the coordinate system uses ordinary real numbers.

Example: Encode the value of the `foo` field as a position on the horizontal axis:

```javascript
"encoding": {
    "x": {
        "field": "foo",
        "type": "quantitative"
    },
    ...
}
```

## Genomic coordinates

To support easy visualization of genomic data, GenomeSpy provides a specific
genomic coordinate system, which maps the discrete chromosomes or contigs
onto the continuous linear axis.

To activate the genomic coordinate system, add `genome` property to the
root level configuration object:

```javascript
{
    "genome": {
        "name": "hg38"
    },
    "tracks": [ ... ]
}
```

Currently, GenomeSpy has built-in support for `hg19` and `hg38` assemblies.

TODO: How to specify custom genomes.

With Genomic coordinate system enabled, you can encode the genomic coordinates
conveniently:

```javascript
"encoding": {
    "x": {
        "chrom": "Chr",
        "pos": "Pos",
        "offset": -1.0,
        "type": "quantitative"
    },
    ...
}
```

The configuration above specifies that the chromosome and the
intra-chromosomal position is read from the `Chr` and `Pos` columns,
respectively. The `offset` property allows for aligning and adjusting for
different coordinate notations: zero or one based, closed or half-open.
The offset is added to the final coordinate.
