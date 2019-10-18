# Formula

The formula transform calculates and adds a new field to the data.

## Parameters

TODO

## Example

Given the following data:

| x | y |
| - | - |
| 1 | 2 |
| 3 | 4 |

... and configuration:

```json
{
    "type": "formula",
    "expr": "datum.x + datum.y",
    "as": "z"
}
```

A new field is added:

| x | y | z |
| - | - | - |
| 1 | 2 | 3 |
| 3 | 4 | 7 |
