# Text

Text mark displays each data item as text.

<div class="embed-example">
<div class="embed-container" style="height: 200px"></div>
<div class="embed-spec">
```json
{
  "data": { "url": "sincos.csv" },
  "mark": "text",
  "encoding": {
    "x": { "field": "x", "type": "quantitative" },
    "y": { "field": "sin", "type": "quantitative" },
    "text": { "field": "sin", "type": "quantitative", "format": ".2f" },
    "size": {
      "field": "x",
      "type": "quantitative",
      "scale": {
        "range": [6, 28]
      }
    }
  }
}
```
</div>
</div>

## Channels

In addition to standard [position](../encoding/index.md) channels and
`color` and `opacity` channels, point mark has the following
channels:

`text`
: Type: String

    The text to display. The format of numeric data can be customized with
    a [format specifier](https://github.com/d3/d3-format#locale_format) as
    shown in the example above.

    **Default value:** `""`

`size`
: Type: Number

    The font size in pixels.

    **Default value:** `11`

## Properties

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

The `x2` channel allows for positioning the text inside a segment. The text is
hidden if it does not fit in the segment.

The example below has two layers: gray rectangles at the bottom and ranged
text on the top. Try to zoom and pan to see how they behave!

<div class="embed-example">
<div class="embed-container" style="height: 250px"></div>
<div class="embed-spec">
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
    "x": { "field": "a", "type": "index" },
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
</div>
</div>
