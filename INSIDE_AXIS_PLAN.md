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

## Step-By-Step Implementation Plan

The work should proceed in small commits because axis behavior touches layout,
rendering order, and generated schema docs.

### 1. Add the public axis property and schema docs

Tentative commit message:

```text
feat(core): add axis placement spec
```

Add `AxisPlacement = "outside" | "inside"` and `placement?: AxisPlacement` to
the Core axis spec. Document that `"outside"` is the default and that inside
axes draw into the plotting area without reserving external layout space.

Evaluation point:

- Generated schema/types accept `axis.placement`.
- Existing specs remain valid without migration.
- The docs avoid promising automatic padding, label backgrounds, or
  data-avoidance behavior.

### 2. Introduce axis-side geometry helpers

Tentative commit message:

```text
refactor(core): separate axis anchor side from tick side
```

Add a small internal helper that resolves:

- the anchor side from `orient`
- the placement from `axis.placement ?? "outside"`
- the tick/label side by mirroring the anchor side when placement is `"inside"`

Use this helper in ordinary axis tick, label, title, and size calculations.
Keep the existing outside-axis snapshots and tests passing before changing
layout behavior.

Evaluation point:

- Outside axes are behaviorally unchanged.
- The helper reduces repeated orientation branching instead of adding parallel
  inside-axis branches throughout `AxisView`.
- Explicit `labelAlign`, `labelBaseline`, `labelAngle`, and title properties
  still override defaults.

### 3. Make inside axes render with no external overhang

Tentative commit message:

```text
feat(core): exclude inside axes from external overhang
```

Update GridView/GridChild overhang calculations so inside axes do not reserve
space outside the plot. Keep outside-axis overhang unchanged.

For SampleView, make the y-axis lane reservation ignore inside axes while still
allowing SampleView to render the same `AxisView` instances against sample-local
plot rectangles.

Evaluation point:

- A left inside y-axis does not increase left overhang.
- A right inside y-axis does not increase right overhang.
- Existing outside-axis alignment in concat/vconcat still works.
- SampleView inside y-axes do not create sidebar-to-plot spacer lanes.

### 4. Align rendering order with existing z-index semantics

Tentative commit message:

```text
feat(core): default inside axes to plot overlays
```

Do not add a new inside-axis render phase. Use the existing decoration z-index
pipeline. Inside axes should get a positive effective default z-index so they
render after marks, while explicit `axis.zindex` continues to override the
default.

Evaluation point:

- `placement: "inside"` with omitted `zindex` renders above marks.
- `placement: "inside", zindex: 0` renders before marks.
- Outside axes keep their current default z-index behavior, including clipped
  or scrollable views.
- Existing GridView z-index tests remain meaningful and only need focused
  additions for inside placement.

### 5. Add focused layout and rendering tests

Tentative commit message:

```text
test(core): cover inside axis layout and zindex
```

Add tests close to the affected code. Prefer layout snapshot utilities where
they capture the contract clearly.

Suggested coverage:

- left/right/top/bottom inside axes reserve no external overhang
- left inside y-axis mirrors right-axis tick/label direction
- right inside y-axis mirrors left-axis tick/label direction
- top/bottom inside axes mirror vertically
- explicit `axis.zindex` overrides the inside-axis overlay default
- outside axes keep existing overhang and z-index behavior

Evaluation point:

- Tests describe durable behavior rather than implementation details.
- No tests depend on temporary compatibility branches.
- The assertions catch both geometry and layout regressions.

### 6. Evaluate genome axes separately

Tentative commit message if support is straightforward:

```text
feat(core): support inside placement for genome axes
```

Tentative commit message if support is deferred:

```text
docs(core): document inside axis genome limitation
```

Try routing genome-specific axis pieces through the same side/tick-side helper.
If this stays local and clear, include genome axes in the feature. If it spreads
large special cases through `AxisView`, defer it and document the limitation.

Evaluation point:

- Ordinary quantitative axes should not be held hostage by genome-specific
  complexity.
- Genome support should share the same geometry model or be explicitly scoped
  out for the first version.

### 7. Verify SampleView behavior with representative axes

Tentative commit message:

```text
test(app): cover inside sample y axes
```

Add or adjust SampleView tests for `sampleYAxis` modes that render one
representative axis. The feature remains a Core axis property, but SampleView is
the main motivating consumer and should not accidentally reserve axis lanes for
inside axes.

Evaluation point:

- `sampleYAxis.mode: "top"`, `"middle"`, or `"bottom"` can render an inside
  y-axis without external lane reservation.
- `sampleYAxis.mode: "all"` works mechanically, even if it may be visually busy.
- Toggleable-layer axis visibility remains based on visible axis candidates.

### 8. Update user-facing docs and examples only after behavior settles

Tentative commit message:

```text
docs: document inside axes
```

Update schema-derived docs and add a concise user-facing note where axis
placement belongs. Avoid SampleView-specific framing except as an example of
why inside axes are useful.

Evaluation point:

- The docs explain `placement` as a Core axis property.
- Defaults and limitations match the implemented behavior.
- Examples remain small and inspectable.

### 9. Final verification

Tentative commit message only if fixes are needed:

```text
fix(core): polish inside axis edge cases
```

Run focused tests during development, then broader checks before review:

```text
npx vitest run packages/core/src/view/gridView/gridView.test.js
npx vitest run packages/app/src/sampleView/sampleView.test.js
npm --workspaces run test:tsc --if-present
```

Evaluation point:

- No known layout regressions for outside axes.
- Inside axes work in ordinary GridView and SampleView scenarios.
- Any remaining unsupported cases are documented rather than silently broken.
