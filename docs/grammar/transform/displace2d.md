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

Zoom the scatterplot to see the labels recompute and move smoothly. Leader
lines stop at the edge of the centered text instead of continuing underneath
it.

EXAMPLE examples/docs/grammar/transform/displace2d/displace2d-labels.json height=420

## Geometry and ordering

The `x` and `y` fields specify the original center of each collision rectangle.
`width` and `height` specify its full size in logical pixels, including any
desired spacing. They can be constants, datum fields, or reactive expressions
that provide a shared value. Marks should use centered alignment or adjust
their anchor coordinates before displacement.

`anchorWidth` and `anchorHeight` can reserve a rectangle around each original
center. Every displaced rectangle avoids every reserved anchor, including its
own. Use the rendered point dimensions plus the desired clearance. Setting
either dimension to zero disables the anchor for that row.

The transform processes rows in input order and gives earlier rectangles higher
placement priority. Sorting by a priority field immediately before
`displace2d` gives important annotations more influence over the result. The
solver progressively reduces overlap while preferring positions near the
original centers. Dense or infeasible arrangements may retain overlaps. The
transform always preserves every row.

Set `key` when upstream transforms may replace row objects or change their
order or membership between updates. Rows with the same key retain their
progressive placement through cloning, filtering, and reordering. Without a
key, placement state follows object identity only.

## Position scales

The transform maps `x` and `y` through the view's positional scales. It follows
zoom and layout changes, respects reversed and nonlinear scales, places
categorical positions at the center of their scale bands, and uses the viewport
as the placement extent. Collision dimensions and output offsets remain in
logical pixels.

Set the offset channels' scales to `null` so the resulting offsets are applied
directly:

```json
"xOffset": { "field": "labelDx", "type": "quantitative", "scale": null },
"yOffset": { "field": "labelDy", "type": "quantitative", "scale": null }
```

The transform considers the supplied rectangles and configured anchors only. It
does not inspect rendered marks, avoid unrelated points, measure text
automatically, or route leader lines.

## Viewport participation

`displace2d` processes every input row. To exclude annotations with offscreen
anchors, filter them before displacement using `inrange` with the current scale
domains. Configure `key` so labels that remain visible keep their placement as
the filter membership changes. `inrange` also supports reversed domains.

## Smooth updates

In interactive views, `displace2d` advances the solver within a per-frame work
budget and eases displayed positions toward the evolving placement. It stops
requesting frames after the layout settles. Headless rendering and disabled
transitions solve the same constraints synchronously.
