# Displace 1D

The `"displace1d"` transform separates overlapping items along a positional
axis while keeping them as close as possible to their original positions. It
preserves every input row and writes the signed displacement to a new field.

The `positionFactor` multiplier converts `pos` values into the units used by
`length` and the output displacement. It can be a reactive expression. For
example, an expression can convert an affine positional scale's unit range into
logical pixels. As the view is zoomed in and the scaled positions spread apart,
the transform recomputes the placement and the displacements naturally decrease
to zero. Items at the same position remain separated.

When using the output with an offset channel, make `positionFactor` produce
logical pixels and disable the offset scale:

```json
{
  "transform": [
    {
      "type": "displace1d",
      "pos": "position",
      "length": 18,
      "positionFactor": {
        "expr": "width * (scale('x', 1) - scale('x', 0))"
      },
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

GenomeSpy positional scales use a unit range. In the expression above, the
difference between two scaled values gives the signed unit-range distance for
one position unit. Multiplication by `width` converts that distance to logical
pixels. The expression reacts to both zoom and layout changes. For values that
are already in collision-space units, omit `positionFactor`; its default is
`1`.

## Placement method

The transform minimizes the total squared displacement while preserving item
order and preventing overlaps. After the items have been ordered, this is
solved in linear time using equal-weight least-squares isotonic regression and
the pool-adjacent-violators algorithm (PAVA). See Busing,
[_Monotone Regression: A Simple and Fast O(n) PAVA Implementation_](https://doi.org/10.18637/jss.v102.c01).

The transform accepts numeric positions and does not constrain displaced items
to the viewport. A single `positionFactor` describes affine mappings such as
linear quantitative and index scales. Nonlinear and locus-scale mappings are
not supported directly.

## Parameters

SCHEMA Displace1DParams
