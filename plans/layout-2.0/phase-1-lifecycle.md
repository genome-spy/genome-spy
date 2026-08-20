# Phase 1: Clarify the Layout and Rendering Lifecycle

Status: Detailed implementation plan; rebase onto current `master` before coding

Tentative PR title: `refactor(core): separate layout from rendering collection`

## Purpose

Remove the misleading recursive `View.render()` operation and establish one
renderer-neutral boundary without changing layout or rendering behavior.

The universal lifecycle after this phase has two stages:

1. **Arrange:** perform a full recursive layout and produce a completed ordered
   description of the view and mark placements.
2. **Consume:** pass that result to a backend-specific context. Immediate
   backends draw while consuming; buffered backends prepare work and draw it
   afterward.

Full layout recomputation remains the correctness baseline. WebGL normal and
picking batches remain fresh after layout. Phase 1 does not prescribe WebGPU
resource lifetime: production WebGPU is expected to retain compatible resources
between frames, while a temporary PoC fixture may still rebuild them. This phase
introduces no cross-layout identity, reconciliation, invalidation, transitions,
or retained geometry in Core.

## Implementation baseline

At the time of this revision, `plan/layout-2.0` is behind `master`. Current
`master` adds the Canvas2D compatibility backend, grid and legend behavior, and
the Core architecture documents that this refactor must preserve. Rebase this
phase branch onto current `master` and recount the affected overrides and root
callers before editing lifecycle code.

Treat the `webgpu` branch as a coordination and validation fixture, as specified
by the main Layout 2.0 plan. Do not make merging the entire experimental branch
a prerequisite for the Core refactor. Once the Core boundary works on current
`master`, adapt and validate the WebGPU coordinator on a temporary integration
branch or dependent commit. The validation must show that Core no longer forces
a second traversal or resource recreation; renderer-owned lifetime remains a
WebGPU concern.

Do not merge code from `perf/layout-2.0`. It is design evidence and a source of
candidate tests, not an implementation base.

## Current lifecycle and migration inventory

`View.render(context, coords, options)` does not draw pixels. It recursively
combines layout state mutation with calls into a `ViewRenderingContext`:

- `View.render()` records `facetCoords`, updates layout-driven width and height
  parameters, marks layout complete, and finalizes post-scale parameters.
- `GridView`, `LayerView`, dormant `FacetView`, `TitleView`, `LegendView`, and
  `UnitView` calculate child or decoration rectangles and recurse.
- App `SampleView`, `MetadataView`, and `SampleLabelView` add repeated samples,
  summaries, sidebars, chrome, clipping, and sample-facet batch scopes.
- `pushView()`, `popView()`, and `renderMark()` communicate the ordered view and
  mark placements to rendering contexts.
- `getDevicePixelRatio()` feeds pixel-aligned grid and facet layout, so device
  pixel ratio is an arrangement input, not merely a drawing option.

Production roots include the WebGL coordinator and exports, current-master
Canvas2D live rendering and export, SVG creation/analysis/hybrid export, the
WebGPU proof-of-concept coordinator, and layout test helpers.

The coupling appears differently in each backend:

- WebGL creates normal and picking work before layout has finished settling.
- Canvas2D traverses with painting disabled during `computeLayout()` and then
  traverses again while painting each `renderAll()`.
- WebGPU similarly traverses for layout and paint, destroying mark handles
  before the paint traversal to recover order.
- Hybrid SVG traverses for counting and output, and again for each WebGL raster
  run.

## Design decisions

### Rename recursive layout to `arrange()`

Rename the base method, all overrides, the type alias, and recursive helpers:

- `View.render()` becomes `View.arrange()`;
- `RenderMethod` becomes `ArrangeMethod`;
- helpers such as `renderTitle()` and SampleView's `#renderChild()` receive
  arrangement names;
- `Mark.render()` and backend drawing methods keep their names because they
  prepare or perform actual rendering.

Do not keep a deprecated `View.render()` forwarding alias. This is an internal
atomic migration, and two names would obscure whether the old lifecycle is
really gone.

### Use one small completed layout result

Add a recorder/result under `packages/core/src/view/layout/`, tentatively named
`LayoutResult`. It records only the operations emitted today, in exact order:

1. begin a SampleView facet-batch scope;
2. enter a view with its coordinates;
3. add a mark placement with its rendering options;
4. leave a view;
5. end a SampleView facet-batch scope.

The KISS implementation may reuse the existing `ViewRenderingContext` protocol:
the recorder implements it, and a replay method such as
`collectRenderCommands(context)` forwards the recorded operations to a real
context. Keep the recorder private to a synchronous helper, validate balanced
view and sample-batch scopes before returning, and expose only the completed
replayable result. Do not add a public builder state machine.

The result supplies the device pixel ratio during arrangement. Backend contexts
retain their own output/framebuffer DPR where drawing needs it; the two values
must not be conflated.

The result must not contain:

- stable instance or placement keys;
- retained rectangle slots or flattened numeric geometry;
- generations, dirty flags, scene-invalidated state, or input snapshots;
- positional reconciliation with an earlier result;
- WebGL callbacks, WebGPU resources, shader state, projected Canvas2D values,
  or SVG nodes;
- backend filtering decisions such as picking participation or raster-run
  selection.

### Isolate option envelopes while preserving live geometry

An operation sequence may outlive the synchronous arrangement that created it.
SampleView also caches and mutates top-level rendering-option objects. Recording
those objects by reference would let a later layout overwrite an earlier result.

For each mark placement, snapshot only the small mutable option envelope:

- shallow-copy `RenderingOptions`;
- shallow-copy `sampleFacetRenderingOptions` and `clip` when present;
- keep their `Rectangle`, `clip.rect`, `clipRect`, and `locSize` references live.

This isolates facet IDs, flags, clip modes, and `pixelToUnit` between results
while preserving the current closure-backed geometry and SampleView peek
behavior. It is lifetime isolation within one pass, not stable identity or a new
geometry representation.

### Give results backend-specific lifetimes

There is no shared result cache:

- WebGL consumes the final settled result into fresh normal and picking batches
  and may then discard the result.
- Canvas2D retains the latest live result only so `renderAll()` can paint without
  arranging again; the next successful layout replaces it.
- WebGPU retains the latest layout result as ordered placement input while
  retaining compatible renderer-owned resources independently. A temporary PoC
  fixture may rebuild handles, but no Phase 1 contract requires that behavior.
- SVG and export helpers use one-shot local results that never replace a live
  coordinator's result.
- Debug and layout-test helpers arrange once and consume once.

During canvas-size settling, build a candidate result for each full attempt.
Publish or collect only a candidate with valid dimensions, balanced scopes, and
a settled canvas size. Keep the last valid live result until then; a NaN,
failed, partial, or discarded attempt must not replace it. Preserve the current
`layout`, `onLayoutComputed`, and `layoutComputed` notification order.

### Make size and DPR explicit inputs without caching them

Conceptually, one helper provides the arrangement boundary:

```js
const layout = arrangeView(viewRoot, coords, {
  devicePixelRatio,
  options: { firstFacet: true },
});
layout.collect(renderingContext);
```

The exact signature may change during implementation. Do not add generic input
snapshots or equality logic. Each coordinator recomputes on its existing layout
and size notifications.

An export with a different logical size or arrangement DPR computes a local
result. Within one hybrid SVG export, counting and vector output reuse one result
when their inputs match. If rasterization needs a different DPR, compute at most
one alternate result and replay it for every raster run. Separate public export
or analysis calls never share a cached result.

### Keep consumption backend-local

- WebGL replays one settled result through the existing normal/picking composite
  context, builds fresh batches, and draws them as today.
- Canvas2D replays a retained live result or one-shot export result into a fresh
  immediate context and draws while consuming.
- SVG replays a one-shot result for counting and document output; its hybrid
  raster adapter replays the appropriate local result into mark-filtered WebGL
  contexts.
- WebGPU consumes the settled result on each paint to submit placements in
  order without arranging again or recreating compatible renderer-owned
  resources.
- Debugging contexts consume a result instead of driving view recursion.

The result does not group, filter, optimize, or execute commands. WebGL batching,
Canvas2D/SVG projection and culling, SVG raster-run selection, picking, and
WebGPU translation remain owned by their contexts.

### Preserve hook and state ownership

Arrangement owns measurement, flex calculation, `facetCoords`, coordinate
recording, layout-driven parameters, post-scale parameter finalization, and the
ordered result.

Consumption and backend drawing own `View.onBeforeRender()`, mark readiness,
opacity, picking participation, clipping, culling, `Mark.prepareRender()`,
`Mark.render()`, backend translation, and output.

Arrangement must not call `onBeforeRender()`, `Mark.render()`, or a backend
adapter. Repainting from an existing result may run current per-frame hooks but
must not update layout parameters or re-enter `View.arrange()`.

## Implementation milestones

### Milestone 1: Add the completed-result contract

Intended outcome:

- add the private recorder, completed result, and one-pass helper;
- initially let the helper record the existing `View.render()` traversal so the
  repository stays buildable;
- cover exact operation order, balanced nesting, DPR propagation, and option
  envelope isolation without changing production coordinators.

Affected areas and downstream consumers:

- a new file under `packages/core/src/view/layout/`;
- `ViewRenderingContext` types or JSDoc needed by the recorder;
- focused recorder tests using a small decorated hierarchy and a repeated
  SampleView placement.

Verification:

- one ordered-operation assertion covers view nesting, a mark, and SampleView's
  begin/end delimiters;
- two results with different facet/clip/`pixelToUnit` envelopes cannot overwrite
  each other, while a live `locSize` change remains observable;
- fractional-DPR arrangement reaches grid/facet pixel snapping;
- all existing suites remain green because production entry points are
  unchanged.

Documentation or migration: none in this milestone.

Tentative commit: `refactor(core): add completed layout results`

### Milestone 2: Migrate the hierarchy and all production consumers

Intended outcome:

- atomically rename `View.render()` to `arrange()` across Core and App;
- migrate WebGL, Canvas2D, SVG, export, headless, and test-helper roots to the
  completed-result boundary;
- remove the old name, type alias, recursive calls, and stale JSDoc in the same
  commit;
- adapt WebGPU on its integration branch without making fresh-handle rebuilding
  part of the Core contract;
- preserve current output and full-layout semantics without a compatibility
  alias.

Affected areas and downstream consumers:

- `packages/core/src/view/view.js`, `unitView.js`, `layerView.js`,
  `facetView.js`, `titleView.js`, legend views, and `gridView/`;
- `packages/core/src/types/rendering.d.ts`, rendering contexts, and test helpers;
- WebGL `renderCoordinator.js` and canvas/raster export;
- current-master `packages/core/src/rendering/canvas2d/` and `rendering/svg/`;
- App `sampleView.js`, `sampleChromeLayout.js`, `sampleLabelView.js`, and
  `metadataView.js`;
- WebGPU coordinator/context code on the validation branch.

Verification:

- settling tests show that only the final valid candidate is consumed and that
  notification timing is unchanged;
- repeated Canvas2D and WebGPU paints consume the current result without a
  second arrangement; the production WebGPU adapter also preserves compatible
  renderer-owned resources;
- WebGL normal/picking collection receives the same ordered placements;
- hybrid SVG reuses one matching-input result and at most one alternate-DPR
  result across raster runs, preserving crop alignment and paint order;
- SampleView preserves current facetId payload values and traversal order,
  filtering, clipping, picking, and live peek geometry;
- an alternate-size export does not replace the live coordinator result, and a
  subsequent live repaint and interaction remain correct;
- repository searches find no production `View.render()` lifecycle call or
  override and no `RenderMethod` alias.

Documentation or migration:

- update `packages/core/docs/architecture/rendering.md` to describe arrangement
  followed by backend consumption and optional buffered drawing;
- update `views-and-dataflow.md` and renderer READMEs where they describe the
  old recursive rendering lifecycle;
- no public specification or user migration documentation is expected.

Tentative commits:

1. `refactor: consume completed view layouts`
2. `chore(core): document the explicit rendering lifecycle`

## Final integration verification

During iteration, run the new result tests plus the narrow coordinator or
backend suite being migrated. Before the phase gate, run:

- WebGL coordinator and buffered-context tests;
- grid/legend layout tests, including current z-index behavior;
- Canvas2D coordinator, context, live-render, and export tests;
- SVG context, culling, analysis/export, and hybrid-raster tests;
- App SampleView, chrome, metadata, LocationManager, and facet-texture tests;
- WebGPU coordinator/context/adapter tests on the integration branch, including
  its renderer-owned resource-retention checks;
- workspace TypeScript checks, the full Vitest suite, and lint.

Representative smoke cases:

- `examples/core/first.json` with WebGL and the WebGPU proof of concept;
- current-master Canvas2D dense-point and dense-rect examples;
- an App SampleView with filtering, peek, scrolling, summaries, axes, and
  picking;
- vector SVG and threshold-based hybrid SVG export.

Compare structured layout and supported final geometry across backends. Do not
require pixel-identical output where renderer feature support differs.

Commands from the repository root:

```sh
npx vitest run <focused-test-files> --reporter=agent
npm test -- --reporter=agent
npm --workspaces run test:tsc --if-present
npm run lint
```

Use the repository's browser-debugging workflow for live WebGL, Canvas2D,
WebGPU, picking, and SampleView smoke tests.

## Acceptance criteria

- `View.render()`, `RenderMethod`, their overrides/calls, and stale JSDoc are
  gone without a compatibility alias.
- Full arrangement produces a completed backend-neutral ordered result.
- Production backends and helpers consume results instead of recursively
  traversing views to recover order.
- Canvas-size settling publishes and consumes only a final valid result.
- Repainting Canvas2D or WebGPU does not re-enter arrangement; drawing prepared
  WebGL normal or picking work does not arrange either.
- Option envelopes are isolated between results while live Rectangle and
  SampleView `locSize` behavior is preserved.
- WebGL, Canvas2D, SVG, WebGPU integration, picking, clipping, culling, export,
  and App SampleView behavior remain equivalent within supported feature
  intersections.
- `onBeforeRender()` and backend mark preparation occur only during consumption
  or drawing.
- No stable keys, retained slots, reconciliation, generations, dirty-state
  model, geometry flattening, or transition state enters the implementation.
- Relevant lifecycle code size is measured before and after, and internal
  architecture documentation matches the result.

## Non-goals and rejected expansion

- Introducing WebGL batch retention or a shared cross-backend retention policy.
  Production WebGPU still owns and retains its compatible resources.
- Supporting repeated WebGPU placements; Phase 1 only supplies their ordered
  input boundary.
- Defining layout-instance or render-placement identity.
- Replacing `facetCoords`, `GridChild.coords`, or closure-backed `Rectangle`.
- Dirty-branch layout, subtree arrangement, input-equality caches, invalidation
  generations, target/presented geometry, semantic visibility, or transitions.
- Changing visibility, order, batching, picking, clipping, or culling behavior.
- Creating a public layout-result or renderer-plugin API.
- Generalizing the two SampleView batch delimiters before another real consumer
  requires it.

Merely renaming `render()` would leave duplicate Canvas2D/WebGPU traversal.
Calling backend contexts directly from arrangement would leave the coupling in
place. The retained `LayoutCommandList` from `perf/layout-2.0` is also not a
starting point: its slots, maps, reconciliation, generations, and invalidation
belong to later phases, if measurements and demonstrated behavior require them.

## Risks and mitigations

- **Mutable SampleView options leak between results:** snapshot the small option
  envelopes and test isolation while retaining live `locSize` references.
- **DPR moves to the wrong stage:** pass arrangement DPR explicitly and cover a
  fractional-DPR grid/facet case; keep framebuffer DPR backend-local.
- **A failed settling attempt replaces valid work:** publish atomically only
  after valid dimensions, balanced scopes, and a settled size.
- **Immediate rendering silently re-enters layout:** test arrangement counts at
  the coordinator boundary while asserting visible output remains unchanged.
- **SVG reuse becomes a hidden cache:** scope results to one export call and
  compute only the explicit alternate-DPR result required by rasterization.
- **The rename masks behavior changes:** keep Milestone 2 mechanical, reject
  unrelated cleanup, compare representative output, and inspect repository-wide
  searches before review.

## Phase review gate

Before Phase 2, answer with evidence:

1. Is completed arrangement followed by backend consumption easier to explain
   than the old traversal?
2. Can immediate and buffered backends consume the result without a second view
   traversal?
3. Is the result an ephemeral ordered sequence with isolated option envelopes,
   or did retained identity/state enter the implementation?
4. Can any bridge, copied payload, duplicated context, or helper be deleted?
5. Did every backend preserve ordering, hook timing, clipping, picking, export,
   and supported output behavior?
6. Does full layout remain the obvious deterministic baseline, and does the
   code-size comparison justify the boundary?

Proceed to Phase 2 only if the result is simpler than the old lifecycle and no
speculative identity or invalidation machinery was required.
