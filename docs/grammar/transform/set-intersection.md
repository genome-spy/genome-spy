# Set Intersection

The `"setIntersection"` transform groups distinct elements by their exact set
memberships. It emits a flattened profile-by-set table suitable for
co-occurrence matrices, concordance summaries, and set-intersection charts.

## Parameters

SCHEMA SetIntersectionParams

## Input forms

Element and set fields must contain scalar strings, Booleans, or finite numbers.

Sparse input contains one row for each active element–set membership. An absent
pair means non-membership:

| sample | gene   |
| ------ | ------ |
| S1     | TP53   |
| S1     | KRAS   |
| S2     | TP53   |
| S3     | PIK3CA |

```json
{
  "type": "setIntersection",
  "element": "sample",
  "set": "gene"
}
```

Dense input may include an explicit `membership` field. Its values must be
`true`, `false`, `1`, or `0`. This form can represent elements that belong to
no set:

```json
{
  "type": "setIntersection",
  "element": "sample",
  "set": "gene",
  "membership": "present"
}
```

Multiple `element` fields form a compound identity. Repeated rows with the
same identity, set, and membership are coalesced. Conflicting memberships for
the same element and set are invalid.

Wide binary data can be normalized using [`"regexFold"`](regex-fold.md):

```json
[
  {
    "type": "regexFold",
    "columnRegex": "^(TP53|KRAS|PIK3CA)$",
    "asKey": "gene",
    "asValue": "present"
  },
  {
    "type": "setIntersection",
    "element": "sample",
    "set": "gene",
    "membership": "present"
  }
]
```

## Output

The transform emits one row for every observed profile and observed set:

| Field           | Description                                                 |
| --------------- | ----------------------------------------------------------- |
| `profileKey`    | Bit string encoding the profile in first-observed set order |
| `profileSize`   | Number of distinct elements with exactly this profile       |
| `profileDegree` | Number of active sets in the profile                        |
| `set`           | Set identifier from the input                               |
| `setIndex`      | Zero-based index in first-observed set order                |
| `member`        | Whether the profile is a member of this set                 |

Only observed profiles are emitted; the transform does not enumerate the
power set. Set and profile presentation order can be derived downstream. For
example, `window` can rank profiles by size, while an inclusive set size can
be calculated using `member ? profileSize : 0` followed by `aggregate`.

## Genomic co-mutation example

This example treats samples as elements and mutated genes as sets. Each output
row maps directly to one matrix cell: exact profiles are rows, genes are
columns, and dark cells indicate membership. The aligned sample count shows
how many input samples were collapsed into each exact profile. Hover a cell to
inspect the profile size and degree.

EXAMPLE examples/docs/grammar/transform/set-intersection/co-mutation.json height=260 spechidden
