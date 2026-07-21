# FlattenCigar

The `"flattenCigar"` transform expands an alignment row into one row per CIGAR
operation. It is intended for BAM alignment visualizations where aligned blocks,
insertions, deletions, skipped regions, and clipped ends need separate marks.
For background on the CIGAR notation, see the
[SAM/BAM format specification](https://samtools.github.io/hts-specs/SAMv1.pdf).

The transform preserves the input fields, or only the fields listed in
`copyFields` when it is defined, and adds:

| field         | description                                                                             |
| ------------- | --------------------------------------------------------------------------------------- |
| `cigarOp`     | CIGAR operation, such as `M`, `I`, `D`, `N`, `S`, `H`, `P`, `=`, or `X`                 |
| `cigarLength` | Operation length from the CIGAR string                                                  |
| `cigarStart`  | Reference start coordinate for the operation                                            |
| `cigarEnd`    | Reference end coordinate for the operation                                              |
| `readStart`   | Query/read start offset for the operation                                               |
| `readEnd`     | Query/read end offset for the operation                                                 |
| `cigarType`   | One of `aligned`, `insertion`, `deletion`, `skip`, `softClip`, `hardClip`, or `padding` |

Reference coordinates are 0-based and half-open. Insertions and clipped bases
are emitted as zero-width reference-anchored rows. Unavailable CIGAR values
(`*`) produce no rows.

The `copyFields` parameter limits which top-level input fields are copied to
the emitted operation rows. For example, BAM reads often contain long sequence
and base-quality fields that are needed upstream but not in CIGAR overlay rows.

## Parameters

SCHEMA FlattenCigarParams

## Example

Given the following data:

| chrom | start | name  | cigar              |
| ----- | ----- | ----- | ------------------ |
| chr1  | 100   | read1 | 5S10M2I4M3D6M1S    |

... and configuration:

```json
{
  "type": "flattenCigar"
}
```

The CIGAR operations are expanded into new data objects. The original fields
are preserved:

| chrom | start | name  | cigar              | cigarOp | cigarLength | cigarStart | cigarEnd | readStart | readEnd | cigarType |
| ----- | ----- | ----- | ------------------ | ------- | ----------- | ---------- | -------- | --------- | ------- | --------- |
| chr1  | 100   | read1 | 5S10M2I4M3D6M1S    | S       | 5           | 100        | 100      | 0         | 5       | softClip  |
| chr1  | 100   | read1 | 5S10M2I4M3D6M1S    | M       | 10          | 100        | 110      | 5         | 15      | aligned   |
| chr1  | 100   | read1 | 5S10M2I4M3D6M1S    | I       | 2           | 110        | 110      | 15        | 17      | insertion |
| chr1  | 100   | read1 | 5S10M2I4M3D6M1S    | M       | 4           | 110        | 114      | 17        | 21      | aligned   |
| chr1  | 100   | read1 | 5S10M2I4M3D6M1S    | D       | 3           | 114        | 117      | 21        | 21      | deletion  |
| chr1  | 100   | read1 | 5S10M2I4M3D6M1S    | M       | 6           | 117        | 123      | 21        | 27      | aligned   |
| chr1  | 100   | read1 | 5S10M2I4M3D6M1S    | S       | 1           | 123        | 123      | 27        | 28      | softClip  |

Layers can filter by `cigarType` and render different operation types with
ordinary marks.

For a complete genomic visualization example, see the [SPI1 Binding-QTL Dynseq
Track](../../genomic-data/examples/dynseq-spi1-bqtl.md).
