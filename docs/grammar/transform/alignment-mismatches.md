# AlignmentMismatches

The `"alignmentMismatches"` transform expands a read alignment into sparse rows
for mismatching aligned bases. It is intended for BAM pileup views where
non-reference read bases need separate marks on top of read bodies.

The transform uses the read sequence, CIGAR string, and MD tag. The MD tag is
required because ordinary `M` CIGAR operations do not distinguish matches from
mismatches. Insertions, deletions, skipped regions, and clipped bases are not
emitted as mismatch rows; use [`flattenCigar`](./flatten-cigar.md) to render
those operations.

The transform preserves the input fields and adds:

| field           | description                                             |
| --------------- | ------------------------------------------------------- |
| `mismatchStart` | Reference start coordinate for the mismatching base     |
| `mismatchEnd`   | Reference end coordinate for the mismatching base       |
| `readOffset`    | Query/read offset for the mismatching base              |
| `base`          | Read base from the sequence field                       |
| `refBase`       | Reference base from the MD tag                          |
| `baseQuality`   | Base quality from the quality array, when available     |

Reference coordinates are 0-based and half-open. Unavailable CIGAR values
(`*`) produce no rows.

## Parameters

SCHEMA AlignmentMismatchesParams

## Example

```json
{
  "transform": [
    { "type": "pileup", "start": "start", "end": "end", "as": "_lane" },
    { "type": "alignmentMismatches" }
  ]
}
```

After `alignmentMismatches`, layers can color `base` with a nominal scale and
filter or fade marks using `baseQuality`.
