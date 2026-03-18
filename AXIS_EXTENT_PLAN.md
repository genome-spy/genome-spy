# Axis Extent Plan

## Rationale

GenomeSpy currently reserves axis space using fixed heuristics in
`packages/core/src/view/axisView.js`.

- X axes budget roughly one font-size worth of label space.
- Y axes use a hard-coded `30px` label allowance.
- The final extent is clamped by `minExtent` / `maxExtent`.

This has predictable downsides:

- quantitative axes can clip or waste space depending on the current domain
- categorical axes are especially sensitive to label length
- users often need to tune `axis.minExtent` or padding manually
- the default extent does not track rotated labels in any principled way

At the same time, a full Vega-style live bounds system would be too expensive
and would likely cause distracting layout jumps while zooming or animating
domains.

The target is a narrower solution:

- measure axis label bounds only
- use those measurements to improve the default label contribution to axis
  extent
- keep explicit `minExtent` / `extent` style overrides authoritative
- make automatic growth conservative so layout does not thrash

## Scope

In scope for the first pass:

- ordinary axis tick labels only
- shared and independent axes
- quantitative, ordinal, nominal, index, and locus axes through the existing
  tick generation path
- rotated labels, using a geometry estimate from measured text width plus font
  height
- grow-only automatic extent updates with a minimum delta threshold

Out of scope for the first pass:

- title bounds
- chromosome label bounds
- multi-line label layout
- shrinking extents after zooming back out
- a generic global bounds engine for all guide elements

## Current Architecture Notes

- `AxisView.getPerpendicularSize()` is the value consumed by layout.
- `GridChild.getOverhang()` and `GridView` aggregate those perpendicular sizes
  to reserve axis space.
- `AxisTickSource` already computes the visible ticks and formatted `label`
  strings for the current scale, domain, and axis length.
- `SingleAxisLazySource` already listens to both domain changes and
  `layoutComputed`, which is useful because tick generation depends on the
  current pixel length of the axis.
- `measureText.js` already uses the same BM font metrics that text marks use,
  so its core width calculation should be reused instead of introducing a
  separate measuring path.
- `UnitView.getCollector()` gives direct access to the collected rows of a unit
  spec, which makes it possible to inspect transformed axis label rows after the
  dataflow runs.
- `AxisView` currently does not pass `labelFont`, `labelFontStyle`, or
  `labelFontWeight` to the axis label text mark. This must be fixed as part of
  the same change so rendered labels and measured labels use the same font
  inputs.

Important constraint:

- The internal axis spec currently bakes `extent` into both the axis container
  size and tick geometry. Updating only `getPerpendicularSize()` would not be
  enough; the rendered axis internals must see the same effective extent.
- Rebuilding the `AxisView` subtree during zooming or ordinary extent updates is
  not allowed. The axis subtree must stay alive and react to extent changes.

## Proposed Design

### 1. Split fixed extent from measured label extent

Refactor axis extent calculation into additive parts:

- fixed contribution
  - ticks
  - label padding
  - title contribution
  - any future chromosome contribution
- label contribution
  - currently heuristic
  - will become measured when auto measurement is available

The fixed contribution should remain deterministic and cheap.

### 2. Keep measurement inside the axis dataflow

Do not extract tick-generation or text-measurement helpers.

Instead, use the existing internal axis label pipeline:

- `AxisTickSource` produces the tick rows with formatted `label` strings
- the labels unit gets a `measureText` transform that measures `label` into a
  new field such as `_labelWidth`
- `AxisView` inspects the label unit's collector after the flow completes and
  derives the maximum width from the collected rows

This keeps measurement aligned with the actual rendered axis labels without
creating a second code path for tick generation.

### 3. Let `AxisView` own an auto-measured extent state

Add internal state to `AxisView`:

- `#autoLabelExtent`
  - the measured label contribution in pixels
- `#effectiveExtent`
  - the full extent used by layout and by the internal axis spec
- cached measurement inputs
  - labels hash or max-width signature
  - axis angle
  - font settings
  - axis length bucket if needed

Initialization:

- start from the current heuristic so first layout remains synchronous
- after initialization, schedule measurement and upgrade the extent if needed

In addition to the JS-side numeric state, `AxisView` should own an internal
parameter, for example `axisExtent`, so the axis subtree can consume the current
effective extent through `ExprRef`s without being rebuilt.

### 4. Measure only the labels that will actually render

Measure the same rows that feed the label mark:

- quantitative: the collector will contain the formatted visible tick labels
- categorical / ordinal: the collector will contain the visible domain labels
- locus / index: the collector will contain whatever the current tick source
  emits for those scales

This avoids divergence between the estimate and the actual axis labels.

### 5. Convert measured text width to perpendicular extent

For angle-aware perpendicular extent, use:

- text width from BM font metrics
- font-height estimate from font metrics and label font size
  - likely based on cap height plus descent, or line height if that proves more
    stable

For a label box with width `w` and height `h`, the axis-perpendicular footprint
can be estimated as:

- horizontal axis labels: `abs(w * sin(a)) + abs(h * cos(a))`
- vertical axis labels: `abs(w * cos(a)) + abs(h * sin(a))`

where `a` is the label angle in radians, normalized to the text box
orientation.

The result should then respect:

- `labelLimit` if that property is enforced by rendering
- explicit `minExtent`
- explicit `maxExtent`

### 6. Use conservative updates

Automatic updates should be grow-only in the first pass.

Rules:

- do not shrink automatically
- require a minimum increase before triggering layout, for example `>= 4px`
- optionally debounce the relayout request to the next animation frame or a
  short timeout if repeated domain events arrive during interaction

This should reduce layout churn when domains change smoothly.

### 7. Keep layout and rendered geometry in sync

When `AxisView` promotes its effective extent:

- invalidate its size cache
- update the internal extent parameter so tick geometry and any other
  extent-dependent graphics react without subtree reconstruction
- request layout reflow through `context.requestLayoutReflow()`

Implementation direction:

- `AxisView` should expose the current effective extent to its internal child
  specs through an internal parameter
- extent-dependent mark props inside the axis subtree should use `ExprRef`s
  bound to that parameter
- this keeps the subtree stable while allowing geometry and offsets to update
  reactively

Subtree rebuilding is explicitly out of bounds for this feature.

### 8. Make rendered label font props match measurement inputs

`AxisView` should pass axis label font properties through to the text mark:

- `labelFont`
- `labelFontStyle`
- `labelFontWeight`

This is required, not optional. Without it, measurements can disagree with
actual rendering whenever a theme or axis config sets a non-default font.

## Detailed Implementation Steps

### Step 1. Clean up the current axis extent code

- Refactor `getExtent(axisProps)` into smaller helpers:
  - `getFixedAxisExtent(axisProps)`
  - `getHeuristicLabelExtent(axisProps, channel)`
  - `clampAxisExtent(axisProps, extent)`
- Make the current heuristic explicit and testable before changing behavior.

### Step 2. Add measurement to the axis label dataflow

- Update the axis labels unit spec so it pipes the tick rows through a
  `measureText` transform.
- Measure the `label` field into an internal field such as `_labelWidth`.
- Use the same label font settings that the text mark uses:
  - `labelFont`
  - `labelFontStyle`
  - `labelFontWeight`
  - `labelFontSize`

This makes the collector hold both the rendered label strings and their
measured widths.

### Step 3. Fix axis label font propagation first

- Update the axis labels text mark in `AxisView` to pass through:
  - `labelFont`
  - `labelFontStyle`
  - `labelFontWeight`
- Ensure the `measureText` transform on the same labels unit uses the exact same
  font inputs.
- Treat mismatched font inputs as a correctness bug, not a polish issue.

### Step 4. Introduce an internal extent parameter for `AxisView`

- Allocate an internal parameter in `AxisView`, for example `axisExtent`.
- Keep it synchronized with the JS-side numeric `effectiveExtent`.
- Use this parameter only for internal axis specs; do not expose it as a
  user-facing axis feature.

### Step 5. Make axis internals extent-reactive with `ExprRef`

- Replace internal uses of the static `ap.extent` value where runtime updates
  are needed.
- Use `ExprRef`s against the internal `axisExtent` parameter for:
  - tick endpoint positioning
  - any offsets or placements that must stay consistent with the current extent
- Keep the subtree stable across zoom and extent changes.

### Step 6. Read measured rows from the labels collector

- Identify the labels unit inside `AxisView`.
- Access its collector through `UnitView.getCollector()`.
- After collector completion, read the collected rows and compute the maximum
  `_labelWidth`.
- Use that maximum width as the measurement input for the perpendicular extent
  calculation.

### Step 7. Add auto-measurement state and lifecycle to `AxisView`

- Add private fields for measured/effective extent and the last applied
  measurement signature.
- After `AxisView.initializeChildren()`, schedule an initial measurement.
- Listen for the same events that can change labels:
  - scale domain changes
  - `layoutComputed`
- Recompute by inspecting the labels collector after the axis dataflow has
  updated.

### Step 8. Compute the measured perpendicular label extent

- Read the maximum `_labelWidth` from the labels collector.
- Estimate the text height from font metrics and font size.
- Convert width/height/angle into perpendicular footprint.
- Add padding and clamp against axis min/max constraints.

### Step 9. Update axis rendering to consume dynamic extent

- Ensure `AxisView.getPerpendicularSize()` returns the effective extent.
- Update the internal extent parameter whenever the effective extent changes.
- Keep all axis graphics synchronized through the live subtree instead of
  subtree reconstruction.

### Step 10. Add conservative reflow policy

- Only increase the effective extent automatically.
- Ignore changes below the configured threshold.
- Coalesce multiple updates before requesting layout reflow.
- Document the policy in code comments because this is intentionally not a
  “true bounds” system.

### Step 11. Preserve explicit user control

- If the user sets an explicit extent knob, define the behavior clearly:
  - `minExtent` remains a floor
  - `maxExtent` remains a ceiling
  - if a future explicit `extent` property is introduced, it should disable auto
    measurement entirely

For the current schema, auto measurement should simply feed into the existing
`minExtent` / `maxExtent` clamp.

### Step 12. Tests

Add focused tests near the affected modules:

- axis extent tests for:
  - quantitative axis with short vs long formatted labels
  - categorical axis with long labels
  - rotated bottom axis labels
  - grow-only updates after domain change
  - thresholded updates that avoid tiny relayouts
  - shared axes using the same measured extent across children
- regression test for `measureText` using the axis label font settings
- regression test for `labelFont` / `labelFontWeight` / `labelFontStyle`
  reaching both the text mark and the `measureText` transform
- regression test that extent changes do not rebuild or recreate the axis
  subtree during zoom-driven updates

### Step 13. Documentation

- No user-facing docs are required if behavior only improves defaults.
- If a new config knob is added for auto extent policy, document it in the axis
  schema and user docs.

## Suggested First Iteration

To keep risk contained, the first implementation should be:

1. ordinary axis labels only
2. no chromosome label measurement
3. grow-only updates
4. no shrinking
5. no new public schema knobs unless needed

That should already remove most of the current `30px` / one-line heuristics
without turning the layout system into a continuously recomputed bounds engine.

## Open Questions

1. Should `minExtent` continue to default to `20` globally, or should the
   default become smaller once auto label measurement is in place?

2. Should measurement use the currently visible ticks only, or should
   quantitative axes use a more conservative synthetic sample of possible labels
   so zooming does not repeatedly grow the axis?

3. For categorical scales with very large domains, should all labels be measured
   or only the labels returned by the current tick-generation path?

4. What is the best font-height approximation for rotated labels in GenomeSpy’s
   BM font metrics:
   - `capHeight + descent`
   - `common.lineHeight`
   - another existing text-box estimate from the text vertex builder

5. Should automatic extent updates happen immediately after the first axis
   layout, or should they wait until the first stable `layoutComputed` event to
   avoid a guaranteed second layout pass during initialization?

6. Which internal axis mark props need to become `ExprRef`-driven against the
   live extent parameter, and which can remain static?

7. Should locus chromosome labels stay out of scope entirely for the first pass,
   or should the implementation leave an obvious hook for adding them next?

8. Do we want an internal-only config constant for:
   - minimum growth delta
   - debounce interval
   - grow-only vs allow-shrink behavior

9. Should the labels collector itself be observed for measurement updates, or is
   it sufficient to re-read it on `layoutComputed` and domain events?

10. Should a measured extent be remembered per axis instance across visibility
   toggles, or is recomputing after recreation acceptable?
