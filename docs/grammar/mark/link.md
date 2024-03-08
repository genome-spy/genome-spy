# Link

The `"link"` mark displays each data item as a curve that connects two points.
The mark can be used to display structural variation and interactions, for
example. The mark has several different [`linkShape`s](#properties) that control
how the curve is drawn.

<div><genome-spy-doc-embed height="250">

```json
{
  "data": {
    "sequence": { "start": 0, "stop": 30, "as": "z" }
  },
  "transform": [
    { "type": "formula", "expr": "round(random() * 800)", "as": "x" },
    {
      "type": "formula",
      "expr": "round(datum.x + pow(2, random() * 10))",
      "as": "x2"
    }
  ],
  "mark": "link",
  "encoding": {
    "x": { "field": "x", "type": "index" },
    "x2": { "field": "x2" }
  }
}
```

</genome-spy-doc-embed></div>

## Channels

In addition to the primary and secondary [position](./index.md#channels)
channels and the `color` and `opacity` channels, link mark supports the following
channels: `size`.

## Properties

SCHEMA LinkProps

## Examples

### Different link shapes and orientations

This example shows the different link shapes and orientations. All links have
the same coordinates: `{ x: 2, y: 2, x2: 8, y2: 8 }`. The links are arranged in
grid with

`linkShape` as columns: `"arc"`, `"dome"`, `"diagonal"`, `"line"`.  
`orient` as rows: `"vertical"`, `"horizontal"`.

<div><genome-spy-doc-embed height="350">

```json
{
  "data": { "values": [{ "x": 2, "x2": 8 }] },
  "resolve": {
    "scale": { "x": "shared", "y": "shared" },
    "axis": { "x": "shared", "y": "shared" }
  },

  "encoding": {
    "x": {
      "field": "x",
      "type": "quantitative",
      "scale": { "domain": [0, 10] },
      "axis": { "grid": true }
    },
    "x2": { "field": "x2" },
    "y": {
      "field": "x",
      "type": "quantitative",
      "scale": { "domain": [0, 10] },
      "axis": { "grid": true }
    },
    "y2": { "field": "x2" },
    "size": { "value": 2 }
  },

  "columns": 4,
  "spacing": 20,

  "concat": [
    { "mark": { "type": "link", "linkShape": "arc", "orient": "vertical" } },
    { "mark": { "type": "link", "linkShape": "dome", "orient": "vertical" } },
    {
      "mark": { "type": "link", "linkShape": "diagonal", "orient": "vertical" }
    },
    { "mark": { "type": "link", "linkShape": "line", "orient": "vertical" } },
    { "mark": { "type": "link", "linkShape": "arc", "orient": "horizontal" } },
    { "mark": { "type": "link", "linkShape": "dome", "orient": "horizontal" } },
    {
      "mark": {
        "type": "link",
        "linkShape": "diagonal",
        "orient": "horizontal"
      }
    },
    { "mark": { "type": "link", "linkShape": "line", "orient": "horizontal" } }
  ]
}
```

</genome-spy-doc-embed></div>

### Varying the dome height

This example uses the `"dome"` shape to draw links with varying heights. The
height is determined by the `y` channel. The `clampApex` property is set to
`true` to ensure that the apex of the dome is always visible. Try to zoom in
and pan around to see it in action.

<div><genome-spy-doc-embed height="350">

```json
{
  "data": {
    "sequence": { "start": 0, "stop": 20, "as": "z" }
  },

  "transform": [
    { "type": "formula", "expr": "round(random() * 1000)", "as": "x" },
    {
      "type": "formula",
      "expr": "round(datum.x + random() * 500)",
      "as": "x2"
    },
    { "type": "formula", "expr": "random() * 1000 - 500", "as": "y" }
  ],

  "mark": {
    "type": "link",
    "linkShape": "dome",
    "orient": "vertical",
    "clampApex": true,
    "color": "gray"
  },

  "encoding": {
    "x": { "field": "x", "type": "index" },
    "x2": { "field": "x2" },
    "y": {
      "field": "y",
      "type": "quantitative",
      "axis": { "grid": true }
    }
  }
}
```

</genome-spy-doc-embed></div>
