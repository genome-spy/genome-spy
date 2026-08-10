# PR 1: Incremental Layout and Retained Render Geometry

## Purpose

The first PR splits `View.render()`, introduces explicit partial invalidation,
retains render geometry across size changes, and implements the four priority
optimizations. It intentionally lands without animated transitions while
establishing all state and boundaries needed by PR 2.

Suggested PR title: `perf(core): add incremental retained layout`

## Step 1: Add lifecycle metrics and behavioral baselines

### Outcome

Introduce debug/test instrumentation for:

- Views measured and arranged per commit.
- Geometry slots changed.
- Render commands collected.
- Normal and picking batches compiled.
- Layout passes caused by canvas-size settling.

Add a forced-full-layout result that incremental tests can compare against.
Disabled metrics must not allocate in production hot paths.

### Affected areas

- `packages/core/src/genomeSpy/renderCoordinator.js`
- New focused diagnostics under `packages/core/src/view/`
- `packages/core/src/view/testUtils.js`

### Verification

- Existing layout snapshots remain unchanged.
- Tests can assert batch-compilation and measured/arranged-node counts.
- Disabled metrics have no observable behavior.

### Documentation and migration

- Internal architecture documentation only.
- No public API migration.

### Tentative commit

`test(core): instrument layout and render batch work`

## Step 2: Split `View.render()`

### Outcome

Extract recursive measurement/arrangement from command enumeration. Arrangement
writes retained layout-instance records. Command collection reads those records
without calculating flex layouts or updating layout params.

Grid decorations, axes, legends, scrollbars, facets, and sample facets receive
stable instance records so order and coordinates can be consumed without
rerunning arrangement.

### Affected areas

- All `View` subclasses overriding `render()`.
- Rendering context interfaces and implementations.
- SVG, debug rendering, and headless bootstrap paths.
- Grid and facet instance enumeration.

### Verification

- Existing WebGL and SVG snapshots are unchanged.
- Command collection cannot alter `facetCoords`, layout params, or size caches.
- Arrangement cannot call `mark.render()`.
- Picking and ordinary rendering enumerate matching instance identities.

### Documentation and migration

- Update `ARCHITECTURE.md` with the new phases and terminology.
- A temporary mechanical rename is allowed only to keep extraction reviewable.

### Tentative commits

- `refactor(core): name the combined layout traversal explicitly`
- `refactor(core): split view layout from render command collection`

## Step 3: Retain geometry and reuse batches for size changes

### Outcome

Create stable geometry slots and make buffered requests reference them. Track a
scene generation separately from layout and presentation generations.

When arrangement changes coordinates but scene generation is unchanged:

- Update geometry slots and layout-driven params.
- Publish one layout-computed event.
- Keep normal and picking batch identities unchanged.
- Request a draw and dirty the picking framebuffer.

Move canvas size and DPR from immutable buffered-context constructor state into
retained render-target state. Replace numeric viewport coalescing with stable
slot-identity checks so initially equal rectangles can later diverge.

### Affected areas

- `packages/core/src/genomeSpy/renderCoordinator.js`
- `packages/core/src/view/renderingContext/`
- `packages/core/src/types/rendering.d.ts`
- Geometry-slot storage and WebGL/picking render-target state

### Verification

- Repeated deep size changes preserve normal and picking batch generations.
- Structural insertion/removal and facet-identity changes compile one new batch
  after a transaction.
- Logical and physical canvas changes use current render-target dimensions.
- Picking observes updated geometry.

### Documentation and migration

- Document all scene-invalidation causes in `ARCHITECTURE.md`.
- No user-visible migration.

### Tentative commit

`perf(core): retain render geometry across layout changes`

## Step 4: Add incremental measurement and arrangement

### Outcome

Replace broad invalidation plus unconditional root traversal with a scheduler:

1. Mark the changed node and dependent ancestor path dirty by axis.
2. Coalesce invalidations until the scheduled commit.
3. Recompute dirty measurements bottom-up using explicit cache inputs.
4. Arrange containers whose allocation or dirty descendants require it.
5. Stop descending when allocation and relevant generations are unchanged.
6. Repeat only affected work if content-derived canvas size has not settled.

Introduce conservative dependency boundaries for fixed and scrollable
viewports. Add guide-specific boundaries only when legend and axis tests prove
their contracts.

### Affected areas

- View size invalidation and size-expression listeners.
- Grid, layer, concat, facet, title, legend, and app-side sample containers.
- Canvas-size calculation and layout scheduling.
- Dynamic view mutation transactions.

### Verification

- Every incremental result equals forced full layout.
- Clean sibling subtrees report zero measurement and arrangement work.
- Multiple synchronous invalidations produce one commit.
- The required dependency tests below pass with exact work counters.
- Mutation transactions still publish one final layout event.

### Documentation and migration

- Document invalidation kinds, propagation, and boundaries in
  `ARCHITECTURE.md`.
- Give custom app-side views explicit axis invalidation/dependency helpers.

### Tentative commit

`perf(core): recompute only dirty layout branches`

## Step 5: Apply priority optimizations

### Outcome

Implement the four agreed optimizations:

1. Make `Mark.setViewport()` allocation-free during ordinary draws:
   - Read rectangle values once.
   - Use scalar clipping and viewport calculations.
   - Reuse uniform vectors and objects.
   - Remove per-call `flatten()`, mapped arrays, and spread-created objects.
2. Cache flattened viewport/clip state in retained slots and reuse it until the
   presentation generation changes.
3. Reduce `GridView` work:
   - Cache visible children by structure/visibility generation.
   - Avoid allocating `[column, row]` results.
   - Compute coordinate unions in one loop.
   - Reuse stable flex-item/coordinate storage where it remains simple.
4. Retain decoration and render-request structures across geometry-only changes
   and rebuild only with scene invalidation.

### Affected areas

- `packages/core/src/marks/mark.js`
- Geometry and clipping helpers.
- `packages/core/src/view/gridView/gridView.js`
- `packages/core/src/view/layout/flexLayout.js`
- Buffered request storage.

### Verification

- Viewport tests cover identical scalar results, fractional DPR, zero/negative
  rectangles, and directional clips.
- Allocation profiling shows no new objects in steady-state viewport setup.
- Layout snapshots remain unchanged.
- A representative nested-grid benchmark records before/after timings and work
  counts; semantic tests remain authoritative.

### Documentation and migration

- No public documentation required.
- Record benchmark method and representative spec in PR notes.

### Tentative commits

- `perf(core): eliminate viewport setup allocations`
- `perf(core): reuse grid layout working state`

## Required test cases

### Nested step-sized view with an index scale

Create a nested layout containing a unit view sized with `{ step: ... }`, an
`index` positional scale, and a clean sibling branch. Update the data domain so
the number of index steps changes.

Assert that:

- Measured size and final rectangle change correctly.
- Only the dependent ancestor path is measured and arranged.
- The clean sibling performs no work.
- Normal and picking batch generations do not change.
- Incremental layout equals forced full layout.
- One final `layoutComputed` notification is published.

Place the focused behavior test next to sizing or scheduling. Add a small stable
snapshot only if the full hierarchy is part of the contract.

### Dirty subtree inside a scrollable viewport

Create a fixed-size scrollable viewport with nested content whose intrinsic size
changes.

Assert that:

- Content geometry and scrollbar limits update.
- The viewport rectangle remains unchanged.
- Measurement invalidation stops at the viewport boundary and does not reach the
  root.
- Unrelated outer layout is neither measured nor arranged.
- Render batches are retained.
- Incremental layout equals forced full layout.

Cover width and height separately if boundaries are axis-specific.

### Legend size change

Create a view with a legend inside a fixed outer layout. Change active domain or
label content so the measured legend extent changes.

Assert that:

- The legend and owning grid child are measured and arranged.
- Plot rectangle and guide overhang update.
- Propagation stops once an ancestor's measured output/allocation is unchanged.
- An unrelated sibling performs no work.
- The batch is retained if legend command topology is stable; otherwise exactly
  one scene rebuild occurs and the test states why.
- Incremental layout equals forced full layout.

The test must distinguish legend geometry changes from legend view
creation/removal because their scene invalidation differs.

## Acceptance criteria

- No production path calls the combined `View.render()` API.
- A size-only update never compiles a normal or picking batch.
- Incremental layout equals forced full layout for existing snapshots and all
  required scenarios.
- Dirty propagation is axis-aware with a conservative fallback.
- Batch, measurement, and arrangement work is observable in tests.
- Steady-state viewport setup performs no per-request allocation.
- Dynamic mutations still coalesce to one final layout/batch update.
- SVG and headless rendering retain deterministic final geometry.
