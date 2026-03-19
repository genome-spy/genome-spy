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

- The rendered axis internals must see the same effective extent that layout
  uses. Extent-dependent geometry must react through the live `axisExtent`
  parameter instead of stale spec-time snapshots.
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

This should reduce layout churn when domains change smoothly without adding
extra delay to axis updates.

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

## Implemented First Pass

The branch now implements the first-pass design:

- axis labels flow through `AxisTickSource -> measureText -> collector`
- `AxisView` reads the labels collector and derives the maximum `_labelWidth`
- label font properties are propagated consistently to both rendering and
  `measureText`
- `AxisView` owns a live `effectiveExtent` and an internal `axisExtent`
  parameter
- extent-dependent tick geometry reacts through `ExprRef`s without subtree
  rebuilding
- automatic updates are grow-only and thresholded
- placeholder implicit continuous startup domains such as `[0, 0]` are ignored
  until the scale domain is initialized
- extent updates are triggered from the labels collector, bootstrapped by
  `subtreeDataReady`
- focused tests cover font propagation, categorical growth, subtree stability
  during zoom, and implicit vs explicit quantitative domain parity

The implementation intentionally does not add debounce.

## Remaining Work

- decide whether the current growth threshold is the right default long-term
- consider whether a more explicit collector-tracking field would be cleaner
  than the current one-shot observer latch inside `AxisView`
- optionally add broader regression coverage for complex composed layouts if
  future issues appear
- keep chromosome label bounds, title bounds, and shrinking behavior out of
  scope unless a separate follow-up is started

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
   Answer: 20 is fine for now.

2. Should measurement use the currently visible ticks only, or should
   quantitative axes use a more conservative synthetic sample of possible labels
   so zooming does not repeatedly grow the axis?
   Answer: the visible ticks only, to keep measurement aligned with actual labels.

3. For categorical scales with very large domains, should all labels be measured
   or only the labels returned by the current tick-generation path?
   Answer: all.

4. What is the best font-height approximation for rotated labels in GenomeSpy’s
   BM font metrics:
   - `capHeight + descent`
   - `common.lineHeight`
   - another existing text-box estimate from the text vertex builder
     Answer: `capHeight + descent`

5. Should automatic extent updates happen immediately after the first axis
   layout, or should they wait until the first stable `layoutComputed` event to
   avoid a guaranteed second layout pass during initialization?
   Answer: I don't know. Figure it out.

6. Which internal axis mark props need to become `ExprRef`-driven against the
   live extent parameter, and which can remain static?
   Answer: Those that you need to make the layout reactive.

7. Should locus chromosome labels stay out of scope entirely for the first pass,
   or should the implementation leave an obvious hook for adding them next?
   Answer: Out of scope for now.

8. Do we want an internal-only config constant for:
   - minimum growth delta
   - grow-only vs allow-shrink behavior
     Answer: Yes.

9. Should the labels collector itself be observed for measurement updates, or is
   it sufficient to re-read it on `layoutComputed` and domain events?
   Answer: Observe the labels collector directly, bootstrapped by
   `subtreeDataReady`.

10. Should a measured extent be remembered per axis instance across visibility
    toggles, or is recomputing after recreation acceptable?
    Answer: Recomputing is acceptable if it's really needed.
