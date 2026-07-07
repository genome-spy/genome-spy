# FlattenCigar

The `"flattenCigar"` transform expands an alignment row into one row per CIGAR
operation. It is intended for BAM alignment visualizations where aligned blocks,
insertions, deletions, skipped regions, and clipped ends need separate marks.

The transform preserves the input fields and adds:

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

## Parameters

SCHEMA FlattenCigarParams

## Example

```json
{
  "transform": [
    { "type": "pileup", "start": "start", "end": "end", "as": "_lane" },
    { "type": "flattenCigar" }
  ]
}
```

After `flattenCigar`, layers can filter by `cigarType` and render different
operation types with ordinary marks.
