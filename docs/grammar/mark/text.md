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
    "text": { "field": "text" },
    "size": { "value": 100 }
  }
}
```

</genome-spy-doc-embed></div>

## Channels

In addition to primary and secondary [position](./index.md#channels) channels
and `color` and `opacity` channels, point mark has the following channels:
`text`, `size`, and `angle`.

## Properties

SCHEMA TextProps

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
          "expr": "'Hello ' + floor(datum.a)"
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
