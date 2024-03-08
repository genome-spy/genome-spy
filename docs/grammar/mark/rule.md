# Rule

Rule mark displays each data item as a line segment. Rules can span the whole
width or height of the view. Alternatively, they may have specific endpoints.

<div><genome-spy-doc-embed height="150">

```json
{
  "data": {
    "sequence": { "start": 0, "stop": 15, "as": "y" }
  },
  "mark": {
    "type": "rule",
    "strokeDash": [6, 3]
  },
  "encoding": {
    "x": { "field": "y", "type": "quantitative" },
    "color": { "field": "y", "type": "nominal" }
  }
}
```

</genome-spy-doc-embed></div>

## Channels

Rule mark supports the primary and secondary [position](./index.md#channels)
channels and the `color`, `opacity`, and `size` channels.

## Properties

SCHEMA RuleProps

## Examples

### Ranged rules

<div><genome-spy-doc-embed height="150">

```json
{
  "data": {
    "values": [
      { "y": "A", "x": 2, "x2": 7 },
      { "y": "B", "x": 0, "x2": 3 },
      { "y": "B", "x": 5, "x2": 6 },
      { "y": "C", "x": 4, "x2": 8 },
      { "y": "D", "x": 1, "x2": 5 }
    ]
  },
  "mark": {
    "type": "rule",
    "size": 10,
    "strokeCap": "round"
  },
  "encoding": {
    "y": { "field": "y", "type": "nominal" },
    "x": { "field": "x", "type": "quantitative" },
    "x2": { "field": "x2" }
  }
}
```

</genome-spy-doc-embed></div>

### Plenty of diagonal rules

<div><genome-spy-doc-embed height="350">

```json
{
  "width": 300,
  "height": 300,

  "data": {
    "sequence": { "start": 0, "stop": 50 }
  },

  "transform": [
    {
      "type": "formula",
      "expr": "random()",
      "as": "x"
    },
    {
      "type": "formula",
      "expr": "datum.x + random() * 0.5 - 0.25",
      "as": "x2"
    },
    {
      "type": "formula",
      "expr": "random()",
      "as": "y"
    },
    {
      "type": "formula",
      "expr": "datum.y + random() * 0.5 - 0.25",
      "as": "y2"
    },
    {
      "type": "formula",
      "expr": "random()",
      "as": "size"
    }
  ],

  "mark": {
    "type": "rule",
    "strokeCap": "round"
  },

  "encoding": {
    "x": {
      "field": "x",
      "type": "quantitative"
    },
    "x2": { "field": "x2" },
    "y": {
      "field": "y",
      "type": "quantitative"
    },
    "y2": { "field": "y2" },
    "size": {
      "field": "size",
      "type": "quantitative",
      "scale": { "type": "pow", "range": [0, 10] }
    },
    "color": {
      "field": "x",
      "type": "nominal",
      "scale": { "scheme": "category20" }
    }
  }
}
```

</genome-spy-doc-embed></div>
