# AlignmentMismatches

The `"alignmentMismatches"` transform expands a read alignment into sparse rows
for mismatching aligned bases. It is intended for BAM pileup views where
non-reference read bases need separate marks on top of read bodies.

The transform uses the read sequence, CIGAR string, and MD tag. The MD tag is
required because ordinary `M` CIGAR operations do not distinguish matches from
mismatches. Insertions, deletions, skipped regions, and clipped bases are not
emitted as mismatch rows; use [`flattenCigar`](./flatten-cigar.md) to render
those operations.

The transform preserves the input fields, or only the fields listed in
`copyFields` when it is defined, and adds:

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

The `copyFields` parameter limits which top-level input fields are copied to
the emitted mismatch rows after they have been used by the transform. For
example, `seq`, `qual`, and `md` can be read as inputs without being copied to
every mismatch row.

## Parameters

SCHEMA AlignmentMismatchesParams

## Example

Given the following data:

| chrom | start | name  | cigar | seq        | qual                                    | md   |
| ----- | ----- | ----- | ----- | ---------- | --------------------------------------- | ---- |
| chr1  | 100   | read1 | 10M   | AAAATAAAAA | [30, 30, 30, 30, 17, 30, 30, 30, 30, 30] | 4A5  |

... and configuration:

```json
{
  "type": "alignmentMismatches"
}
```

The MD tag says that the first four aligned reference bases match, the next
reference base is `A`, and the following five bases match. The read has `T` at
that offset, so one mismatch row is emitted:

| chrom | start | name  | cigar | seq        | md   | mismatchStart | mismatchEnd | readOffset | base | refBase | baseQuality |
| ----- | ----- | ----- | ----- | ---------- | ---- | ------------- | ----------- | ---------- | ---- | ------- | ----------- |
| chr1  | 100   | read1 | 10M   | AAAATAAAAA | 4A5  | 104           | 105         | 4          | T    | A       | 17          |

Layers can color `base` with a nominal scale and filter or fade marks using
`baseQuality`.

For a complete genomic visualization example, see the [SPI1 Binding-QTL Dynseq
Track](../../genomic-data/examples/dynseq-spi1-bqtl.md).
