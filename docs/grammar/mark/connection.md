# Connection

Connection mark displays each data item as a curve that connects two points.
The mark can be used to display structural variation and interactions, for example.

<div class="embed-example">
<div class="embed-container" style="height: 250px"></div>
<div class="embed-spec">

```json
{
  "data": {
    "sequence": { "start": 0, "stop": 30, "as": "z" }
  },
  "transform": [
    { "type": "formula", "expr": "random() * 800", "as": "x" },
    { "type": "formula", "expr": "datum.x + pow(2, random() * 10)", "as": "x2" }
  ],
  "mark": "connection",
  "encoding": {
    "x": { "field": "x", "type": "quantitative" },
    "x2": { "field": "x2" },
    "height": {
      "expr": "abs(datum.x2 - datum.x)",
      "type": "quantitative"
    }
  }
}
```

</div>
</div>

!!! warning "Still under development"

    Connection mark does not currently support details on demand (tooltips).
    Also, the parameterization is likely to be changed a bit to support
    more use cases.

## Channels

In addition to the standard [position](../encoding/index.md) channels and
`color` and `opacity` channels, connection mark supports the following channels:

`height`
: Type: Number

    If the `y` and `y2` are equal or left undefined, the connections are rendered as arcs.
    The height channel specifies their heights.

`size`
: Type: Number

    Stroke width of the starting point in pixels.

`size2`
: Type: Number

    Stroke width of the end point in pixels. Same as `size` if left undefined.

`color2`
: Type: Number

    Color of the end point. Same as `color` if left undefined.

## Properties

`segments`
: Type: Number

    Number of segments in the bézier curve. Affects the rendering quality and speed.

    **Default value:** `101`

## Examples

### More channels

When the `y` and `y2` channels are unequal, the height is ignored and only the
_x_-axis is zoomed.

<div class="embed-example">
<div class="embed-container" style="height: 300px"></div>
<div class="embed-spec">

```json
{
  "data": {
    "sequence": { "start": 0, "stop": 40, "as": "z" }
  },
  "transform": [
    { "type": "formula", "expr": "random() * 1000", "as": "x" },
    { "type": "formula", "expr": "random() * 1000", "as": "x2" }
  ],
  "mark": "connection",
  "encoding": {
    "y": { "value": 0 },
    "y2": { "value": 1 },
    "x": { "field": "x", "type": "quantitative" },
    "x2": { "field": "x2" },
    "opacity": { "value": 0.5 },
    "color": { "value": "black" },
    "color2": { "value": "red" },
    "size": { "value": 1 },
    "size2": { "value": 7 }
  }
}
```

</div>
</div>

### Connections between bands

<div class="embed-example">
<div class="embed-container" style="height: 350px"></div>
<div class="embed-spec">

```json
{
  "layer": [
    {
      "data": {
        "sequence": { "start": 1, "stop": 4, "as": "band" }
      },
      "mark": "rect",
      "encoding": {
        "y": {
          "field": "band",
          "type": "nominal",
          "scale": { "type": "band", "paddingInner": 0.6, "paddingOuter": 0.25 }
        },
        "x": { "datum": 0, "type": "quantitative" },
        "x2": { "datum": 20 },
        "color": { "value": "#e0e0e0" }
      }
    },
    {
      "data": {
        "sequence": { "start": 0, "stop": 10, "as": "z" }
      },
      "transform": [
        { "type": "formula", "expr": "random() * 10", "as": "x" },
        { "type": "formula", "expr": "random() * 10 + 10", "as": "x2" },
        { "type": "formula", "expr": "ceil(random() * 3)", "as": "band" },
        { "type": "formula", "expr": "ceil(random() * 3)", "as": "band2" }
      ],
      "mark": "connection",
      "encoding": {
        "x": { "field": "x", "type": "quantitative" },
        "x2": { "field": "x2" },
        "y": { "field": "band", "type": "nominal" },
        "y2": { "field": "band2" },
        "size": { "value": 1.5 },
        "height": {
          "expr": "abs(datum.x2 - datum.x)",
          "type": "quantitative",
          "scale": {
            "range": [0.01, 0.2]
          }
        },
        "color": {
          "expr": "datum.band != datum.band2 ? 1 : 0",
          "type": "nominal",
          "scale": {
            "domain": [0, 1],
            "range": ["red", "black"]
          }
        }
      }
    }
  ]
}
```

</div>
</div>
