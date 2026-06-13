# Inside Axis Plan

## Goal

Add a Core axis feature that allows axes to be drawn inside the plotting area.
Inside axes should conserve layout space while preserving the meaning of the
existing axis `orient`.

The important visual rule is that an inside axis is mirrored, not merely shifted
into the plot. For example, a left-oriented y-axis placed inside the plot should
be anchored at the left plot edge and draw its ticks and labels inward, visually
like a right-oriented axis at that edge.

## Scope

This should be a Core axis capability, not a SampleView-specific option.
SampleView should benefit naturally because it already reuses Core `AxisView`
for repeated y-axes.

The first implementation should focus on ordinary ticks, labels, titles, and
axis overhang. Grid lines and genome-specific chromosome axis details can be
handled only if they fall out naturally from the same model; otherwise they
should be evaluated separately.

## Proposed Spec

Add a property to the Core axis spec:

```ts
type AxisPlacement = "outside" | "inside";

interface Axis {
    orient?: "top" | "bottom" | "left" | "right";
    placement?: AxisPlacement;
}
```

Semantics:

- Omitted `placement` means `"outside"` and preserves current behavior.
- `"inside"` draws the axis into the plot area.
- `orient` remains the side of the plot associated with the axis.
- `placement` controls whether the axis is outside or inside that side.
- Inside axes should not reserve external overhang.

This avoids orient values such as `"inside-left"` and keeps side and placement
as separate concepts.

## Vega Prior Art Check

Vega does not appear to provide a first-class inside-axis placement property.
The local Vega sources under `tmp/vega/` expose these relevant axis properties:

- `orient`: `"top"`, `"bottom"`, `"left"`, or `"right"`
- `offset`: orthogonal displacement from the chart edge
- `position`: anchor position along the axis group
- `translate`: pixel-grid translation offset
- custom `encode` blocks for axis parts

The Vega schema and typings do not include a `placement`, `inside`, or
equivalent property. In Vega's parser, tick, label, and title directions are
derived from `orient` through helpers such as `getSign()`, `ifX()`, `ifY()`,
`ifTop()`, and `ifRight()`. The layout pass then places the axis group outside
the chart edge based on `orient` and `offset`.

Vega users can likely approximate inside axes with custom encoders and manual
offsets, but that is not equivalent to a declarative mirrored placement mode.
The proposed GenomeSpy feature should therefore be an explicit Core extension
rather than an attempt to mirror an existing Vega axis property.

## Visual Semantics

Outside axes keep the current behavior:

```text
left outside:   labels ticks | plot
right outside:  plot | ticks labels
top outside:    labels/ticks above plot
bottom outside: labels/ticks below plot
```

Inside axes mirror the tick and label direction into the plot:

```text
left inside:    plot edge | ticks labels ...data
right inside:   data... labels ticks | plot edge
top inside:     plot edge, ticks/labels downward into plot
bottom inside:  plot edge, ticks/labels upward into plot
```

The axis domain line should stay on the same plot edge implied by `orient`.
Ticks, labels, and titles should move to the plot side of that domain line.

## Axis Geometry Model

Currently, much of `AxisView` behavior is derived directly from `orient`:

- anchor location
- tick offset direction
- label alignment
- label angle defaults
- title placement
- perpendicular extent

Inside placement breaks the assumption that `orient` alone determines the
direction of ticks and labels.

Introduce a small internal geometry helper that derives two concepts:

```js
const side = axisProps.orient;
const placement = axisProps.placement ?? "outside";
const tickSide = getAxisTickSide(side, placement);
```

Where `tickSide` is the side toward which ticks and labels extend:

```text
side     outside tickSide   inside tickSide
left     left               right
right    right              left
top      top                bottom
bottom   bottom             top
```

Use `side` for the axis anchor on the plot rectangle. Use `tickSide` for:

- tick offset sign
- label offset sign
- default label alignment and baseline
- title side

This keeps the axis attached to its original side while mirroring the visible
marks inward.

## Overhang And Layout

Outside axes reserve overhang as they do today:

```js
axisView.getPerpendicularSize() + (axisView.axisProps.offset ?? 0)
```

Inside axes should reserve no external overhang. Their perpendicular size still
matters for drawing and optional clipping, but it should not widen or heighten
the parent layout.

GridView and SampleView both need to respect this:

- GridView overhang should ignore inside axes.
- SampleView y-axis lanes should not reserve left or right lane width for inside
  axes.
- SampleView should still render inside axes against sample-local rectangles in
  representative modes such as `"top"`, `"middle"`, and `"bottom"`.

For `sampleYAxis.mode: "all"`, inside axes are possible but may be visually
busy. The Core feature should not special-case this; users can choose whether
to use inside placement.

## Rendering And Clipping

Inside axes are drawn inside the plot rectangle. They may overlap data by
design.

GridView already supports decoration z-ordering through `zindex`. Axis
`zindex` is user-facing: values greater than `0` render after view marks, while
values less than or equal to `0` render before marks. Inside axes should use
that existing mechanism rather than introducing a separate render phase.

The default effective z-index for inside axes should probably be positive so
they appear above the marks they share space with. Explicit `axis.zindex` should
still override that default. Outside axes should keep their current default
behavior, including the existing higher default when view content is clipped or
scrollable.

This means "inside" controls geometry and overhang, while `zindex` continues to
control layering:

- `placement: "inside"` with no `zindex`: render as a plot overlay.
- `placement: "inside", zindex: 0`: render below marks if the user wants the
  data to dominate.
- `placement: "outside"`: preserve current axis layering defaults.

The first implementation should not introduce automatic plot padding, data
avoidance, or label-background masks. Those can be added later if real examples
need them.

Clipping should follow existing axis behavior unless an inside axis visibly
bleeds outside the plot. If clipping becomes necessary, it should clip inside
axes to the plot rectangle, not to an external overhang lane.

## Axis Props And Defaults

Existing axis properties should keep their current meaning where possible:

- `tickSize`: length of ticks, now applied toward `tickSide`.
- `labelPadding`: padding from ticks toward `tickSide`.
- `labelAlign` and `labelBaseline`: explicit values override placement-derived
  defaults.
- `labelAngle`: explicit values override placement-derived defaults.
- `offset`: still offsets the axis line perpendicular to the plot edge.

The `offset` behavior needs careful handling. For outside axes, positive offset
currently moves the axis farther outside. For inside axes, the most coherent
behavior is that positive offset moves the anchored axis line farther inward,
following `tickSide`.

## Genome Axis Considerations

Genome axes have additional chromosome ticks and labels. They currently derive
their tick direction and default label angles from `orient`.

The first design should route genome-axis geometry through the same `side` and
`tickSide` helper if the changes are local and understandable. If that becomes
large, the first implementation may explicitly reject or ignore
`placement: "inside"` for genome-specific chromosome labels and document the
limitation.

## Testing Strategy

Add focused Core tests before implementation:

- A left outside y-axis keeps current overhang and label/tick direction.
- A left inside y-axis reserves no left overhang.
- A left inside y-axis renders tick/label coordinates on the plot side of the
  axis line, mirroring right-axis direction.
- A right inside y-axis mirrors left-axis direction.
- Top and bottom inside axes follow the same rule.
- Existing axis configuration precedence still works.

Add one integration-style test for SampleView:

- A representative sample y-axis with `axis.placement: "inside"` renders but
  does not reserve a SampleView y-axis lane.

## Implementation Notes

Likely files:

- `packages/core/src/spec/axis.d.ts`
- `packages/core/src/view/axisView.js`
- `packages/core/src/view/gridView/gridChild.js`
- `packages/core/src/view/gridView/gridView.js`
- `packages/app/src/sampleView/sampleChromeLayout.js`
- relevant Core and App tests

The main implementation should stay in `axisView.js`. GridView and SampleView
should only need small checks for whether an axis contributes external overhang.

Avoid adding SampleView-specific mirroring logic. SampleView should pass the
same axis props to Core `AxisView` and let Core determine the axis geometry.

## Open Questions

- Should `placement: "inside"` be allowed for genome axes in the first
  implementation, or initially limited to ordinary axes?
- Should inside axis labels be clipped to the plot rectangle by default?
- Should `offset` for inside axes move inward, or should offset remain in the
  same absolute direction as the outside axis?
- Should inside axes support optional label backgrounds later for readability
  over dense data?

## Recommended First Step

Start with ordinary quantitative/linear axes and implement the internal
`side`/`tickSide` geometry helper. Keep the public API limited to
`axis.placement`, defaulting to `"outside"`.

Once ordinary axes work and existing axis tests pass, evaluate genome axes and
SampleView examples visually before extending scope.
