# Lookup

The `"lookup"` transform adds values from a keyed table to each input data
object. Input objects without a matching key are retained.

The table uses an eager [`data`](../data/index.md) descriptor. It can contain
inline values, load a URL in any supported format such as CSV or Parquet, or
refer to named data. The table is loaded before primary data.

## Limitations

- Lookup tables are fully materialized in memory and must have unique keys.
- Lookup matches exact field values. Range, overlap, and many-to-many joins
  are not supported.
- Lookup tables cannot use lazy data sources.
- Reloading a lookup table automatically refreshes the primary data.

## Parameters

SCHEMA LookupParams

## Example

The following input data contains DNA codons:

| codon |
| ----- |
| ATG   |
| TGG   |
| TAA   |
| NNN   |

The lookup table maps each codon to an amino acid:

| codon | aminoAcid |
| ----- | --------- |
| ATG   | M         |
| TGG   | W         |
| TAA   | Stop      |

This transform copies `aminoAcid` from the matching table row. The unmatched
`NNN` codon receives the default value `"?"`.

```json
{
  "type": "lookup",
  "from": {
    "data": {
      "values": [
        { "codon": "ATG", "aminoAcid": "M" },
        { "codon": "TGG", "aminoAcid": "W" },
        { "codon": "TAA", "aminoAcid": "Stop" }
      ]
    },
    "key": "codon"
  },
  "fields": ["codon"],
  "values": ["aminoAcid"],
  "default": "?"
}
```

The resulting data is:

| codon | aminoAcid |
| ----- | --------- |
| ATG   | M         |
| TGG   | W         |
| TAA   | Stop      |
| NNN   | ?         |

Use matching `fields` and `from.key` arrays for a composite key, for example
`fields: ["sample", "codon"]` and `from.key: ["sample", "codon"]`.

When `values` is omitted, lookup writes the complete matching table row to the
single field named by `as`.
