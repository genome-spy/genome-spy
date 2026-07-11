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

The following input data contains codon observations from a sequencing read:

| position | codon | readCount |
| -------- | ----- | --------- |
| 1        | ATG   | 42        |
| 4        | TGG   | 17        |
| 7        | TAA   | 6         |
| 10       | NNN   | 1         |

The separately ordered lookup table maps codons to amino acids:

| codon | aminoAcid |
| ----- | --------- |
| TGG   | W         |
| ATG   | M         |
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

| position | codon | readCount | aminoAcid |
| -------- | ----- | --------- | --------- |
| 1        | ATG   | 42        | M         |
| 4        | TGG   | 17        | W         |
| 7        | TAA   | 6         | Stop      |
| 10       | NNN   | 1         | ?         |

Use matching `fields` and `from.key` arrays for a composite key, for example
`fields: ["sample", "codon"]` and `from.key: ["sample", "codon"]`.

When `values` is omitted, lookup writes the complete matching table row to the
single field named by `as`.
