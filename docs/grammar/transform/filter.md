# Filter

The `"filter"` transform removes data objects based on a predicate
[expression](../expressions.md) or a
[selection](../parameters.md#selection-parameters) predicate.

## Parameters

### Predicate Expression

SCHEMA ExprFilterParams

### Selection Predicate

SCHEMA SelectionFilterParams

## Example

### Filtering by a Predicate Expression

```json
{
  "type": "filter",
  "expr": "datum.p <= 0.05"
}
```

The example above passes through all rows for which the field `p` is less than
or equal to 0.05.

### Filtering by a Selection Predicate

Interval selections in GenomeSpy are defined by their data extent along the x
and/or y channels. When filtering data based on a selection, you must explicitly
map the visual channels (x or y) to the corresponding data fields to ensure
correct filtering. This ensures that the filter correctly interprets the
selection in the context of your dataset.

<div><genome-spy-doc-embed height="250">

```json
{
  "data": { "url": "sincos.csv" },

  "params": [{ "name": "brush" }],

  "vconcat": [
    {
      "height": 30,
      "transform": [
        { "type": "collect" },
        {
          "type": "filter",
          "param": "brush",
          "fields": { "x": "x", "y": "sin" }
        },
        { "type": "aggregate" },
        {
          "type": "formula",
          "as": "text",
          "expr": "datum.count + ' points selected'"
        }
      ],
      "mark": { "type": "text", "size": 20 },
      "encoding": {
        "text": { "field": "text" }
      }
    },
    {
      "params": [
        {
          "name": "brush",
          "value": { "x": [2.5, 4], "y": [-0.6, 0.6] },
          "select": {
            "type": "interval",
            "encodings": ["x", "y"]
          },
          "push": "outer"
        }
      ],

      "mark": { "type": "point", "size": 100 },

      "encoding": {
        "x": { "field": "x", "type": "quantitative" },
        "y": { "field": "sin", "type": "quantitative" }
      }
    }
  ]
}
```

</genome-spy-doc-embed></div>
