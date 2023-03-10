# Linearize Genomic Coordinate

![Linearization](../../img/coordinate-linearization.svg){ align=right }

The `linearizeGenomicCoordinate` transform maps the \(chromosome, position\)
pairs into a linear coordinate space using the chromosome sizes of
the current [genome assembly](../../genomic-data/genomic-coordinates.md).

## Parameters

SCHEMA LinearizeGenomicCoordinateParams

## Example

```json
{
  "type": "linearizeGenomicCoordinate",
  "chrom": "chrom",
  "pos": "start",
  "as": "_start"
}
```
