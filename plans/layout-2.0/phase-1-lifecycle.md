# Phase 1: Clarify the Layout and Rendering Lifecycle

Status: Draft

Tentative PR title: `refactor(core): separate layout from render command collection`

## Purpose

Remove the misleading `View.render()` operation and make the existing lifecycle
explainable without changing layout or rendering behavior. This phase should be
a maintainability refactor with full layout recomputation, fresh render batches,
and no transition or incremental-layout machinery.

The earlier prototype showed that the lifecycle can be split, but it also
allowed later retention and invalidation concerns to enter the same PR. This
phase deliberately keeps only the split.

## What `View.render()` does today

On `master`, `View.render(context, coords, options)` does not draw pixels. It is
the recursive layout traversal and currently combines several responsibilities:

- `GridView`, dormant `FacetView`, `LayerView`, and App-specific containers calculate
  child and decoration rectangles and recurse into children.
- `View` records `facetCoords`, applies clipping, updates layout-driven width and
  height parameters, and finalizes post-scale parameters.
- Unit, axis, legend, title, scrollbar, background, and overlay views call
  `context.renderMark()` while the traversal is still in progress.
- `pushView()` and `popView()` calls communicate layout-instance nesting,
  clipping, and order to rendering contexts.
- Buffered rendering contexts turn those calls into executable normal and
  picking batches; SVG and test contexts consume the same traversal directly.

Thus, simply renaming `render()` to `layout()` would improve terminology but
would leave command construction hidden inside layout. Conversely, moving flex
calculation into rendering contexts would preserve the same coupling under new
names. The useful boundary is between calculating/recording layout and consuming
the result to prepare drawing.

## Intended lifecycle after this phase

The public concepts should be:

1. **Arrange:** traverse the hierarchy, calculate rectangles, update
   layout-driven state, and describe the ordered view/mark occurrences produced
   by that layout.
2. **Collect render commands:** consume the completed description using normal,
   picking, SVG, debug, or other rendering contexts. This phase must not measure
   views, calculate flex layouts, or update layout parameters.
3. **Draw:** execute the prepared rendering batch. Existing mark callbacks and
   WebGL behavior remain unchanged.

Measurement may continue through the existing cached `getSize()` methods. A
separate generalized constraint solver is not required merely to remove
`View.render()`.

## Provisional approach

The earlier implementation established a workable migration path:

- Rename recursive `render()` implementations to a layout term such as
  `arrange()`.
- During arrangement, record the existing ordered operations—view entry/exit,
  mark occurrence, and the small number of App-specific batch delimiters—in a
  simple per-layout result.
- After arrangement is complete, replay or otherwise consume that result through
  the existing rendering contexts.
- Keep a convenience operation for standalone callers that performs arrange
  followed immediately by command collection. Its name must describe layout,
  such as `computeLayout()`, rather than pretend to draw.
- Update `RenderCoordinator` to invoke the phases explicitly so later phases
  have a real boundary at which batch retention can be introduced.

The per-layout result is a migration mechanism, not yet a retained scene graph.
In this phase it may be rebuilt on every layout. It should carry only information
already passed through `ViewRenderingContext`; stable keys, reconciliation,
generations, geometry slots, dirty flags, and transition state belong to later
phases.

The earlier `LayoutCommandList` prototype proved the separation but also grew
into command-sequence reconciliation. If a command list is used again, Phase 1
should keep it as a small append-and-consume structure. It should not compare the
new traversal with an old traversal or decide whether the scene changed.

## Affected areas

- `packages/core/src/view/view.js` and every Core view subclass that overrides
  `render()`.
- `packages/core/src/view/gridView/`, where child geometry, guides, decorations,
  z-order, clipping, and scrollbars are interleaved.
- `packages/core/src/view/facetView.js`, which emits multiple occurrences of one
  child and manages facet labels.
- App-specific view subclasses under `packages/app/src/sampleView/`.
- `packages/core/src/genomeSpy/renderCoordinator.js`.
- Rendering contexts, SVG/raster export, headless helpers, and layout test
  utilities that currently call `View.render()` directly.

## Contracts to make explicit

- Arrangement owns measurement, flex calculation, coordinate recording, and
  layout-driven parameter updates.
- Command collection owns calls that prepare mark drawing callbacks and batches.
- Drawing owns WebGL execution and must not trigger arrangement.
- Render order remains the order produced by the completed layout, including
  backgrounds, grid lines, axes, selection overlays, rulers, scrollbars, titles,
  facets, and sample facets.
- Ordinary and picking contexts consume the same occurrences and identities.
- SVG and headless paths receive the same final geometry as WebGL.
- Configured-invisible views behave exactly as before; semantic visibility is
  not introduced here.

## Verification

- Existing Core and App unit tests and layout snapshots remain unchanged.
- Add focused tests showing that arrangement completes before any mark command
  is collected and that command collection cannot change recorded coordinates
  or layout-driven parameters.
- Cover a grid with decorations and a faceted or repeated view so the test does
  not validate only the trivial unit-view path.
- Exercise normal, picking, SVG, raster/headless, and test-helper callers.
- Treat App `SampleView`, rather than dormant Core `FacetView`, as the mandatory
  repeated-layout integration case. Preserve its sample-facet batch delimiters,
  facet IDs, filtering-driven hierarchy updates, peek rendering, summaries,
  chrome, clipping, picking, and SVG/CPU facet positions.
- Run existing `SampleView`, `LocationManager`, facet-texture, and SVG tests in
  addition to focused lifecycle tests. A peek frame must still update mutable
  sample locations without accidentally re-entering the new arrangement phase.
- Search the repository to ensure no production `View.render()` override or call
  remains and remove its JSDoc/type aliases with it.
- Measure the relevant lifecycle code before and after. Added indirection is
  acceptable only when the resulting ownership is materially easier to explain.

## Non-goals

- Retaining batches across layouts.
- Defining stable layout-instance identity.
- Separating target and presented coordinates.
- Dirty-branch measurement or subtree-scoped arrangement.
- Changing when a view is considered visible.
- Optimizing allocations unless the split creates an obvious regression.
- Replacing the closure-backed `Rectangle` coordinate model. Preserve it as a
  known behavior during the mechanical lifecycle split so a later phase can
  evaluate geometry representation independently.

## Risks and open questions

- `arrange()` may still be a misleading name if it directly exposes methods
  named for rendering. The smallest explicit layout-result interface should be
  chosen during the PR.
- App sample faceting has extra begin/end batching operations; these must remain
  ordered without making the Core abstraction App-specific.
- A stored command description may duplicate information already held in views.
  Phase 1 should tolerate that temporarily, then Phase 2 should decide what
  actually deserves stable identity and ownership.
- Convenience APIs used by tests and SVG export must not become a second,
  behaviorally different lifecycle.

## Phase acceptance and review gate

The phase is complete when `View.render()` is gone, the three lifecycle stages
have enforceable responsibilities, and observable output is unchanged.

Before Phase 2, evaluate:

- Is the split easier to explain than the old traversal?
- Can any bridge API or duplicated state be deleted?
- Did the PR introduce retention or invalidation machinery without a current
  requirement?
- Is the full-layout, fresh-batch path still direct and deterministic?

Tentative commit sequence:

1. `refactor(core): separate view arrangement from command collection`
2. `refactor(app): adopt the explicit view layout lifecycle`
3. `docs(core): document layout and rendering phases`
