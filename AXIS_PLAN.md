# SampleView Y-Axis Plan

## Goal

Add optional vertical axes for SampleView sample tracks, primarily for signal
tracks such as BigWig. The axes should be useful when samples are large enough,
avoid clutter in dense overviews, support both left- and right-oriented axes,
and avoid layout churn during closeup/peek animation.

## Scope

This plan covers SampleView y-axis layout and rendering. Normal Core GridView
axis behavior should remain the conceptual reference, but the first
implementation may be local to SampleView if a full Core axis refactor is too
large.

Axis creation should continue to reuse existing `AxisView` behavior as much as
possible. SampleView should not reinterpret axis specs or merge scale
resolutions. It should lay out and repeat already-created axis views or
axis candidates.

## Proposed Spec

Add one optional SampleView property:

```ts
specYAxis?: {
    mode?: "none" | "all" | "top" | "middle" | "bottom";
    minSampleHeight?: number;
}
```

Suggested semantics:

- `"none"` disables SampleView y-axis rendering.
- `"all"` repeats the active y-axis for every eligible visible sample.
- `"top"`, `"middle"`, and `"bottom"` render one representative y-axis next to
  one eligible visible sample.
- `minSampleHeight` controls when an axis is allowed to appear.
  Default: `50`.

The conservative default should probably be `mode: "none"` so existing
SampleView specs do not change visually.

The name `specYAxis` is intentionally explicit: the axes come from the
SampleView's repeated `spec` child, not from sample labels, metadata, summaries,
or grouping chrome.

## Winning Architecture: Integrated Axis Lanes

Use an integrated SampleView chrome layout rather than putting more y-axis
policy directly in `SampleView`.

Proposed objects:

- `SampleChromeLayout`: coordinates SampleView-specific chrome around the
  repeated sample pane.
- `SampleAxisLane`: owns one vertical axis lane for one orient, `"left"` or
  `"right"`.
- `SampleAxisTargetSelector`: pure target-selection logic for
  `"all"`, `"top"`, `"middle"`, and `"bottom"`.

`SampleGridChild` is the natural owner because it already owns SampleView
backgrounds, strokes, summaries, scrollbars, and axes. `SampleView` should only
ask the chrome layout for rectangles and delegate vertical-axis rendering.

SampleView should remain responsible for orchestration only:

- create `SampleGridChild`
- initialize or refresh the chrome layout after axes are available
- ask the chrome layout for the sample plot rectangle during render
- render horizontal axes through the existing pane-level path
- delegate vertical-axis lane rendering to the chrome layout

This keeps the increasingly complex y-axis policy out of `SampleView`.

## Layout Model

The effective layout is:

```text
sidebar | left y-axis lane | sample plot | right y-axis lane
```

The lanes reserve space independently:

- left lane width comes from the active left-oriented axis
- right lane width comes from the active right-oriented axis
- the sample plot rectangle is the available sample pane minus active lane
  reservations

Reserved width for an axis should follow existing axis placement semantics:

```js
axisView.getPerpendicularSize() + (axisView.axisProps.offset ?? 0)
```

Lane reservation is active only when:

- `specYAxis.mode` is not `"none"`
- a visible axis candidate exists for the lane orient
- SampleView is in non-peek overview mode
- at least one eligible visible sample meets `minSampleHeight`

Left and right axes can coexist. The same mode and height threshold apply to
both sides unless future requirements justify per-orient settings.

The vertical scrollbar/right-axis relationship should be explicit. Prefer
keeping the scrollbar on the right edge of the sample plot, matching how
GridView places scrollbars with respect to the scrolled content. With an active
right axis, the logical layout is:

```text
sidebar | left lane | sample plot + scrollbar edge | right lane
```

The right axis must not silently overlap the scrollbar. The right lane should be
outside the sample plot, while the scrollbar remains attached to the sample plot
edge.

## Rendering Model

Horizontal axes remain pane-level axes because the x-scale is shared across the
sample pane.

Vertical axes should never be rendered once against the full SampleView child
rectangle. Each active `SampleAxisLane` renders its active axis against
sample-local rectangles:

- `"all"`: every eligible visible sample
- `"top"`: first eligible visible sample
- `"middle"`: eligible sample whose visible center is closest to the visible
  pane midpoint
- `"bottom"`: last eligible visible sample

Use the full sample row rectangle for axis coordinates, even if the sample is
partially clipped. Apply clipping separately so tick layout remains stable while
axis marks do not bleed into sticky summaries, neighboring samples, or outside
the viewport.

Reusing one `AxisView` for multiple render calls is acceptable. `AxisView` is
largely passive, and `coords` may simply reflect the last rendered target. Code
should not rely on vertical repeated-axis `coords` for interaction or layout.

## Layered Children And Axis Candidates

SampleView children may be LayerViews. Different layers may have independent
y-axes placed on the left or right. GridView handles normal layer axes today by
creating axes from layer child resolutions and placing them by orient.
SampleView should preserve that model.

The source of truth should not be only `view.getAxisResolution("y")`. It must
include layer-child axis resolutions and preserve the original axis data parent
so each axis remains tied to the correct layer scale.

The harder case is toggleable layers. A SampleView may contain many layers that
require axes, while only one or a few are visible at a time. This can produce
axis-orient conflicts if axis creation is based on child existence rather than
effective visibility.

The preferred direction is a visibility-aware axis candidate model:

```js
{
    axisView,
    sourceView,
    channel,
    orient,
    resolution
}
```

Each lane owns candidates for its orient and chooses an active candidate from
currently visible source views:

- zero visible candidates: no lane, no reservation
- one visible candidate: render that axis
- multiple visible candidates: apply deterministic arbitration, ideally aligned
  with layer order, and warn or otherwise surface the ambiguity

This visibility-aware arbitration should eventually be shared with ordinary
GridView-managed axes, because the same toggleable-layer problem exists there.
SampleView can implement a local version first, but the design should avoid
locking in behavior that conflicts with a later Core-level solution.

## Closeup And Animation

Closeup/peek mode excludes SampleView y-axis rendering.

Activating or disabling closeup must not recompute layout. The closeup
transition is animation-sensitive, and the current layout must remain stable
while it runs.

Initially, y-axes should be hidden whenever closeup is active or transitioning:

- closeup is being activated
- closeup is active
- closeup is being disabled

In practice, any nonzero or transitioning peek state should suppress vertical
axis rendering. This should be a render-time suppression, not a layout
invalidation trigger.

Y-axis eligibility must not be recalculated from interpolated sample heights
during peek. The y-axis lane reservation state should be based on stable
non-peek fitted layout and should not change because closeup was toggled.

Later, the project can revisit whether there is a feasible way to position and
animate these axes together with the peek transition. That should be treated as
a separate performance-sensitive design.

Layout invalidation is still needed when:

- the sample hierarchy changes
- browser or view resizing changes the fitted sample height enough to cross the
  axis threshold
- visible layer changes affect active axis candidates or lane widths
- axis label measurement changes an active axis extent

Those events should trigger at most discrete layout updates. Peek animation
frames and closeup activation/deactivation must not request layout reflow.

## Open Design Points

- Exact default for `mode`: safest is `"none"`, while `"middle"` would make
  configured y-axes useful automatically.
- Arbitration rule for multiple visible candidates on the same orient: first
  visible by spec order, last/topmost visible by layer order, warning, or error.
- Whether visibility-aware axis candidates should be introduced locally in
  SampleView first or generalized in Core before implementing SampleView lanes.
- Whether y-axis grid lines should remain group-level initially or later become
  sample-local like the axes.
- Exact right-axis/scrollbar geometry while keeping the scrollbar attached to
  the sample plot edge.

## Feasibility

The feature is feasible with moderate risk.

The basic lane layout and repeated rendering are straightforward. The main
complexity is visibility-aware axis candidates for layered and toggleable
children. Handling that well would also improve ordinary GridView behavior, but
it may be too large to solve globally in the first pass.

The best implementation path is likely:

1. Introduce the SampleView chrome-lane structure.
2. Support left and right lanes for the currently available axes.
3. Add or prepare the candidate model needed for toggleable layered axes.
4. Keep the behavior compatible with a later Core-level visibility-aware axis
   arbitration model.
