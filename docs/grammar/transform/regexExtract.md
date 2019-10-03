---
title: Regex Extract
---

RegexMatch filter extracts and adds one or more new fields to the data
by using a regular expression.

## Example

Given the following data:

| Gene | Genome Location         |
| ---- | ----------------------- |
| AKT1 | 14:104770341-104792643  |

... and configuration:

```json
{
    "type": "regexMatch",
    "field": "Genome Location",
    "regex": "^(X|Y|\\d+):(\\d+)-(\\d+)$",
    "as": ["Chrom", "Start", "End"]
}
```

TODO: Rename to Regex Extract

Three new fields are added to the data:

| Gene | Genome Location         | Chrom | Start     | End       |
| ---- | ----------------------- | ----- | --------- | --------- |
| AKT1 | 14:104770341-104792643  | 14    | 104770341 | 104792643 |
