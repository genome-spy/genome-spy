# Filter Scored Lables

The `"filterScoredLabels"` transform fits prioritized elements such as labels
into the available space, dynamically adjusting as the scale domain changes
(such as during zooming). It is particularly suited for gene annotation tracks,
where genes have an associated importance or score, such as their popularity or
relevance, and only the most significant labels should be displayed when space
is limited. This transform is typically used in conjunction with the
[`measureText`](measure-text.md) transform to calculate the width of each label.

For an usage example, check the [Annotation
Tracks](https://observablehq.com/@tuner/annotation-tracks?collection=@tuner/genomespy)
notebook or the [example](#example) below.

## Parameters

SCHEMA FilterScoredLabelsParams

## Example

Zoom in to see how the labels are filtered based on their score and the available
space.

<div><genome-spy-doc-embed height="100">

```json
{
  "data": { "sequence": { "start": 0, "stop": 100000, "step": 1, "as": "_z" } },

  "transform": [
    { "type": "formula", "expr": "floor(random() * 10000000)", "as": "x" },
    { "type": "formula", "expr": "floor(random() * 100000)", "as": "score" },
    { "type": "formula", "expr": "'' + datum.score", "as": "label" },
    {
      "type": "measureText",
      "fontSize": 16,
      "field": "label",
      "as": "textWidth"
    },
    {
      "type": "filterScoredLabels",
      "score": "score",
      "width": "textWidth",
      "pos": "x",
      "padding": 5
    }
  ],

  "mark": {
    "type": "text",
    "size": 16
  },

  "encoding": {
    "x": { "field": "x", "type": "index", "scale": { "domain": [0, 1000000] } },
    "text": { "field": "label" }
  }
}
```

</genome-spy-doc-embed></div>
