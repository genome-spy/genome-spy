# Displace 1D

The `"displace1d"` transform separates overlapping items along a positional
axis while keeping them as close as possible to their original positions. It
preserves every input row and writes the signed displacement to a new field.
Input rows must be ordered by ascending scaled position. Use an upstream
`collect` transform to establish that order and provide the replay buffer needed
for reactive updates.

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
      "type": "collect",
      "sort": { "field": "position", "order": "ascending" }
    },
    {
      "type": "displace1d",
      "pos": "position",
      "length": 18,
      "positionFactor": {
        "expr": "width * (scale('x', 1) - scale('x', 0))"
      },
      "extent": [0.5, 1068.5],
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

Use `extent` to keep collision intervals inside preferred outer bounds. The
bounds use the original `pos` coordinate system and are multiplied by
`positionFactor` together with the item positions. For a one-based index scale
covering protein residues 1 through 1068, `[0.5, 1068.5]` represents the outer
edges of the first and last residue bands.

`extent` can also be a reactive expression. For example, the following keeps
the preferred bounds at the edges of the currently visible x domain:

```json
"extent": { "expr": "[invert('x', 0), invert('x', 1)]" }
```

As with an expression-backed `positionFactor`, place a `collect` transform
upstream so that changes can replay the input data.

`length` can likewise be a reactive expression when all items use the same
collision length. For example, `{"expr": "labelSpacing"}` updates placement
when the `labelSpacing` parameter changes. Use a field instead when collision
lengths vary by row.

When all collision intervals fit, the extent acts as a hard bound. If their
combined length exceeds the available extent, items remain non-overlapping and
extend outside it by the minimum necessary amount. Among placements with the
same minimum overflow, the transform minimizes squared displacement. Placement
changes continuously as `positionFactor` changes; active constraints may
change the rate of movement but do not introduce jumps.

For a positive `positionFactor`, sort `pos` in ascending order as above. For a
negative factor, sort it in descending order. Unsorted scaled positions cause
an error. Equal positions preserve their incoming order.

## Placement method

The transform minimizes the total squared displacement while preserving the
incoming item order and preventing overlaps. For ordered input, this is solved
in linear time using equal-weight least-squares isotonic regression and the
pool-adjacent-violators algorithm (PAVA). See Busing,
[_Monotone Regression: A Simple and Fast O(n) PAVA Implementation_](https://doi.org/10.18637/jss.v102.c01).

The transform accepts numeric positions. `extent` is expressed in position
coordinates rather than viewport coordinates, so the transform remains
independent of scales and view layout. A single `positionFactor` describes
affine mappings such as linear quantitative and index scales. Nonlinear and
locus-scale mappings are not supported directly.

## Parameters

SCHEMA Displace1DParams
