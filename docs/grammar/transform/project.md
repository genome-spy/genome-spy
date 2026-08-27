# Project

The `"project"` transform retains the specified fields of the rows,
optionally renaming them. All other fields are removed.

## Parameters

SCHEMA ProjectParams

## Example

```json
{
  "type": "project",
  "fields": ["lane", "start", "exons"]
}
```
