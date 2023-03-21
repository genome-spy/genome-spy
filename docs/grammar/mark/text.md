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

In addition to primary and secondary [position](./index.md#channels) channels
and `color` and `opacity` channels, point mark has the following channels:

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

`fitToBand`
: Type: Boolean

    If true, sets the secondary positional channel that allows the text to be squeezed
    (see the `squeeze` property).
    Can be used when:
    (1) `"band"`, `"index"`, or `"locus"` scale is being used and
    (2) only the primary positional channel is specified.

    **Default value:** `false`

`paddingX`
: Type: Number

    The horizontal padding, in pixels, when the `x2` channel is used for ranged text.

    **Default value:** `0`

`paddingY`
: Type: Number

    The vertical padding, in pixels, when the `y2` channel is used for ranged text.

    **Default value:** `0`

`flushX`
: Type: Boolean

    If true, the text is kept inside the viewport when the range of `x` and `x2`
    intersect the viewport.

    **Default value:** `true`

`flushY`
: Type: Boolean

    If true, the text is kept inside the viewport when the range of `y` and `y2`
    intersect the viewport.

    **Default value:** `true`

`squeeze`
: Type: Boolean

    If the `squeeze` property is true and secondary positional channels (`x2` and/or `y2`)
    are used, the text is scaled to fit mark's width and/or height.

    **Default value:** `true`

`logoLetters`
: Type: Boolean;

    Stretch letters so that they can be used with [sequence logos](https://en.wikipedia.org/wiki/Sequence_logo), etc...

    **Default value:** `false`

## Examples

GenomeSpy's text mark provides several tricks useful with segmented data and
zoomable visualizations.

### Ranged text

The `x2` and `y2` channels allow for positioning the text inside a segment. The
text is either squeezed (default) or hidden when it does not fit in the segment.
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

### Sequence logo

The example below demonstrates the use of the `logoLetters`, `squeeze`, and
`fitToBand` properties to ensure that the letters fully cover the rectangles
defined by the primary and secondary positional channels. Not all fonts look
good in sequence logos, but _Source Sans Pro_ seems decent.

<div><genome-spy-doc-embed height="150">

```json
{
  "data": {
    "values": [
      { "pos": 1, "base": "A", "count": 2 },
      { "pos": 1, "base": "C", "count": 3 },
      { "pos": 1, "base": "T", "count": 5 },
      { "pos": 2, "base": "A", "count": 7 },
      { "pos": 2, "base": "C", "count": 3 },
      { "pos": 3, "base": "A", "count": 10 },
      { "pos": 4, "base": "T", "count": 9 },
      { "pos": 4, "base": "G", "count": 1 },
      { "pos": 5, "base": "G", "count": 8 },
      { "pos": 6, "base": "G", "count": 7 }
    ]
  },
  "transform": [
    {
      "type": "stack",
      "field": "count",
      "groupby": ["pos"],
      "offset": "information",
      "as": ["_y0", "_y1"],
      "baseField": "base",
      "sort": { "field": "count", "order": "ascending" }
    }
  ],
  "encoding": {
    "x": { "field": "pos", "type": "index" },
    "y": {
      "field": "_y0",
      "type": "quantitative",
      "scale": { "domain": [0, 2] },
      "title": "Information"
    },
    "y2": { "field": "_y1" },
    "text": { "field": "base", "type": "nominal" },
    "color": {
      "field": "base",
      "type": "nominal",
      "scale": {
        "type": "ordinal",
        "domain": ["A", "C", "T", "G"],
        "range": ["#7BD56C", "#FF9B9B", "#86BBF1", "#FFC56C"]
      }
    }
  },
  "mark": {
    "type": "text",
    "font": "Source Sans Pro",
    "fontWeight": 700,
    "size": 100,
    "squeeze": true,
    "fitToBand": true,

    "paddingX": 0,
    "paddingY": 0,

    "logoLetters": true
  }
}
```

</genome-spy-doc-embed></div>
