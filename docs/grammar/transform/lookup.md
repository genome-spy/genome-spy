# Lookup

The `"lookup"` transform adds values from a keyed lookup table to each input
data object. Input objects without a matching key are retained.

The lookup table uses a regular [`data`](../data/index.md) descriptor. It can
be inline data, a URL with any supported format such as CSV or Parquet, named
data, or a lazy data source. The table is materialized before the transform
emits its output.

`fields` and `from.key` form an aligned key tuple. Use matching arrays for a
composite lookup, for example `fields: ["sample", "codon"]` and
`from.key: ["sample", "codon"]`.

## Limitations

- Lookup tables are fully materialized in memory and must have unique keys.
- Lookup matches exact field values. Range, overlap, and many-to-many joins
  are not supported.
- Lookup tables cannot use lazy data sources.
- Changes to the lookup table do not update existing output. Reload the
  primary data to apply the new table values.

## Parameters

SCHEMA LookupParams

## Example

The following transform maps DNA codons to amino acids. The complete example
is in `examples/core/transforms/lookup-codons.json`.

```json
{
  "type": "lookup",
  "from": {
    "data": { "url": "data/genetic-code.csv", "format": { "type": "csv" } },
    "key": ["codon"]
  },
  "fields": ["codon"],
  "values": ["aminoAcid"],
  "as": ["aminoAcid"],
  "default": "?"
}
```
