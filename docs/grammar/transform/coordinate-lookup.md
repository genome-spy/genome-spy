# Coordinate Lookup

The `"coordinateLookup"` transform adds values from a lazy side input to rows
whose coordinates are on the same positional scale. It performs an exact,
one-to-one keyed lookup within the side input's available coordinate interval.

Unlike [`"lookup"`](lookup.md), this transform does not retain primary rows
outside that interval. Within the interval, unmatched keys receive `default`.

The side input must be a single-axis lazy data source using the same resolved
`x` or `y` scale as the primary data. `coordinate` specifies the primary-row
position used to restrict the output. Use a `field` for a continuous position,
or `chrom` and `pos` for a locus scale.

`from.transform` is a pipeline for the side input. For example, it can flatten
a lazy reference sequence before its bases are matched to primary rows. The
side-input transforms run before the keyed lookup.

## Parameters

SCHEMA CoordinateLookupParams
