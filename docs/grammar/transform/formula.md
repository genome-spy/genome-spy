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

### Using with Parameters

As expressions have access to [parameters](../parameters.md), they can be used
to create dynamic visualizations. The following example uses a formula to
calculate the sum of two sine waves with different wave lengths. The wave
lengths are controlled by the `a` and `b` parameters.

Under the hood, when any of the parameters change, the formula transform finds
the closest [collector](./collect.md) or [data source](../data/index.md) in the
data pipeline and triggers a re-propagation of the data, resulting in a
re-evaluation of the formula expression.

<div><genome-spy-doc-embed height="300">

```json
{
  "params": [
    {
      "name": "a",
      "value": 200,
      "bind": { "input": "range", "min": 10, "max": 2000, "step": 1 }
    },
    {
      "name": "b",
      "value": 270,
      "bind": { "input": "range", "min": 10, "max": 2000, "step": 1 }
    }
  ],

  "data": { "sequence": { "start": 0, "stop": 1000, "as": "x" } },

  "transform": [
    {
      "type": "formula",
      "expr": "sin(datum.x * 2 * PI / a) + sin(datum.x * 2 * PI / b)",
      "as": "y"
    }
  ],

  "mark": "point",

  "encoding": {
    "size": { "value": 4 },
    "x": { "field": "x", "type": "quantitative" },
    "y": { "field": "y", "type": "quantitative" }
  }
}
```

</genome-spy-doc-embed></div>
