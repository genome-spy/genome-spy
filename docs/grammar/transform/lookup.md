# Lookup

The `"lookup"` transform performs a keyed, one-to-one left outer join: it
retains every input data object and adds values from a matching lookup-table
row.

The table can use an eager [`data`](../data/eager.md) descriptor. It can contain
inline values, load a URL in any supported format such as CSV or Parquet, or
refer to named data. Alternatively, `{ "source": "input" }` uses the current
input data as the lookup table.

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

For an example that maps nucleotide complements and codons, see [Indexed FASTA
Six-Frame Translation](../../examples/genomic-data/indexed-fasta-six-frame-translation.md).

## Lookup from the input

Use `{ "source": "input" }` to match records against other records in the input
data. For example, these records refer to each other through `relatedId`:

| id  | relatedId | label |
| --- | --------- | ----- |
| A   | B         | Alpha |
| B   | A         | Beta  |
| C   | X         | Gamma |

```json
{
  "type": "lookup",
  "from": { "source": "input" },
  "fields": "relatedId",
  "key": "id",
  "values": ["label"],
  "as": ["relatedLabel"]
}
```

The result is:

| id  | relatedId | label | relatedLabel |
| --- | --------- | ----- | ------------ |
| A   | B         | Alpha | Beta         |
| B   | A         | Beta  | Alpha        |
| C   | X         | Gamma | null         |

Self-input lookup reads all records from one input file or inline dataset before
emitting results. Results preserve the original input order. Reading all records
first allows a record to match another record that appears later in the data.

When a data source loads multiple files, each file is indexed separately. Keys
in different files neither match nor conflict. Likewise, if upstream data has
been divided into facets, each facet is indexed separately.

With lazy or incrementally loaded genomic data, a self-input lookup can only
match records loaded together. For example, a structural-variant mate outside
the loaded genomic window is unavailable and receives `default`.

When `values` is omitted for a self-input lookup, all non-key fields from the
matching record replace the corresponding fields in the cloned input record.
Use explicit `values` and `as` to retain the original fields and add renamed
mate fields.
