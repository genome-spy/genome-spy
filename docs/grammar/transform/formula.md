# Formula

The `"formula"` transform uses an [expression](../expressions.md) to calculate
and add a new field to the data objects.

## Parameters

SCHEMA FormulaParams

## Example

Given the following data:

| x   | y   |
| --- | --- |
| 1   | 2   |
| 3   | 4   |

... and configuration:

```json
{
  "type": "formula",
  "expr": "datum.x + datum.y",
  "as": "z"
}
```

A new field is added:

| x   | y   | z   |
| --- | --- | --- |
| 1   | 2   | 3   |
| 3   | 4   | 7   |
