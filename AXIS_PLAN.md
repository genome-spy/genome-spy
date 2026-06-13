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
sampleYAxis?: SampleYAxisDef | null;

interface SampleYAxisDef {
    mode?: "all" | "top" | "middle" | "bottom";
    minSampleHeight?: number;
}
```

Suggested semantics:

- `null` disables SampleView y-axis rendering.
- Omitted `sampleYAxis` uses the default enabled behavior.
- `"all"` repeats the active y-axis for every eligible visible sample.
- `"top"`, `"middle"`, and `"bottom"` render one representative y-axis next to
  one eligible visible sample.
- `minSampleHeight` controls when an axis is allowed to appear.
  Default: `60`.

The default should be `{ "mode": "all", "minSampleHeight": 60 }`. Existing
visualizations generally disabled child y-axes because SampleView did not
previously handle them well, so useful y-axis behavior should be enabled unless
`sampleYAxis` is explicitly `null`.

The name `sampleYAxis` describes the rendered behavior: y-axes are shown for
sample plots, not for sample labels, metadata, summaries, or grouping chrome.

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

- `sampleYAxis` is not `null`
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

This visibility-aware arbitration is now shared at the Core candidate-selection
level for SampleView's use. Ordinary GridView rendering and overhang still need
an explicit migration before they use the same active-candidate result.

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

- Arbitration rule for multiple visible candidates on the same orient: first
  visible by spec order, last/topmost visible by layer order, warning, or error.
- Whether y-axis grid lines should remain group-level initially or later become
  sample-local like the axes.
- Exact right-axis/scrollbar geometry while keeping the scrollbar attached to
  the sample plot edge.

## Feasibility

The feature is feasible with moderate risk.

The basic lane layout and repeated rendering are implemented. The remaining
complexity is whether ordinary GridView should also use active axis candidates
for rendering and overhang. That would improve consistency, but it has wider
layout impact than the SampleView-specific work.

## Implementation Status

The first SampleView implementation phase is done.

Completed pieces:

- `sampleYAxis` is available on SampleView specs and is disabled only when set
  to `null`.
- `SampleChromeLayout` owns SampleView-specific y-axis lane policy.
- Horizontal axes remain pane-level axes.
- Vertical axes are reserved and rendered as repeated or representative
  sample-local axes.
- Left and right y-axis lanes are supported.
- Axis rendering is suppressed during closeup/peek without requesting layout
  reflow.
- Core `GridChild` collects axis candidates with source-view visibility.
- SampleView uses Core active-axis candidate selection.
- SampleView supports toggleable LayerView child y-axes, including layers that
  are initially hidden and later become visible.
- Focused SampleView tests cover lane reservation, min-height gating,
  visibility-aware candidates, and initially hidden layers.

## Evaluation Point

Stop here before changing ordinary GridView overhang or rendering behavior.

Evaluate:

- Does SampleView now support toggleable layered axes correctly?
- Did the Core candidate API stay small and understandable?
- Does the implementation preserve existing GridView behavior?
- Are default orient fallback rules still consistent with `CHANNEL_ORIENTS`?
- Is ambiguity handling acceptable for multiple visible candidates?

If these answers are satisfactory, the minimum requirement is met. The remaining
steps should be treated as a separate Core behavior migration, not as part of the
minimum SampleView toggleable-axis work.

## Remaining Follow-Up: Ordinary GridView Alignment

The current implementation intentionally preserves ordinary GridView behavior.
GridView still renders and reserves overhang from its existing `axes` map, while
SampleView opts into visibility-aware duplicate candidates. The same
toggleable-layer problem can still exist in ordinary GridView-managed layer
axes, but it is a separate migration with wider layout impact.

### Step 1: Switch GridView Overhang To Active Axes

Change `GridChild.getOverhang()` so axis overhang comes from active candidates,
not from all created/existing axes. Hidden toggleable layers should no longer
reserve axis space.

Keep non-axis child overhang untouched:

```js
activeAxisOverhang.unionOrAdd(childViewOverhang)
```

Add GridView tests for a LayerView with toggleable children whose y-axes share
an orient. The tests should verify that hiding a layer also removes its axis
overhang when no other visible candidate uses that orient.

Tentative commit:

```text
fix(core): base grid axis overhang on visible candidates
```

### Step 2: Switch GridView Rendering To Active Axes

Change GridView axis rendering to render only active candidates. This should
align rendering with the overhang result from Step 1.

Important cases to test:

- hidden layer axis is not rendered
- newly visible layer axis is rendered after visibility changes
- if multiple candidates are visible, the same candidate that contributes
  overhang is rendered

Tentative commit:

```text
fix(core): render only active grid axis candidates
```

### Step 3: Revisit SampleView Layout Preparation

After Core axis visibility is shared, re-evaluate the current
`prepareLayoutSize()` path. It may still be needed because SampleView's y-axis
lane depends on fitted sample height, but the API should be explicit and
documented in Core if it remains.

Possible end state:

```js
prepareLayout({ width, height }) {
    return { horizontalOverhangChanged: boolean };
}
```

Avoid preserving a duck-typed hook indefinitely if more views start using it.

Tentative commit:

```text
refactor(core): formalize prepared layout overhang hook
```

### Step 4: Remove Transitional Duplication

Once GridView and SampleView both use the Core candidate model, remove
transitional maps or compatibility helpers that duplicate candidate state.

Targets to inspect:

- `GridChild.axes` if it becomes redundant or misleading
- local SampleChromeLayout candidate arbitration
- SampleGridChild axis-overhang subtraction helpers that can move to Core

Tentative commit:

```text
refactor(core): remove transitional axis candidate paths
```

### Step 5: Documentation And Diagnostics

Document the visibility behavior in developer-facing architecture notes or code
comments near the Core candidate resolver. User-facing docs probably only need a
brief statement that axes follow layer visibility.

If ambiguity warnings are added, document when they fire and how users can avoid
them, for example by placing mutually exclusive layers in a visibility group or
using distinct axis orientations.

Tentative commit:

```text
docs(core): document visibility-aware axis arbitration
```
