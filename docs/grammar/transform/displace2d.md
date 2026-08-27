# Displace 2D

The `"displace2d"` transform separates overlapping axis-aligned rectangles in
two dimensions. It preserves every input row and writes signed horizontal and
vertical pixel offsets to two fields. Earlier input rows have placement
priority, so use an upstream `collect` transform when priority matters.

`displace2d` operates on generic rectangle geometry. For text annotations,
measure the label width with [`measureText`](./measure-text.md), include the
desired spacing in the collision dimensions, and apply the output fields with
unscaled offset channels.

## Parameters

SCHEMA Displace2DParams

## Example

Zoom the scatterplot to see the labels recompute. The same displacement fields
move both the centered text and one endpoint of each leader line.

EXAMPLE examples/docs/grammar/transform/displace2d/displace2d-labels.json height=420

## Geometry and ordering

The `x` and `y` fields specify the original center of each collision rectangle.
`width` and `height` specify its full size in logical pixels, including any
desired spacing. They can be constants, datum fields, or reactive expressions
that provide a shared value. Marks should use centered alignment or adjust
their anchor coordinates before displacement.

The transform visits rows in input order and places each rectangle at the
first available candidate in a bounded deterministic sequence around its
original center. Sorting by a priority field immediately before `displace2d`
gives important annotations the first choice of positions. The transform always
preserves every row.

## Pixel-space placement

GenomeSpy positional scales use a unit range. Position factors convert source
coordinates to the logical-pixel coordinate system used by the collision sizes
and output offsets. For affine x and y scales, use:

```json
"xPositionFactor": {
  "expr": "width * (scale('x', 1) - scale('x', 0))"
},
"yPositionFactor": {
  "expr": "height * (scale('y', 0) - scale('y', 1))"
}
```

The reversed subtraction for y matches screen offsets: positive `yOffset`
moves down, while a normal quantitative y scale increases upward. Negative
position factors are supported.

Scale and layout changes automatically update expression-backed factors. Set
the offset channels' scales to `null` so the resulting logical-pixel offsets
are applied directly:

```json
"xOffset": { "field": "labelDx", "type": "quantitative", "scale": null },
"yOffset": { "field": "labelDy", "type": "quantitative", "scale": null }
```

The factor conversion supports affine mappings. For nonlinear scales, derive
pixel positions upstream instead of using position factors.

## Preferred bounds and overflow

`xExtent` and `yExtent` provide preferred outer bounds in the original x and y
coordinate systems. Reactive domain expressions keep the preferred bounds at
the visible plot edges:

```json
"xExtent": { "expr": "domain('x')" },
"yExtent": { "expr": "domain('y')" }
```

Accepted local candidates stay inside every supplied extent. If the bounded
search cannot place a rectangle there, the transform preserves it in a
non-overlapping overflow row to the right of the crowded region. Thus, extents
are preferences rather than a visibility or clipping policy. Downstream marks
still control clipping, opacity, tooltips, and leader-line styling.

The transform prevents collisions only between the supplied rectangles. It
does not inspect rendered marks, avoid unrelated points, measure text
automatically, or route leader lines.
