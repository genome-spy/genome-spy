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

TODO, but in principle, the same as in the [rect](./rect.md) mark.

## Properties

TODO, but in principle, the same as in the [rect](./rect.md) mark plus the following:

`size`
: Type: Number

    The stroke width of the lines in pixels.

    **Default value:** `1`

`minLength`
: Type: Number

    The minimum length of the rule.

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
