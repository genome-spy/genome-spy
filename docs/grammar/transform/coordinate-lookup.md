# Coordinate Lookup

The `"coordinateLookup"` transform adds values from a lazy side input to rows
whose coordinates are on the same positional scale. It performs an exact,
one-to-one lookup by a continuous coordinate or a `[chrom, pos]` pair.

Unlike [`"lookup"`](lookup.md), this transform does not retain primary rows
outside that interval. Within the interval, unmatched keys receive `default`.

The side input must be a single-axis lazy data source using the same resolved
`x` or `y` scale as the primary data.

`key` names the coordinate field or `[chrom, pos]` fields in the side input.
`fields` names the corresponding primary-data fields and defaults to `key`.
These fields determine both the lookup match and whether a primary row falls
within the loaded side-input interval.

`from.transform` runs on the side input before lookup. It can normalize fields
to the coordinate names used by `key`.

## Parameters

SCHEMA CoordinateLookupParams

## Example

The following transform adds BigWig scores to base-level rows produced by an
indexed FASTA pipeline. The preceding transforms provide `chrom` and `pos` in
the primary data. The side-input formula renames the BigWig `start` field to
the position field used for lookup.

```json
{
  "type": "coordinateLookup",
  "from": {
    "data": {
      "lazy": {
        "type": "bigwig",
        "url": "scores.bw",
        "pixelsPerBin": 1
      }
    },
    "transform": [{ "type": "formula", "expr": "datum.start", "as": "pos" }]
  },
  "key": ["chrom", "pos"],
  "values": ["score"]
}
```

The shared `chrom` and `pos` fields identify each primary base, determine
side-input coverage, and match a score row. If the primary fields use different
names, provide them with `fields`, for example
`fields: ["chromosome", "position"]`.

For a complete reference-versus-alternate sequence-contribution visualization,
see the [SPI1 Binding-QTL Dynseq Track](../../genomic-data/examples/dynseq-spi1-bqtl.md).
