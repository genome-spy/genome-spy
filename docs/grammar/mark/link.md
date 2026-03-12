# Link

The `"link"` mark displays each data item as a curve that connects two points.
The mark can be used to display structural variation and interactions, for
example. The mark has several different [`linkShape`s](#properties) that control
how the curve is drawn.

EXAMPLE examples/docs/grammar/mark/link/link-mark.json height=250

## Channels

In addition to the primary and secondary [position](./index.md#channels)
channels and the `color` and `opacity` channels, link mark supports the following
channels: `size`.

## Properties

SCHEMA LinkProps

## Examples

### Different link shapes and orientations

This example shows the different link shapes and orientations. All links have
the same coordinates: `{ x: 2, y: 2, x2: 8, y2: 8 }`. The links are arranged in
grid with

`linkShape` as columns: `"arc"`, `"dome"`, `"diagonal"`, `"line"`.  
`orient` as rows: `"vertical"`, `"horizontal"`.

EXAMPLE examples/docs/grammar/mark/link/link-shapes-and-orientations.json height=350

### Varying the dome height

This example uses the `"dome"` shape to draw links with varying heights. The
height is determined by the `y` channel. The `clampApex` property is set to
`true` to ensure that the apex of the dome is always visible. Try to zoom in
and pan around to see it in action.

EXAMPLE examples/docs/grammar/mark/link/dome-height.json height=350
