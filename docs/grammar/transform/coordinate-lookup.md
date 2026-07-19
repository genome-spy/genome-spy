# Coordinate Lookup

The `"coordinateLookup"` transform adds values from a lazy side input to rows
whose coordinates are on the same positional scale. It performs an exact,
one-to-one keyed lookup within the side input's available coordinate interval.

Unlike [`"lookup"`](lookup.md), this transform does not retain primary rows
outside that interval. Within the interval, unmatched keys receive `default`.

The side input must be a single-axis lazy data source using the same resolved
`x` or `y` scale as the primary data.

`from.transform` runs on the side input before the keyed lookup. It can expose
or normalize its key fields.

## Coverage coordinate

`coordinate` is not a lookup key. It identifies the position of each primary
row on the shared scale so that the transform can determine whether the lazy
side input has loaded data there:

- Within the loaded interval, the transform performs the exact keyed lookup.
  An unmatched key receives `default`.
- Outside the loaded interval, the primary row is not passed through because
  the side input might contain a match that has not been loaded yet.

Use `{ "field": "position" }` for a continuous scale, or
`{ "chrom": "chrom", "pos": "pos" }` for a locus scale. `key` and
`fields` independently select the matching side-input row.

## Parameters

SCHEMA CoordinateLookupParams

## Example

The following transform adds BigWig scores to base-level rows produced by an
indexed FASTA pipeline. The preceding transforms provide `chrom` and `pos` in
the primary data. The side-input formula exposes the BigWig `start` field as
the matching position.

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
  "coordinate": { "chrom": "chrom", "pos": "pos" },
  "key": ["chrom", "pos"],
  "values": ["score"]
}
```

The `coordinate` object checks side-input coverage for each primary base. The
`key` array then matches that base to a score row. Omit `fields` when the
primary and side-input key fields have the same names.

For a complete reference-versus-alternate sequence-contribution visualization,
see the [SPI1 Binding-QTL Dynseq Track](../../genomic-data/examples/dynseq-spi1-bqtl.md).
