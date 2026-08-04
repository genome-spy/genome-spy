# Displace 1D

The `"displace1d"` transform separates overlapping items along a positional
axis while keeping them as close as possible to their original positions. It
preserves every input row and writes the signed displacement to a new field.

Positions are mapped through the selected primary scale before placement. The
`length` is the full collision length in logical pixels and may include any
desired spacing. As the view is zoomed in and the original positions spread
apart, the transform recomputes the placement and the displacements naturally
decrease to zero. Items at the same position remain separated.

Use the output with the offset channel matching `channel`. Disable its scale
because the output is already in logical pixels:

```json
{
  "transform": [
    {
      "type": "displace1d",
      "pos": "position",
      "length": 18,
      "as": "xDisplacement"
    }
  ],
  "encoding": {
    "x": { "field": "position", "type": "quantitative" },
    "xOffset": {
      "field": "xDisplacement",
      "type": "quantitative",
      "scale": null
    }
  }
}
```

The transform supports numeric positions on quantitative and index scales. It
does not constrain displaced items to the viewport, and chromosome-position
field pairs used by locus scales are not supported.

## Parameters

SCHEMA Displace1DParams
