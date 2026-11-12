# Publish

The `"publish"` transform exposes the rows at its position in a pipeline as a
read-only named dataset and passes those rows onward. It works in the main
pipeline or inside a [`"branch"`](branch.md). Its input must produce one
unpartitioned table from [eager data](../data/eager.md).

The table updates when the input pipeline recomputes, including when its data or
parameters change.

## Parameters

SCHEMA PublishParams

## Publishing a local dataset

Set `dataset` to declare a name in the current view. The name must be unique
among that view's dataset declarations. A [`lookup`](lookup.md) later in the
pipeline can read it through `from.name`. Descendant views can also read it
through `data.name` or a lookup. The table follows the usual
[named data scope rules](../data/eager.md#named-data).

This example illustrates local publication by computing the maximum score for
each group and adding it to each original row with a lookup. The
[`window`](window.md) transform is a better fit for this calculation. Use
`groupby: ["group"]` and `frame: [null, null]` with the `max` operation.

```json
{
  "data": {
    "values": [
      { "group": "A", "score": 2 },
      { "group": "A", "score": 4 },
      { "group": "B", "score": 1 }
    ]
  },
  "transform": [
    {
      "type": "branch",
      "transform": [
        {
          "type": "aggregate",
          "groupby": ["group"],
          "fields": ["score"],
          "ops": ["max"],
          "as": ["maxScore"]
        },
        { "type": "publish", "dataset": "groupMaxima" }
      ]
    },
    {
      "type": "lookup",
      "from": { "name": "groupMaxima" },
      "key": "group",
      "values": ["maxScore"]
    }
  ],
  "mark": "point",
  "encoding": {
    "x": { "field": "score", "type": "quantitative" },
    "y": { "field": "maxScore", "type": "quantitative" }
  }
}
```
