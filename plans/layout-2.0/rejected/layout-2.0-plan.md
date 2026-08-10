# Layout 2.0

Status: Draft
Working branch: `perf/layout-2.0`

## Summary

GenomeSpy currently uses `View.render()` for a traversal that measures and
arranges views, records coordinates, updates layout-driven parameters, and
collects commands for new normal and picking render batches. Size invalidation
can clear only relevant cached sizes, but `RenderCoordinator.computeLayout()`
still traverses the whole hierarchy and creates both batches again.

Layout 2.0 separates layout from command collection, adds explicit partial
layout invalidation, and retains geometry referenced by render commands.
Geometry-only changes will update retained slots without compiling a new batch.
The same slots will later hold target and presented geometry for animated layout
transitions.

The implementation is divided into two pull requests:

1. [PR 1: Incremental layout and retained render geometry](pr1-incremental-layout.md)
2. [PR 2: Layout view transitions and follow-up optimization](pr2-view-transitions.md)

## Current implementation

The current lifecycle is concentrated in:

- `packages/core/src/genomeSpy/renderCoordinator.js`, which creates new buffered
  normal and picking contexts in every layout pass and calls
  `viewRoot.render()`.
- `packages/core/src/view/view.js`, which records `facetCoords`, updates
  layout-driven width and height params, and owns `size/*` cache invalidation.
- `packages/core/src/view/gridView/gridView.js`, which computes flex coordinates,
  creates child and decoration rectangles, orders decorations, and recursively
  calls `render()`.
- `packages/core/src/view/renderingContext/bufferedViewRenderingContext.js`,
  which turns `renderMark()` calls into grouped executable callbacks.
- `packages/core/src/view/layout/rectangle.js`, whose accessor-backed rectangles
  already allow retained draw commands to observe changing coordinates.
- `packages/core/src/marks/mark.js`, which reads rectangle and clipping values in
  `setViewport()` immediately before drawing.
- `packages/app/src/sampleView/`, which already animates retained sample
  locations read by buffered draw callbacks.

The new lifecycle makes the existing retained-rendering property explicit: draw
callbacks do not need recreation merely because viewport coordinates change.

## Goals

- Give each lifecycle phase a name that describes what it does.
- Recompute only measurement and arrangement affected by a size change.
- Never create a rendering batch for geometry-only changes.
- Coalesce multiple invalidations into one scheduled layout commit.
- Preserve axes, legends, scrollbars, clipping, picking, and layout observation.
- Reduce allocations and accessor calls in layout and viewport setup.
- Separate canonical target geometry from animated presentation geometry.
- Keep headless rendering deterministic and able to snap to targets.
- Prove skipped work with counters and tests, not timing alone.

## Non-goals

- Replacing GenomeSpy's layout model with CSS, Yoga, or another engine.
- Adding a general-purpose retained scene graph.
- Defining a public CSS-like transition language in PR 1.
- Animating arbitrary mark encoding or data changes.
- Resizing the WebGL backing store on every transition frame.
- Combining this work with WebGPU changes.

## Target lifecycle

The target lifecycle has four phases:

1. **Measure** computes intrinsic or preferred sizes from configuration,
   data-dependent sizing, guides, and children.
2. **Arrange** assigns rectangles and clipping to layout instances using an
   allocated parent rectangle.
3. **Collect render commands** enumerates marks and rendering instances and
   compiles batch topology only when scene structure is dirty.
4. **Draw** executes a retained batch using current presentation geometry.

`View.render()` will not survive as a combined operation. During migration, a
temporary `layoutAndCollectRenderCommands()` name may make a mechanical commit
reviewable, but it must be removed before PR 1 is complete.

The intended responsibilities are:

```js
view.measure(layoutContext, constraints);
view.arrange(layoutContext, allocatedBounds, options);
view.collectRenderCommands(commandCollector);
renderBatch.draw(renderTargetState);
```

Existing `getSize()` implementations can remain cached measurement helpers
initially. The essential contracts are that command collection cannot perform
layout and arrangement cannot call `mark.render()`.

## Key decisions

### Separate layout, scene, and presentation invalidation

Each layout node tracks explicit dirty state:

- `measureX` and `measureY`: intrinsic size may have changed in an axis.
- `arrange`: allocated geometry, clipping, or descendant arrangement may change.
- `scene`: command membership, identity, order, or callback inputs may change.
- `presentation`: interpolated geometry or opacity changed; draw only.

Dirty flags have monotonic generations for coalescing, cache validation, and
diagnostics. Scene invalidation includes more than view insertion/removal:

- Mark, guide, overlay, or scrollbar creation/removal.
- Facet identity, cardinality, or order changes.
- Z-order or clipping-topology changes.
- A mark becoming ready after initialization.
- Captured rendering options changing facet range or drawing mode.

Position and size changes alone do not invalidate the scene.

### Retain geometry slots

Render commands reference stable geometry slots keyed by view identity plus
explicit facet/role identity. Keys must not depend on traversal order or repeated
`JSON.stringify` calls.

PR 1 slots contain committed coordinates and flattened numeric viewport state.
PR 2 expands them to:

```js
{
    from: { x, y, width, height },
    target: { x, y, width, height },
    presented: { x, y, width, height },
    opacity,
    rectangle,
    layoutGeneration,
    presentationGeneration,
}
```

The stable `rectangle` exposes presented values to rendering code. Numeric
viewport and clip state is recomputed at most once per presentation generation
and reused by applicable draw requests.

### Cache by explicit inputs

Measurement and arrangement caches are valid only when these inputs match:

- View configuration and measurement generation.
- Relevant child measurement generations.
- Available or allocated width and height.
- DPR when pixel snapping affects the result.
- Guide and font measurement generations where applicable.

A dirty descendant marks ancestors whose output depends on it. PR 1 begins
conservatively by marking the dependent ancestor path and using cache hits to
skip clean siblings. Explicit relayout boundaries follow only after tests define
their dependency contracts.

This is adapted from established patterns:

- Yoga separates measurement and layout caches, keys them by constraints, and
  skips clean nodes with matching inputs:
  <https://github.com/facebook/yoga/blob/main/yoga/algorithm/CalculateLayout.cpp>
- Flutter propagates `markNeedsLayout()` according to whether a parent uses a
  child's size and stops at relayout boundaries:
  <https://api.flutter.dev/flutter/rendering/RenderObject-class.html>
- LayoutNG uses explicit inputs and reusable immutable fragments so canonical
  layout does not depend on partially mutated previous output:
  <https://developer.chrome.com/docs/chromium/layoutng>

No source code will be copied from these projects.

### Make dependency boundaries axis-aware

- A fixed viewport dimension contains scrollable content changes in that axis.
- A dimension imposed entirely by a parent does not make the parent's intrinsic
  size depend on the child in that axis.
- Grid track sizing depends on applicable child sizes and guide overhangs.
- Layer sizing depends on children only where it lacks an independent size.
- Axes, legends, titles, and overhang can create cross-axis dependencies.

Unknown or height-dependent guide behavior remains conservatively dependent on
both axes. Correct over-invalidation is acceptable during migration;
under-invalidation is not.

### Separate logical and presented coordinate semantics

After transitions exist:

- Target layout drives axis length, ticks, lazy-data sizing, layout-driven
  params, canvas sizing, and subsequent layout.
- Presented layout drives WebGL viewports, clipping, picking, hit testing,
  rulers, and currently rendered bounds.

Uses of `view.coords`, `facetCoords`, and `GridChild.coords` must be audited and
assigned one meaning. An internal target accessor prevents scale/layout code
from observing intermediate animation frames.

## Alternatives considered

### Keep the combined traversal and add a layout-only rendering context

This could reconcile rectangles into existing requests, but it still traverses
everything and couples layout correctness to rendering order. It may serve as a
short migration bridge, not the target architecture.

### Mutate the current `Rectangle` graph directly

This lets batches observe new values, but canonical layout, animation state,
clipping, and target/presented semantics remain implicit in closure chains.
Explicit slots and generations are easier to invalidate, test, and profile.

### Introduce relayout boundaries immediately

Aggressive boundaries before dependencies are explicit risk stale guides and
cross-axis layout. Dirty ancestor paths plus cache hits provide most of the
benefit and expose safe boundaries through metrics.

### Use bitmap snapshots for every transition

Snapshots handle removed content but stretch plots and text. Live geometry lets
GenomeSpy reproject analytical graphics at intermediate viewport sizes.
Snapshots remain an option for incompatible structural cases.

## Risks and mitigations

- **Under-invalidation:** Compare incremental results with forced full layout and
  provide a conservative both-axis fallback.
- **Re-entrant updates:** Queue another generation when layout-driven params or
  guides invalidate during commit; retain the finite canvas-settling guard.
- **Stale hidden coordinates:** Explicitly clear, retain as tombstones, or dispose
  target and presented instances.
- **Facet identity mismatch:** Include view, facet, and role in keys and fail
  loudly on duplicates.
- **Batch callback captures:** Treat facet range or rendering-mode changes as
  scene invalidations even when command counts match.
- **Transition memory growth:** Bound slot/tombstone ownership and release it at
  completion or cancellation.
- **Canvas resizing:** Resize backing storage only for target geometry, never per
  interpolated frame.
- **Coordinate API ambiguity:** Audit consumers and preserve public
  last-rendered-bounds semantics.
- **Complexity growth:** Delete the old traversal and avoid permanent parallel
  layout paths.

## Unresolved questions

- Should transition policy begin as an embed option, mutation option, view spec
  property, or experimental internal API?
- What are the default duration and easing, and should transitions start opt-in?
- Should a content-sized wrapper jump to final size or animate separately in DOM?
- Which view types declare dependency boundaries versus having containers infer
  them from size definitions?
- Should target bounds be exposed through the embed API?
- Which legend entry changes can retain callback topology safely?
- Are texture snapshots needed for reparenting in PR 2, or is exit/enter enough?

## Overall completion criteria

- No permanent compatibility implementation of combined `View.render()` remains.
- `ARCHITECTURE.md` describes phase ownership, invalidation, geometry states,
  and batch rebuild causes.
- Nested step-size, scrollable boundary, and legend tests prove correctness and
  bounded work.
- Size-only layout changes retain normal and picking batches.
- Transition frames allocate no layout structures and perform no measurement,
  arrangement, or command collection.
- Performance claims include reproducible counters, profiles, or benchmarks.
