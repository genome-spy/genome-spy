# Stack

- computes stacked layout
- For example, stacked bar chart

## Parameters

SCHEMA StackParams

## Example

```json
{
  "type": "stack",
  "groupby": ["chrom", "startpos"],
  "sort": {
    "field": "Role in Cancer"
  },
  "offset": "normalize"
}
```

TODO: Explanation
