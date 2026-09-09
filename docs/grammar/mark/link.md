# Link

The `"link"` mark displays each row as a curve that connects two points.
The mark can be used to display structural variation and interactions, for
example. The mark has several different [`linkShape`s](#showing-selected-arcs-in-full) that control
how the curve is drawn.

EXAMPLE examples/docs/grammar/mark/link/link-mark.json height=250

## Channels

In addition to the primary and secondary [position](./index.md#channels)
channels and the `color` and `opacity` channels, link mark supports the following
channels: `size`.

## Properties

SCHEMA LinkProps

## Showing selected arcs in full

Distance fading gives arcs a softer ending than abrupt clipping and reduces
clutter when showing structural variants across [multiple samples](../../sample-collections/visualizing.md).
Disabling fading for selected arcs makes their connections easier to follow,
especially in dense multi-sample views. Combine conditional
[draw order](./index.md) with `noFadingOnSecondPass: true`:

```json
{
  "mark": {
    "type": "link",
    "arcFadingDistance": [100, 200],
    "noFadingOnSecondPass": true
  },
  "encoding": {
    "order": {
      "condition": { "param": "picked", "empty": false, "value": 1 },
      "value": 0
    }
  }
}
```

This fragment assumes a selection parameter named `picked` and positional
encodings for the link endpoints. The lower order level draws first with normal
fading. The higher level draws second without fading, so selected links appear
in full above the others. The option follows the **second partition**, not
selection membership: reversing the order values makes unselected links unfaded.

The option defaults to `false`. Without active conditional ordering, including
when every referenced selection is empty, all links retain normal fading.

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
