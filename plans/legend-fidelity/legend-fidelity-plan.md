# Legend fidelity porting plan

## Summary

Port the useful, placement-independent legend improvements from
`feature/legends-2.0` onto the current `master`. The old branch is a behavioral
reference only: its `legend.placement: "local" | "root"` model has been replaced
by `resolve.legend: "collected" | "excluded"` and must not be restored.

The port covers three related concerns:

1. Correct legend and plot sizing so legend chrome does not distort sibling
   flex allocation.
2. Separate entry layout from complete-legend region layout, including stack
   direction and edge anchoring.
3. Add the most useful Vega-compatible gradient legend controls.

Implement these as focused changes against the current collector architecture,
with a commit after each implementation step.

## Background and provenance

The earlier implementation is preserved on `feature/legends-2.0`. The most
relevant commits are:

- `c4d58b82d`: keep legends out of sibling flex sizing.
- `fc99216e8`: pack horizontal symbol legends naturally.
- `50796ae50`: rename the track-bottom legend style.
- `1eb3f4017`: respect legend entry direction.
- `887f63041` and `758f26a47`: configure and apply region anchors.
- `a6fd8888c` and `3f2b6677c`: gradient controls and border extent.
- `0e9c567a2`: centralize legend defaults.

Do not cherry-pick these commits. They were built around the superseded root
placement model and predate the collected-resolution implementation now in
`packages/core/src/view/gridView/legendCollection.js` and
`packages/core/src/view/gridView/guideViewSync.js`.

The public property names and region layout concepts are based on Vega:

- [Vega legend properties](https://vega.github.io/vega/docs/legends/)
- `tmp/vega/docs/docs/legends.md`
- `tmp/vega/packages/vega-view-transforms/src/layout/legend.js`
- `tmp/vega/packages/vega-typings/types/spec/legend.d.ts`

Vega is BSD-3-Clause licensed, which is compatible with adapting these
concepts. The implementation should be native to GenomeSpy rather than copied
line-for-line. Retain an “Adapted from Vega” reference near public defaults or
non-obvious layout logic.

## Current architecture

On current `master`:

- `LegendResolution` retains semantic ownership and legend definitions.
- `findLegendCollectionDeclaration()` routes complete legends to the nearest
  composition declaring `"collected"`.
- `GridView` and `GridChild` both create `LegendView` instances through the
  helpers in `gridChildLegends.js`.
- `LegendRegionView` groups complete legends by `orient`.
- `legendLayout.js` places each orientation region around its destination plot
  or grid.
- Individual legend defaults are resolved from the source legend's config
  scopes by `getConfiguredLegendDefaults()`.

Two current behaviors need correction:

- Legend parallel-size constraints participate in `GridView` flex sizing and
  can make otherwise equal sibling plots receive different dimensions.
- `LegendView` currently treats `orient: "top" | "bottom"` as an implicit
  horizontal entry direction, even though `direction` is the property that is
  documented to control entries.

Region layout must integrate at `addLegendView()`, where both local/shared and
collected legends enter their physical destination. It must not add another
collection or routing mechanism.

## Goals

- Keep legend chrome from changing sibling plot flex allocation.
- Make `legend.direction` the sole control for entries within one legend.
- Arrange complete legends horizontally or vertically per orientation region.
- Anchor external legend stacks at the start, middle, or end of the plot edge.
- Apply region configuration at the destination collector so collected legends
  use the collector's layout policy.
- Add fixed gradient length, thickness, opacity, border, and desired tick count.
- Preserve adaptive gradient sizing when no fixed length is configured.
- Preserve local, shared, collected, excluded, mutation, and visibility
  semantics.
- Keep the implementation small and reuse the existing region and guide
  lifecycle.

## Non-goals

- Do not add `legend.placement`, `"root"`, or any replacement physical-routing
  property.
- Do not change scale or legend resolution topology.
- Do not merge or deduplicate independent collected legends.
- Do not add named legend regions, arbitrary placement targets, wrapping,
  overflow clipping, or a generalized guide scheduler.
- Do not add Vega's complete legend surface. In particular, defer
  `tickMinStep`, tick styling, explicit legend type, label-overlap controls, and
  symbol override properties.
- Do not add Vega-Lite's orientation-specific gradient min/max length settings.
- Do not mechanically port the old branch's large test-suite split. Extract a
  shared test helper only if the new focused tests would otherwise duplicate
  substantial setup.
- Do not retain old root-placement examples or documentation.

## Public specification

### Entry direction

Keep the existing property:

```ts
type LegendDirection = "vertical" | "horizontal";

interface Legend {
    direction?: LegendDirection;
}
```

`direction` controls entries within one complete legend. Its default is
`"vertical"`, independent of `orient`.

This corrects a behavioral inconsistency. Specifications that relied on a top
or bottom orientation implicitly making entries horizontal must add
`"direction": "horizontal"`. The built-in genome-track legend style must add
that property explicitly to preserve its compact behavior.

### Region layout

Add destination-level region layout to `LegendConfig`:

```ts
type LegendRegionAnchor = "start" | "middle" | "end";

interface LegendRegionLayout {
    anchor?: LegendRegionAnchor;
    direction?: LegendDirection;
}

interface LegendLayout extends LegendRegionLayout {
    left?: LegendRegionLayout;
    right?: LegendRegionLayout;
    top?: LegendRegionLayout;
    bottom?: LegendRegionLayout;
    "top-left"?: LegendRegionLayout;
    "top-right"?: LegendRegionLayout;
    "bottom-left"?: LegendRegionLayout;
    "bottom-right"?: LegendRegionLayout;
}

interface LegendConfig extends Legend {
    layout?: LegendLayout;
}
```

Resolve each property in this order:

1. `config.legend.layout[orient]` at the destination collector.
2. `config.legend.layout` at the destination collector.
3. Built-in defaults.

Default complete-legend packing is vertical for left and right regions and
horizontal for top, bottom, and corner regions. The default external anchor is
`"start"`.

`layout` is region configuration, not an individual legend property. Remove it
from the object returned by `getConfiguredLegendDefaults()` so it cannot leak
into `LegendDefinition.legend`. Resolve it separately from the destination
view's config scopes when creating a region.

`spacing` remains an individual legend/config property for compatibility. The
first legend currently determines region spacing; redesigning that precedence
is outside this port.

### Gradient controls

Add the following static properties to `Legend` and therefore to
`config.legend`:

```ts
interface Legend {
    gradientLength?: number;
    gradientThickness?: number;
    gradientOpacity?: number;
    gradientStrokeColor?: string;
    gradientStrokeWidth?: number;
    tickCount?: number;
}
```

Semantics:

- `gradientLength` is the ramp-body width for a horizontal gradient and height
  for a vertical gradient. Titles and padding are additional.
- With no `gradientLength`, retain GenomeSpy's adaptive behavior when the ramp
  axis is parallel to its region. Otherwise use the existing natural length.
- `gradientThickness` replaces the hard-coded 12-pixel ramp thickness.
- `gradientOpacity` affects only ramp samples.
- `gradientStrokeColor` and `gradientStrokeWidth` draw one border around the
  complete ramp without replacing an encoded stroke channel.
- The centered border stroke must be included in measured ramp extent so it is
  neither clipped nor allowed to overlap adjacent content.
- `tickCount` is a desired count passed to scale tick generation. Explicit
  `values` take precedence.

Validation constraints:

- Length, thickness, and stroke width are non-negative.
- Opacity is between zero and one.
- Tick count is at least one.
- These properties do not accept `ExprRef` in this iteration.

Defaults should live in `legendDefaults.js` and be reused by generated specs
and size calculations:

- `gradientThickness`: `12`
- `gradientOpacity`: `1`
- `gradientStrokeWidth`: `0`
- `tickCount`: `5`

## Layout design

### Complete-legend region packing

Generalize `LegendRegionView` to create either an `hconcat` or `vconcat`
container according to the resolved region direction.

- Horizontal regions sum active legend widths plus spacing and use the largest
  active legend height.
- Vertical regions use the largest active legend width and sum active legend
  heights plus spacing.
- Empty regions contribute no size or overhang.
- Reactive `disable` and resolution visibility continue to filter active
  legends before measuring and rendering.
- Direction changes packing only; deterministic legend ordering remains
  depth-first source order followed by title/field/channel tie-breakers.

The same `LegendRegionView` implementation must serve local, naturally shared,
and collected legends.

### Edge anchoring

For external regions, translate the natural packed region along its plot edge:

- `start`: factor `0`
- `middle`: factor `0.5`
- `end`: factor `1`

The parallel offset is:

```text
factor * (available edge length - natural region length)
```

Top and bottom regions move horizontally; left and right regions move
vertically. Corner regions remain anchored to their named corner and ignore
`anchor`. A region that already fills the available edge has no visible anchor
offset.

Oversized regions retain natural size and may extend beyond the edge. Do not
add clipping or wrapping in this iteration.

### Plot and sibling sizing

Legend thickness remains guide overhang perpendicular to the plot edge.
However, a legend's natural length parallel to the plot edge must not become a
minimum size for the plot or affect flex distribution between sibling views.

Remove `getLegendParallelSizeConstraints()` from `GridView` sizing. Verify both
local and GridView-owned regions, including collected regions. This deliberately
allows a long legend stack to overhang parallel to the edge rather than making
one sibling plot wider or taller than another.

### Entry sizing

Change horizontal-entry detection to depend only on `legend.direction`.
Orientation selects a region; it does not select entry direction.

Horizontal symbol legends should use their natural parallel size. Only an
adaptive gradient whose ramp axis is parallel to the destination region may
request flexible parallel space. A perpendicular adaptive gradient must use
its natural length so chrome thickness does not become flexible.

### Source and destination configuration

Keep a strict ownership split:

- Individual properties—entry direction, title, labels, symbols, gradient
  controls, padding, offset, and orientation—come from the source legend.
- Region direction and anchor come from the physical destination collector.

For `resolve.legend.color: "collected"`, independent child legends therefore
retain their own appearance while the declaring composition controls how the
complete legends are packed. An inner `"excluded"` boundary keeps the legend
local, where the local collector's region configuration applies.

## Track legend compatibility

Rename the built-in style to the globally scoped name
`"track-bottom-legend"`. Retain `"track-bottom"` as a compatibility alias that
points to the same defaults and add a deprecation comment with a TODO for the
next breaking release.

The style must explicitly set:

```json
{
  "orient": "bottom",
  "direction": "horizontal",
  "titleOrient": "left",
  "spacing": 3,
  "offset": 3
}
```

Update `legendTrack`'s documented default style name. Do not introduce runtime
deprecation logging.

## Implementation steps

### 1. Correct sibling flex sizing

**Outcome:** Legend parallel length no longer changes plot flex allocation.

**Affected areas:**

- `packages/core/src/view/gridView/gridView.js`
- `packages/core/src/view/layoutSnapshot.test.js`
- Existing legend layout snapshot helpers

**Verification:** Add representative snapshots for equal-sized `hconcat`
siblings with multiple top legends and equal-sized `vconcat` siblings with side
legends. Cover both local and collected regions.

**Documentation/migration:** None; this is a layout bug fix.

**Tentative commit:** `fix(core): isolate legends from sibling flex sizing`

### 2. Respect entry direction and preserve track defaults

**Outcome:** Entry layout depends only on `legend.direction`; horizontal symbol
legends size naturally; genome-track legends remain compact.

**Affected areas:**

- `packages/core/src/view/legendView.js`
- `packages/core/src/config/defaults/legendDefaults.js`
- `packages/core/src/spec/config.d.ts`
- `packages/core/src/config/legendConfig.test.js`
- Examples that relied on implicit horizontal top/bottom entries

**Verification:** Test symbol and gradient legends in parallel and
perpendicular orientation/direction combinations. Test the new track style and
the deprecated alias.

**Documentation/migration:** Document the independent meanings of `orient` and
`direction`. Explicitly set horizontal direction in affected examples.

**Tentative commit:** `fix(core): respect legend entry direction`

### 3. Define destination region configuration

**Outcome:** The schema and config resolver expose region direction and anchor
without leaking `layout` into individual legend definitions.

**Affected areas:**

- `packages/core/src/spec/legend.d.ts`
- `packages/core/src/config/legendConfig.js`
- `packages/core/src/config/legendConfig.test.js`
- `packages/core/src/spec/schema.test.js`

**Verification:** Test general defaults, per-orientation overrides, nested
config scopes, and removal of `layout` from resolved individual legend props.

**Documentation/migration:** Schema-derived docs describe defaults and the
source/destination distinction.

**Tentative commit:** `feat(core): configure legend region layout`

### 4. Pack and anchor legend regions

**Outcome:** Complete legends pack according to region direction and external
stacks honor start/middle/end anchoring.

**Affected areas:**

- `packages/core/src/view/legendView.js`
- `packages/core/src/view/gridView/gridChildLegends.js`
- `packages/core/src/view/gridView/legendLayout.js`
- Focused region/layout tests

**Verification:** Cover every external orientation, at least one corner,
horizontal and vertical packing, spacing, disabled legends, oversized stacks,
and local/shared/collected destinations. Confirm anchoring does not alter
overhang or plot size.

**Documentation/migration:** None beyond the schema docs in this step.

**Tentative commit:** `feat(core): arrange and anchor legend regions`

### 5. Add gradient controls

**Outcome:** Gradient dimensions, opacity, border, and tick density are
configurable with correct geometry and measurement.

**Affected areas:**

- `packages/core/src/spec/legend.d.ts`
- `packages/core/src/config/defaults/legendDefaults.js`
- `packages/core/src/view/legendView.js`
- Schema and focused gradient legend tests

**Verification:** Cover horizontal and vertical continuous gradients,
threshold/quantize ramps, fixed and adaptive lengths, non-default thickness,
opacity, bordered and borderless ramps, explicit values precedence, and
local/collected destinations.

**Documentation/migration:** Add concise schema docs for all six properties.

**Tentative commit:** `feat(core): add gradient legend controls`

### 6. Add examples and user documentation

**Outcome:** Curated examples demonstrate the new fidelity controls without
reintroducing root placement terminology.

**Affected areas:**

- `examples/core/legends/gradient-controls.json`
- `examples/core/legends/region-layout-directions.json`
- Existing `root-collected-legends.json`, if useful for demonstrating
  destination-controlled region layout
- `docs/grammar/legend.md`
- Example snapshots and PNG thumbnails

**Verification:** Initialize shared examples, regenerate and inspect thumbnails,
and build the documentation.

**Documentation/migration:** Keep example descriptions to 8–10 words; use a
description array when elaboration is needed. Put comprehensive demonstrations
under `examples/core/legends/` and only the essential properties in grammar
documentation. Use `collected` and `excluded`, never `placement`.

**Tentative commit:** `docs(core): demonstrate legend fidelity controls`

## Alternatives considered

### Cherry-pick the old branch

Rejected. The old commits mix useful layout work with obsolete root routing,
old guide synchronization, and stale tests. Manual porting against current
collector entry points is easier to review and less likely to regress
collection semantics.

### Put stack direction on each legend

Rejected. Entry direction and complete-legend packing are different concepts.
A region containing several legends needs one destination-owned packing policy.

### Reuse `resolve.legend` for layout direction

Rejected. Resolution controls semantic grouping and collection boundaries;
region layout controls physical arrangement after routing.

### Make legend parallel length constrain the plot

Rejected. This caused unequal sibling flex sizes. Parallel overflow is a chrome
layout concern and must not change the plot's flex weight.

### Port every Vega legend property

Rejected. The selected gradient and region controls cover current concrete use
cases without expanding into tick styling, overlap management, or arbitrary
placement.

## Risks

- Correcting entry direction changes existing top/bottom legends that relied on
  implicit horizontal entries. Update built-in styles and repository examples
  explicitly, and call out the behavior in documentation.
- Adaptive gradient sizing can create layout feedback if chrome is allowed to
  determine the same available size it consumes. Keep plot sizing independent
  of parallel legend length and test fixed containers.
- Region configuration can accidentally be inherited from a source child
  instead of the destination collector. Add a collected-legend test where
  source and destination configs intentionally disagree.
- A border stroke can be clipped or double-counted. Test exact measured extents
  with zero, one, and two-pixel strokes.
- Old tests encode root-placement assumptions. Port assertions by behavior and
  rewrite them with collected resolution rather than copying fixtures.
- The old branch's test reorganization creates a large noisy diff. Keep test
  movement separate from feature work or omit it.

## Acceptance criteria

- Equal sibling plots remain equal when only one has long or multiple legends.
- `legend.direction` controls entries independently of `orient`.
- Track legends retain their compact bottom-horizontal presentation.
- `track-bottom-legend` is the active built-in name and `track-bottom` remains
  a tested compatibility alias.
- Top/bottom and corner regions pack complete legends horizontally by default;
  left/right regions pack vertically.
- General and orientation-specific `config.legend.layout` overrides work.
- External regions honor start, middle, and end anchors without changing plot
  size; corner legends remain corner-anchored.
- Region layout works identically for local, shared, collected, and excluded
  legends, subject only to their physical destination.
- All six gradient controls have schema coverage and visible behavior.
- Explicit gradient values override automatic tick generation.
- Fixed and adaptive gradients report correct extents, including borders.
- No `legend.placement` or root-routing code is introduced.
- Core unit tests, TypeScript checks, linting, shared-example snapshots, docs
  build, and generated thumbnails pass.

## Unresolved questions

- Should the test-suite split from `feature/legends-2.0` be done later as a
  standalone refactor? It is not required for this port.
- Should the deprecated `track-bottom` alias be removed in the next major
  release or retained for one additional cycle? This plan only marks it for
  later removal.
