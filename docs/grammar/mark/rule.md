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

`size`
: Type: Number

    The stroke width of the lines in pixels.

    **Default value:** `1`

`minLength`
: Type: Number

    The minimum length of the rule in pixels. Use this property to ensure that
    very short rules remain visible even when the user zooms out.

    **Default value:** `0`

`strokeDash`
: Type: Number[]

    An array of of alternating stroke and gap lengths or `null` for solid
    strokes.

    **Default value:** `null`

`strokeDashOffset`
: Type: Number

    An offset for the stroke pattern.

    **Default value:** `0`

`strokeCap`
: Type: String

    The style of stroke ends. Available choices: `"butt"`, `"round`", and
    `"square"`.

    **Default value:** `"butt"`

`xOffset`
: Type: Number

    Offsets of the `x` and `x2` coordinates in pixels. The offset is applied
    after the viewport scaling and translation.

    **Default value:** `0`

`yOffset`
: Type: Number

    Offsets of the `y` and `y2` coordinates in pixels. The offset is applied
    after the viewport scaling and translation.

    **Default value:** `0`

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
