# Displace 1D

The `"displace1d"` transform separates overlapping items along a positional
axis while keeping them as close as possible to their original positions. It
preserves every input row and writes the signed displacement to a new field.
Input rows must be ordered by ascending scaled position. Use an upstream
`collect` transform to establish that order and provide the replay buffer needed
for reactive updates.

## Parameters

SCHEMA Displace1DParams

## Example

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

## Pixel-space placement

GenomeSpy positional scales use a unit range. In the expression above, the
difference between two scaled values gives the signed unit-range distance for
one position unit. Multiplication by `width` converts that distance to logical
pixels. Thus, `positionFactor` converts the positions to the pixel units used by
`length` and the resulting displacement.

The expression reacts to zoom and layout changes. As zoom spreads the positions
apart, the displacements decrease naturally to zero; items at the same position
remain separated. Setting `scale` to `null` on `xOffset` applies the resulting
pixel offsets directly.

This conversion assumes an affine mapping, such as a linear quantitative,
index, or locus scale. Nonlinear mappings are not supported directly.

## Bounds

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

When all collision intervals fit, the extent acts as a hard bound. If their
combined length exceeds the available extent, items remain non-overlapping and
extend outside it by the minimum necessary amount. Among placements with the
same minimum overflow, the transform minimizes squared displacement. Placement
changes continuously as `positionFactor` changes; active constraints may
change the rate of movement but do not introduce jumps.

## Placement method

The transform minimizes the total squared displacement while preserving the
incoming item order and preventing overlaps. For ordered input, this is solved
in linear time using equal-weight least-squares isotonic regression and the
pool-adjacent-violators algorithm (PAVA). See Busing,
[_Monotone Regression: A Simple and Fast O(n) PAVA Implementation_](https://doi.org/10.18637/jss.v102.c01).
