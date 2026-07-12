# Lookup

The `"lookup"` transform performs a keyed, one-to-one left outer join: it
retains every input data object and adds values from a matching lookup-table
row.

The table uses an eager [`data`](../data/eager.md) descriptor. It can contain
inline values, load a URL in any supported format such as CSV or Parquet, or
refer to named data.

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
    "values": [
      { "codon": "ATG", "aminoAcid": "M" },
      { "codon": "TGG", "aminoAcid": "W" },
      { "codon": "TAA", "aminoAcid": "Stop" }
    ]
  },
  "key": "codon",
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

Use matching `fields` and `key` arrays for a composite key, for example
`fields: ["sample", "codon"]` and `key: ["sample", "codon"]`.

When the key fields have the same names in both data sets, omit `fields`. When
`values` is omitted, lookup copies every non-key field from the table. Use
explicit `values` and `as` to select or rename copied fields. Copied fields
must not have the same names as primary-data fields. Implicit values
require top-level lookup key fields.
