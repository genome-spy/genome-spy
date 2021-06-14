# Connection

Connection mark displays each data item as a curve that connects two points.
The mark can be used to display structural variation and interactions, for example.

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
  "mark": "connection",
  "encoding": {
    "x": { "field": "x", "type": "index" },
    "x2": { "field": "x2" },
    "height": {
      "expr": "abs(datum.x2 - datum.x)",
      "type": "quantitative"
    }
  }
}
```

</genome-spy-doc-embed></div>

!!! warning "Still under development"

    The parameterization is likely to be changed a bit to support
    more use cases.

## Channels

In addition to the standard [position](../encoding/index.md) channels and
`color` and `opacity` channels, connection mark supports the following channels:

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

TODO
