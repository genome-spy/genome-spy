# Link

The `"link"` mark displays each data item as a curve that connects two points.
The mark can be used to display structural variation and interactions, for
example.

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

!!! warning "Still under development"

    The parameterization is likely to be changed a bit to support
    more use cases.

## Channels

In addition to the primary and secondary [position](./index.md#channels)
channels and the `color` and `opacity` channels, link mark supports the following
channels:

`size`
: Type: Number

    Stroke width of the starting point in pixels.

## Properties

`segments`
: Type: Number

    Number of segments in the bézier curve. Affects the rendering quality and speed.

    **Default value:** `101`

`minPickingSize`
: Type: Number

    The minimum stroke width of the links when pointing with the mouse cursor.
    Allows making very thin links easier to point at.

    **Default value:** `3.0`

## Examples

<div><genome-spy-doc-embed height="350">

```json
{
  "width": 300,
  "height": 300,
  "data": {
    "sequence": { "start": 0, "stop": 12, "as": "z" }
  },
  "transform": [
    { "type": "formula", "expr": "datum.z / 12 * 3.141 * 2", "as": "theta" },
    { "type": "formula", "expr": "cos(datum.theta)", "as": "x" },
    { "type": "formula", "expr": "sin(datum.theta)", "as": "y" }
  ],
  "mark": {
    "type": "link",
    "size": 7
  },
  "encoding": {
    "x": { "datum": 0, "type": "quantitative" },
    "x2": { "field": "x" },
    "y": { "datum": 0, "type": "quantitative" },
    "y2": { "field": "y" },
    "color": {
      "field": "theta",
      "type": "quantitative",
      "scale": { "scheme": "rainbow" }
    }
  }
}
```

</genome-spy-doc-embed></div>
