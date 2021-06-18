# Regex Extract

The `"regexExtract"` transform extracts groups from a string field
and adds them to the data objects as new fields.

## Parameters

SCHEMA RegexExtractParams

## Example

Given the following data:

| Gene | Genome Location        |
| ---- | ---------------------- |
| AKT1 | 14:104770341-104792643 |

... and configuration:

```json
{
  "type": "regexExtract",
  "field": "Genome Location",
  "regex": "^(X|Y|\\d+):(\\d+)-(\\d+)$",
  "as": ["Chrom", "Start", "End"]
}
```

Three new fields are added to the data:

| Gene | Genome Location        | Chrom | Start     | End       |
| ---- | ---------------------- | ----- | --------- | --------- |
| AKT1 | 14:104770341-104792643 | 14    | 104770341 | 104792643 |
