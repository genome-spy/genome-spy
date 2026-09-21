# Displace 2D

The `"displace2d"` transform reduces overlap between axis-aligned rectangles
while keeping them near their anchors. It preserves every input row and writes
signed horizontal and vertical pixel offsets to two fields.

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

EXAMPLE examples/docs/grammar/transform/displace2d/displace2d-labels.json height=300

## Placement model

Each row defines a collision rectangle anchored at `x` and `y`. The transform
maps these values through the view's positional scales, including reversed,
nonlinear, and zoomed scales. Discrete values are placed at the center of their
scale bands. Collision dimensions and output offsets are in logical pixels.

The rectangle is centered on its anchor, so the displaced mark should use
centered alignment. Apply the output fields with unscaled offset channels:

```json
"xOffset": { "field": "labelDx", "type": "quantitative", "scale": null },
"yOffset": { "field": "labelDy", "type": "quantitative", "scale": null }
```

`anchorWidth` and `anchorHeight` can reserve a rectangle around each original
center. Every displaced rectangle avoids every reserved anchor, including its
own. Use the rendered point dimensions plus the desired clearance. Setting
either dimension to zero disables the anchor for that row.

The transform processes rows in input order and gives earlier rectangles higher
placement priority. Use a `collect` transform immediately before `displace2d`
to sort important annotations first. Placement is best-effort: dense or
infeasible arrangements may retain overlaps.

Set `key` when upstream transforms may replace row objects or change their
order or membership between updates. Rows with the same key retain their
progressive placement through cloning, filtering, and reordering. Without a
key, placement state follows object identity only.

The solver considers only the supplied collision rectangles, anchor obstacles,
and viewport bounds. It does not inspect marks, measure text, avoid unrelated
geometry, or route leader lines.

## Viewport participation

Rows with offscreen anchors receive zero offsets and do not participate in
placement. To remove them from downstream processing as well, filter them
before `displace2d` using `inrange` with the current scale domains. Configure
`key` so the remaining labels retain placement when filter membership changes.
`inrange` also supports reversed domains.

## Smooth updates

In interactive views, `displace2d` performs a bounded amount of work per frame
and eases displayed positions toward the evolving placement. It resumes after
data, scale, or layout changes and stops requesting frames after settling.
Headless rendering and disabled transitions solve the same constraints
synchronously.

## Algorithm

Each solver sweep pulls rectangles toward their anchors, keeps them within the
viewport, and projects overlapping pairs apart along their shallowest axis.
Occasional deterministic searches help escape poor local arrangements. Because
every sweep compares every pair of rectangles, the work grows quadratically
with the number of rows and is best suited to a moderate number of annotations.
