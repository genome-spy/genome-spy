# Flatten Sequence

Flattens strings such as FASTA sequences into rows with position and character
fields.

## Parameters

SCHEMA FlattenSequenceParams

## Example

Given the following data:

| identifier | sequence |
| ---------- | -------- |
| X          | AC       |
| Y          | ACTG     |

... and parameters:

```json
{
  "type": "flattenSequence",
  "field": "sequence",
  "as": ["base", "pos"]
}
```

The sequences are flattened into:

| identifier | sequence | base | pos |
| ---------- | -------- | ---- | --- |
| X          | AC       | A    | 0   |
| X          | AC       | C    | 1   |
| Y          | ACTG     | A    | 0   |
| Y          | ACTG     | C    | 1   |
| Y          | ACTG     | T    | 2   |
| Y          | ACTG     | G    | 3   |
