# Text

Text mark displays each data item as text.

<div><genome-spy-doc-embed height="150">

```json
{
  "data": {
    "values": [
      { "x": 1, "text": "Hello" },
      { "x": 2, "text": "world!" }
    ]
  },
  "mark": "text",
  "encoding": {
    "x": { "field": "x", "type": "ordinal" },
    "color": { "field": "x", "type": "nominal" },
    "text": { "field": "text", "type": "nominal" },
    "size": { "value": 100 }
  }
}
```

</genome-spy-doc-embed></div>

## Channels

In addition to standard [position](../encoding/index.md) channels and
`color` and `opacity` channels, point mark has the following
channels:

`text`
: Type: String

    The text to display. The format of numeric data can be customized by
    setting a [format specifier](https://github.com/d3/d3-format#locale_format)
    to channel definition's `format` property.

    **Default value:** `""`

`size`
: Type: Number

    The font size in pixels.

    **Default value:** `11`

`angle`
: Type: Number

    The rotation angle in degrees.

    **Default value:** `0`

## Properties

`font`
: Type: String

    The font typeface. GenomeSpy uses [SDF](https://github.com/Chlumsky/msdfgen)
    versions of [Google Fonts](https://fonts.google.com/). Check their
    availability at the [A-Frame
    Fonts](https://github.com/etiennepinchon/aframe-fonts/tree/master/fonts)
    repository. The system fonts are **not** supported.

    **Default value:** `"Lato"`

`fontWeight`
: Type: String | Number

    The font weight. The following strings and numbers are valid values:
    `"thin"` (`100`),
    `"light"` (`300`),
    `"regular"` (`400`),
    `"normal"` (`400`),
    `"medium"` (`500`),
    `"bold"` (`700`),
    `"black"` (`900`)

    **Default value:** `"regular"`

`fontStyle`
: Type: String

    The font style. Valid values: `"normal"` and `"italic"`.

    **Default value:** `"normal"`

`align`
: Type: String

    The horizontal alignment of the text.
    One of `"left"`, `"center"`, or `"right"`.

    **Default value:** `"left"`

`baseline`
: Type: String

    The vertical alignment of the text.
    One of `"top"`, `"middle"`, `"bottom"`.

    **Default value:** `"bottom"`

`dX`
: Type: Number

    Offset of the x coordinate in pixels. The offset is applied after
    the viewport scaling and translation.

    **Default value:** `0`

`dY`
: Type: Number

    Offset of the x coordinate in pixels. The offset is applied after
    the viewport scaling and translation.

    **Default value:** `0`

## Examples

### Ranged text

The `x2` and `y2` channels allow for positioning the text inside a segment. The
text is either squeezed (default) or hidden if it does not fit in the segment.
The `squeeze` property controls the behavior.

The example below has two layers: gray rectangles at the bottom and ranged
text on the top. Try to zoom and pan to see how they behave!

<div><genome-spy-doc-embed height="250">

```json
{
  "data": {
    "values": ["A", "B", "C", "D", "E", "F", "G"]
  },
  "transform": [
    { "type": "formula", "expr": "round(random() * 100)", "as": "a" },
    { "type": "formula", "expr": "datum.a + round(random() * 60)", "as": "b" }
  ],
  "encoding": {
    "x": { "field": "a", "type": "quantitative", "scale": { "zoom": true } },
    "x2": { "field": "b" },
    "y": {
      "field": "data",
      "type": "nominal",
      "scale": {
        "padding": 0.3
      }
    }
  },
  "layer": [
    {
      "mark": "rect",
      "encoding": { "color": { "value": "#eaeaea" } }
    },
    {
      "mark": {
        "type": "text",
        "align": "center",
        "baseline": "middle",
        "paddingX": 5
      },
      "encoding": {
        "text": {
          "expr": "'Hello ' + floor(datum.a)",
          "type": "ordinal"
        },
        "size": { "value": 12 }
      }
    }
  ]
}
```

</genome-spy-doc-embed></div>
